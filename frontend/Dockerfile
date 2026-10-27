# syntax=docker/dockerfile:1
# Build context is the repository root (the pnpm lockfile lives there).
FROM node:24.22.1-bookworm-slim AS base
RUN npm install --global pnpm@12.4.2
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile --filter frontend

# Development image: source is bind-mounted by Compose.
FROM base AS dev
ENV NEXT_TELEMETRY_DISABLED=1
COPY frontend frontend
# Compose runs this image as the host user (it writes into the bind-mounted source),
# so the build cache volume must be writable by any uid.
RUN mkdir -p frontend/.next && chmod 1777 frontend/.next
ENV HOME=/tmp
WORKDIR /workspace/frontend
EXPOSE 3000
# Start Next directly: `pnpm dev` would re-check dependencies at startup and try to
# reinstall into the root-owned /workspace/node_modules as the unprivileged user.
CMD ["./node_modules/.bin/next", "dev", "--port", "3000", "--hostname", "0.0.0.0"]

# Production build: Next standalone server. /api and /media are routed by Caddy;
# server components reach the API at RAFF_API_ORIGIN (runtime).
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1 RAFF_API_ORIGIN=http://backend:8000
COPY frontend frontend
RUN pnpm --dir frontend build

FROM node:24.22.1-bookworm-slim AS prod
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /workspace/frontend/.next/standalone ./
COPY --from=build --chown=node:node /workspace/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=node:node /workspace/frontend/public ./frontend/public
USER node
EXPOSE 3000
CMD ["node", "frontend/server.js"]

