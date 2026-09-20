# ==========================================
# Stage 1: Build Frontend (React) | MVP
# ==========================================
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ==========================================
# Stage 2: Configure Backend (Node.js)
# ==========================================
FROM node:18-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --only=production
COPY backend/ ./

# Copy compiled React static files to Node.js environment
COPY --from=frontend-builder /app/frontend/dist ./public

# Cloud Run relies on the PORT environment variable (default 8080)
EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "server.js"]