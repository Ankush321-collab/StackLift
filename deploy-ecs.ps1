# ECS Deployment Script for Vercel Clone
# Updates task definitions and services with new ECR images

param(
    [string]$ClusterName = "builder-server-vercel",
    [string]$Region = "ap-south-2",
    [string]$AWSAccountId = "722496600979"
)

$ErrorActionPreference = "Stop"

# Colors
$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"
$Cyan = "Cyan"

Write-Host "=====================================" -ForegroundColor $Cyan
Write-Host "ECS Deployment Script" -ForegroundColor $Cyan
Write-Host "=====================================" -ForegroundColor $Cyan
Write-Host ""
Write-Host "Cluster: $ClusterName" -ForegroundColor $Yellow
Write-Host "Region: $Region" -ForegroundColor $Yellow
Write-Host "AWS Account: $AWSAccountId" -ForegroundColor $Yellow
Write-Host ""

# Image URIs
$ApiServerImage = "$AWSAccountId.dkr.ecr.$Region.amazonaws.com/api-server:latest"
$BuildServerImage = "$AWSAccountId.dkr.ecr.$Region.amazonaws.com/build-server:latest"
$S3ProxyImage = "$AWSAccountId.dkr.ecr.$Region.amazonaws.com/s3-reverse-proxy:latest"

Write-Host "Image URIs:" -ForegroundColor $Yellow
Write-Host "  API Server: $ApiServerImage" -ForegroundColor $Cyan
Write-Host "  Build Server: $BuildServerImage" -ForegroundColor $Cyan
Write-Host "  S3 Reverse Proxy: $S3ProxyImage" -ForegroundColor $Cyan
Write-Host ""

# Function to register task definition
function Register-TaskDefinition {
    param(
        [string]$Family,
        [string]$Image,
        [int]$Memory = 2048,
        [int]$Cpu = 512
    )
    
    Write-Host "Registering task definition: $Family" -ForegroundColor $Yellow
    
    $taskDef = @{
        family       = $Family
        networkMode  = "awsvpc"
        requiresCompatibilities = @("EC2", "FARGATE")
        cpu          = $Cpu.ToString()
        memory       = $Memory.ToString()
        containerDefinitions = @(
            @{
                name      = $Family
                image     = $Image
                essential = $true
                portMappings = @(
                    @{
                        containerPort = if ($Family -like "*api*") { 9000 } elseif ($Family -like "*builder*") { 3000 } else { 8000 }
                        hostPort      = 0
                        protocol      = "tcp"
                    }
                )
                logConfiguration = @{
                    logDriver = "awslogs"
                    options   = @{
                        "awslogs-group"         = "/ecs/$Family"
                        "awslogs-region"        = $Region
                        "awslogs-stream-prefix" = "ecs"
                    }
                }
                environment = @()
            }
        )
    } | ConvertTo-Json -Depth 10
    
    try {
        $result = aws ecs register-task-definition `
            --cli-input-json $taskDef `
            --region $Region
        
        Write-Host "✓ Task definition registered: $Family" -ForegroundColor $Green
        return ($result | ConvertFrom-Json).taskDefinition.taskDefinitionArn
    }
    catch {
        Write-Host "✗ Error registering task definition: $_" -ForegroundColor $Red
        return $null
    }
}

# Function to update service
function Update-ECSService {
    param(
        [string]$ServiceName,
        [string]$TaskDefinition
    )
    
    Write-Host "Updating service: $ServiceName" -ForegroundColor $Yellow
    
    try {
        aws ecs update-service `
            --cluster $ClusterName `
            --service $ServiceName `
            --task-definition $TaskDefinition `
            --region $Region | Out-Null
        
        Write-Host "✓ Service updated: $ServiceName" -ForegroundColor $Green
    }
    catch {
        Write-Host "✗ Error updating service: $_" -ForegroundColor $Red
    }
}

# Main deployment flow
try {
    # Check AWS CLI
    if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
        throw "AWS CLI is not installed!"
    }
    
    Write-Host "Step 1: Registering API Server task definition..." -ForegroundColor $Cyan
    $apiTaskDef = Register-TaskDefinition -Family "api-server-task" -Image $ApiServerImage -Cpu 512 -Memory 2048
    
    Write-Host ""
    Write-Host "Step 2: Registering Build Server task definition..." -ForegroundColor $Cyan
    $buildTaskDef = Register-TaskDefinition -Family "builder-task" -Image $BuildServerImage -Cpu 1024 -Memory 4096
    
    Write-Host ""
    Write-Host "Step 3: Registering S3 Reverse Proxy task definition..." -ForegroundColor $Cyan
    $proxyTaskDef = Register-TaskDefinition -Family "s3-reverse-proxy-task" -Image $S3ProxyImage -Cpu 256 -Memory 1024
    
    Write-Host ""
    Write-Host "Step 4: Updating ECS services..." -ForegroundColor $Cyan
    
    # Check if services exist and update them
    $services = aws ecs list-services --cluster $ClusterName --region $Region | ConvertFrom-Json
    
    if ($services.serviceArns.Count -gt 0) {
        foreach ($serviceArn in $services.serviceArns) {
            $serviceName = $serviceArn.Split("/")[-1]
            
            if ($serviceName -like "*api*") {
                Update-ECSService -ServiceName $serviceName -TaskDefinition $apiTaskDef
            }
            elseif ($serviceName -like "*builder*") {
                Update-ECSService -ServiceName $serviceName -TaskDefinition $buildTaskDef
            }
            elseif ($serviceName -like "*proxy*" -or $serviceName -like "*s3*") {
                Update-ECSService -ServiceName $serviceName -TaskDefinition $proxyTaskDef
            }
        }
    }
    else {
        Write-Host "No services found. Create services first in AWS Console or use AWS CLI." -ForegroundColor $Yellow
        Write-Host ""
        Write-Host "Example commands to create services:" -ForegroundColor $Cyan
        Write-Host "
aws ecs create-service \
  --cluster $ClusterName \
  --service-name api-server \
  --task-definition api-server-task \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-xxxxx],securityGroups=[sg-xxxxx]}' \
  --region $Region

aws ecs create-service \
  --cluster $ClusterName \
  --service-name builder-server \
  --task-definition builder-task \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-xxxxx],securityGroups=[sg-xxxxx]}' \
  --region $Region

aws ecs create-service \
  --cluster $ClusterName \
  --service-name s3-reverse-proxy \
  --task-definition s3-reverse-proxy-task \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-xxxxx],securityGroups=[sg-xxxxx]}' \
  --region $Region
" -ForegroundColor $Cyan
    }
    
    Write-Host ""
    Write-Host "=====================================" -ForegroundColor $Green
    Write-Host "Deployment Complete!" -ForegroundColor $Green
    Write-Host "=====================================" -ForegroundColor $Green
}
catch {
    Write-Host "Error: $_" -ForegroundColor $Red
    exit 1
}
