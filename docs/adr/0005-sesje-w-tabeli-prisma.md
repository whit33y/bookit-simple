# Sesje w tabeli zarządzanej przez Prisma

Sesje logowania trzymamy w modelu `Session` ze schematu Prisma (`sid`, `userId`, `data`, `expiresAt`), a nie w tabeli, którą `connect-pg-simple` tworzy sam. Tabela spoza schematu to dla `prisma migrate dev` dryf: przy następnej migracji Prisma proponuje jej usunięcie albo reset bazy. Własny model ma też kolumnę `userId`, więc unieważnienie wszystkich sesji osoby (usunięcie z Personelu, zawieszenie Salonu) to jedno `deleteMany`, bez szukania po JSON-ie sesji.

Rozważaliśmy tabelę `connect-pg-simple` opisaną w schemacie Prisma (`sid`, `sess`, `expire`). Rozwiązuje dryf, ale łamie zasadę `id`/`createdAt`/`updatedAt` z docs/mvp.md i nie ma `userId`.

## Consequences

- T06 pisze mały store `express-session` na `PrismaService` (`get`, `set`, `destroy`, `touch`) albo bierze gotowy store dla Prisma i dopasowuje nazwy pól.
- `userId` ustawia store przy logowaniu. `onDelete: Cascade` usuwa sesje razem z kontem `User`.
- Wygasłe sesje sprząta okresowe `deleteMany({ where: { expiresAt: { lt: now } } })`, stąd indeks na `expiresAt`.
