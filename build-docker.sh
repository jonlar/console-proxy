#!/bin/bash

# Get the latest git tag, or use the short commit SHA if no tag exists
GIT_TAG=$(git describe --tags --exact-match 2>/dev/null)
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Use tag if available, otherwise use commit
VERSION=${GIT_TAG:-$GIT_COMMIT}

echo "Building console-proxy:${VERSION}"

docker build \
  --build-arg GIT_TAG="${GIT_TAG}" \
  --build-arg GIT_COMMIT="${GIT_COMMIT}" \
  -t console-proxy:${VERSION} \
  -t console-proxy:latest \
  .

echo "Built image: console-proxy:${VERSION}"
