# syntax=docker/dockerfile:1
# Three stages: install deps, build (Next.js standalone server + bundled CLI), then a small runtime image.

FROM node:22-alpine AS deps
WORKDIR /src
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /src
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /src/node_modules ./node_modules
COPY . .
RUN npx next build && npm run build:cli

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# the standalone server, its static assets and public/ (the email logo), the SQL migrations (applied at start-up) and the ops CLI
COPY --from=build --chown=node:node /src/.next/standalone ./
COPY --from=build --chown=node:node /src/.next/static ./.next/static
COPY --from=build --chown=node:node /src/public ./public
COPY --from=build --chown=node:node /src/migrations ./migrations
COPY --from=build --chown=node:node /src/dist/cli.cjs ./cli.cjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
