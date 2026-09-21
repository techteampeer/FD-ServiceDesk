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
# Stage 2: Configure Express & Nitro SSR Monolith
# ==========================================
FROM node:22-alpine
WORKDIR /app

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/ ./

# Copy full Nitro SSR output (.output/public & .output/server)
COPY --from=frontend-builder /app/frontend/.output ./frontend/.output

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "server.js"]