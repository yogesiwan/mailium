# AutoBot to Mailium draft sync

AutoBot can replace the recipient selection for one India scan date without sending email. Mailium creates at most one draft per owner, integration ID, and scan date. The owner reviews the complete list and rendered message in the campaign detail page, chooses a future send time, timezone, and delay, then explicitly schedules it.

## Configure the integration

Set these variables in Mailium's server environment. The route remains unavailable when the required values are missing.

| Variable | Required | Purpose |
| --- | --- | --- |
| `AUTOBOT_INTEGRATION_ID` | Yes | Stable source identity, for example `jobs-sheet`. Keep it when rotating the token. |
| `AUTOBOT_OWNER_USER_ID` | Yes | Mailium user that owns the template and Gmail sender. |
| `AUTOBOT_DEFAULT_TEMPLATE_ID` | Yes | Template copied when the first nonempty selection arrives for a date. |
| `AUTOBOT_SYNC_TOKEN_SHA256` | Yes | Lowercase or uppercase hex SHA-256 digest of a dedicated random bearer token. |
| `AUTOBOT_SENDER_EMAIL` | No | Optional sender; must match the owner's configured Mailium sender identity. |
| `AUTOBOT_MAX_RECIPIENTS` | No | Per-request cap; defaults to 500 and cannot exceed 500. |

Generate a dedicated token outside Mailium, store the raw value only in the private Apps Script project's Script Properties, and configure only its SHA-256 digest in Mailium. Rotate access by changing the digest and the Apps Script property. Requests use the HTTPS API route; the bearer token is scoped to this one sync endpoint and is never written to logs.

The current production MongoDB reports a replica set, so draft reconciliation and activation use MongoDB transactions. A standalone MongoDB uses the durable sync selection, lock, and recovery path instead.

## Sync endpoint

```http
PUT /api/integrations/autobot/drafts/YYYY-MM-DD/recipients
Authorization: Bearer <raw-token>
Content-Type: application/json
```

```json
{
  "selectionVersion": 1,
  "recipients": [
    {
      "jobId": "stable-job-id",
      "email": "recruiter@example.com",
      "contactName": "Asha Sharma",
      "company": "Example Manufacturing",
      "role": "Quality Engineer",
      "location": "Manesar",
      "jobUrl": "https://example.com/jobs/123"
    }
  ]
}
```

The display fields may be `null`. Additional fields are rejected so phone numbers and unrelated sheet data stay out of Mailium. Emails are trimmed and case-normalized. The endpoint validates the whole batch before changing the sync record or campaign. `selectionVersion` must increase per scan date; retries with the same version and content are idempotent. Older versions and mismatched replays return `409 STALE_SELECTION`. A collision with a manual or nonpending recipient returns `409 RECIPIENT_CONFLICT`.

The first nonempty request copies the configured template and sender into a draft. Empty requests are recorded even when no campaign exists. Later requests reconcile only AutoBot-managed recipients and preserve manual recipients. Syncing never creates an Agenda email job.

Successful draft sync returns `campaignId`, relative `draftPath`, `revision`, `selectionVersion`, add/remove counts, and the complete campaign recipient count. An empty selection without a campaign returns `status: "noop"` and null campaign fields.

## Review and schedule

Open the returned `draftPath` on the same Mailium origin. The detail page shows the complete recipient set, a server-rendered preview for each recipient, the revision, editable subject/body, and schedule controls. Substitutions are escaped in HTML and newlines are removed from subject values.

Scheduling calls the existing campaign send route with the reviewed revision and an explicit future timestamp, timezone, and delay. A sync that changes the draft first makes the old revision stale and requires a fresh review. Activation freezes the sync record and campaign recipient mutations. A durable pending-enqueue marker and unique Agenda jobs allow recovery after a process interruption without enqueuing the activation twice.

## Deployment verification checklist

Before configuring Apps Script, test with a non-sending test draft and verify:

- one draft per scan date, a second date, and an identical retry;
- additions, unchecking recipients, empty selection, and delayed older versions;
- manual-recipient conflicts and rejected phone/extra fields;
- template preview escaping and the fallback greeting;
- stale review rejection, scheduling in the future, and blocked sync after activation;
- no Agenda email job from sync, and one unique job after confirmed scheduling.

This implementation does not deploy Mailium or store the raw bearer token in this repository.
