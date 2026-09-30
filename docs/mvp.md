# MVP Bookit

Dokument opisuje zakres pierwszej wersji, model danych, reguły i listę zadań do przepisania na GitHub Issues. Terminy pisane wielką literą (Salon, Wizyta, Personel...) mają znaczenie z [CONTEXT.md](../CONTEXT.md). Decyzje architektoniczne są w [docs/adr/](adr/).

Cel MVP: salon pilotażowy Studio Kora (patrz sekcja 9) prowadzi cały kalendarz w aplikacji uruchomionej lokalnie i ma działającą Wizytówkę. Hosting jest poza MVP.

## 1. Zakres

### W MVP

- Administrator zakłada Salon formularzem, a Właściciel dostaje zaproszenie e-mailem.
- Właściciel zarządza Personelem, Cennikiem, Godzinami otwarcia, Ogłoszeniami, galerią i treścią Wizytówki.
- Personel prowadzi kalendarz: Wizyty, Nieobecności, kartotekę Klientów.
- Wizytówka pod `/{adres-wizytowki}`, renderowana po stronie serwera.
- Interfejs działa na telefonie, tablecie i komputerze.

### Świadomie poza MVP

| Rzecz | Dlaczego nie teraz |
|---|---|
| Rezerwacja online przez Klienta | Klienci umawiają się telefonicznie lub w salonie. |
| SMS-y i e-maile do Klientów | Koszt i zgody. Telefon trzymamy w E.164, żeby dało się to dodać później. |
| Tygodniowy grafik Pracowników | Wystarczą Godziny otwarcia i Nieobecności. |
| Przypisanie Usług do osób | Personel małego salonu wie, kto co robi. |
| Płatności, kasa, raporty przychodów | Wizyta nie zapisuje płatności. |
| Informacje o zdrowiu Klienta | [ADR 0003](adr/0003-bez-informacji-o-zdrowiu.md). |
| Kilka lokalizacji jednego Salonu | Jeden Salon to jeden adres. |
| Kilka szablonów Wizytówki | Jeden szablon, kolor i logo do ustawienia. |
| Subdomeny i własne domeny | [ADR 0002](adr/0002-adres-wizytowki-jako-sciezka.md) opisuje, jak je dodać. |
| Wizyty cykliczne | Rzadkie w małych salonach. |
| Logowanie przez Google, wcielanie się Administratora w Właściciela | Później, to drugie tylko z logiem. |
| Hosting, backupy, monitoring | Po MVP. |
| Inne języki niż polski, inne strefy czasowe niż Europe/Warsaw | Rynek polski. |

## 2. Role i uprawnienia

| Akcja | Administrator | Właściciel | Pracownik |
|---|:-:|:-:|:-:|
| Zakładanie, zawieszanie Salonu, zmiana Adresu wizytówki | ✓ | | |
| Zapraszanie i usuwanie Personelu | | ✓ | |
| Cennik, Godziny otwarcia, Ogłoszenia, galeria, treść Wizytówki | | ✓ | |
| Dodawanie, edycja, odwoływanie, usuwanie Wizyt każdej osobie | | ✓ | ✓ |
| Nieobecności każdej osoby | | ✓ | ✓ |
| Kartoteka Klientów: dodawanie i edycja | | ✓ | ✓ |
| Usunięcie Klienta (żądanie RODO) | | ✓ | |
| Historia zmian Wizyt | | ✓ | |

Administrator nie ma dostępu do kalendarza ani Klientów Salonów.

## 3. Architektura

```
bookit/
├── apps/
│   ├── web/        Angular 20+, SSR tylko dla Wizytówki
│   └── api/        NestJS
├── libs/
│   └── shared/     typy DTO, stałe (zarezerwowane adresy, limity), funkcja świąt
├── prisma/         schema i migracje (seed w apps/api/src/seed)
└── docker-compose.yml   Postgres 16, MinIO, Mailpit
```

