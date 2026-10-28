# Preparation only. Pin an approved image digest before any server deployment.
FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node config ./config
RUN mkdir -p /state && chown node:node /state
USER node
ENV EXCELENT_DB_PATH=/state/state.sqlite EXCELENT_PORT=8789 EXCELENT_BIND=0.0.0.0
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8789/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "src/server.mjs"]
