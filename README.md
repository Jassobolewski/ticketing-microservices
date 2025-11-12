# Ticketing Microservices (Node + Express + Postgres + Docker)

A small microservice system with an API Gateway, Auth (S1), and Ticket Intake (S2). Everything runs locally via Docker Compose and is cloud-portable.

---

## Repo Structure

microserviceProject/
├─ api-gateway/ # Single public entrypoint; routes to internal services
│ ├─ index.js # CORS, /health, proxy routes (/auth, /tickets, ...)
│ ├─ package.json # "start": "node index.js"
│ └─ Dockerfile
│
├─ s1-auth-account/ # S1: Account creation + login (JWT), roles
│ ├─ index.js # /register, /login, /me; creates users table on boot
│ ├─ package.json # "start": "node index.js"
│ └─ Dockerfile
│
├─ s2-ticket-intake/ # S2: Ticket creation/listing (per-user)
│ ├─ index.js # / (POST, GET) behind gateway /tickets; creates tickets table
│ ├─ package.json # "start": "node index.js"
│ └─ Dockerfile
│
├─ infra/ # Local orchestration
│ └─ docker-compose.yml # Postgres + services + port mappings
│
└─ .gitignore # ignores node_modules, .env, local data, etc.




> **Paths:**
> - Gateway listens on host `:8080`.
> - Auth internal URL: `http://s1-auth-account:3001`
> - Tickets internal URL: `http://s2-ticket-intake:3002`
> - Postgres internal URL: `postgres://ticketuser:ticketpass@postgres:5432/ticketdb`

---

## How Things Talk

- **Clients → API Gateway** (HTTP):
  - `/auth/*` → **S1 Auth** (prefix stripped via `pathRewrite: { "^/auth": "" }`)
  - `/tickets/*` → **S2 Tickets** (no rewrite; S2 handles root `/` and is mounted at `/tickets` via the gateway)
- **Services → Postgres** using `DB_URL` env var.
- **Auth** issues JWT; downstream services verify `Authorization: Bearer <token>`.

---

## Prereqs

- Docker Desktop
- (Optional) Node 20+ for local tweaks

---

## Run (Local)

```bash
cd infra
docker compose down
docker compose up --build
```
