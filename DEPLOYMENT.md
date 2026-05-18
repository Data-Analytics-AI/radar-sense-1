# SnapFort — Deployment Guide (Huawei Cloud ECS + SWR)

This guide walks through containerising SnapFort and running it on a Huawei
Cloud **ECS** instance, using **SWR** (SoftWare Repository for Containers) as
the registry. The same image runs anywhere Docker runs — only the registry
hostname and credentials differ.

---

## 0. What you ship

A single Docker image:

- React frontend pre-built into `dist/public` and served by Express.
- Express API (`server/index.ts`) on port **5000**.
- Connects out to Huawei RDS (Postgres) and Huawei OBS at runtime.
- Health endpoint: `GET /api/health` (also `GET /api/system/obs-health`,
  `GET /api/system/db-health` for deeper checks).

The container is **stateless**. All persistence lives in RDS and OBS.

---

## 1. Build the image locally

```bash
# From repo root
docker build -t snapfort:latest .
```

The build is multi-stage:

1. `node:20-slim` builder installs all deps and runs `npm run build`
   (Vite → `dist/public`), then prunes dev dependencies.
2. `node:20-slim` runtime copies in `node_modules`, `dist/`, `server/`,
   `shared/`, `src/`, exposes 5000, runs as the unprivileged `node` user,
   and starts the server with `tsx server/index.ts`.

A built-in `HEALTHCHECK` polls `/api/health` every 30s.

---

## 2. Smoke-test the image

```bash
cp .env.example .env       # then fill in real values — never commit .env
docker run --rm \
  --name snapfort \
  -p 5000:5000 \
  --env-file .env \
  snapfort:latest
```

Then in another terminal:

```bash
curl -s http://localhost:5000/api/health        | jq
curl -s http://localhost:5000/api/system/db-health  | jq
curl -s http://localhost:5000/api/system/obs-health | jq
open  http://localhost:5000                      # full React app
```

If `/api/system/db-health` or `/api/system/obs-health` are not `ok`, fix the
env vars before pushing the image.

---

## 3. Push to Huawei SWR

> Replace `<region>` with your SWR region (`cn-north-4`, `ap-southeast-1`,
> etc.) and `<org>` with your SWR organisation.

### 3a. Get a temporary docker login

In the Huawei Cloud console: **SWR → My Images → Generate Login Command**.
You'll get something like:

```bash
docker login -u <region>@AKSK -p <long-token> swr.<region>.myhuaweicloud.com
```

The token is short-lived (12h). Run it on the machine that will push.

### 3b. Tag and push

```bash
TAG=$(date +%Y%m%d-%H%M)
docker tag  snapfort:latest swr.<region>.myhuaweicloud.com/<org>/snapfort:$TAG
docker tag  snapfort:latest swr.<region>.myhuaweicloud.com/<org>/snapfort:latest
docker push swr.<region>.myhuaweicloud.com/<org>/snapfort:$TAG
docker push swr.<region>.myhuaweicloud.com/<org>/snapfort:latest
```

Always push an immutable `:$TAG` (date- or commit-SHA-based) **and** update
`:latest`. Rollbacks pin to `:$TAG`, never to `:latest`.

---

## 4. Provision the ECS instance

Recommended baseline:

| Setting           | Value                                         |
| ----------------- | --------------------------------------------- |
| Image             | Ubuntu 22.04 LTS (or HuaweiCloud EulerOS 2.0) |
| Flavor            | ≥ 4 vCPU / 8 GB RAM (s6.xlarge.2 or similar)  |
| System disk       | ≥ 40 GB SSD                                   |
| EIP               | Bind a public IPv4 (or use ELB)               |
| Security group    | Inbound: 22 (SSH from your IP), 5000 (or 80/443 if Nginx-fronted) |
| VPC               | Same VPC/subnet as your RDS instance, so the DB is reachable on its private endpoint |

Open RDS access for the ECS's private IP in the **RDS security group** so the
container can reach Postgres on its private endpoint (faster + free).

---

## 5. Install Docker on ECS

```bash
ssh root@<ecs-public-ip>

apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
    > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io
systemctl enable --now docker
docker --version
```

---

## 6. Pull and run on ECS

```bash
# Login to SWR (regenerate the temp token from the SWR console first)
docker login -u <region>@AKSK -p <long-token> swr.<region>.myhuaweicloud.com

# Place the runtime env file outside the container
mkdir -p /opt/snapfort
nano    /opt/snapfort/.env        # paste the values from .env.example
chmod 600 /opt/snapfort/.env

# Pull
docker pull swr.<region>.myhuaweicloud.com/<org>/snapfort:latest

# Run (single instance, restart on reboot)
docker run -d \
  --name snapfort \
  --restart unless-stopped \
  -p 5000:5000 \
  --env-file /opt/snapfort/.env \
  swr.<region>.myhuaweicloud.com/<org>/snapfort:latest

# Verify
docker logs -f snapfort
curl -s http://127.0.0.1:5000/api/health
```

The app is now reachable at `http://<ecs-public-ip>:5000`.

### Required runtime environment variables

