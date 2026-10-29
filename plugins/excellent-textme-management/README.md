# Excellent TextMe read-only connection

Version 0.2.0 adds the authenticated, restricted n8n MCP connection to the existing
private plugin. Identity, audience, default prompt and browser fallback remain.
One tool: textme_read. Six bounded read operations; no send or campaign tool.

Backend acceptance: n8n execution 65692 on 29 October 2026; exact one-tool surface,
TextMe balance HTTP 200 / provider status 0. Missing and wrong auth both HTTP 403.
Actual Dot host authentication/use remains a separate test.

The dedicated caller secret is entered only in the host's secure API-key
connection form, without a Bearer prefix. The provider token stays in n8n.
No secrets are packaged. The private endpoint config is generated for upload,
not committed to Git. Repository source: src/integrations/textme-dot/.

Rollback: disconnect this host connection or unpublish only the dedicated gateway.
Do not change the existing SMS workflow, Cosend, Blueticks, account settings,
opt-outs or campaigns. Browser reports remain available with an owner login.
