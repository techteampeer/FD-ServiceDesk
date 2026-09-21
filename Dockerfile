# ==========================================
# Stage 1: Build Frontend (React / Vite)
# ==========================================
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend

# Copiar únicamente package.json para omitir conflictos de lockfile
COPY frontend/package.json ./
RUN npm install --no-package-lock --no-audit --no-fund

COPY frontend/ ./
ENV VITE_API_BASE_URL=""
RUN npm run build

# ==========================================
# Stage 2: Configure Backend (Node.js)
# ==========================================
FROM node:18-alpine
WORKDIR /app

COPY backend/package.json ./
RUN npm install --omit=dev --no-package-lock --no-audit --no-fund

COPY backend/ ./

# Copiar los estáticos compilados
COPY --from=frontend-builder /app/frontend/dist ./public

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "server.js"]
