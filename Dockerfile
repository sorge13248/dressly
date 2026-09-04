# syntax=docker/dockerfile:1.7

FROM node:alpine AS frontend-build
WORKDIR /app

COPY frontend/package*.json frontend/
RUN npm ci --prefix frontend --no-audit --no-fund

COPY frontend/ ./frontend/
RUN npm --prefix frontend run build -- --configuration production

FROM node:slim AS backend-build
WORKDIR /app/backend

COPY backend/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

WORKDIR /app
COPY tsconfig.base.json ./
COPY backend/nest-cli.json backend/tsconfig*.json backend/
COPY backend/src backend/src
WORKDIR /app/backend
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts

FROM node:slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx supervisor poppler-utils \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/backend /app/data /run/nginx /var/log/nginx /usr/share/nginx/html

COPY --from=backend-build /app/backend/dist /app/backend/dist
COPY --from=backend-build /app/backend/node_modules /app/backend/node_modules
COPY backend/package*.json /app/backend/

COPY --from=frontend-build /app/frontend/dist/frontend/browser/ /usr/share/nginx/html/

COPY deploy/nginx.unified.conf /etc/nginx/conf.d/default.conf
COPY deploy/supervisord.conf /etc/supervisord.conf

EXPOSE 8080
STOPSIGNAL SIGTERM

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]