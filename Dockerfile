# Stage 1: build the React client and compile native addons
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY client/package*.json ./client/
RUN cd client && npm ci
COPY . .
RUN cd client && npm run build

# Stage 2: lean production image
FROM node:20-alpine
WORKDIR /app
# Copy compiled node_modules (better-sqlite3 native addon built for this arch)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/client/dist ./client/dist
COPY server/ ./server/
COPY shared/ ./shared/
COPY package.json ./
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
EXPOSE 3001
ENV PORT=3001
ENV DATABASE_PATH=/data/fitness.db
VOLUME /data
ENTRYPOINT ["./docker-entrypoint.sh"]
