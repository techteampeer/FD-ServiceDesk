# ==========================================
# Stage 1: Build TanStack Start / Nitro Frontend
# ==========================================
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy package definitions
COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps

# Copy full frontend directory
COPY frontend/ ./

ENV VITE_API_BASE_URL=""
RUN npm run build

# ==========================================
# Stage 2: Configure Express Backend & Static Serving
# ==========================================
FROM node:22-alpine
WORKDIR /app

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/ ./

# Copy compiled Nitro public assets to /app/public for Express
COPY --from=frontend-builder /app/frontend/.output/public ./public

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "server.js"]
