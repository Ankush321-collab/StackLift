#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}Starting Vercel Clone Services...${NC}"
echo -e "${CYAN}=================================${NC}"

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed!${NC}"
    exit 1
fi

echo -e "\n${GREEN}Node.js version: $(node -v)${NC}"
echo -e "${GREEN}npm version: $(npm -v)${NC}"

# Function to start a service
start_service() {
    local name=$1
    local path=$2
    local command=$3
    local port=$4
    
    echo -e "\n${YELLOW}Starting $name on port $port...${NC}"
    
    if [ -d "$path" ]; then
        cd "$path"
        
        # Check if node_modules exists
        if [ ! -d "node_modules" ]; then
            echo -e "${YELLOW}Installing dependencies for $name...${NC}"
            npm install
        fi
        
        # Start the service in background with a new terminal
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            osascript -e "tell app \"Terminal\" to do script \"cd '$PWD' && echo '$name Running on port $port' && $command\""
        else
            # Linux
            if command -v gnome-terminal &> /dev/null; then
                gnome-terminal -- bash -c "cd '$PWD' && echo '$name Running on port $port' && $command; exec bash"
            elif command -v xterm &> /dev/null; then
                xterm -e "cd '$PWD' && echo '$name Running on port $port' && $command" &
            else
                echo -e "${YELLOW}No terminal emulator found. Running in background...${NC}"
                nohup $command > "$name.log" 2>&1 &
            fi
        fi
        
        cd - > /dev/null
        echo -e "${GREEN}$name started successfully!${NC}"
    else
        echo -e "${RED}Error: $path not found!${NC}"
    fi
}

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Start API Server
start_service "API Server" "$SCRIPT_DIR/api-server" "npm run dev" "9000 & 9001"

sleep 2

# Start S3 Reverse Proxy
start_service "S3 Reverse Proxy" "$SCRIPT_DIR/s3-reverse-proxy" "node index.js" "8000"

sleep 2

# Start Frontend
start_service "Frontend (Next.js)" "$SCRIPT_DIR/frontend-nextjs" "npm run dev" "3000"

echo -e "\n${CYAN}=================================${NC}"
echo -e "${GREEN}All services started!${NC}"
echo -e "\n${CYAN}Access Points:${NC}"
echo -e "${GREEN}  Frontend:        http://localhost:3000${NC}"
echo -e "${GREEN}  API Server:      http://localhost:9000${NC}"
echo -e "${GREEN}  Socket.io:       http://localhost:9001${NC}"
echo -e "${GREEN}  Reverse Proxy:   http://localhost:8000${NC}"
echo -e "\n${YELLOW}Check individual terminal windows for logs${NC}"
echo -e "${CYAN}=================================${NC}"