| Variable                  | Required | Purpose                                                |
| ------------------------- | -------- | ------------------------------------------------------ |
| `NODE_ENV`                | yes      | Must be `production` to serve `dist/public`.           |
| `PORT`                    | no       | Defaults to `5000`.                                    |
| `HUAWEI_PGHOST`           | yes      | RDS Postgres private endpoint.                         |
| `HUAWEI_PGPORT`           | yes      | Usually `5432`.                                        |
| `HUAWEI_PGUSER`           | yes      | RDS user.                                              |
| `HUAWEI_PGPASSWORD`       | yes      | RDS password.                                          |
| `HUAWEI_PGDATABASE`       | yes      | DB name.                                               |
| `HUAWEI_PGSSLMODE`        | yes      | `require` (or `verify-full` if shipping the CA bundle).|
| `HUAWEI_PGSSLROOTCERT`    | optional | Path **inside the container** to the RDS CA bundle.    |
| `HUAWEI_OBS_AK`           | yes      | OBS access key.                                        |
| `HUAWEI_OBS_SK`           | yes      | OBS secret key.                                        |
| `HUAWEI_OBS_BUCKET`       | yes      | Target bucket name.                                    |
| `HUAWEI_OBS_ENDPOINT`     | yes      | e.g. `obs.ap-southeast-3.myhuaweicloud.com`.           |
| `AZURE_OPENAI_API_KEY`    | yes¹     | Azure OpenAI key (primary AI provider).                |
| `AZURE_OPENAI_ENDPOINT`   | yes¹     | e.g. `https://<resource>.openai.azure.com`.            |
| `AZURE_OPENAI_DEPLOYMENT` | yes¹     | Azure deployment name.                                 |
| `OPENAI_API_KEY`          | optional | OpenAI fallback if Azure errors.                       |
| `SESSION_SECRET`          | yes      | Long random string for session cookies.                |

¹ At least one AI provider must be configured. If both Azure and OpenAI are
missing, AI endpoints return 500 but the rest of the app still works.

### Mounting the RDS CA bundle (optional, for `verify-full`)

```bash
# Put the CA file on the host first, e.g. /opt/snapfort/rds-ca.pem
docker run -d \
  --name snapfort --restart unless-stopped -p 5000:5000 \
  --env-file /opt/snapfort/.env \
  -e HUAWEI_PGSSLMODE=verify-full \
  -e HUAWEI_PGSSLROOTCERT=/app/certs/rds-ca.pem \
  -v /opt/snapfort/rds-ca.pem:/app/certs/rds-ca.pem:ro \
  swr.<region>.myhuaweicloud.com/<org>/snapfort:latest
```

---

## 7. (Optional) Nginx reverse proxy + Let's Encrypt

If you want HTTPS on `https://app.example.com` instead of `http://<ip>:5000`:

```bash
apt-get install -y nginx certbot python3-certbot-nginx
```

`/etc/nginx/sites-available/snapfort`:

```nginx
server {
    listen 80;
    server_name app.example.com;

    location / {
        proxy_pass         http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # SSE for /api/chat
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 3600s;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/snapfort /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d app.example.com
```

Then close port `5000` in the security group — only `80/443` should be public.

---

## 8. (Optional) systemd unit for stronger lifecycle control

`docker run --restart unless-stopped` already auto-restarts on reboot. If you
want systemd to own the lifecycle (e.g. for `journalctl` aggregation):

`/etc/systemd/system/snapfort.service`:

```ini
[Unit]
Description=SnapFort container
Requires=docker.service
After=docker.service network-online.target

[Service]
Restart=always
RestartSec=5
ExecStartPre=-/usr/bin/docker stop snapfort
ExecStartPre=-/usr/bin/docker rm   snapfort
ExecStartPre=/usr/bin/docker pull  swr.<region>.myhuaweicloud.com/<org>/snapfort:latest
ExecStart=/usr/bin/docker run --rm --name snapfort \
    -p 5000:5000 \
    --env-file /opt/snapfort/.env \
    swr.<region>.myhuaweicloud.com/<org>/snapfort:latest
ExecStop=/usr/bin/docker stop snapfort

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now snapfort
journalctl -u snapfort -f
```

---

## 9. Rollback

Always deploy via an immutable tag (`:20260515-1430`, not `:latest`) so
rollback is a one-liner:

```bash
docker pull swr.<region>.myhuaweicloud.com/<org>/snapfort:20260514-0900
docker stop snapfort && docker rm snapfort
docker run -d --name snapfort --restart unless-stopped -p 5000:5000 \
  --env-file /opt/snapfort/.env \
  swr.<region>.myhuaweicloud.com/<org>/snapfort:20260514-0900
```

Database migrations: there are none — `server/seed.ts` is idempotent and
upgrades the schema in place on every boot.

---

## 10. Future: CI/CD

This project does **not** ship with a GitHub Actions workflow. When you're
ready, the workflow is roughly:

1. `actions/checkout@v4`
2. `docker/setup-buildx-action@v3`
3. `docker login` to SWR using `${{ secrets.SWR_USER }}` / `${{ secrets.SWR_TOKEN }}`
4. `docker buildx build --push -t swr.<region>.myhuaweicloud.com/<org>/snapfort:${{ github.sha }} .`
5. SSH into ECS and `docker pull && docker stop && docker run` the new tag.

Keep the `:latest` floating tag for humans; deploy by SHA in CI.

---

## Notes on `tsx` in production

The container runs the Express server with `tsx` (TypeScript loader) rather
than a precompiled `dist/server/`. This keeps the build simple and the
runtime image small. The cost is a few hundred ms of TypeScript parsing on
boot. If you ever want to remove `tsx` from the runtime, add a server build
step (`tsc -p tsconfig.server.json`) and change the `CMD` to
`node dist/server/index.js`.
