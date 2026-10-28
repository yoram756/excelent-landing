# Excellent official Cosend connection

Native provider MCP: https://mcp.cosend.app/mcp, Streamable HTTP and OAuth 2.1.
No custom proxy, duplicate webhook, server deployment, key copy or paid model is
needed for this connection package. The existing n8n API key is not reused.

This initial release requests read-only conversation/contact/automation/template
access. The owner wants eventual automatic replies after rules and exclusive
ownership approval; that later stage is explicitly not activated here.

Install the saved private plugin in the owner's account and complete its secure
Cosend OAuth consent. Review the workspace and scopes. Then use the discovered
whoami and tools/list to verify the intended connection and read-only tools.
An installed plugin, OAuth consent or an HTTP 200 alone is not completed access.
Check one recent page without opening/marking customer conversations as read,
then prepare one answer in chat with its source. Do not send a test message.

The provider's native send_message requires a human confirmation round-trip.
Automatic operation must respect it and use a separately approved provider
workflow where appropriate; do not bypass the native confirmation.

Sources verified 28 October 2026:
* https://cosend.app/docs/mcp
* https://cosend.app/mcp
* https://learn.chatgpt.com/docs/dots/computers-and-apps

The provider MCP is documented as available on Free. This does not assert that
future message, automation or model usage has no cost. No new charge is approved.
