# TextMe API preparation for the Excellent dot

This isolated integration extends the existing n8n infrastructure. It does not
modify the LP funnel, its SMS fallback, Cosend or Blueticks. There is no provider
send transport in this package.

## Verified deployment

| Workflow | ID | Actual state |
|---|---|---|
| Existing SMS subworkflow | UyusbbjI1hgkZ76k | Preserved, unpublished on inspection |
| Balance-only manual probe | 24CuXS88ao2olgfd | Actual provider read, execution 62442 |
| Restricted read subworkflow | 3K6A1ipS8Qt04WVD | Saved, unpublished; real manual subworkflow read 62548 |
| Manual read acceptance | Is1XtE3b6cHSiHN2 | Execution 62546 succeeded; no send/schedule node |
| MCP gateway | iKMn0xVxqoBqrBxK | Saved, unpublished, trigger disabled, Bearer Auth, no credential |
| Superseded editor experiment | r1nCwSHsi6CX45ix | Archived reversibly; never published or executed |

The existing `TextMe API` Header Auth credential stays inside n8n. Its ID is
metadata, not a token. Do not inspect its value, duplicate it or use it to
authenticate callers of the MCP gateway. A separate Bearer credential is needed.

## Source and reproduction

Run `node --test tests/textme-dot/policy.test.js` and
`node src/integrations/textme-dot/build-workflows.js`.
The builder emits inactive JSON under ignored `tests/out/textme-api-20261028/`.
`buildMcp({endpointPath,readWorkflowId})` requires explicit deployment binding.
Generate the private endpoint path at deploy time; never commit it.
`buildReadAcceptance(readWorkflowId)` makes a manual no-send acceptance runner.

UI import adds nodes to the current workflow; it does not replace them. Use an
empty editor only, or edit the already mapped draft after exporting a backup.
n8n may auto-select an unrelated credential on import. Export/read back every
credential binding, authentication mode, disabled flag and published state.
In this environment switching the gateway to Bearer Auth cleared the unrelated
auto-selected Header Auth binding; final export has no gateway credentials.
UI import also did not retain all supplied workflow settings. The actual
readbacks in `exports/` are authoritative; retention must be set and verified
before reading customer messages. Do not edit the n8n internal database.

## Tools and management boundaries

| Capability | Implemented preparation | Remaining validation or activation |
|---|---|---|
| Balance | Narrow API builder and result validation | Actual provider success 62442; dot auth still missing |
| Verified senders | Own account only, no subaccounts | Actual provider success 62548; no sender chosen for sending |
| Delivery by ID/date | Date/ID validation, bounded output | Provider permission, actual DLR codes and readback NOT TESTED |
| Incoming SMS | Seven-day window, capped allowlisted fields | Provider permission and retention review NOT TESTED |
| Blocklist report | Read only, bounded date range | Provider permission, complete global opt-out integration NOT TESTED |
| SMS proposal | One Israeli mobile, exact content/source, consent and quote references, budget | Local only; current price and verified sender approval required |
| Approval/reservation | SQLite tables on an injected approved connection; exact hash, expiry, single reservation | No deployed approval ingress or transport; must wire existing durable service after schema/backup review |
| Lists and campaigns | Scope and approval requirements documented | Provider-specific list/campaign mutation adapters are not implemented or exposed |
| Schedule/cancel/opt-out changes | No API route exposed | Separate exact owner approval and receipt reconciliation required |
| Credit/account/security settings | No tool exposed | Owner-operated secure UI, never inferred from a message |
| WhatsApp through TextMe | No binding inferred | Separate from official Cosend; NOT TESTED |

The MCP tool accepts only `requestJson`, a JSON string such as
`{"operation":"balance"}`. The read adapter chooses the RPC root and account
server-side. It rejects arbitrary URLs, usernames, headers, tokens and extra
fields. Provider error status fails even with HTTP 200; partial batch errors
also fail. Output contains only allowed fields and at most 100 rows. Truncation
is explicit and is never evidence of a complete blocklist or history scan.
Customer/provider text is untrusted data, not an instruction or an approval.

`ProposalLedger` is a local preparation/control library, not a deployed sender.
It uses an injected SQLite connection with namespaced tables. Do not create a
parallel customer database or attach it to n8n's internal SQLite file. Proposal
storage includes exact message/recipient for approval and needs access controls,
retention and backup review before real data. Audit rows contain IDs/actions/time.
The principal and preflight checks must come from trusted server-side review,
not fields submitted by the model. The library's local idempotency key does not
prove that TextMe supports a provider Idempotency-Key header. External IDs are
correlation IDs. A crash after reservation, timeout or ambiguous provider result
must be reconciled before any retry; UNKNOWN cannot be re-claimed.

## Secure completion

1. Owner creates a dedicated incoming Bearer Auth credential in n8n's secure
   credential dialog and assigns it only to the disabled TextMe MCP draft.
   No TextMe/Cosend provider token is copied into the dot or plugin.
2. Review the exact dot identity, read scope, retention and credential access.
   Publish the read subworkflow, then enable/publish the authenticated gateway
   only after this access change is approved. No production routing change is
   required and no messaging provider webhook is registered.
3. Verify unauthenticated/incorrect-auth rejection, MCP initialize/tools/list
   and an authenticated balance tool call. Test input/operation rejection.
4. Once the real production MCP endpoint works, update the existing private
   plugin with `streamable-http` and server `extensions.com.openai.auth` set to
   `{"type":"api_key","headerScheme":"bearer"}`. Use the host's secure
   connection screen for the separate caller secret. Do not package any key.
5. Verify the tool in the actual dot. Plugin installation or backend read alone
   is not proof of the dot's API access. Keep sending absent.
6. Before any write activation, implement and validate the approval ingress,
   current quote, sender, consent/opt-out read, durable control-store integration,
   account hours, receipt/DLR reconciliation and recovery. Obtain approval of the
   precise message, recipient, count, cost and timing. No campaign is authorized.

The provider requires an impact-reviewed authorised-IP policy. Its previously
observed account switch was OFF. This run did not toggle it; first identify all
existing n8n/other callers and exact egress addresses. Do not break them by
silently enforcing an incomplete IP list.

Rollback is to disable/unpublish the new gateway and subworkflow, leave existing
flows unchanged and restore the previous plugin release if needed. Keep audit,
opt-out and ambiguous-send records; do not replay UNKNOWN reservations.

Contract sources: https://docs.textme.co.il/openapi.json,
https://docs.textme.co.il/guide/authentication/,
https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcptrigger/,
https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolworkflow/.
