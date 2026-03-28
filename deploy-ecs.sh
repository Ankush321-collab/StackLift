#!/bin/bash

# ECS Deployment Script for Vercel Clone
# Updates task definitions and services with new ECR images

CLUSTER_NAME="${1:-builder-server-vercel}"
REGION="${2:-ap-south-2}"
AWS_ACCOUNT_ID="${3:-722496600979}"

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}=====================================${NC}"
echo -e "${CYAN}ECS Deployment Script${NC}"
echo -e "${CYAN}=====================================${NC}"
echo ""
echo -e "${YELLOW}Cluster: $CLUSTER_NAME${NC}"
echo -e "${YELLOW}Region: $REGION${NC}"
echo -e "${YELLOW}AWS Account: $AWS_ACCOUNT_ID${NC}"
echo ""

# Image URIs
API_SERVER_IMAGE="$AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/api-server:latest"
BUILD_SERVER_IMAGE="$AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/build-server:latest"
S3_PROXY_IMAGE="$AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/s3-reverse-proxy:latest"

echo -e "${YELLOW}Image URIs:${NC}"
echo -e "${CYAN}  API Server: $API_SERVER_IMAGE${NC}"
echo -e "${CYAN}  Build Server: $BUILD_SERVER_IMAGE${NC}"
echo -e "${CYAN}  S3 Reverse Proxy: $S3_PROXY_IMAGE${NC}"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed!${NC}"
    exit 1
fi

# Function to register task definition
register_task_definition() {
    local family=$1
    local image=$2
    local memory=${3:-2048}
    local cpu=${4:-512}
    
    echo -e "${YELLOW}Registering task definition: $family${NC}"
    
    # Determine port based on family
    local port=3000
    if [[ $family == *"api"* ]]; then
        port=9000
    elif [[ $family == *"builder"* ]]; then
        port=3000
    elif [[ $family == *"proxy"* ]]; then
        port=8000
    fi
    
    local task_def=$(cat <<EOF
{
  "family": "$family",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["EC2", "FARGATE"],
  "cpu": "$cpu",
  "memory": "$memory",
  "containerDefinitions": [
    {
      "name": "$family",
      "image": "$image",
      "essential": true,
      "portMappings": [
        {
          "containerPort": $port,
          "hostPort": 0,
          "protocol": "tcp"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/$family",
          "awslogs-region": "$REGION",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "environment": []
    }
  ]
}
EOF
)
    
    if result=$(aws ecs register-task-definition \
        --cli-input-json "$task_def" \
        --region $REGION 2>&1); then
        local arn=$(echo $result | grep -o '"taskDefinitionArn":"[^"]*' | cut -d'"' -f4)
        echo -e "${GREEN}✓ Task definition registered: $family${NC}"
        echo $arn
    else
        echo -e "${RED}✗ Error registering task definition: $result${NC}"
        return 1
    fi
}

# Function to update service
update_ecs_service() {
    local service_name=$1
    local task_definition=$2
    
    echo -e "${YELLOW}Updating service: $service_name${NC}"
    
    if aws ecs update-service \
        --cluster $CLUSTER_NAME \
        --service $service_name \
        --task-definition $task_definition \
        --region $REGION > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Service updated: $service_name${NC}"
    else
        echo -e "${RED}✗ Error updating service: $service_name${NC}"
        return 1
    fi
}

# Main deployment flow
echo -e "${CYAN}Step 1: Registering API Server task definition...${NC}"
API_TASK_DEF=$(register_task_definition "api-server-task" "$API_SERVER_IMAGE" "2048" "512")

echo ""
echo -e "${CYAN}Step 2: Registering Build Server task definition...${NC}"
BUILD_TASK_DEF=$(register_task_definition "builder-task" "$BUILD_SERVER_IMAGE" "4096" "1024")

echo ""
echo -e "${CYAN}Step 3: Registering S3 Reverse Proxy task definition...${NC}"
S3_PROXY_TASK_DEF=$(register_task_definition "s3-reverse-proxy-task" "$S3_PROXY_IMAGE" "1024" "256")

echo ""
echo -e "${CYAN}Step 4: Updating ECS services...${NC}"

# Check if services exist
services=$(aws ecs list-services --cluster $CLUSTER_NAME --region $REGION --query 'serviceArns' --output text)

if [ -z "$services" ]; then
    echo -e "${YELLOW}No services found. Create services first in AWS Console or use AWS CLI.${NC}"
    echo ""
    echo -e "${CYAN}Example commands to create services:${NC}"
    cat <<EOF

aws ecs create-service \\
  --cluster $CLUSTER_NAME \\
  --service-name api-server \\
  --task-definition api-server-task \\
  --desired-count 1 \\
  --launch-type FARGATE \\
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-xxxxx],securityGroups=[sg-xxxxx]}' \\
  --region $REGION

aws ecs create-service \\
  --cluster $CLUSTER_NAME \\
  --service-name builder-server \\
  --task-definition builder-task \\
  --desired-count 1 \\
  --launch-type FARGATE \\
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-xxxxx],securityGroups=[sg-xxxxx]}' \\
  --region $REGION

aws ecs create-service \\
  --cluster $CLUSTER_NAME \\
  --service-name s3-reverse-proxy \\
  --task-definition s3-reverse-proxy-task \\
  --desired-count 1 \\
  --launch-type FARGATE \\
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-xxxxx],securityGroups=[sg-xxxxx]}' \\
  --region $REGION
EOF
else
    for service in $services; do
        service_name=$(basename $service)
        if [[ $service_name == *"api"* ]]; then
            update_ecs_service $service_name $API_TASK_DEF
        elif [[ $service_name == *"builder"* ]]; then
            update_ecs_service $service_name $BUILD_TASK_DEF
        elif [[ $service_name == *"proxy"* ]] || [[ $service_name == *"s3"* ]]; then
            update_ecs_service $service_name $S3_PROXY_TASK_DEF
        fi
    done
fi

echo ""
echo -e "${CYAN}=====================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${CYAN}=====================================${NC}"
