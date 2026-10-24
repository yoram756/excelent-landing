FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node src/services/lifecycle/db.js src/services/lifecycle/lock-server.js deploy/lock/start.cjs ./
RUN mkdir /data && chown node:node /data
USER node
CMD ["node", "start.cjs"]
