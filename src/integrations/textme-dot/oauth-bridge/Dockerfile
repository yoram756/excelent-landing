FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS runtime
WORKDIR /opt/textme
COPY read-policy.js mcp-read-probe.js ./
COPY oauth-bridge/package.json oauth-bridge/package-lock.json ./oauth-bridge/
WORKDIR /opt/textme/oauth-bridge
RUN npm ci --ignore-scripts --no-audit --no-fund && mkdir -p /var/lib/textme-auth && chown node:node /var/lib/textme-auth
COPY oauth-bridge/ ./
ENV NODE_ENV=production NPM_CONFIG_UPDATE_NOTIFIER=false
USER node
CMD ["node", "server.mjs"]

FROM runtime AS synthetic-test
ENV NODE_ENV=test
CMD ["node", "--test", "--test-concurrency=1", "test/bridge.test.mjs"]
