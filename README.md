# Mailium

A self-hosted email campaign management app modeled after Mailmeteor, built for cold-emailing workflows with custom recipient filtering and campaign templates.

## Tech Stack

### Backend
- Node.js + Express
- MongoDB + Mongoose
- Nodemailer + Gmail API (OAuth2)
- Agenda.js (MongoDB-backed job scheduling)

### Frontend
- React (Vite)
- TipTap (Rich Text Editor)
- React Router
- Lucide React (Icons)

## Setup Instructions

1. Clone the repository
2. Navigate to `server` and run `npm install`
3. Ensure `.env` is configured properly in `server/.env`
4. Run `npm start` (or `npm run dev` if configured) in the `server` directory
5. Navigate to `client` and run `npm install`
6. Run `npm run dev` in the `client` directory
7. Access the app at `http://localhost:5173`

## Production Deployment

Production uses rootless Docker Compose with service-style container names:

- `system-cache-runtime`: Express API, Agenda jobs, Gmail/reply sync
- `system-cache-router`: Nginx static frontend and `/api`, `/t`, `/uploads` proxy

On the VM:

```bash
ssh system-cache@143.244.128.71
export DOCKER_HOST=unix:///run/user/1002/docker.sock
docker context show
mkdir -p /var/lib/system-cache/apps/mailium
cd /var/lib/system-cache/apps/mailium
cp .env.example .env
```

Fill `.env` on the VM only. Do not commit real credentials. For the current rootless setup, use:

```bash
TRACKING_BASE_URL=http://143.244.128.71:8091
FRONTEND_URL=http://143.244.128.71:8091
ROUTER_PORT=8091
```

Deploy or redeploy:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f
```

For reliable Google OAuth callbacks and email tracking in production, use a real HTTPS domain when possible and set `TRACKING_BASE_URL` and `FRONTEND_URL` to that domain.

## GitHub Actions CD

CD can be added after these GitHub repository secrets are configured:

- `VM_HOST`: `143.244.128.71`
- `VM_USER`: `system-cache`
- `VM_SSH_KEY`: private SSH key that can connect as `system-cache`
- `DEPLOY_PATH`: `/var/lib/system-cache/apps/mailium`

The deploy job should SSH into the VM, export `DOCKER_HOST=unix:///run/user/1002/docker.sock`, run `git pull`, and then run `docker compose up -d --build`. Keep the production `.env` on the VM; do not store application credentials in GitHub Actions unless you explicitly want the workflow to manage the env file.
