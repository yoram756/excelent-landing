# Excellent TextMe read-only connection

Version 0.2.0 adds the authenticated, restricted n8n MCP connection to the existing
private plugin. Identity, audience, default prompt and browser fallback remain.
One tool: textme_read. Six bounded read operations; no send or campaign tool.

Backend acceptance: n8n execution 65692 on 29 October 2026; exact one-tool surface,
TextMe balance HTTP 200 / provider status 0. Missing and wrong auth both HTTP 403.
Actual Dot host authentication/use remains a separate test.

The earlier API-key Connect instructions do not apply to the hosted Dot form;
that form has no fixed-Bearer entry. Do not enter the caller secret into the
instance-wide n8n OAuth flow. The provider token stays in n8n.
No secrets are packaged. The private endpoint config is generated for upload,
not committed to Git. Repository source: src/integrations/textme-dot/.

Rollback: disconnect this host connection or unpublish only the dedicated gateway.
Do not change the existing SMS workflow, Cosend, Blueticks, account settings,
opt-outs or campaigns. Browser reports remain available with an owner login.

## Hosted Dot compatibility correction, 29 October 2026

The current hosted Add custom MCP server form has no fixed API-key/Bearer flow.
Declaring api_key in mcp.json did not register textme_read in the Dot catalog.
The actual one-off Dot attempt at 08:14 Israel time was BLOCKED before any
provider call. OAuth discovery on this host returned n8n instance-management
metadata, not the dedicated trigger. No broad scopes were authorized.
A narrow OAuth bridge or separately approved private tunnel remains required.
No such new service is deployed. Never use anonymous access or packaged tokens.
Sources: https://developers.openai.com/plugins/build/plugins and
https://developers.openai.com/plugins/deploy/submission#authentication-limitations
