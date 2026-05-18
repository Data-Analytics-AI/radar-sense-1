###############################################
# SnapFort — Production Docker image
# Multi-stage: builder (vite build) + runtime (Node 20 slim)
###############################################

# ---------- Stage 1: Builder ----------
FROM node:20-slim AS builder

WORKDIR /app

# Install build toolchain for any native deps (esdk-obs-nodejs, pg, etc.)
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install ALL deps (including dev) so vite can build
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund --loglevel=error

# Copy source and build the React frontend → dist/public
COPY . .
RUN npm run build

# Strip dev dependencies for the runtime stage
RUN npm prune --omit=dev

# ---------- Stage 2: Runtime ----------
FROM node:20-slim AS runtime

ENV NODE_ENV=production
ENV PORT=5000

WORKDIR /app

# Runtime needs ca-certificates for outbound TLS to OBS / Postgres / Azure
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Pull only what the server needs at runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/src ./src 
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Drop privileges
RUN chown -R node:node /app
USER node

EXPOSE 5000

# Lightweight container healthcheck (3s start grace, 10s interval)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tsx runs the TypeScript server directly via the npm start script
CMD ["npm", "start"]
