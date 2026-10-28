# Excellent TextMe browser workflow

This private plugin helps the dot work in an authorized TextMe browser session.
It contains one skill and no MCP server, app-account binding or API secret.
The local owner session and usage-report access were verified on 28 October
2026. Availability in the dot's own browser/connected computer must be checked
separately; local Codex access alone does not establish it.

The current stage permits reading and proposals only. No send, schedule,
recipient/list modification, settings change, token generation or purchase.
The existing Cosend and n8n flows are preserved.

Future API integration needs a restricted server-side adapter, an approved
existing credential, an impact-reviewed IP allowlist and secure client auth.
The provider's API tokens are not read-only. Do not paste them into chat.

Verified sources:
* https://docs.textme.co.il/guide/authentication/
* https://docs.textme.co.il/guide/introduction/
* https://docs.textme.co.il/endpoints/overview/
* https://learn.chatgpt.com/docs/dots/computers-and-apps

API preparation 28 October 2026: backend balance read verified in n8n execution
62442 using the existing credential. Restricted reads and disabled authenticated
MCP draft prepared; separate caller authentication and actual dot MCP tests
remain BLOCKED. No MCP endpoint is packaged and no send tool is available.
Repository implementation: src/integrations/textme-dot/.
