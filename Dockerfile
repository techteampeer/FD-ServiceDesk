# ==========================================
# Stage 1: Build TanStack Start / Nitro Frontend
# ==========================================
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy package definitions
COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps

# Copy full frontend directory
COPY frontend/ ./

ENV VITE_API_BASE_URL=""
RUN npm run build

# ==========================================
# Stage 2: Configure Express Backend & Asset Integration
# ==========================================
FROM node:18-alpine
WORKDIR /app

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/ ./

# Copy compiled Nitro public static assets to /app/public
COPY --from=frontend-builder /app/frontend/.output/public ./public

# Copy full Nitro server build output for SSR handling if needed
COPY --from=frontend-builder /app/frontend/.output ./frontend/.output

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "server.js"]
