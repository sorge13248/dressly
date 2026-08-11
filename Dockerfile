FROM node:24-alpine AS frontend-build
WORKDIR /workspace
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY frontend frontend
RUN cd frontend && npm run build

FROM node:22-alpine AS backend-build
WORKDIR /workspace
COPY backend/package*.json backend/
RUN apk add --no-cache python3 make g++ && cd backend && npm ci --ignore-scripts
COPY backend backend
RUN cd backend && npm run build

FROM node:22-alpine AS backend-prod-deps
WORKDIR /workspace/backend
COPY backend/package*.json ./
RUN apk add --no-cache python3 make g++ && npm ci --omit=dev --ignore-scripts && npm rebuild better-sqlite3 --build-from-source && npm cache clean --force && apk del python3 make g++

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache nginx supervisor poppler-utils
COPY --from=backend-build /workspace/backend/dist /app/backend/dist
COPY --from=backend-prod-deps /workspace/backend/node_modules /app/backend/node_modules
COPY --from=frontend-build /workspace/frontend/dist /usr/share/nginx/html
COPY deploy/nginx.unified.conf /etc/nginx/http.d/default.conf
COPY supervisord.conf /etc/supervisord.conf
EXPOSE 8080
CMD ["supervisord", "-c", "/etc/supervisord.conf"]