# Mailium Deployment Guide

This document outlines the steps required to safely deploy the Mailium application to the production VM (`dev-server`).

> [!IMPORTANT]  
> Before deploying, ensure all code is committed and pushed to the `main` branch.

## 1. Connect to the VM
Connect to the VM using SSH:
```bash
ssh dev-server
# Or manually: ssh dev@64.227.189.186
```

## 2. Pull the Latest Code
Navigate to the project directory on the VM and pull the latest changes:
```bash
cd /path/to/mailium
git pull origin main
```

## 3. Rebuild and Restart Containers
Mailium runs using Docker Compose. To apply changes, gracefully rebuild and restart the containers.
```bash
docker-compose down
docker-compose up -d --build
```

## 4. Verification
After the containers start, monitor the logs to ensure there are no startup crashes or database connection issues:
```bash
docker-compose logs -f
```

## Extra Precautions
- **Database Safety:** Ensure any schema changes are backward compatible or accompanied by proper migration logic.
- **Environment Variables:** Verify that `.env` files on the VM contain all necessary production keys (e.g., Google OAuth keys, MongoDB URIs). These are not tracked in Git.
- **Downtime:** The `--build` flag will take some time. Running `docker-compose up -d --build` usually minimizes downtime by building the new images before recreating the containers, but brief downtime is expected when the containers restart.