- **Monorepo Nx.** Jedna komenda buduje i testuje wszystko, a DTO są wspólne dla frontu i API.
- **Jedna aplikacja Angular, trzy strefy.** `/{adres}` to Wizytówka (`RenderMode.Server`), `/panel/**` to panel Personelu, `/admin/**` to panel Administratora (oba `RenderMode.Client`). Konfiguracja w `app.routes.server.ts`.
- **Komponenty panelu:** Angular Material i Angular CDK. Wizytówka ma własne style bez Material, żeby strona była lekka.
- **Kalendarz piszemy sami** na CSS Grid i `@angular/cdk/drag-drop`. Widok z kolumnami na osoby (`resourceTimeGrid`) w FullCalendar jest w płatnej wersji Premium.
- **Baza:** PostgreSQL z Prisma. Czasy jako `timestamptz` w UTC. Kwoty w groszach jako `int`.
- **Izolacja Salonów** ([ADR 0001](adr/0001-jedna-aplikacja-jedna-baza.md)): `SalonContextGuard` ustala `salonId` z sesji, a rozszerzenie Prisma Client dopisuje `where: { salonId }` do każdego zapytania o model z kolumną `salonId`. Serwisy nie filtrują same.
- **Logowanie:** sesja w ciasteczku `httpOnly`, `SameSite=Lax`, przechowywana w Postgresie. Sesję w bazie da się unieważnić przy usunięciu osoby albo zawieszeniu Salonu, JWT tego nie umożliwia. Hasła przez `argon2`.
- **Pliki:** MinIO (API S3) przez `@aws-sdk/client-s3`. Na hostingu podmieniamy tylko endpoint i klucze. Lokalnie obraz `pgsty/minio` ([ADR 0004](adr/0004-obraz-minio-z-pgsty.md)).
- **E-maile:** `nodemailer` na SMTP. Lokalnie Mailpit z podglądem pod `http://localhost:8025`.
- **Telefony:** `libphonenumber-js`, zapis w E.164, domyślny kraj PL.
- **Testy:** Jest w `api` (jednostkowe i integracyjne na prawdziwym Postgresie z Docker Compose), Vitest lub Jest w `web`, Playwright dla ścieżek end-to-end.

## 4. Model danych

Nazwy tabel po angielsku w kodzie, po polsku w UI. Każda tabela ma `id` (UUID), `createdAt`, `updatedAt`. Kolumna `salonId` oznacza tabelę objętą izolacją.

**Salon**
- `name`, `slug` (Adres wizytówki, unikalny), `status`: `ACTIVE | SUSPENDED`
- `about` (O nas), `street`, `postalCode`, `city`, `phone`, `email`, `mapUrl`
- `accentColor` (hex), `logoPhotoId`, `heroPhotoId`
- `sections` (JSON: które sekcje Wizytówki są włączone)
- `privacyNotice` (treść klauzuli informacyjnej RODO)

**SalonSlugRedirect**: `oldSlug` (unikalny), `salonId`. Stare adresy po zmianie przez Administratora.

**User**: `email` (unikalny), `passwordHash` (null do przyjęcia zaproszenia), `isAdministrator`.

**StaffMember** (`salonId`): osoba z Personelu.
- `userId` (null po usunięciu), `role`: `OWNER | EMPLOYEE`
- `displayName`, `acceptsVisits` (Przyjmuje Wizyty), `showOnPage`, `photoId`, `bio`, `sortOrder`
- `deletedAt`. Po usunięciu zostaje tylko `displayName`. Resztę danych zerujemy.

**Invitation**: `staffMemberId`, `tokenHash`, `expiresAt` (7 dni), `usedAt`.

**PasswordReset**: `userId`, `tokenHash`, `expiresAt` (1 godzina), `usedAt`. Nowy link zastępuje poprzedni, a ustawienie hasła wylogowuje osobę na wszystkich urządzeniach.

**Session**: `sid`, `userId`, `data`, `expiresAt`. Model Prisma zamiast tabeli `connect-pg-simple` ([ADR 0005](adr/0005-sesje-w-tabeli-prisma.md)).

**ServiceCategory** (`salonId`): `name`, `sortOrder`.

**Service** (`salonId`): Usługa.
- `categoryId`, `name`, `description`
- `priceGrosze`, `priceType`: `FIXED | FROM`
- `durationMin`, `breakMin` (domyślna Przerwa po Wizycie, domyślnie 0)
- `sortOrder`, `hidden` (nie pokazuj na Wizytówce), `archivedAt` (zamiast usuwania, bo Wizyty się do niej odwołują)

**OpeningHours** (`salonId`): `weekday` (1–7), `opensAt`, `closesAt` (typ `time`). Brak wiersza oznacza zamknięte. Jeden przedział na dzień.

**Announcement** (`salonId`): Ogłoszenie. `title`, `body`, `photoId`, `showFrom` (data, typ `date`), `showUntil` (data, null = bez końca).

**Photo** (`salonId`): `storageKey`, `width`, `height`, `bytes`.

