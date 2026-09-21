# NOTE: preserved from the previous static-SPA frontend. The imported TanStack
# Start app is SSR (nitro output, no dist/), so this two-stage nginx build no
# longer matches the build output. Kept for reference until the deployment
# target is decided; nginx.conf was moved to the frontend root so COPY resolves.
# Stage 1: Build React/Vite Frontend
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Set API URL for build time
ARG VITE_API_BASE_URL=https://fdny-itsm-service-102553479742.us-central1.run.app
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]