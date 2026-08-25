# ── Stage 1: Build ───────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Accept NEXT_PUBLIC_ build args (baked into JS bundle at build time)
ARG NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
ARG NEXT_PUBLIC_WS_URL=http://localhost:8001
ARG NEXT_PUBLIC_MEDIASOUP_URL=http://localhost:3000

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_MEDIASOUP_URL=$NEXT_PUBLIC_MEDIASOUP_URL
ENV NEXT_TELEMETRY_DISABLED=1

# Copy dependency manifests first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci --frozen-lockfile

# Copy full source
COPY . .

# Build Next.js production bundle
RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Add non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy only the required build artifacts
COPY --from=builder /app/public        ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static  ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