**GalleryItem** (`salonId`): `photoId`, `sortOrder`. Maksymalnie 30 na Salon.

**Client** (`salonId`): Klient. `name`, `phoneE164` (null), `notes`, `deletedAt`.

**Visit** (`salonId`): Wizyta.
- `staffMemberId`, `clientId`
- `startsAt`, `durationMin`, `breakMin`, `description`
- `state`: `SCHEDULED | CANCELLED | NO_SHOW`
- `createdById`, `updatedById` (StaffMember)

**VisitService**: `visitId`, `serviceId`, `nameSnapshot`, `priceGroszeSnapshot`, `priceTypeSnapshot`. Kopia, bo Cennik się zmienia, a historia Klienta ma pokazywać, co było wtedy.

**Absence** (`salonId`): Nieobecność. `staffMemberId`, `startsAt`, `endsAt`, `reason`.

**VisitChange** (`salonId`): Historia zmian. `visitId` (bez klucza obcego, bo Wizyta mogła zostać usunięta), `staffMemberId`, `at`, `action`: `CREATED | UPDATED | CANCELLED | NO_SHOW | RESTORED | DELETED`, `before` (JSON), `after` (JSON).

## 5. Reguły

### Czas Wizyty

- Przy wyborze Usług formularz podpowiada `durationMin` jako sumę `Service.durationMin`, a `breakMin` jako największą wartość `Service.breakMin`.
- Przyciski szybkich długości: 15, 30, 45, 60, 90, 120 min. Ustawiają `durationMin`.
- Pracownik może wpisać dowolny `durationMin` (5–600, krok 5) i `breakMin` (0–120, krok 5). Ręcznie wpisana wartość nie zmienia się sama po dodaniu kolejnej Usługi. Przycisk "przelicz z Usług" przywraca podpowiedź.
- Wizyta może nie mieć żadnej Usługi. Wtedy `description` jest wymagany.

### Kolizja

- Wizyta zajmuje przedział `[startsAt, startsAt + durationMin + breakMin)`.
- Kolizja to nakładanie się tego przedziału z inną Wizytą w stanie `SCHEDULED` albo z Nieobecnością tej samej osoby.
- `POST` i `PATCH` Wizyty bez `acceptCollisions: true` zwracają `409` z listą kolidujących Wizyt i Nieobecności. Formularz pokazuje je i przycisk "Zapisz mimo to".
- Wizyta poza Godzinami otwarcia i w Święto nie jest Kolizją.

### Stan Wizyty

- `SCHEDULED → CANCELLED`, `SCHEDULED → NO_SHOW`, oraz powrót do `SCHEDULED` (akcja `RESTORED`, na wypadek pomyłki).
- Odwołana Wizyta znika z kalendarza, zostaje w historii Klienta.
- Twarde usunięcie (pomyłka przy wpisywaniu) usuwa Wizytę. W Historii zmian zostaje wpis `DELETED` z pełnym `before`.

### Historia zmian

- Interceptor w `api` zapisuje `VisitChange` przy każdej zmianie Wizyty, w tej samej transakcji.
- Widok dla Właściciela: lista z filtrem po dniu, osobie i Kliencie, oraz historia jednej Wizyty z jej karty.

### Usunięcie osoby z Personelu

1. Właściciel klika "Usuń" przy osobie. Nie może usunąć samego siebie ani ostatniego Właściciela.
2. Dialog pokazuje liczbę jej przeszłych i przyszłych Wizyt i pyta: "Zachować Wizyty?".
3. **Zachowaj:** usuwamy konto `User`, sesje i zaproszenia. Na `StaffMember` ustawiamy `deletedAt`, zerujemy `userId`, `photoId`, `bio`, `showOnPage`. Zostaje `displayName`. Kalendarz pokazuje kolumnę "{imię} (usunięta)" na każdym dniu do dnia jej ostatniej Wizyty `SCHEDULED` włącznie. Wizyty da się edytować i przepisać na inną osobę, ale nowej nie da się jej dodać. Usuniętej osoby nie pokazujemy w formularzu Wizyty.
4. **Nie zachowuj:** jak wyżej, dodatkowo usuwamy wszystkie jej Wizyty, Nieobecności i wpisy `VisitChange` tych Wizyt.

### Klient

