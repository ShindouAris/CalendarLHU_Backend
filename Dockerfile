# Use the official Bun image as base
FROM oven/bun:1-alpine AS base

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build stage
FROM base AS build

# Build the application
RUN bun run build || echo "Build step skipped - running directly from source"

# Production stage
FROM oven/bun:1-alpine AS production

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy built application or source code
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./

# Create non-root user for security (bun user already exists in base image)
RUN addgroup -g 1001 -S nodejs || true
RUN id -u bun >/dev/null 2>&1 || adduser -S bun -u 1001

# Change ownership of the app directory
RUN chown -R bun:nodejs /app
USER bun

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun run health-check || exit 1

# Start the application
CMD ["bun", "run", "src/index.ts"]
