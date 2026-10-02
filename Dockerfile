# ==========================================
# Arena Store — Multi-Stage Production Dockerfile
# Targets: api | bot | admin
# ==========================================

# 1. Base Stage with Node.js and PNPM
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@12.8.1 --activate
WORKDIR /app

# 2. Dependencies Stage
FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/ui/package.json ./packages/ui/
COPY apps/api/package.json ./apps/api/
COPY apps/bot/package.json ./apps/bot/
COPY apps/admin/package.json ./apps/admin/
COPY tests/package.json ./tests/
RUN pnpm install --frozen-lockfile

# 3. Builder Stage
FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/packages ./packages
COPY --from=dependencies /app/apps ./apps
COPY --from=dependencies /app/tests ./tests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json* ./
COPY . .
RUN pnpm build

# 4. API Target Runtime
FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@12.8.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY apps/api ./apps/api
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]

# 5. Bot Target Runtime
FROM node:22-alpine AS bot
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@12.8.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY apps/bot ./apps/bot
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/apps/bot/dist ./apps/bot/dist
CMD ["node", "apps/bot/dist/index.js"]

# 6. Admin Portal Target Runtime (Nuxt Nitro)
FROM node:22-alpine AS admin
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
COPY --from=builder /app/apps/admin/.output ./
EXPOSE 3000
CMD ["node", "server/index.mjs"]
