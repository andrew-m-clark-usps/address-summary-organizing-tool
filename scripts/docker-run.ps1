param(
    [ValidateSet("static", "dev", "react", "all", "stop")]
    [string]$Mode = "static"
)

switch ($Mode) {
    "static" {
        Write-Host "🐳 Starting static site on http://localhost:8080" -ForegroundColor Cyan
        docker compose up static-site --build -d
    }
    "dev" {
        Write-Host "🐳 Starting dev server with live reload on http://localhost:3000" -ForegroundColor Cyan
        docker compose up dev --build
    }
    "react" {
        Write-Host "🐳 Starting React dev server on http://localhost:3001" -ForegroundColor Cyan
        docker compose --profile react up react-dev --build
    }
    "all" {
        Write-Host "🐳 Starting all services..." -ForegroundColor Cyan
        docker compose --profile react up --build -d
    }
    "stop" {
        Write-Host "🛑 Stopping all containers..." -ForegroundColor Yellow
        docker compose --profile react down
    }
}