- Wymagane tylko `name`. Telefon opcjonalny, normalizowany do E.164. Numer, którego nie da się sparsować, blokuje zapis z komunikatem.
- Po wpisaniu telefonu, który już jest w kartotece Salonu, formularz podpowiada istniejącego Klienta. Zapis nowego Klienta z tym samym numerem jest możliwy po potwierdzeniu.
- Pole "Uwagi" ma stałą podpowiedź: "Nie wpisuj tu informacji o zdrowiu (alergie, choroby, leki)".
- Usunięcie Klienta (tylko Właściciel): ustawiamy `deletedAt`, zerujemy `name` na "Klient usunięty", `phoneE164` i `notes`. Przyszłe Wizyty tego Klienta usuwamy, przeszłe zostają zanonimizowane.

### Godziny otwarcia i Święta

- Godziny otwarcia są tylko na Wizytówce i jako tło w kalendarzu. Godziny poza nimi kalendarz pokazuje na szaro.
- Kalendarz oznacza polskie święta ustawowe. Funkcja `polishHolidays(year)` w `libs/shared` liczy stałe daty i ruchome (Wielkanoc, Poniedziałek Wielkanocny, Zielone Świątki, Boże Ciało) algorytmem Meeusa. Lista stałych świąt uwzględnia Wigilię jako dzień wolny od 2025 r.

### Ogłoszenia

- Wizytówka pokazuje Ogłoszenie, jeśli `showFrom <= dziś` i (`showUntil` jest puste albo `dziś <= showUntil`), gdzie "dziś" liczymy w Europe/Warsaw. Nowsze pierwsze.

### Adres wizytówki

- Regex `^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$`, bez dwóch myślników pod rząd.
- Zarezerwowane: `admin`, `api`, `app`, `panel`, `login`, `logowanie`, `zaproszenie`, `reset-hasla`, `www`, `static`, `assets`, `health`. Lista w `libs/shared`. Każda nowa trasa najwyższego poziomu w `apps/web` musi trafić na tę listę, bo inaczej zasłoni Wizytówkę o tym adresie.
- Zmienia tylko Administrator. Stary adres trafia do `SalonSlugRedirect`, a Wizytówka pod nim odpowiada `301` na nowy.
- Wizytówka zawieszonego Salonu zwraca `404`.

### Zdjęcia

- Limit 10 MB na plik. Akceptowane typy rozpoznajemy po sygnaturze pliku (`file-type`), nie po rozszerzeniu: JPEG, PNG, WebP, HEIC/HEIF.
- HEIC konwertujemy przez `heic-convert` do JPEG, potem `sharp` robi `rotate()` według EXIF, skaluje do maks. 1600 px dłuższego boku, usuwa metadane (w tym GPS) i zapisuje WebP w jakości 80.
- Pole pliku ma `accept="image/*"`, dzięki czemu Safari na iOS przy wyborze z galerii zwykle sam wysyła JPEG.

### Czas

- API przyjmuje i zwraca daty w ISO 8601 z offsetem. Front wyświetla w Europe/Warsaw.
- Testy obejmują dni zmiany czasu (ostatnia niedziela marca i października).

## 6. Ekrany

### Administrator (`/admin`)

- Lista Salonów: nazwa, Adres wizytówki, status, e-mail Właściciela, czy zaproszenie przyjęte.
- Nowy Salon: nazwa, Adres wizytówki (podpowiadany z nazwy, sprawdzany na żywo), e-mail i imię Właściciela.
- Szczegóły Salonu: zmiana Adresu wizytówki, zawieś / odwieś, wyślij zaproszenie ponownie.

### Personel (`/panel`)

- **Kalendarz, widok dnia:** kolumna na każdą osobę, która Przyjmuje Wizyty, siatka co 15 min, domyślnie od 7:00 do 21:00. Wizyta pokazuje godzinę, Klienta i Usługi, Przerwa jest pod nią jako jaśniejszy pasek. Nieobecności są kreskowane, Święto ma etykietę w nagłówku dnia. Kliknięcie w puste pole otwiera formularz z wypełnioną osobą i godziną. Przeciąganie przesuwa Wizytę (także między kolumnami), przeciąganie dolnej krawędzi zmienia długość. Przeciąganie działa od szerokości 768 px.
- **Kalendarz, widok tygodnia:** jedna osoba, siedem kolumn.
- **Kalendarz na telefonie (< 768 px):** dzień jednej osoby, przesunięcie palcem zmienia osobę, przyciski zmieniają dzień. Przycisk "+" otwiera formularz.
- **Formularz Wizyty:** Klient (wyszukiwanie po imieniu i telefonie, "dodaj nowego"), osoba, data i godzina, Usługi (wybór wielokrotny z wyszukiwaniem, pogrupowane po Kategoriach), Czas trwania z przyciskami szybkich długości, Przerwa, opis. Przy Kolizji lista kolidujących wpisów i "Zapisz mimo to". Na telefonie formularz zajmuje cały ekran.
- **Karta Wizyty:** szczegóły, edycja, odwołaj, oznacz "nie przyszedł", usuń, a dla Właściciela historia zmian.
- **Nieobecność:** osoba, od, do (także cały dzień i kilka dni), powód.
- **Klienci:** lista z wyszukiwaniem, karta Klienta z danymi, uwagami i historią Wizyt (także odwołanych i nieodbytych).

