FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node src/integrations/meta-capi ./src/integrations/meta-capi
COPY --chown=node:node src/config/campaigns ./src/config/campaigns
RUN mkdir /data && chown node:node /data
USER node
CMD ["node", "src/integrations/meta-capi/run.js"]
