# ==========================================
# Stage 1: Build Frontend (React / Vite)
# ==========================================
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
# Ensure relative API paths (/api/...) for same-origin integration
ENV VITE_API_BASE_URL=""
RUN npm run build

# ==========================================
# Stage 2: Configure Backend (Node.js)
# ==========================================
FROM node:18-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/ ./

# Copy compiled React static files to /app/public
COPY --from=frontend-builder /app/frontend/dist ./public

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "server.js"]