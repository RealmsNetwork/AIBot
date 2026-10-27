FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --chown=node:node LICENSE ./LICENSE
COPY --chown=node:node config.json ./config.json
COPY --chown=node:node src ./src

USER node
CMD ["node", "src/index.js"]
