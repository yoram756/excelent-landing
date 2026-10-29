# TextMe API preparation for the Excellent dot

This isolated integration extends the existing n8n infrastructure. It does not
modify the LP funnel, its SMS fallback, Cosend or Blueticks. There is no provider
send transport in this package.

## Verified deployment

| Workflow | ID | Actual state |
|---|---|---|
| Existing SMS subworkflow | UyusbbjI1hgkZ76k | Preserved, unpublished on inspection |
| Balance-only manual probe | 24CuXS88ao2olgfd | Actual provider read, execution 62442 |
| Restricted read subworkflow | 3K6A1ipS8Qt04WVD | Published 29 October; earlier direct read 62548, later authenticated MCP acceptance 65692 |
| Manual read acceptance | Is1XtE3b6cHSiHN2 | Execution 62546 succeeded; no send/schedule node |
| MCP gateway | iKMn0xVxqoBqrBxK | Published with owner approval; dedicated Bearer binding verified, MCP acceptance 65692; Dot host compatibility remains blocked |
| Superseded editor experiment | r1nCwSHsi6CX45ix | Archived reversibly; never published or executed |

The existing `TextMe API` Header Auth credential stays inside n8n. Its ID is
metadata, not a token. Do not inspect its value, duplicate it or use it to
authenticate callers of the MCP gateway. The separate owner-created Bearer
credential was bound and verified on 29 October without reading its value.

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
auto-selected Header Auth binding. That initial export had no caller credential;
the later owner-created dedicated Bearer reference was verified before acceptance.
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
4. A fixed Bearer server can declare `streamable-http` with server
   `extensions.com.openai.auth` set to `{"type":"api_key","headerScheme":"bearer"}`.
   This is a package declaration, not a verified hosted Dot connection. On
   29 October 2026 the hosted custom MCP form offered OAuth, no authentication
   and mixed OAuth only, with no fixed-token entry. Backend execution 65692
   passed, but the actual Dot attempt at 08:14 was blocked by a missing tool.
   First provide a supported narrow OAuth connection or approved private tunnel,
   then register the connection and verify actual Dot tools. Never downgrade
   authentication or put the caller token in a URL, headers file or package.
   Discovery on the current host returns the instance-wide `/mcp-server/http`
   resource and management scopes; those are not approval for TextMe access.
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

## Approved local OAuth preparation, 29 October 2026

The owner approved preparation without an additional charge. See
`oauth-bridge/README.md` and `docs/runtime/TEXTME_OAUTH_PREP_20261029.md`.
The dedicated read-only facade is implemented and tested locally; it is not
deployed, registered with the host or connected to Dot. The verified callback
was copied from the host UI, but owner consent and an actual Dot balance read
remain blocked until secure publication and connection. No provider credential,
upstream caller key or private MCP route is included in this repository.
