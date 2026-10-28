# Atomic intake migration, 2026-10-28

| Requirement | Status | Evidence and scope |
|---|---|---|
| Adapt the deployment tool to the guarded 37-node workflow | PASS | `src/webhooks/intake/atomic-export.js`, `atomic-shape.json` and `patch-export.js`; fresh private production export accepted and 41-node output generated, CLI exit 0. |
| Preserve existing nodes, error routes and settings in the generated patch | PASS | Deep comparison against the fresh 37-node export: all original node objects and settings unchanged; only the new-lead branch is redirected through four admission nodes. Existing Stop And Error receives controlled failures. Both WhatsApp nodes remain disabled. This is generated-file evidence, not deployed-state evidence. |
| Concurrent admission and fail-closed behavior | PASS | Local `npm run test:funnel`, exit 0, 385/385. Two HTTP workers share one SQLite database: 20 concurrent executions permit one simulated CRM write and reject 19. Removing the gate produces 20 writes and is detected by the negative control. Invalid/expired responses, authentication/rate/provider errors and transport failures cannot reach the simulated CRM boundary. Log: `tests/out/atomic-intake-20261028/funnel.log` (private, ignored). |
| Real published n8n admission and Monday duplicate prevention | NOT TESTED | Publication and a production race with independent Monday readback are still required. Local simulation is not production proof. |
| Send WhatsApp messages | NOT TESTED | Explicitly excluded by the current instruction. No send nodes are added or enabled by this migration. |

Use a fresh private export. Set LOCK_SERVER_URL and the ID of the existing Header Auth credential, then run `node src/webhooks/intake/patch-export.js input.private.json output.private.json`. The 37-node migration does not require an instant-reply workflow ID. Keep private exports out of Git. A node-only editor update must retain existing runtime static data; do not replace the workflow database record with the generated file. Export and compare the draft before publishing. Do not change n8n settings or credential contents.
