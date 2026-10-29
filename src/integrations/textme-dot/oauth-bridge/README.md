# TextMe OAuth bridge preparation

Not deployed or connected to Dot. Owner approved preparation on 29 October 2026,
conditional on no additional charge. This implementation adds no paid service,
model call, subscription, customer send or provider API credential.

The existing Bearer-protected n8n MCP trigger remains unchanged. The hosted
connection needs compatible OAuth, while discovery on the n8n origin advertises
the separate instance-management resource and broad scopes. This bridge supplies
a dedicated issuer/resource and one `textme:read` scope without those permissions.

## Architecture and identity

ChatGPT OAuth authorization -> secure owner consent form -> authorization code
with mandatory PKCE S256 -> opaque short-lived access token -> exact one-tool
MCP facade -> existing n8n read subworkflow -> existing TextMe credential.

The initial pilot proves possession of the existing dedicated n8n caller key;
it does NOT claim Google/n8n SSO, verified personal identity or a new provider
account. The owner types that key only into the deployed HTTPS consent form.
The server compares it in constant time to its protected caller-key file. It
never asks for the TextMe provider token or the owner's n8n password. The agent
must not read or extract the credential from n8n. If the owner has not retained
the caller key, any secure rotation needs an impact review and synchronized
updates; no such rotation was performed here.

Only the public client ID and exact host callback(s) are registered. Dynamic
registration, anonymous data reads, client-credentials grants and refresh tokens
are disabled. The owner explicitly grants access for at most 15 minutes. This
is a bounded connection pilot, not unattended long-term management; ongoing
refresh/renewal policy is a later decision. Owner consent, CSRF and origin checks,
PKCE, exact callback matching, resource/audience checks and revocation are required.

Only initialize, initialized notification, ping, tools/list and calls to
`textme_read` are accepted. The existing read policy checks the operation,
account override rejection and seven-day/100-row bounds before any forwarding.
The upstream URL and credential cannot come from tool input. Tools/list serves
one schema with read-only annotations. Upstream results are checked before
returning account data. A timeout/error has no automatic retry.

OAuth state and MCP-session mappings use encrypted SQLite payloads and hashed
lookup IDs; encryption/signing keys persist outside Git. Authorization-code
consumption is atomic, including concurrent exchanges. Sessions bind to the
OAuth grant/client, survive restart and stop after revocation/expiry. The audit
contains event names, decisions and time only, with a 30-day cleanup window;
no SMS content, account balance, key, token or raw address is recorded.

## Local acceptance, no real account

`npm ci --ignore-scripts --no-audit --no-fund` then `npm test` in this directory.
The HTTP tests enforce loopback-only destinations and use a synthetic TextMe
upstream. The invalid-scope/PKCE/callback/resource, bad-key/CSRF, code-replay/race,
token expiry, session separation, restart, revocation and storage-tamper cases
must pass. These are not provider or actual Dot acceptance.

From `src/integrations/textme-dot`, the isolated-container commands are:

```sh
docker build --target synthetic-test -t excelent-textme-oauth-prep:20261029 -f oauth-bridge/Dockerfile .
docker run --rm --network none --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --cap-drop ALL --security-opt no-new-privileges --memory 256m --cpus 1 --pids-limit 128 excelent-textme-oauth-prep:20261029
```

The official Node base digest is pinned. No runtime test has external network,
published ports or a real credential. `npm audit --omit=dev` checks dependencies.

## Required before publication

1. Inspect current VPS capacity and the existing proxy network; preserve every
   unrelated workflow/container. No new host, plan or charge is authorized.
2. Copy the exact callback URL from the supported host's User-Defined OAuth
   Client setup. Configure the public client ID, `none` client authentication
   and PKCE. A fixture URL must never be used for a real connection.
3. Owner populates a secret file through an approved secure mechanism, mode
   0400/0600 and readable only by the service UID. Other values follow `.env.example`;
   the private MCP route stays outside Git. Keys and SQLite state need a protected
   persistent volume, backup and restore check. Do not decrypt n8n credentials.
4. `compose.draft.yml` intentionally has no published ports or routing labels.
   Inspect its resource limits, private network and TLS/proxy trust before use.
   Expose only `/textme-dot/`, the exact protected-resource metadata path and
   the exact OAuth authorization-server metadata path. Keep the n8n root metadata
   and existing routing intact. Block bypass access to the service; sanitize
   forwarded headers at the edge and apply an ingress rate limit. Test existing
   nginx config before any reload. Record exact deployment/rollback commands first.
5. Execute `node server.mjs --verify-upstream` with protected configuration.
   It checks initialize, notification and exact tool listing only: zero TextMe
   data reads. A broad upstream tool list fails. Startup with missing config fails.
6. After approval of public access, verify real TLS, discovery issuer/resource
   and only `textme:read`; reject any n8n management scope or resource. Complete
   the owner consent handoff in the real secure form, never a local test form.
7. Register the discovered connector through the host and reuse its verified App
   ID with the existing TextMe plugin; do not invent an App ID or create a second
   provider connection. `buildOAuthPluginConnection` refuses unverified deployment
   and owner-login flags. Current plugin 0.2.1 still has its old fixed-Bearer
   declaration and explicitly reports the hosted connection as blocked.
8. Make one authorized balance read from Dot, inspect its actual tool result and
   correlate the new n8n execution. Installation, a mocked response, old execution
   65692 or HTTP 200 alone is not acceptance. Keep customer sends/campaigns absent.

Rollback: disconnect only the new hosted connector and stop/remove only this
new facade's routing/service, preserving private state for investigation.
The original n8n Bearer gateway, provider credential, SMS flows, Cosend and
Blueticks remain unchanged. Do not delete opt-outs or replay any queued work.

Library: pinned `oidc-provider` 9.12.1 (MIT), with development interactions off,
and Express 5.1.0. Upstream sources:
https://github.com/panva/node-oidc-provider/tree/v9.12.1
https://developers.openai.com/plugins/build/auth
https://developers.openai.com/plugins/deploy/connect-chatgpt
