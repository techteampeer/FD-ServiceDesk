# ==========================================
# Stage 1: Build TanStack Start / Nitro Frontend
# ==========================================
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps

COPY frontend/ ./
ENV VITE_API_BASE_URL=""
RUN npm run build

# ==========================================
# Stage 2: Configure Express Backend & Nitro SSR
# ==========================================
FROM node:22-alpine
WORKDIR /app

# Backend dependencies
COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/ ./

# Copy compiled Nitro SSR output (.output/public & .output/server)
COPY --from=frontend-builder /app/frontend/.output ./frontend/.output

# Copy frontend node_modules so Nitro SSR can resolve externalized packages
COPY --from=frontend-builder /app/frontend/node_modules ./frontend/node_modules

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "server.js"]