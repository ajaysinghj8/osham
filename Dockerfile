# Stage 1: Build admin-ui
FROM node:20-alpine AS admin-ui-builder
WORKDIR /build/admin-ui
COPY admin-ui/package*.json ./
RUN npm ci
COPY admin-ui/ ./
RUN npm run build

# Stage 2: Build server
FROM node:20-alpine AS server-builder
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

# Stage 3: Production
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=server-builder /build/lib ./lib
COPY --from=admin-ui-builder /build/admin-ui/dist ./admin-ui/dist
COPY bin/ ./bin/

EXPOSE 26192
CMD ["node", "lib/index.js"]
