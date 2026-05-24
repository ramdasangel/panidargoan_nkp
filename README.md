# PaniDarGoan

Watershed management and project tracking platform for Maharashtra, India — scalable to all of India.

## What's in the demo

- **Admin hierarchy:** country → state → district → taluka → village (real OSM boundaries for Maharashtra/Pune/Ambegaon/Shirur)
- **Watershed hierarchy:** river basin → sub-basin → micro-watershed (Bhima → Ghod → 2 micro-watersheds)
- **Water sources:** 7 types covered — rivers (lines), check dams/bandharas (points), ponds/farm ponds (polygons)
- **Projects:** 2 sample projects, 7 tasks, resource allocations, cost entries, planned vs actual
- **Reporting:** click any watershed → cost rollup detail (direct watershed / via water source / via village overlap), with breakdown by project
- **i18n:** English + Marathi, switchable in header. Currency in INR.
- **Auth:** dummy login (4 seeded users with different roles); swap to Google OAuth later by flipping `AUTH_MODE=google` and adding a Google Client ID

## Stack

- **Frontend:** React (Vite + PWA), react-i18next, react-leaflet, served by **nginx** in production
- **API:** Express + TypeScript + Prisma, with **Redis** caching the heavy reads (boundary GeoJSON, watershed tree, cost rollup)
- **DB:** PostgreSQL 16 + PostGIS 3.4 (custom image bakes in the public-schema owner fix)
- **Everything Dockerized** for production deployment (Hostinger or any docker host)

## Prerequisites

- Docker Desktop (Mac/Windows) or Docker Engine + Compose plugin (Linux)
- For dev mode: Node.js 20+

## Two ways to run

### A. Production-like (everything in Docker)

```bash
cp .env.example .env
docker compose --profile app up -d --build
```

Open **http://localhost:8080**. nginx serves the React build and proxies `/api/*` to the API container. PostgreSQL is on host port `5433`, Redis on `6379`, API on `3000`.

To stop: `docker compose --profile app down`. To wipe data: `docker compose --profile app down -v` (deletes Postgres + Redis volumes).

### B. Dev with hot reload (db + redis in Docker, api + web on host)

```bash
cp .env.example .env
cp api/.env.example api/.env
cp web/.env.example web/.env

# Bring up just db + redis
docker compose up -d

# Install + migrate + seed
cd api
npm install
npx prisma migrate deploy
npx prisma generate
npm run seed
cd ..

cd web
npm install
cd ..

# Two terminals
cd api && npm run dev      # http://localhost:3000
cd web && npm run dev      # http://localhost:5173
```

> **Port 5433?** Docker maps Postgres to host port `5433` to avoid clashing with any local Homebrew Postgres on `5432`.

## Importing real boundaries

The seed creates placeholder rectangles around each entity's centroid. To replace them with real polygons from OpenStreetMap:

```bash
cd api
npm run import:boundaries
```

This script:
1. Fetches **state, district, taluka** polygons from [OSM Nominatim](https://nominatim.openstreetmap.org/) (cached to `api/.cache/`).
2. Generates **village** boundaries via Voronoi tessellation of the seeded centroids, clipped to each taluka's real OSM boundary using PostGIS `ST_Intersection`. (Indian OSM village polygons are sparse; Voronoi gives a credible approximation.)
3. Refreshes the watershed boundaries to match the new taluka outlines.
4. Invalidates the Redis cache so the next API request serves the new shapes.

> Adding new villages? Make sure the seeded `lat`/`lon` falls inside the real OSM taluka boundary, otherwise the Voronoi intersection will return empty.

## Seeded dummy users

| Email | Role |
|---|---|
| admin@demo.local | admin |
| pm@demo.local | project_manager |
| field@demo.local | field_user |
| viewer@demo.local | viewer |

## What's next

- **Slice 4:** water budgets (annual / half-yearly supply vs demand reports per village or watershed)
- Write endpoints + edit UI for projects/tasks/costs
- Swap dummy auth for Google OAuth (`AUTH_MODE=google`)
- Swap Leaflet for Google Maps (`web/src/components/MapView.tsx` is the only file)

## Layout

```
PaniDarGoan/
├── docker-compose.yml          # db + redis (default), api + web (app profile)
├── db/
│   ├── Dockerfile              # postgis + baked-in init.sql
│   └── init.sql                # ALTER SCHEMA public OWNER → app user
├── api/
│   ├── Dockerfile              # bookworm-slim (NOT alpine — Prisma needs libssl3)
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/         # 3 hand-written SQL migrations
│   │   └── seed.ts             # users, hierarchy, projects, tasks, costs
│   ├── scripts/
│   │   └── import-boundaries.ts  # OSM Nominatim + Voronoi
│   └── src/
│       ├── cache.ts            # Redis wrapper
│       ├── middleware/auth.ts
│       └── routes/             # auth, admin, watersheds, waterSources, projects, reports, boundaries
└── web/
    ├── Dockerfile              # multi-stage: node build → nginx serve
    ├── nginx.conf              # SPA fallback + /api proxy + gzip + asset caching
    └── src/
        ├── auth/               # AuthContext + DummyLogin
        ├── components/         # MapView, WatershedSidebar, CostRollupPanel, ProjectsList, ProjectDetail
        └── locales/            # en.json, mr.json
```