### Tylko Właściciel (`/panel/ustawienia`)

- **Personel:** lista, zaproś (imię, e-mail, rola), przełączniki Przyjmuje Wizyty i pokazuj na Wizytówce, zdjęcie, opis, kolejność, usuń.
- **Cennik:** Kategorie Usług i Usługi z przeciąganiem kolejności, archiwizacja Usługi.
- **Godziny otwarcia:** siedem wierszy, przełącznik zamknięte / otwarte, godziny od–do.
- **Wizytówka:** dane kontaktowe, O nas, link do mapy, kolor, logo, zdjęcie nagłówka, włączanie sekcji, klauzula RODO (z gotowym szablonem do uzupełnienia), podgląd.
- **Galeria:** upload wielu plików, kolejność, usuwanie.
- **Ogłoszenia:** lista aktywnych, zaplanowanych i minionych, formularz.
- **Historia zmian:** lista z filtrami.

### Wizytówka (`/{adres}`)

Sekcje w kolejności: nagłówek (logo, nazwa, zdjęcie, przycisk "Zadzwoń" jako `tel:`), Ogłoszenia, O nas, Cennik (Kategorie, Usługa z nazwą, opisem, Ceną i czasem), Zespół, Galeria, Godziny otwarcia (z wyróżnieniem dzisiejszego dnia), Kontakt z adresem i linkiem do mapy. W stopce klauzula informacyjna RODO jako rozwijany tekst lub osobna podstrona `/{adres}/prywatnosc`.

SEO: `<title>`, `meta description` z O nas, Open Graph ze zdjęciem nagłówka, JSON-LD `HairSalon` / `NailSalon` / `BeautySalon` z adresem, telefonem i `openingHoursSpecification`.

## 7. API (szkic)

Wszystkie ścieżki panelu działają w kontekście Salonu z sesji. Nie ma `salonId` w URL.

```
POST   /auth/login | /auth/logout | /auth/password-reset | /auth/password-reset/confirm | /auth/accept-invitation
GET    /auth/me

GET    /admin/salons            POST /admin/salons
PATCH  /admin/salons/:id        POST /admin/salons/:id/suspend | /resume | /resend-invitation

GET    /staff                   POST /staff/invite
PATCH  /staff/:id               DELETE /staff/:id?keepVisits=true|false

GET    /service-categories      POST | PATCH /:id | DELETE /:id | PUT /order
GET    /services                POST | PATCH /:id | POST /:id/archive
PUT    /opening-hours
GET    /announcements           POST | PATCH /:id | DELETE /:id
POST   /photos                  DELETE /photos/:id
GET    /gallery                 PUT /gallery (kolejność)
GET    /salon/page              PATCH /salon/page

GET    /clients?q=              POST | PATCH /:id | DELETE /:id
GET    /clients/:id/visits

GET    /calendar?from=&to=      Wizyty, Nieobecności, Święta, Godziny otwarcia, osoby
POST   /visits                  PATCH /visits/:id   DELETE /visits/:id
POST   /visits/:id/cancel | /no-show | /restore
GET    /visits/:id/changes      GET /visit-changes?day=&staffId=&clientId=
POST   /absences                PATCH | DELETE /absences/:id

GET    /public/pages/:slug      dane Wizytówki (bez autoryzacji)
```

## 8. Zadania

Każde zadanie to jedno issue. Etykiety: `etap-N`, `api`, `web`, `infra`. "Zależy od" wpisuj w issue jako listę `#numer`.

### Etap 0. Fundament

**T01. Workspace Nx z aplikacjami `web` i `api`** `infra`
Utworzyć workspace Nx z `apps/web` (Angular, SSR włączone), `apps/api` (NestJS) i `libs/shared`. Skonfigurować ESLint i Prettier.
- [ ] `npx nx run-many -t lint test build` przechodzi na czystym repo
- [ ] `apps/web` importuje stałą z `libs/shared`, `apps/api` też

