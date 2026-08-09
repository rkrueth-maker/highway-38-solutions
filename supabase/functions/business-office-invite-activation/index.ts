import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);
const REDIRECT_TO = "https://highway38solutions.com/commercial-app/?invitation=1";
const MAX_BODY_BYTES = 16 * 1024;
const REQUEST_COOLDOWN_MS = 10 * 60 * 1000;

function originValue(origin: string | null): string {
  return String(origin || "").trim().replace(/\/+$/, "");
}
function corsHeaders(origin: string | null): HeadersInit {
  const requested = originValue(origin);
  const allowed = ALLOWED_ORIGINS.has(requested)
    ? requested
    : "https://highway38solutions.com";
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-headers": "authorization, content-type, x-client-info, apikey",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-max-age": "600",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "vary": "Origin",
  };
}
function json(origin: string | null, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders(origin) });
}
function safeMessage(error: unknown): string {
  return String(error instanceof Error ? error.message : error || "Invitation request failed.")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/sb_secret_[A-Za-z0-9_-]+/g, "[REDACTED_KEY]")
    .replace(/sb_service_role_[A-Za-z0-9_-]+/g, "[REDACTED_KEY]")
    .slice(0, 700);
}
function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}
function validEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 254;
}
function genericSuccess(origin: string | null): Response {
  return json(origin, 200, {
    status: "PASS",
    message: "If this email has a pending Business Office invitation, a secure activation email has been sent. Use only the newest email and open it on the same device.",
    requestOutcomeDisclosed: false,
    automaticBusinessActivation: false,
  });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const normalizedOrigin = originValue(origin);

  if (request.method === "OPTIONS") {
    if (!ALLOWED_ORIGINS.has(normalizedOrigin)) {
      return new Response(null, { status: 403, headers: corsHeaders(origin) });
    }
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method === "GET") {
    return json(origin, 200, {
      status: "PASS",
      service: "business-office-invite-activation",
      version: "1.0.1",
      inviteOnly: true,
      passwordHandledByFunction: false,
      redirectOrigin: new URL(REDIRECT_TO).origin,
      serviceRoleExposedToBrowser: false,
      automaticBusinessActivation: false,
      externalActionsEnabled: false,
    });
  }

  if (request.method !== "POST") {
    return json(origin, 405, { status: "FAIL", error: "Method not allowed." });
  }
  if (!ALLOWED_ORIGINS.has(normalizedOrigin)) {
    return json(origin, 403, { status: "FAIL", error: "Invitation requests must originate from an approved Highway 38 page." });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json(origin, 413, { status: "FAIL", error: "Invitation request is too large." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json(origin, 503, { status: "FAIL", error: "Invitation service is unavailable." });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    if (!validEmail(email)) {
      return json(origin, 400, { status: "FAIL", error: "Enter a valid invited email address." });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-client-info": "h38-business-office-invite-activation" } },
    });

    const { data: invitations, error: invitationError } = await admin
      .from("business_memberships")
      .select("id,business_id,invited_email,role,status,auth_user_id,businesses!inner(id,business_key,display_name,status)")
      .eq("status", "invited")
      .is("auth_user_id", null)
      .ilike("invited_email", email)
      .limit(10);
    if (invitationError) throw invitationError;

    const invitation = (invitations || []).find((row: any) => {
      const business = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
      return business && (business.status === "provisioning" || business.status === "active");
    }) as any;

    if (!invitation) return genericSuccess(origin);

    const business = Array.isArray(invitation.businesses)
      ? invitation.businesses[0]
      : invitation.businesses;
    const cooldownStart = new Date(Date.now() - REQUEST_COOLDOWN_MS).toISOString();
    const { data: recentProof, error: recentError } = await admin
      .from("business_proof_log")
      .select("id,created_at")
      .eq("business_id", invitation.business_id)
      .eq("action_type", "BUSINESS_INVITATION_EMAIL_SENT")
      .gte("created_at", cooldownStart)
      .contains("details", { invitedEmail: email })
      .order("created_at", { ascending: false })
      .limit(1);
    if (recentError) throw recentError;
    if ((recentProof || []).length) return genericSuccess(origin);

    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: REDIRECT_TO,
      data: {
        invitation_type: "business_office_membership",
        business_id: invitation.business_id,
        business_key: business.business_key,
        business_name: business.display_name,
        requested_role: invitation.role,
      },
    });

    if (inviteError) {
      const message = String(inviteError.message || "");
      if (/already.*registered|already.*exists|user.*exists/i.test(message)) {
        await admin.from("business_proof_log").insert({
          business_id: invitation.business_id,
          actor_user_id: null,
          action_type: "BUSINESS_INVITATION_ACCOUNT_ALREADY_EXISTS",
          entity_type: "business_membership",
          entity_id: invitation.id,
          result: "HOLD",
          details: {
            invitedEmail: email,
            businessKey: business.business_key,
            instruction: "Use Sign in or Reset password. The exact-email invitation will be claimed after authentication.",
            externalActionOccurred: false,
          },
          external_action_occurred: false,
        });
        return genericSuccess(origin);
      }
      throw inviteError;
    }

    await admin.from("business_onboarding_runs").update({
      status: "invited",
      invitation_requested_at: new Date().toISOString(),
    }).eq("business_id", invitation.business_id);

    const { error: proofError } = await admin.from("business_proof_log").insert({
      business_id: invitation.business_id,
      actor_user_id: null,
      action_type: "BUSINESS_INVITATION_EMAIL_SENT",
      entity_type: "business_membership",
      entity_id: invitation.id,
      result: "PASS",
      details: {
        invitedEmail: email,
        businessKey: business.business_key,
        requestedRole: invitation.role,
        authUserId: inviteData.user?.id || null,
        redirectOrigin: new URL(REDIRECT_TO).origin,
        ownerRequestedActivation: true,
        customerMessageSent: false,
        automaticBusinessActivation: false,
      },
      external_action_occurred: true,
    });
    if (proofError) throw proofError;

    return genericSuccess(origin);
  } catch (error) {
    const message = safeMessage(error);
    console.error(JSON.stringify({
      event: "business_office_invite_activation_failed",
      origin: normalizedOrigin,
      error: message,
    }));
    return json(origin, 500, {
      status: "FAIL",
      error: "The secure invitation could not be sent. Wait a few minutes and try again, or contact Highway 38 support.",
    });
  }
});
