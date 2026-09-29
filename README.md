# Bookit

Wizytówka i kalendarz wizyt dla małych salonów beauty. Klient widzi stronę salonu z cennikiem i godzinami otwarcia, a Personel prowadzi w panelu kalendarz zamiast papierowego zeszytu.

- Słownik pojęć: [CONTEXT.md](CONTEXT.md)
- Zakres MVP, model danych i zadania: [docs/mvp.md](docs/mvp.md)
- Decyzje architektoniczne: [docs/adr/](docs/adr/)

## Stos

Nx, Angular (SSR dla Wizytówki), NestJS, PostgreSQL + Prisma, MinIO, Mailpit. Szczegóły w [docs/mvp.md](docs/mvp.md#3-architektura).

## Uruchomienie lokalne

Wymagania: Node.js 24 LTS, Docker.

```bash
cp .env.example .env
docker compose up -d          # Postgres :5432, MinIO :9000 (konsola :9001), Mailpit :1025/:8025
docker compose ps             # postgres, minio i mailpit powinny być "healthy"
npm install
npx nx run-many -t serve -p api web
```

Migracje i seed Administratora dojdą w T03.

- Stan API: http://localhost:3000/api/health (`s3` i `smtp` muszą mieć `ok`, inaczej `503`)
- Konsola MinIO: http://localhost:9001 (login i hasło z `S3_ACCESS_KEY` / `S3_SECRET_KEY`)
- E-maile (zaproszenia, reset hasła): http://localhost:8025

Kontener `minio-init` tworzy bucket `bookit` i kończy pracę, więc w `docker compose ps -a` ma stan `exited (0)`. Brak zmiennej w `.env` zatrzymuje start `api` z komunikatem, której brakuje.

## Testy

```bash
npx nx run-many -t lint test build
npx nx run web-e2e:e2e
```

CI (`.github/workflows/ci.yml`) uruchamia `nx affected -t lint test build` na każdym PR i pushu do `main`, z Postgresem 16 i zmiennymi z `.env.example`.
