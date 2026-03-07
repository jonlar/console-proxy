# Use Alpine-based Node.js image
FROM node:25-alpine

# Build arguments for version information
ARG GIT_TAG
ARG GIT_COMMIT

# Install Bun
RUN apk add --no-cache curl unzip bash && \
    curl -fsSL https://bun.sh/install | bash && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
    apk del curl unzip

WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
RUN bun install

# Copy source
COPY packages/backend ./packages/backend
COPY packages/frontend ./packages/frontend

# Build frontend with version info
RUN cd packages/frontend && \
    VITE_GIT_TAG="${GIT_TAG}" \
    VITE_GIT_COMMIT="${GIT_COMMIT}" \
    bun run build

# Data directory for persistent storage
RUN mkdir -p /data

EXPOSE 80

ENV PORT=80
ENV NODE_ENV=production

VOLUME /data

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD []
