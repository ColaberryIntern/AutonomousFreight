# nginx — multi-stage: build Vite web → serve static + proxy /api/* to backend.

FROM node:20-alpine AS web-builder
WORKDIR /web
COPY services/web/package.json services/web/package-lock.json* ./
RUN npm install
COPY services/web/ ./
# VITE_API_URL baked at build time; empty = same-origin (nginx handles /api)
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=web-builder /web/dist /usr/share/nginx/html
EXPOSE 80
