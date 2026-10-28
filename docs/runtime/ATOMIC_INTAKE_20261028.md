# Atomic intake lock closure, 2026-10-28

Status: PASS for the atomic intake task. This does not declare the whole project ready for go-live.

| Requirement | Status | Evidence |
|---|---|---|
| Deployment tool for the guarded 37-node intake | PASS | Source commit e494d25; four additive nodes plus an explicit rewiring plan, without deleting original nodes. |
| Original nodes, settings and error handling preserved | PASS | Private export of version 60101067-81e0-4daa-b9b2-d4cfa7b9d736 compared to generated source: all 37 original node objects and settings unchanged; final connections match. New node IDs and positions are assigned by the editor. |
| Local regression and fail-closed cases | PASS | npm run test:funnel exit 0, 386/386; tests/out/atomic-intake-20261028/funnel-final.log. Two HTTP workers on shared SQLite: 20 concurrent requests permit one simulated CRM write. Invalid/expired/provider/transport failures cannot reach CRM; negative controls detect a bypass. These are local tests. |
| Production publication | PASS | n8n Publish Timeline: Active Published Atomic intake gate 20261028 at 22:20 Asia/Jerusalem. Editor subsequently shows Published. Runtime execution 61968 succeeded in 4.308 seconds. |
| Production concurrent duplicate prevention | PASS | Three simultaneous actual POSTs to the live /api/lead: one HTTP 200, request_id 3316200363; two HTTP 409 duplicate_pending. No automatic retry. |
| Independent Monday readback | PASS | Exactly one matching event, TEST-atomic-production-20261028-001, on board 5106246268; normalized synthetic phone 972500000081 and personsAndTeams user 75075191 confirmed through the raw API. |
| Controlled errors and central alerts | PASS | Executions 61969 and 61970 stopped at Stop And Error with Atomic lead lock already held, before any Monday save. Owned central-handler alerts 3316177368 and 3316194874 read back status נעצר / כשל. |
| Test cleanup | PASS | Raw API readback: 3316200363, 3316177368 and 3316194874 are deleted. All four baseline records remain active, including the pre-existing historical record 3291304369. |
| No WhatsApp sends | PASS | Both original WhatsApp nodes remain disabled in the graph and execution view; none added or enabled. Input grants no marketing channels, and no WhatsApp send tool/provider was invoked. |
| Induced production lock outage | NOT TESTED | No service outage or n8n settings change was induced; failure cases were checked locally. |

Build the additive editor artifact with node src/webhooks/intake/patch-export.js input.private.json delta.private.json --incremental, using LOCK_SERVER_URL and the existing LOCK_CREDENTIAL_ID. Apply the accompanying .plan.json: remove one old connection, add three external connections. Importing the full 41-node file into an occupied editor appends duplicates; use the additive artifact. Verify the complete exported graph before publication. Keep exports, runtime static data and test payloads private and ignored by Git. The IF condition serialization format is explicitly version 1.

The preserved production validator expects a legacy hyphen-compatible idempotency_key. This fixture used the same hyphen-compatible value for event_id and idempotency_key; the migration does not change the validator contract.

Detailed production evidence: [atomic-intake-20261028.json](atomic-intake-20261028.json).

Remaining whole-project work is unchanged: Meta CAPI sender credential/receipt, Calendly live readback, excluded WhatsApp activation/delivery, approved video assets and the decision about the historical test record. See PILOT_READINESS.md.
