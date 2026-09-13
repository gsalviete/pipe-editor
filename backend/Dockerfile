# pipe-editor backend image.
#
# Two-stage build: builder produces dist/, runner ships only prod deps
# + the built JS. Matches the convention the project's own Dockerfile
# Generator emits (multi-stage when a build Stage is in the chain) —
# see docs/specs/dockerfile-generator.spec.md Design Decision 3.
#
# Build context is `./backend` (set by docker-compose.yml).

# ───────────── builder ─────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN pnpm run build

# ───────────── runner ──────────────
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist

# Default port; override via PORT env if needed. The actual listener
# binding (127.0.0.1 by default, 0.0.0.0 in compose) is controlled by
# BIND_ADDRESS env per backend/src/main.ts.
EXPOSE 3000

CMD ["node", "dist/main.js"]
