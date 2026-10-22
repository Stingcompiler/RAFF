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
RUN mkdir -p frontend/.next && chown -R node:node /workspace/frontend
USER node
WORKDIR /workspace/frontend
EXPOSE 3000
# Start Next directly: `pnpm dev` would re-check dependencies at startup and try to
# reinstall into the root-owned /workspace/node_modules as the unprivileged user.
CMD ["./node_modules/.bin/next", "dev", "--port", "3000", "--hostname", "0.0.0.0"]
