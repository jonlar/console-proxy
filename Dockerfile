# Use Alpine-based Node.js image
FROM node:24-alpine

# Build arguments for version information
ARG GIT_TAG
ARG GIT_COMMIT

# Install Bun
RUN apk add --no-cache curl unzip bash && \
    curl -fsSL https://bun.sh/install | bash && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
    apk del curl unzip

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./
COPY bun.lock ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

# Install dependencies from root (workspaces)
RUN bun install

# Copy source files
COPY packages/backend ./packages/backend
COPY packages/frontend ./packages/frontend

# Build frontend with version info
RUN cd packages/frontend && \
    echo "Building with GIT_TAG=${GIT_TAG} and GIT_COMMIT=${GIT_COMMIT}" && \
    VITE_GIT_TAG="${GIT_TAG}" \
    VITE_GIT_COMMIT="${GIT_COMMIT}" \
    bun run build

# Create data directory for persistent storage
RUN mkdir -p /data

# Expose port 80
EXPOSE 80

# Set environment variables
ENV PORT=80
ENV CONFIG_PATH=/data/config.json
ENV NODE_ENV=production

# Create volume for persistent data
VOLUME /data

# Copy and use entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD []
