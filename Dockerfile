# Autonomous Freight — API Gateway backend.
# Multi-stage: builder compiles TS → dist/, runtime copies only what's needed.

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* tsconfig.base.json tsconfig.json ./
COPY services services
COPY execution execution
COPY scripts scripts

# Install ALL deps (including dev for tsc)
RUN npm ci

# Compile TypeScript + copy non-TS assets (SQL migrations, Grafana JSON, etc.)
RUN npm run build

# Prune dev deps so we can copy production node_modules
RUN npm prune --omit=dev

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy compiled output, production deps, package manifest, SQL migrations
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Non-root user
RUN addgroup -S af && adduser -S af -G af
USER af

EXPOSE 3000

CMD ["node", "dist/services/api-gateway/src/index.js"]
