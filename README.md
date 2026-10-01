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
npx nx run api:migrate        # prisma migrate dev: tabele z prisma/schema.prisma
npx nx run api:seed           # Administrator z ADMIN_EMAIL i ADMIN_PASSWORD, można uruchamiać wielokrotnie
npx nx run-many -t serve -p api web
```

- Stan API: http://localhost:3000/api/health (`db`, `s3` i `smtp` muszą mieć `ok`, inaczej `503`)
- Konsola MinIO: http://localhost:9001 (login i hasło z `S3_ACCESS_KEY` / `S3_SECRET_KEY`)
- E-maile (zaproszenia, reset hasła): http://localhost:8025

Serwer SSR `web` pyta API o stare Adresy wizytówki (`301` na nowy) pod `API_INTERNAL_URL`, domyślnie `http://localhost:3000`. W produkcji ustaw ją na adres `api` w sieci wewnętrznej. Z tego samego adresu serwer SSR pobiera dane Wizytówki, a przeglądarka dostaje je w HTML-u (transfer cache) i nie pyta API drugi raz. Serwer SSR odpowiada tylko na hosty z listy (ochrona przed SSRF): w buildzie jest `localhost`, w produkcji ustaw `NG_ALLOWED_HOSTS` na domenę, np. `NG_ALLOWED_HOSTS=bookit.pl`. Za reverse proxy z TLS ustaw też `NG_TRUST_PROXY_HEADERS=x-forwarded-proto,x-forwarded-host`, inaczej serwer widzi adres `http://`: linki kanoniczne i Open Graph wyjdą z `http://`, a przeglądarka pobierze dane Wizytówki drugi raz. Serwer SSR nie kompresuje odpowiedzi, robi to reverse proxy przed nim (np. `encode gzip zstd` w Caddy). Bez kompresji Wizytówka spada w Lighthouse na telefonie poniżej 90 punktów za wydajność.

Kontener `minio-init` tworzy bucket `bookit` i kończy pracę, więc w `docker compose ps -a` ma stan `exited (0)`. Brak zmiennej w `.env` zatrzymuje start `api` z komunikatem, której brakuje.

## Baza danych

Schemat i migracje są w `prisma/`, konfiguracja CLI w `prisma.config.ts`. Po zmianie schematu `npx nx run api:migrate --name opis-zmiany` tworzy migrację. Prisma Client generuje się do `apps/api/src/generated/prisma` (poza gitem) przed `build`, `test` i `lint` albo ręcznie przez `npx nx run api:prisma-generate`.

Seed nie nadpisuje hasła istniejącego Administratora. Żeby zmienić hasło z `.env`, usuń go z bazy i uruchom seed ponownie.

## Testy

Testy `api` korzystają z Postgresa z `DATABASE_URL` i przed startem wykonują `prisma migrate deploy`.

```bash
npx nx run-many -t lint test build
npx nx run web-e2e:e2e
```

Testy Playwright (`apps/web-e2e`) potrzebują Postgresa i Mailpita z `docker compose up -d`. Same uruchamiają `nx serve web` (razem z `api`), a jeśli aplikacja już działa na :4200, korzystają z niej. Linki z zaproszeń i resetu hasła pobierają z API Mailpita. Salony z zaproszonym Właścicielem testy zakładają przez API Administratora, więc baza potrzebuje Administratora z `.env` (`npx nx run api:seed`). Przy pierwszym uruchomieniu zainstaluj przeglądarkę: `npx playwright install chromium`.

CI (`.github/workflows/ci.yml`) uruchamia `nx affected -t lint test build` na każdym PR i pushu do `main`, z Postgresem 16 i zmiennymi z `.env.example`.
