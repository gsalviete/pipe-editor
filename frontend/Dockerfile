# pipe-editor frontend image.
#
# Build context is the REPO ROOT (set by docker-compose.yml) so the
# Vite alias `@modules/ir` → `../backend/src/modules/ir` can resolve
# inside the builder. The frontend depends on the IR module's
# PipelineIR types + helpers; the spec mandates a single shared
# symbol (visual-editor.spec.md "Local definitions").
#
# Two-stage: builder produces dist/, runner serves it via nginx.

# ───────────── builder ─────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Frontend's own package manifest + lockfile.
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# The shared IR module from the backend — required by the Vite alias.
# vite.config.ts resolves `@modules/ir` → `../backend/src/modules/ir`
# (relative to __dirname). With /app as the frontend root, `..` is `/`
# so we place the IR module at /backend/src/modules/ir.
COPY backend/src/modules/ir /backend/src/modules/ir

# Frontend sources.
COPY frontend/tsconfig.json frontend/tsconfig.node.json frontend/vite.config.ts ./
COPY frontend/index.html ./
COPY frontend/postcss.config.js frontend/tailwind.config.js ./
COPY frontend/src ./src
COPY frontend/public ./public

RUN pnpm run build

# ───────────── runner (nginx) ─────────────
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
