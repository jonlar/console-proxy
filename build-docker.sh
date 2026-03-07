#!/bin/bash

GIT_TAG=$(git describe --tags --exact-match 2>/dev/null || true)
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
VERSION=${GIT_TAG:-$GIT_COMMIT}

echo "Building my-app:${VERSION}"

docker build \
  --build-arg GIT_TAG="${GIT_TAG}" \
  --build-arg GIT_COMMIT="${GIT_COMMIT}" \
  -t my-app:"${VERSION}" \
  -t my-app:latest \
  .

echo "Built image: my-app:${VERSION}"