**T02. Docker Compose ze środowiskiem lokalnym** `infra` · zależy od T01
Postgres 16, MinIO (z bucketem tworzonym przy starcie), Mailpit. Plik `.env.example` z wszystkimi zmiennymi.
- [ ] `docker compose up -d` uruchamia trzy usługi, a `api` łączy się z każdą
- [ ] README opisuje uruchomienie od zera

**T03. Prisma: schemat, migracje, pusty seed** `api` · zależy od T02
Schemat z sekcji 4, pierwsza migracja, skrypt `nx run api:seed` (na razie tworzy tylko Administratora z `.env`).
- [ ] `prisma migrate dev` na pustej bazie przechodzi
- [ ] seed jest idempotentny: drugie uruchomienie niczego nie dubluje

**T04. CI na GitHub Actions** `infra` · zależy od T01
Lint, testy i build na każdym PR. Postgres jako service container do testów integracyjnych.
- [ ] PR z błędem lintu ma czerwony status

**T05. Izolacja Salonów** `api` · zależy od T03
`SalonContextGuard` i rozszerzenie Prisma Client dopisujące `salonId` do zapytań (ADR 0001). Dekorator `@AdminScope()` dla ścieżek Administratora.
- [ ] test integracyjny: Personel Salonu A dostaje `404` na każdy zasób Salonu B (Wizyta, Klient, Usługa, Zdjęcie)
- [ ] test: `create` bez jawnego `salonId` dostaje `salonId` z kontekstu
- [ ] test: zapytanie poza kontekstem Salonu i bez `@AdminScope()` rzuca wyjątek

### Etap 1. Konta i logowanie

**T06. Sesje i logowanie** `api` · zależy od T03
Sesja w Postgresie, ciasteczko `httpOnly`, `argon2`, `/auth/login`, `/auth/logout`, `/auth/me`. Limit prób logowania: 10 na 15 min na e-mail.
- [ ] zła para e-mail/hasło zwraca `401` bez informacji, co jest złe
- [ ] zawieszenie Salonu i usunięcie osoby unieważnia jej sesje

**T07. Zaproszenia i ustawienie hasła** `api` · zależy od T06
Token 32 bajty, w bazie tylko hash, ważny 7 dni, jednorazowy. E-mail przez `nodemailer`. Szablon e-maila po polsku.
- [ ] e-mail z linkiem widać w Mailpit
- [ ] użyty albo przeterminowany token zwraca `410`

**T08. Reset hasła** `api` · zależy od T07
- [ ] odpowiedź jest taka sama dla istniejącego i nieistniejącego e-maila

**T09. Guardy ról** `api` · zależy od T06
Dekoratory `@Roles('OWNER')`, `@AdminOnly()`. Tabela z sekcji 2 jako test.
- [ ] test na każdy wiersz tabeli uprawnień

**T10. Ekrany logowania, zaproszenia i resetu hasła** `web` · zależy od T06, T07, T08
Oraz layout panelu: menu boczne na komputerze, dolna nawigacja na telefonie.
- [ ] Playwright: przyjęcie zaproszenia, logowanie, wylogowanie

### Etap 2. Administrator

**T11. Zakładanie Salonu** `api` `web` · zależy od T07, T09
Formularz, walidacja Adresu wizytówki (regex, zarezerwowane, unikalność, sprawdzanie na żywo), zaproszenie Właściciela.
- [ ] Playwright: Administrator zakłada Salon, Właściciel przyjmuje zaproszenie i widzi pusty panel

**T12. Lista i szczegóły Salonów, zawieszanie** `api` `web` · zależy od T11
- [ ] zawieszony Salon: Personel nie loguje się, Wizytówka zwraca `404`

**T13. Zmiana Adresu wizytówki z przekierowaniem** `api` `web` · zależy od T11, T34
- [ ] stary adres zwraca `301` na nowy
- [ ] nowy Salon nie może dostać adresu, który jest w `SalonSlugRedirect`

### Etap 3. Personel

**T14. Lista Personelu i zapraszanie** `api` `web` · zależy od T07, T09
Przełączniki Przyjmuje Wizyty i pokazuj na Wizytówce, zdjęcie (po T19), opis, kolejność.
- [ ] Właściciel zaprasza Pracownika, Pracownik po zalogowaniu nie widzi ustawień

