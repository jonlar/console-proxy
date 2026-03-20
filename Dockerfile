# Use official Bun Alpine image (no Node.js, smaller attack surface)
FROM oven/bun:1-alpine

# Build arguments for version information
ARG GIT_TAG
ARG GIT_COMMIT

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
