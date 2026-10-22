# Excelent landing pages

Static public files only. No leads, keys or passwords live here.

site/lp1v2/   selected refinance page (LP1)
site/lp1/     earlier page version
deploy/     nginx config
docker-compose.yml   runs on the VPS under /docker/lp

Routing in the repository (verify the running server separately):
- `refi.excelentfinance.com` serves `site/lp1v2` and includes `deploy/lp1-api.inc`.
- `/api/lead` proxies to the n8n `lead-intake` webhook; `/api/club` and `/api/partner` proxy to `lp-signup`.
- `lp1-stg.srv1604140.hstgr.cloud` is password protected and serves the same static page. Its `/api/` routes return JSON 503 until a separate sandbox backend is configured and verified. It must not forward test submissions to the operational webhooks.
- Compose mounts both include files. A repository change alone does not update the running VPS configuration.

`npm run test:deploy` requires nginx (or `NGINX_BINARY` pointing to it). It starts an isolated local nginx process with controlled loopback upstreams, checks staging isolation and public routing, and proves that restoring shared staging routing fails the same isolation check. It does not submit leads to live n8n or verify the running VPS.

Deployment requires the existing release approval and a reviewed diff; do not run the old blanket pull/restart recipe as a diagnostic action.
