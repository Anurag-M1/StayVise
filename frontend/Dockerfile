FROM node:20-alpine AS base
WORKDIR /app

FROM base AS development
COPY package*.json ./
RUN npm ci --legacy-peer-deps
EXPOSE 5173
# Source is mounted at runtime

FROM base AS production
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps
COPY . .
RUN npm run build
