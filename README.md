# Bookit

Wizytówka i kalendarz wizyt dla małych salonów beauty. Klient widzi stronę salonu z cennikiem i godzinami otwarcia, a Personel prowadzi w panelu kalendarz zamiast papierowego zeszytu.

- Słownik pojęć: [CONTEXT.md](CONTEXT.md)
- Zakres MVP, model danych i zadania: [docs/mvp.md](docs/mvp.md)
- Decyzje architektoniczne: [docs/adr/](docs/adr/)

## Stos

Nx, Angular (SSR dla Wizytówki), NestJS, PostgreSQL + Prisma, MinIO, Mailpit. Szczegóły w [docs/mvp.md](docs/mvp.md#3-architektura).

## Uruchomienie lokalne

> Kodu jeszcze nie ma. Poniższe kroki powstają w zadaniach T01–T03 i trzeba je zweryfikować, gdy będą gotowe.

Wymagania: Node.js 24 LTS, Docker.

```bash
cp .env.example .env
docker compose up -d          # Postgres :5432, MinIO :9000 (konsola :9001), Mailpit :8025
npm install
npx nx run api:migrate
npx nx run api:seed           # Administrator z .env i salon Studio Kora
npx nx run-many -t serve -p api web
```

- Panel: http://localhost:4200/panel
- Panel Administratora: http://localhost:4200/admin
- Wizytówka Studio Kora: http://localhost:4200/studio-kora
- E-maile (zaproszenia, reset hasła): http://localhost:8025

## Testy

```bash
npx nx run-many -t lint test build
npx nx run web-e2e:e2e
```
