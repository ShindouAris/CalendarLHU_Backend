.PHONY: help build build-dev run run-dev stop clean logs

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build production Docker image
	docker build -t calendarlhu-backend:latest .

build-dev: ## Build development Docker image
	docker build -t calendarlhu-backend:dev --target base .

run: ## Run production container
	docker run -d --name calendarlhu-backend -p 3000:3000 calendarlhu-backend:latest

run-dev: ## Run development container with hot reload
	docker run -d --name calendarlhu-backend-dev -p 3001:3000 -v $(PWD)/src:/app/src calendarlhu-backend:dev

stop: ## Stop all containers
	docker stop calendarlhu-backend calendarlhu-backend-dev 2>/dev/null || true

clean: stop ## Stop and remove containers
	docker rm calendarlhu-backend calendarlhu-backend-dev 2>/dev/null || true
	docker rmi calendarlhu-backend:latest calendarlhu-backend:dev 2>/dev/null || true

logs: ## Show container logs
	docker logs -f calendarlhu-backend

logs-dev: ## Show development container logs
	docker logs -f calendarlhu-backend-dev

compose-up: ## Start with Docker Compose
	docker-compose up -d

compose-down: ## Stop Docker Compose
	docker-compose down

compose-dev: ## Start development environment with Docker Compose
	docker-compose --profile dev up -d

compose-logs: ## Show Docker Compose logs
	docker-compose logs -f

shell: ## Get shell access to production container
	docker exec -it calendarlhu-backend /bin/sh

shell-dev: ## Get shell access to development container
	docker exec -it calendarlhu-backend-dev /bin/sh
