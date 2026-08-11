# syntax=docker/dockerfile:1.7

FROM node:alpine AS frontend-build
WORKDIR /app

COPY package*.json ./
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace frontend --no-audit --no-fund

COPY frontend/ ./frontend/
RUN npm run build --workspace frontend -- --configuration production

FROM node:alpine AS backend-build
WORKDIR /app

RUN apk add --no-cache --virtual .build-deps python3 make g++

COPY package*.json ./
COPY backend/package.json backend/package.json
RUN npm ci --workspace backend --include=dev --no-audit --no-fund --ignore-scripts

COPY tsconfig.base.json ./
COPY backend/nest-cli.json backend/tsconfig*.json backend/
COPY backend/src backend/src
RUN npm run build --workspace backend

FROM node:alpine AS backend-prod-deps
WORKDIR /app

RUN apk add --no-cache --virtual .build-deps python3 make g++

COPY package*.json ./
COPY backend/package.json backend/package.json
RUN npm ci --workspace backend --omit=dev --no-audit --no-fund --ignore-scripts \
    && npm rebuild better-sqlite3 --workspace backend --build-from-source --no-audit --no-fund \
    && npm cache clean --force \
    && apk del .build-deps

FROM node:alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache nginx supervisor poppler-utils \
    && mkdir -p /app/backend /app/data /run/nginx /var/log/nginx /usr/share/nginx/html

COPY --from=backend-build /app/backend/dist /app/backend/dist
COPY --from=backend-prod-deps /app/node_modules /app/node_modules
COPY backend/package*.json /app/backend/

COPY --from=frontend-build /app/frontend/dist/frontend /usr/share/nginx/html

COPY deploy/nginx.unified.conf /etc/nginx/nginx.conf
COPY deploy/supervisord.conf /etc/supervisord.conf

EXPOSE 8080
STOPSIGNAL SIGTERM

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]