**T15. Usuwanie osoby z Personelu** `api` `web` · zależy od T14, T24
Reguła z sekcji 5.
- [ ] nie da się usunąć ostatniego Właściciela ani siebie
- [ ] "zachowaj": kolumna jest w kalendarzu do dnia ostatniej Wizyty i znika dzień później
- [ ] "zachowaj": nowej Wizyty nie da się jej przypisać (API zwraca `422`)
- [ ] "nie zachowuj": Wizyty, Nieobecności i ich Historia zmian znikają

### Etap 4. Cennik i treść Salonu

**T16. Kategorie Usług** `api` `web` · zależy od T09
CRUD i kolejność przeciąganiem. Usunięcie Kategorii z Usługami jest zablokowane.

**T17. Usługi** `api` `web` · zależy od T16
Nazwa, opis, Cena (stała lub "od"), czas, domyślna Przerwa, ukryta, archiwizacja.
- [ ] zarchiwizowana Usługa nie pojawia się w formularzu Wizyty ani na Wizytówce, a stare Wizyty ją pokazują

**T18. Godziny otwarcia** `api` `web` · zależy od T09
- [ ] `closesAt` musi być po `opensAt`

**T19. Upload zdjęć** `api` · zależy od T02, T05
Reguły z sekcji 5. Endpoint zwraca `Photo`. Serwowanie przez `api` albo presigned URL z MinIO.
- [ ] test z plikiem HEIC z iPhone'a, JPEG obróconym w EXIF i PNG
- [ ] plik 11 MB zwraca `413`, plik `.jpg`, który jest PDF-em, zwraca `415`
- [ ] wynikowy WebP nie ma metadanych GPS

**T20. Treść Wizytówki** `api` `web` · zależy od T19
Dane kontaktowe, O nas, link do mapy, kolor, logo, zdjęcie nagłówka, sekcje, klauzula RODO z szablonem.

**T21. Galeria** `api` `web` · zależy od T19
- [ ] 31. zdjęcie zwraca błąd z komunikatem o limicie

**T22. Ogłoszenia** `api` `web` · zależy od T19
- [ ] lista w panelu dzieli Ogłoszenia na aktywne, zaplanowane i minione

### Etap 5. Kalendarz

**T23. Kartoteka Klientów** `api` `web` · zależy od T05
Wyszukiwanie po imieniu (bez polskich znaków też: "Łucja" po "lucja") i telefonie, normalizacja E.164, podpowiedź duplikatu, podpowiedź przy Uwagach, usunięcie przez Właściciela.
- [ ] "600 100 200", "+48600100200" i "0048 600-100-200" zapisują się jako ten sam numer
- [ ] usunięcie Klienta anonimizuje przeszłe Wizyty i usuwa przyszłe

**T24. API Wizyt** `api` · zależy od T17, T23
Create, update, cancel, no-show, restore, delete. Snapshot Usług. Kolizje z `409`.
- [ ] testy jednostkowe wykrywania Kolizji: styk końca i początku to nie Kolizja, Przerwa się liczy, odwołana Wizyta się nie liczy, Nieobecność się liczy
- [ ] Wizyta bez Usług i bez opisu zwraca `422`

**T25. Historia zmian Wizyt** `api` `web` · zależy od T24
Interceptor, widok listy i historia w karcie Wizyty, tylko dla Właściciela.
- [ ] każda akcja z T24 tworzy dokładnie jeden wpis w tej samej transakcji
- [ ] Pracownik dostaje `403`

**T26. Nieobecności** `api` · zależy od T05
- [ ] Nieobecność przez kilka dni i przez zmianę czasu ma poprawne granice

**T27. Polskie święta** `shared` · zależy od T01
`polishHolidays(year)` z testami dla lat 2025–2030 porównanymi z kalendarzem.

**T28. Endpoint kalendarza** `api` · zależy od T24, T26, T27
`GET /calendar?from=&to=` zwraca wszystko do narysowania zakresu, także kolumny usuniętych osób z Wizytami w zakresie.

**T29. Widok dnia** `web` · zależy od T28
Siatka, kolumny, Wizyty, Przerwy, Nieobecności, szare tło poza Godzinami otwarcia, Święto, wskaźnik bieżącej godziny, nawigacja po dniach.

**T30. Formularz Wizyty** `web` · zależy od T29
Reguły czasu z sekcji 5, wyszukiwanie Klienta, dodanie nowego w miejscu, obsługa `409`.
- [ ] Playwright: dodanie Wizyty z dwiema Usługami, ręczna zmiana czasu na 40 min, zapis mimo Kolizji

