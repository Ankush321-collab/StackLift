# Start All Services - Vercel Clone

# Colors for output
$Green = "Green"
$Red = "Red"
$Yellow = "Yellow"
$Cyan = "Cyan"

Write-Host "Starting Vercel Clone Services..." -ForegroundColor $Cyan
Write-Host "=================================" -ForegroundColor $Cyan

# Check if node is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Node.js is not installed!" -ForegroundColor $Red
    exit 1
}

Write-Host "`nNode.js version: $(node -v)" -ForegroundColor $Green
Write-Host "npm version: $(npm -v)" -ForegroundColor $Green

# Function to start a service
function Start-Service {
    param(
        [string]$Name,
        [string]$Path,
        [string]$Command,
        [string]$Port
    )
    
    Write-Host "`nStarting $Name on port $Port..." -ForegroundColor $Yellow
    
    if (Test-Path $Path) {
        Push-Location $Path
        
        # Check if node_modules exists
        if (-not (Test-Path "node_modules")) {
            Write-Host "Installing dependencies for $Name..." -ForegroundColor $Yellow
            npm install
        }
        
        # Start the service in a new window
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; Write-Host '$Name Running on port $Port' -ForegroundColor Green; $Command"
        
        Pop-Location
        Write-Host "$Name started successfully!" -ForegroundColor $Green
    } else {
        Write-Host "Error: $Path not found!" -ForegroundColor $Red
    }
}

# Get the script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Start API Server
Start-Service -Name "API Server" -Path "$ScriptDir\api-server" -Command "npm run dev" -Port "9000 & 9001"

Start-Sleep -Seconds 2

# Start S3 Reverse Proxy
Start-Service -Name "S3 Reverse Proxy" -Path "$ScriptDir\s3-reverse-proxy" -Command "node index.js" -Port "8000"

Start-Sleep -Seconds 2

# Start Frontend
Start-Service -Name "Frontend (Next.js)" -Path "$ScriptDir\frontend-nextjs" -Command "npm run dev" -Port "3000"

Write-Host "`n=================================" -ForegroundColor $Cyan
Write-Host "All services started!" -ForegroundColor $Green
Write-Host "`nAccess Points:" -ForegroundColor $Cyan
Write-Host "  Frontend:        http://localhost:3000" -ForegroundColor $Green
Write-Host "  API Server:      http://localhost:9000" -ForegroundColor $Green
Write-Host "  Socket.io:       http://localhost:9001" -ForegroundColor $Green
Write-Host "  Reverse Proxy:   http://localhost:8000" -ForegroundColor $Green
Write-Host "`nPress Ctrl+C in each window to stop services" -ForegroundColor $Yellow
Write-Host "=================================" -ForegroundColor $Cyan
