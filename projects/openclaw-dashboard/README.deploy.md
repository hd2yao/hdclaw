# OpenClaw Dashboard Deployment

## Included
- `docker-compose.yml`: backend, frontend, nginx reverse proxy, sqlite health checker, backup worker, optional Loki + Promtail
- `docker/backend.Dockerfile`: multi-stage backend build
- `docker/frontend.Dockerfile`: static frontend image
- `deploy/nginx/nginx.conf`: reverse proxy config
- `deploy/health/*.sh`: backend/frontend/sqlite health checks
- `deploy/backup/backup-sqlite.sh`: SQLite backup rotation script
- `deploy/logging/*`: optional log aggregation preset

## Environments
Use one env file per environment:
- `.env.dev`
- `.env.staging`
- `.env.production`

Example:
```bash
cp .env.example .env.production
# edit values
docker compose --env-file .env.production up -d --build
```

Optional observability:
```bash
docker compose --env-file .env.production --profile observability up -d
```

## Notes
- SQLite is persisted in the named volume `dashboard_data`
- Backups are written to the named volume `dashboard_backups`
- Health check endpoints:
  - backend: `/health`
  - frontend: `/healthz`
  - nginx: `/healthz`
- Frontend Docker image now builds the existing Vite app in `frontend/`
- If you deploy behind Nginx, keep `VITE_DASHBOARD_HTTP_URL=/api` and `VITE_DASHBOARD_WS_URL=/ws`
