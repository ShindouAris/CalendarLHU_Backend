# CalendarLHU_Backend

A backend service for Calendar LHU built with Elysia framework and Bun runtime.

## Features

- Student schedule management
- Weather API integration
- RESTful API endpoints
- CORS enabled
- TypeScript support

## API Endpoints

- `GET /schedule/:studentID` - Get student schedule
- `GET /weather/current` - Get current weather
- `GET /weather/forecast` - Get weather forecast
- `GET /weather/forecast_all` - Get all weather forecast data
- `GET /` - Health check endpoint

## Docker Setup

### Prerequisites

- Docker
- Docker Compose (optional)
- Make (optional, for using Makefile commands)

### Quick Start

1. **Build and run with Docker Compose (Recommended):**
   ```bash
   # Production
   docker-compose up -d
   
   # Development with hot reload
   docker-compose --profile dev up -d
   ```

2. **Build and run manually:**
   ```bash
   # Build production image
   docker build -t calendarlhu-backend:latest .
   
   # Run container
   docker run -d --name calendarlhu-backend -p 3000:3000 calendarlhu-backend:latest
   ```

3. **Using Makefile (if available):**
   ```bash
   # Show all available commands
   make help
   
   # Build and run production
   make build
   make run
   
   # Build and run development
   make build-dev
   make run-dev
   ```

### Development Mode

Development mode includes:
- Hot reload with file watching
- Volume mounting for live code changes
- Separate port (3001) to avoid conflicts

```bash
# Start development environment
docker-compose --profile dev up -d

# Or manually
docker run -d --name calendarlhu-backend-dev -p 3001:3000 \
  -v $(PWD)/src:/app/src \
  calendarlhu-backend:dev
```

### Environment Variables

- `NODE_ENV`: Set to `production` or `development`
- `PORT`: Application port (default: 3000)

### Ports

- **Production**: 3000
- **Development**: 3001

## Docker Commands

### Basic Operations

```bash
# Build images
docker build -t calendarlhu-backend:latest .
docker build -t calendarlhu-backend:dev --target base .

# Run containers
docker run -d --name calendarlhu-backend -p 3000:3000 calendarlhu-backend:latest
docker run -d --name calendarlhu-backend-dev -p 3001:3000 -v $(PWD)/src:/app/src calendarlhu-backend:dev

# Stop containers
docker stop calendarlhu-backend calendarlhu-backend-dev

# Remove containers
docker rm calendarlhu-backend calendarlhu-backend-dev

# View logs
docker logs -f calendarlhu-backend
docker logs -f calendarlhu-backend-dev

# Shell access
docker exec -it calendarlhu-backend /bin/sh
docker exec -it calendarlhu-backend-dev /bin/sh
```

### Docker Compose Commands

```bash
# Start services
docker-compose up -d

# Start with development profile
docker-compose --profile dev up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Rebuild and start
docker-compose up -d --build
```

## Health Checks

The application includes health checks that verify the service is running:

```bash
# Check health endpoint
curl http://localhost:3000/

# Docker health check
docker inspect calendarlhu-backend | grep Health -A 10
```

## Troubleshooting

### Common Issues

1. **Port already in use:**
   ```bash
   # Check what's using the port
   lsof -i :3000
   
   # Stop conflicting containers
   docker stop $(docker ps -q)
   ```

2. **Permission issues:**
   ```bash
   # Fix file permissions
   sudo chown -R $USER:$USER .
   ```

3. **Build failures:**
   ```bash
   # Clean Docker cache
   docker system prune -a
   
   # Rebuild without cache
   docker build --no-cache -t calendarlhu-backend:latest .
   ```

### Logs and Debugging

```bash
# View application logs
docker logs -f calendarlhu-backend

# View Docker Compose logs
docker-compose logs -f

# Check container status
docker ps -a

# Inspect container
docker inspect calendarlhu-backend
```

## Production Deployment

For production deployment:

1. **Use production target:**
   ```bash
   docker build --target production -t calendarlhu-backend:prod .
   ```

2. **Set environment variables:**
   ```bash
   docker run -d \
     --name calendarlhu-backend \
     -p 3000:3000 \
     -e NODE_ENV=production \
     -e PORT=3000 \
     calendarlhu-backend:prod
   ```

3. **Use restart policy:**
   ```bash
   docker run -d \
     --restart unless-stopped \
     --name calendarlhu-backend \
     -p 3000:3000 \
     calendarlhu-backend:prod
   ```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with Docker
5. Submit a pull request

## License

This project is licensed under the MIT License.