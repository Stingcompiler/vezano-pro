# Vezano Pro frontend image: LOCAL DEVELOPMENT ONLY.
#
# Production never runs Next.js in a container (or at all): the static export
# in frontend/out is served by Django (backend/core/frontend.py) on the OVH
# VPS, see deploy/ovh/README.md.
#
# Default command: `next dev` on 0.0.0.0:3000. The compose `build` profile
# runs `npm run build` instead, which writes frontend/out into the bind mount.
#
# Node 20 matches CI (.github/workflows/ci.yml, node-version "20");
# override with --build-arg NODE_VERSION=24 when CI moves.
ARG NODE_VERSION=20

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:${NODE_VERSION}-bookworm-slim AS dev
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=development
WORKDIR /app
# Pre-create the paths compose keeps in anonymous volumes so they are owned
# by `node` (uid 1000) rather than root.
RUN mkdir -p /app/node_modules /app/.next /app/.next-dev && chown -R node:node /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
USER node
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]
