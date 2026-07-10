# H38 Owner Portal Apps Script — clasp setup

This folder is the move away from browser copy/paste Apps Script editing.

## Goal

Use `clasp push` so Version 6 Owner Review Portal code can be edited as files and pushed into Apps Script.

## One-time setup on your computer

Open PowerShell in a folder where you keep projects and run:

```powershell
npm install -g @google/clasp
clasp login
```

Then clone the existing Apps Script project:

```powershell
mkdir h38-owner-portal-apps-script
cd h38-owner-portal-apps-script
clasp clone 13Bes6_rs3LD-Sch4Vi5DKssCnIU_qb4hzZpGpDVfoRELRAk0HtXEJ7o
```

After that, future changes are:

```powershell
clasp pull
# edit files with Copilot / VS Code
clasp push
```

## Safety rules

Do not enable triggers during setup.
Do not send test emails during setup.
Do not change GitHub Pages.
Do not publish social posts.
Do not request payment.
Do not deliver final customer work.

## First target fix after cloning

Search the cloned Apps Script files for these names:

```text
h38OwnerApprovedSendSelectedDraft
sendApprovedEmailDraftForSelectedRow
h38ApproveSelectedRow
h38ApproveSelectedRowForSend
```

Normalize to one real function name:

```javascript
function h38OwnerApprovedSendSelectedDraft() {
  // selected Email Approval Queue row only
}
```

The spreadsheet menu must call exactly:

```text
h38OwnerApprovedSendSelectedDraft
```

## Verification

After `clasp push`, refresh the Owner Review Portal spreadsheet and run a blocked-row safety test first.

Expected blocked-row result:

```text
No email sent.
No quote approved.
No payment requested.
No final delivery.
No website/social publish.
No trigger.
```
