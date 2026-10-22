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
EXPOSE 3000
CMD ["pnpm", "--dir", "frontend", "dev", "--hostname", "0.0.0.0"]
