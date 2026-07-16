/** Business Office — provider-neutral SMS preparation, approval, consent, and guarded delivery. */

function h38TmMessageBody_(value) {
  var body = boNormalizeText_(value);
  boAssert_(body, "Message body is required.");
  boAssert_(
    body.length <= 1600,
    "SMS message body may not exceed 1,600 characters.",
  );
  return body;
}
function h38TmStopWord_(body) {
  return /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$/i.test(
    boNormalizeText_(body),
  );
}
function h38TmDuplicateMessage_(row) {
  return (
    h38TmRead_("MESSAGES", { includeVoided: true }).find(function (existing) {
      return (
        existing["Message ID"] !== row["Message ID"] &&
        existing["Duplicate Key"] === row["Duplicate Key"] &&
        ["Sent", "Delivered", "Blocked — Delivery Unknown"].indexOf(
          existing.Status,
        ) >= 0
      );
    }) || null
  );
}
function h38TmSaveMessage_(recordId, values) {
  var user = boGetCurrentUser_();
  boAssertModuleEnabled_("messaging");
  h38TmRequireModule_("messaging", recordId ? "Edit" : "Create");
  boAssert_(h38TmCanWrite_(user), "Viewer access is read-only.");
  var before = recordId ? h38TmFind_("MESSAGES", recordId) : null;
  if (before) h38TmRequireMessageAccess_(before, user, true);
  var input = Object.assign({}, before || {}, values || {});
  delete input.__rowNumber;
  input.Direction = before
    ? before.Direction
    : boNormalizeText_(input.Direction) || "Outbound";
  boAssert_(
    ["Outbound", "Inbound"].indexOf(input.Direction) >= 0,
    "Unsupported message direction.",
  );
  input.Channel = "SMS";
  input.Provider = boPackValue_("messaging.provider", "none");
  input["Phone Number"] = boNormalizeText_(input["Phone Number"]);
  input["Normalized Phone"] = h38TmNormalizePhone_(input["Phone Number"]);
  input["Message Body"] = h38TmMessageBody_(input["Message Body"]);
  input.Status =
    input.Direction === "Inbound"
      ? "Received"
      : before
        ? before.Status
        : "Draft";
  input["Approval Status"] =
    input.Direction === "Inbound"
      ? "Not Required"
      : before
        ? before["Approval Status"]
        : "Draft";
  input["Send Allowed"] =
    input.Direction === "Inbound"
      ? "No"
      : before
        ? before["Send Allowed"]
        : "No";
  if (before && input.Direction === "Outbound") {
    var approvalSensitive = [
        "Phone Number",
        "Message Body",
        "Template ID",
        "Linked Record Type",
        "Linked Record ID",
        "Customer ID",
        "Task ID",
        "Request ID",
        "Quote ID",
        "Work Order ID",
        "Job ID",
        "Invoice ID",
        "Payment ID",
        "Document ID",
      ],
      changed = approvalSensitive.some(function (field) {
        return (
          boNormalizeText_(before[field]) !== boNormalizeText_(input[field])
        );
      });
    if (changed) {
      input.Status = "Draft";
      input["Approval Status"] = "Revision Required";
      input["Send Allowed"] = "No";
      input["Approved By User ID"] = "";
      input["Approved By Email"] = "";
      input["Approved Time"] = "";
      input["Consent ID"] = "";
    }
  }
  input["Created By User ID"] = before
    ? before["Created By User ID"]
    : user["User ID"];
  input["Conversation Key"] =
    input["Conversation Key"] ||
    h38TmHash_(
      [input["Customer ID"], input["Normalized Phone"]].join("|"),
    ).slice(0, 24);
  input["Duplicate Key"] = h38TmHash_(
    [
      input["Normalized Phone"],
      input["Message Body"],
      input["Linked Record Type"],
      input["Linked Record ID"],
    ].join("|"),
  );
  h38TmValidateLinkedRecord_(
    input["Linked Record Type"],
    input["Linked Record ID"],
  );
  if (input.Direction === "Outbound") {
    var duplicate = h38TmDuplicateMessage_(input);
    boAssert_(
      !duplicate,
      "Duplicate-message lock: matching customer text already sent or has unknown delivery status. Existing message: " +
        (duplicate ? duplicate["Message ID"] : ""),
    );
  }
  var saved = recordId
    ? h38TmUpdate_("MESSAGES", recordId, input)
    : h38TmAppend_("MESSAGES", input);
  h38TmMessageEvent_(
    saved["Message ID"],
    before ? "DRAFT_UPDATED" : "DRAFT_CREATED",
    saved.Status,
    "PASS",
    "No external action occurred.",
    user,
  );
  boProof_(
    "MESSAGE_DRAFT",
    "Message",
    saved["Message ID"],
    "PASS",
    "Draft/review record only; no SMS sent.",
    user.Email,
  );
  return saved;
}
function h38TmMessageEvent_(
  messageId,
  eventType,
  providerStatus,
  result,
  evidence,
  user,
) {
  user = user || boGetCurrentUser_();
  return h38TmAppend_("MESSAGE_EVENTS", {
    "Message ID": messageId,
    "Event Type": eventType,
    "Provider Status": providerStatus || "",
    "Provider Message ID": "",
    Result: result || "PASS",
    Evidence: evidence || "",
    "Actor User ID": user["User ID"],
    "Actor Email": user.Email,
    "Event Time": h38TmNow_(),
  });
}
function h38TmSubmitMessageForReview_(messageId, notes) {
  var user = boGetCurrentUser_(),
    before = h38TmFind_("MESSAGES", messageId);
  h38TmRequireMessageAccess_(before, user, true);
  boAssert_(
    before.Direction === "Outbound",
    "Only outbound drafts can be submitted for review.",
  );
  boAssert_(
    ["Draft", "Blocked"].indexOf(before.Status) >= 0 ||
      before["Approval Status"] === "Revision Required",
    "This message is not ready to submit for review.",
  );
  var saved = h38TmUpdate_("MESSAGES", messageId, {
    Status: "Needs Review",
    "Approval Status": "Owner Review Required",
    "Send Allowed": "No",
    Notes: [before.Notes, boNormalizeText_(notes)].filter(Boolean).join(" | "),
  });
  h38TmMessageEvent_(
    messageId,
    "SUBMITTED_FOR_REVIEW",
    saved.Status,
    "PASS",
    "No external action occurred.",
    user,
  );
  boProof_(
    "MESSAGE_REVIEW_QUEUE",
    "Message",
    messageId,
    "PASS",
    "Submitted for owner review; no SMS sent.",
    user.Email,
  );
  return saved;
}
function h38TmApproveMessage_(messageId, decision, notes) {
  var owner = boRequireOwner_();
  boRequireRestrictedArea_("send");
  var before = h38TmFind_("MESSAGES", messageId);
  boAssert_(
    before.Direction === "Outbound",
    "Only outbound drafts require owner approval.",
  );
  boAssert_(
    ["Draft", "Needs Review", "Approved", "Blocked"].some(function (token) {
      return String(before.Status).indexOf(token) === 0;
    }),
    "This message is not in an approvable state.",
  );
  decision = boNormalizeText_(decision);
  boAssert_(
    ["Approve", "Reject", "Hold", "Revise"].indexOf(decision) >= 0,
    "Unsupported message decision.",
  );
  var patch = {
    Notes: [before.Notes, boNormalizeText_(notes)].filter(Boolean).join(" | "),
  };
  if (decision === "Approve") {
    var consent = h38TmConsentForPhone_(before["Normalized Phone"]);
    boAssert_(
      consent && consent["Consent Status"] === "Consented",
      "Documented SMS consent is required before approval.",
    );
    patch.Status = "Approved";
    patch["Approval Status"] = "Approved";
    patch["Send Allowed"] = "Yes";
    patch["Approved By User ID"] = owner["User ID"];
    patch["Approved By Email"] = owner.Email;
    patch["Approved Time"] = h38TmNow_();
    patch["Consent ID"] = consent["Consent ID"];
  } else if (decision === "Reject") {
    patch.Status = "Cancelled";
    patch["Approval Status"] = "Rejected";
    patch["Send Allowed"] = "No";
  } else if (decision === "Hold") {
    patch.Status = "Blocked";
    patch["Approval Status"] = "Hold";
    patch["Send Allowed"] = "No";
  } else {
    patch.Status = "Draft";
    patch["Approval Status"] = "Revision Required";
    patch["Send Allowed"] = "No";
  }
  var saved = h38TmUpdate_("MESSAGES", messageId, patch);
  h38TmMessageEvent_(
    messageId,
    "OWNER_" + decision.toUpperCase(),
    saved.Status,
    "PASS",
    notes || "",
    owner,
  );
  boProof_(
    "MESSAGE_DECISION",
    "Message",
    messageId,
    "PASS",
    decision + "; send allowed=" + saved["Send Allowed"],
    owner.Email,
  );
  return saved;
}
function h38TmUsageSummary_() {
  var month = h38TmNow_().slice(0, 7),
    rows = h38TmRead_("USAGE", { includeVoided: true }).filter(function (row) {
      return String(row["Recorded Time"] || "").slice(0, 7) === month;
    }),
    segments = rows.reduce(function (sum, row) {
      return sum + Number(row.Segments || 0);
    }, 0),
    cost = rows.reduce(function (sum, row) {
      return sum + Math.abs(Number(row["Provider Price"] || 0));
    }, 0),
    p = boGetProperties_(),
    segmentLimit = Number(p.getProperty("H38_SMS_MONTHLY_SEGMENT_LIMIT") || 0),
    costLimit = Number(p.getProperty("H38_SMS_MONTHLY_COST_LIMIT") || 0);
  return {
    month: month,
    segments: segments,
    providerCost: Math.round((cost + Number.EPSILON) * 10000) / 10000,
    segmentLimit: segmentLimit,
    costLimit: costLimit,
    segmentLimitReached: segmentLimit > 0 && segments >= segmentLimit,
    costLimitReached: costLimit > 0 && cost >= costLimit,
  };
}
function h38TmAssertUsageAvailable_(message) {
  var usage = h38TmUsageSummary_(),
    segments = Math.max(
      1,
      Math.ceil(String(message["Message Body"] || "").length / 160),
    );
  boAssert_(
    !usage.segmentLimitReached &&
      (!usage.segmentLimit || usage.segments + segments <= usage.segmentLimit),
    "Monthly SMS segment limit reached.",
  );
  boAssert_(!usage.costLimitReached, "Monthly SMS cost limit reached.");
  return usage;
}
function h38TmProviderStatus_() {
  var properties = boGetProperties_(),
    provider = boPackValue_("messaging.provider", "none"),
    released =
      boPackValue_("messaging.externalActionsEnabled", false) === true &&
      properties.getProperty("H38_SMS_SEND_RELEASED") === "TRUE",
    inboundReleased =
      boPackValue_("messaging.inboundSyncEnabled", false) === true &&
      properties.getProperty("H38_SMS_INBOUND_SYNC_RELEASED") === "TRUE",
    usage = h38TmUsageSummary_();
  return {
    provider: provider,
    providerNeutral: true,
    credentialsConfigured: !!(
      properties.getProperty("H38_SMS_TWILIO_ACCOUNT_SID") &&
      properties.getProperty("H38_SMS_TWILIO_AUTH_TOKEN")
    ),
    fromNumberConfigured: !!properties.getProperty("H38_SMS_FROM_NUMBER"),
    businessRegistrationApproved:
      properties.getProperty("H38_SMS_A2P_APPROVED") === "TRUE",
    outboundReleased: released,
    inboundSyncReleased: inboundReleased,
    bulkMessagingEnabled: false,
    automaticTriggersEnabled: false,
    credentialsExposed: false,
    usage: usage,
  };
}
function h38TmTwilioConfig_() {
  var p = boGetProperties_(),
    cfg = {
      accountSid: p.getProperty("H38_SMS_TWILIO_ACCOUNT_SID") || "",
      authToken: p.getProperty("H38_SMS_TWILIO_AUTH_TOKEN") || "",
      fromNumber: p.getProperty("H38_SMS_FROM_NUMBER") || "",
    };
  boAssert_(
    cfg.accountSid && cfg.authToken && cfg.fromNumber,
    "Twilio credentials and an approved sending number must be stored in Script Properties.",
  );
  return cfg;
}
function h38TmTwilioRequest_(method, path, form) {
  var cfg = h38TmTwilioConfig_(),
    options = {
      method: method,
      muteHttpExceptions: true,
      headers: {
        Authorization:
          "Basic " +
          Utilities.base64Encode(cfg.accountSid + ":" + cfg.authToken),
      },
    };
  if (form) options.payload = form;
  var response = UrlFetchApp.fetch(
      "https://api.twilio.com/2010-04-01/Accounts/" +
        encodeURIComponent(cfg.accountSid) +
        path,
      options,
    ),
    code = response.getResponseCode(),
    text = response.getContentText(),
    json = {};
  try {
    json = JSON.parse(text || "{}");
  } catch (error) {
    json = { raw: text };
  }
  return { ok: code >= 200 && code < 300, code: code, json: json };
}
function h38TmProviderSend_(message) {
  var provider = boPackValue_("messaging.provider", "none");
  boAssert_(provider === "twilio", "No paid SMS provider is configured.");
  var cfg = h38TmTwilioConfig_();
  return h38TmTwilioRequest_("post", "/Messages.json", {
    To: message["Normalized Phone"],
    From: cfg.fromNumber,
    Body: message["Message Body"],
  });
}
function h38TmRecordUsage_(message, direction) {
  direction = direction || message.Direction;
  var body = message["Message Body"] || "",
    segments = Math.max(1, Math.ceil(body.length / 160)),
    existing = h38TmRead_("USAGE", { includeVoided: true }).find(
      function (row) {
        return (
          row["Message ID"] === message["Message ID"] &&
          row.Direction === direction
        );
      },
    ),
    values = {
      "Message ID": message["Message ID"],
      Provider: message.Provider || "twilio",
      Direction: direction,
      Segments: segments,
      "Provider Price": message["Provider Price"] || "",
      "Provider Price Unit": message["Provider Price Unit"] || "",
      "Carrier Fee Estimate": existing
        ? existing["Carrier Fee Estimate"] || ""
        : "",
      "Recorded Time": h38TmNow_(),
      Notes:
        "One usage row is maintained per message and direction; provider price may arrive after delivery sync.",
    };
  return existing
    ? h38TmUpdate_("USAGE", existing["Usage ID"], values)
    : h38TmAppend_("USAGE", values);
}
function h38TmSendMessage_(messageId) {
  var owner = boRequireOwner_();
  boRequireRestrictedArea_("send");
  var message = h38TmFind_("MESSAGES", messageId);
  boAssert_(
    message.Direction === "Outbound",
    "Only outbound messages can be sent.",
  );
  boAssert_(
    message.Status === "Approved" &&
      message["Approval Status"] === "Approved" &&
      message["Send Allowed"] === "Yes",
    "Owner approval and Send Allowed are required.",
  );
  boAssert_(
    message["Retry Locked"] !== "Yes",
    "Retry is locked because delivery is uncertain.",
  );
  var consent = h38TmConsentForPhone_(message["Normalized Phone"]);
  boAssert_(
    consent && consent["Consent Status"] === "Consented",
    "Consent is missing or the customer opted out.",
  );
  var duplicate = h38TmDuplicateMessage_(message);
  boAssert_(
    !duplicate,
    "Duplicate-message lock prevented sending. Existing message: " +
      (duplicate ? duplicate["Message ID"] : ""),
  );
  h38TmAssertUsageAvailable_(message);
  var status = h38TmProviderStatus_();
  if (
    !status.outboundReleased ||
    !status.credentialsConfigured ||
    !status.fromNumberConfigured ||
    !status.businessRegistrationApproved
  ) {
    h38TmMessageEvent_(
      messageId,
      "SEND_HOLD",
      "NOT_RELEASED",
      "HOLD",
      "No external action. Configure provider credentials, approved business registration, and explicit release.",
      owner,
    );
    boProof_(
      "SMS_SEND_HOLD",
      "Message",
      messageId,
      "HOLD",
      "Provider send remains locked; no external request.",
      owner.Email,
    );
    return {
      status: "HOLD",
      message: message,
      providerStatus: status,
      externalActionsOccurred: false,
    };
  }
  h38TmUpdate_("MESSAGES", messageId, {
    Status: "Sending",
    "Provider Status": "Submitting",
  });
  try {
    var result = h38TmProviderSend_(message);
    if (result.ok) {
      var json = result.json || {},
        saved = h38TmUpdate_("MESSAGES", messageId, {
          Status: "Sent",
          "Provider Message ID": json.sid || "",
          "Provider Status": json.status || "queued",
          "Sent Time": h38TmNow_(),
          "Provider Error Code": "",
          "Provider Error Message": "",
        });
      h38TmMessageEvent_(
        messageId,
        "PROVIDER_ACCEPTED",
        saved["Provider Status"],
        "PASS",
        "Provider accepted message " + (json.sid || ""),
        owner,
      );
      h38TmRecordUsage_(saved, "Outbound");
      boProof_(
        "SMS_SEND",
        "Message",
        messageId,
        "PASS",
        "Twilio accepted selected message " + (json.sid || ""),
        owner.Email,
      );
      return { status: "PASS", message: saved, externalActionsOccurred: true };
    }
    var failed = h38TmUpdate_("MESSAGES", messageId, {
      Status: "Failed",
      "Provider Status": "HTTP " + result.code,
      "Failed Time": h38TmNow_(),
      "Provider Error Code": String((result.json || {}).code || result.code),
      "Provider Error Message": String(
        (result.json || {}).message || "Provider rejected message",
      ),
      "Send Allowed": "No",
    });
    h38TmMessageEvent_(
      messageId,
      "PROVIDER_REJECTED",
      failed["Provider Status"],
      "FAIL",
      failed["Provider Error Message"],
      owner,
    );
    boError_(
      "SMS provider",
      "Message",
      messageId,
      new Error(failed["Provider Error Message"]),
      "Error",
    );
    return { status: "FAIL", message: failed, externalActionsOccurred: true };
  } catch (error) {
    var blocked = h38TmUpdate_("MESSAGES", messageId, {
      Status: "Blocked — Delivery Unknown",
      "Provider Status": "Unknown",
      "Retry Locked": "Yes",
      "Send Allowed": "No",
      "Provider Error Message": error.message || String(error),
    });
    h38TmMessageEvent_(
      messageId,
      "DELIVERY_UNKNOWN",
      "Unknown",
      "HOLD",
      "Automatic retry locked. Manual provider review required.",
      owner,
    );
    boError_("SMS unknown delivery", "Message", messageId, error, "Critical");
    return {
      status: "HOLD",
      message: blocked,
      externalActionsOccurred: true,
      automaticRetry: false,
    };
  }
}
function h38TmSyncMessageStatus_(messageId) {
  var user = boGetCurrentUser_();
  boAssert_(
    h38TmManageAll_(user),
    "Owner or Administrator access is required.",
  );
  var message = h38TmFind_("MESSAGES", messageId);
  h38TmRequireMessageAccess_(message, user, true);
  boAssert_(
    message["Provider Message ID"],
    "No provider message ID is recorded.",
  );
  var status = h38TmProviderStatus_();
  boAssert_(
    status.credentialsConfigured,
    "Provider credentials are not configured.",
  );
  var result = h38TmTwilioRequest_(
    "get",
    "/Messages/" + encodeURIComponent(message["Provider Message ID"]) + ".json",
    null,
  );
  boAssert_(result.ok, "Provider status lookup failed: HTTP " + result.code);
  var json = result.json || {},
    mapped =
      {
        delivered: "Delivered",
        failed: "Failed",
        undelivered: "Failed",
        sent: "Sent",
        queued: "Sent",
        accepted: "Sent",
        sending: "Sent",
      }[json.status] || message.Status,
    patch = {
      Status: mapped,
      "Provider Status": json.status || "",
      "Provider Error Code": String(json.error_code || ""),
      "Provider Error Message": String(json.error_message || ""),
      "Provider Price": String(json.price || ""),
      "Provider Price Unit": String(json.price_unit || ""),
    };
  if (mapped === "Delivered" && !message["Delivered Time"])
    patch["Delivered Time"] = h38TmNow_();
  if (mapped === "Failed" && !message["Failed Time"])
    patch["Failed Time"] = h38TmNow_();
  var saved = h38TmUpdate_("MESSAGES", messageId, patch);
  h38TmMessageEvent_(
    messageId,
    "STATUS_SYNC",
    saved["Provider Status"],
    "PASS",
    "Provider status synchronized.",
    user,
  );
  h38TmRecordUsage_(saved, "Outbound");
  return { status: "PASS", message: saved, externalActionsOccurred: true };
}
function h38TmSyncInbound_() {
  var user = boGetCurrentUser_();
  boAssert_(
    h38TmManageAll_(user),
    "Owner or Administrator access is required.",
  );
  var status = h38TmProviderStatus_();
  if (
    !status.inboundSyncReleased ||
    !status.credentialsConfigured ||
    !status.fromNumberConfigured
  ) {
    boProof_(
      "SMS_INBOUND_SYNC",
      "Messaging",
      boGetBusinessId_(),
      "HOLD",
      "Inbound provider sync remains locked; no external request.",
      user.Email,
    );
    return {
      status: "HOLD",
      imported: 0,
      externalActionsOccurred: false,
      providerStatus: status,
    };
  }
  var cfg = h38TmTwilioConfig_(),
    result = h38TmTwilioRequest_(
      "get",
      "/Messages.json?To=" +
        encodeURIComponent(cfg.fromNumber) +
        "&PageSize=50",
      null,
    );
  boAssert_(result.ok, "Inbound provider sync failed: HTTP " + result.code);
  var imported = [];
  (result.json.messages || []).forEach(function (item) {
    if (item.direction !== "inbound") return;
    var exists = h38TmRead_("MESSAGES", { includeVoided: true }).some(
      function (row) {
        return row["Provider Message ID"] === item.sid;
      },
    );
    if (exists) return;
    var phone = item.from || "",
      body = item.body || "",
      message = h38TmAppend_("MESSAGES", {
        Direction: "Inbound",
        Channel: "SMS",
        Provider: "twilio",
        "Provider Message ID": item.sid || "",
        "Conversation Key": h38TmHash_(
          ["", h38TmNormalizePhone_(phone)].join("|"),
        ).slice(0, 24),
        "Phone Number": phone,
        "Normalized Phone": h38TmNormalizePhone_(phone),
        "Message Body": body,
        Status: h38TmStopWord_(body) ? "Opted Out" : "Received",
        "Approval Status": "Not Required",
        "Send Allowed": "No",
        "Provider Status": item.status || "received",
        "Received Time": h38TmNow_(),
        "Duplicate Key": h38TmHash_([item.sid, phone, body].join("|")),
        "Retry Locked": "No",
        "Created By User ID": "SYSTEM",
        Notes: "Imported by manual provider sync.",
      });
    if (h38TmStopWord_(body)) {
      h38TmOptOut_(phone, "Inbound STOP keyword", message["Message ID"]);
      h38TmUpdate_("MESSAGES", message["Message ID"], {
        "Opted Out Time": h38TmNow_(),
      });
    }
    h38TmMessageEvent_(
      message["Message ID"],
      "INBOUND_RECEIVED",
      item.status || "received",
      "PASS",
      "Imported by selected manual sync.",
      user,
    );
    h38TmRecordUsage_(message, "Inbound");
    imported.push(message["Message ID"]);
  });
  boProof_(
    "SMS_INBOUND_SYNC",
    "Messaging",
    boGetBusinessId_(),
    "PASS",
    "Imported " +
      imported.length +
      " new inbound messages; no automatic replies.",
    user.Email,
  );
  return {
    status: "PASS",
    imported: imported.length,
    messageIds: imported,
    externalActionsOccurred: true,
    automaticReplies: false,
  };
}
function h38TmConvertReplyToTask_(messageId, values) {
  var user = boGetCurrentUser_(),
    message = h38TmFind_("MESSAGES", messageId);
  h38TmRequireMessageAccess_(message, user, true);
  boAssert_(
    message.Direction === "Inbound",
    "Only an inbound customer reply can become a task.",
  );
  var taskValues = Object.assign(
    {
      "Task Title": "Follow up on customer text",
      "Task Type": "Customer SMS reply",
      "Assigned User ID": user["User ID"],
      Priority: "Normal",
      Status: "Open",
      Instructions: message["Message Body"],
      "Linked Record Type": "",
      "Linked Record ID": "",
      "Customer ID": message["Customer ID"],
      "Task ID": "",
      Notes: "Created from inbound message " + messageId,
    },
    values || {},
  );
  var task = h38TmSaveTask_("", taskValues);
  h38TmUpdate_("MESSAGES", messageId, {
    "Task ID": task["Task ID"],
    Notes: [message.Notes, "Converted to task " + task["Task ID"]]
      .filter(Boolean)
      .join(" | "),
  });
  h38TmMessageEvent_(
    messageId,
    "CONVERTED_TO_TASK",
    message.Status,
    "PASS",
    task["Task ID"],
    user,
  );
  return {
    status: "PASS",
    task: task,
    messageId: messageId,
    externalActionsOccurred: false,
  };
}
function h38TmSaveTemplate_(recordId, values) {
  var user = boGetCurrentUser_();
  boAssertModuleEnabled_("messageTemplates");
  h38TmRequireModule_("messageTemplates", recordId ? "Edit" : "Create");
  boAssert_(h38TmCanWrite_(user), "Viewer access is read-only.");
  var before = recordId ? h38TmFind_("TEMPLATES", recordId) : null,
    input = Object.assign({}, before || {}, values || {});
  delete input.__rowNumber;
  input["Template Name"] = boNormalizeText_(input["Template Name"]);
  boAssert_(input["Template Name"], "Template name is required.");
  input["Message Body"] = h38TmMessageBody_(input["Message Body"]);
  input.Status = boNormalizeText_(input.Status) || "Active";
  input["Created By User ID"] = before
    ? before["Created By User ID"]
    : user["User ID"];
  var saved = recordId
    ? h38TmUpdate_("TEMPLATES", recordId, input)
    : h38TmAppend_("TEMPLATES", input);
  boProof_(
    "MESSAGE_TEMPLATE",
    "Template",
    saved["Template ID"],
    "PASS",
    "Internal template only.",
    user.Email,
  );
  return saved;
}