**T31. Przeciąganie i zmiana długości** `web` · zależy od T29, T30
CDK drag-drop, przyciąganie do 15 min, przeniesienie do innej kolumny, `409` pokazuje dialog Kolizji.

**T32. Widok tygodnia i widok na telefon** `web` · zależy od T29
- [ ] Playwright na viewporcie 390×844: zmiana osoby przesunięciem, dodanie Wizyty przyciskiem "+"

**T33. Karta Klienta z historią Wizyt** `web` · zależy od T23, T24

### Etap 6. Wizytówka

**T34. Rozpoznawanie Salonu i endpoint publiczny** `api` · zależy od T05
Funkcja `(host, ścieżka) -> Salon` z ADR 0002, `GET /public/pages/:slug` z Cennikiem, aktywnymi Ogłoszeniami, osobami z `showOnPage`, galerią i Godzinami otwarcia.
- [ ] odpowiedź nie zawiera e-maili Personelu, Klientów ani ukrytych Usług

**T35. Wizytówka SSR** `web` · zależy od T34, T20, T21, T22
Sekcje z sekcji 6, kolor przewodni jako zmienna CSS, SEO i JSON-LD.
- [ ] `curl http://localhost:4000/studio-kora` zwraca HTML z nazwą Salonu i Cennikiem
- [ ] Lighthouse na telefonie: Performance ≥ 90, Accessibility ≥ 90

**T36. Klauzula RODO na Wizytówce** `web` · zależy od T35

### Etap 7. Pilot

**T37. Seed Studio Kora** `api` · zależy od T17, T24, T22
Dane z sekcji 9, Wizyty na bieżący i następny tydzień, jedna Kolizja, jedna Nieobecność, jedno zdjęcie HEIC.

**T38. Scenariusze end-to-end pilota** `web` · zależy od T37
Playwright: pełny dzień recepcji (dodaj, przesuń, odwołaj, nie przyszedł), Właściciel zmienia Cenę i widzi ją na Wizytówce, usunięcie Pracownika z zachowaniem Wizyt.

## 9. Studio Kora (dane do seeda)

- Adres wizytówki: `studio-kora`, ul. Długa 12, 31-147 Kraków, tel. +48 600 100 200.
- Godziny otwarcia: pn–pt 9:00–19:00, sob 9:00–15:00, nd zamknięte.
- Personel:
  - Magda, Właścicielka, fryzjerka, Przyjmuje Wizyty.
  - Kasia, fryzjerka.
  - Ola, stylistka paznokci.
  - Natalia, kosmetyczka (twarz i brwi).
- Kategorie i przykładowe Usługi (cena, czas, Przerwa):
  - Strzyżenie: damskie od 90 zł, 45 min, 10 min. Męskie 60 zł, 30 min, 5 min. Dziecięce 45 zł, 30 min, 5 min. Grzywka 20 zł, 10 min.
  - Koloryzacja: jeden kolor od 180 zł, 90 min, 15 min. Balayage od 350 zł, 180 min, 15 min. Tonowanie 120 zł, 45 min, 10 min. Odrost od 150 zł, 75 min, 15 min.
  - Paznokcie: manicure hybrydowy 120 zł, 75 min, 10 min. Zdjęcie hybrydy 40 zł, 20 min, 5 min. Pedicure hybrydowy 150 zł, 90 min, 15 min. Przedłużanie żelem od 200 zł, 120 min, 10 min.
  - Twarz i brwi: oczyszczanie wodorowe 180 zł, 60 min, 15 min. Henna brwi 50 zł, 20 min, 5 min. Laminacja brwi 120 zł, 45 min, 10 min. Regulacja brwi 30 zł, 15 min.
- Ogłoszenie: "Nowość: laminacja brwi. Do końca miesiąca -20%", od dziś do końca miesiąca.
- Klienci: 30 losowych osób z polskimi imionami, 5 bez telefonu, jedna para z tym samym numerem.

## 10. Do potwierdzenia przy realizacji

Rzeczy, które ustaliłem sam przy pisaniu tego dokumentu, bez twojej decyzji. Każdą łatwo zmienić.

- Usunięcie Klienta anonimizuje jego przeszłe Wizyty i usuwa przyszłe.
- Jeden przedział Godzin otwarcia na dzień (bez przerwy obiadowej).
- Siatka kalendarza co 15 min, zakres 7:00–21:00.
- Angular Material w panelu, własny kalendarz zamiast FullCalendar.
- Sesje w bazie zamiast JWT.
