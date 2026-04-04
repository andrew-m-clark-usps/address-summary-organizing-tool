#!/bin/bash
set -e

MODE="${1:-static}"

case "$MODE" in
  static)
    echo "🐳 Starting static site on http://localhost:8080"
    docker compose up static-site --build -d
    ;;
  dev)
    echo "🐳 Starting dev server with live reload on http://localhost:3000"
    docker compose up dev --build
    ;;
  react)
    echo "🐳 Starting React dev server on http://localhost:3001"
    docker compose --profile react up react-dev --build
    ;;
  all)
    echo "🐳 Starting all services..."
    docker compose --profile react up --build -d
    ;;
  stop)
    echo "🛑 Stopping all containers..."
    docker compose --profile react down
    ;;
  *)
    echo "Usage: $0 {static|dev|react|all|stop}"
    exit 1
    ;;
esac
