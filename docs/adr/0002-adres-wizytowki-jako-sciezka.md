# Wizytówka pod ścieżką, subdomena i własna domena później

Na start Wizytówka jest pod `twojadomena.pl/{adres-wizytowki}`. Ta opcja nie wymaga wildcard DNS ani certyfikatów dla każdego Salonu, więc działa na jednym zwykłym certyfikacie.

Od pierwszego dnia backend rozpoznaje Salon jedną funkcją `(host, ścieżka) -> Salon`. Dzisiaj patrzy tylko na ścieżkę. Dodanie subdomeny albo własnej domeny to rozszerzenie tej funkcji, bez zmian w reszcie aplikacji.

Adres wizytówki: małe litery, cyfry i myślniki, 3–40 znaków, unikalny w całej platformie. Zarezerwowane nazwy, których Salon nie może dostać: `admin`, `api`, `app`, `panel`, `login`, `www`, `static`, `assets`.

## Considered Options

### Subdomena: `studio-anna.twojadomena.pl`

Co trzeba zrobić, żeby przejść:

1. W DNS dodać rekord wildcard `*.twojadomena.pl` wskazujący na serwer.
2. Wystawić certyfikat wildcard `*.twojadomena.pl`. Let's Encrypt wystawia wildcard tylko przez wyzwanie DNS-01, więc reverse proxy (Caddy albo Traefik) potrzebuje tokenu API do dostawcy DNS, np. Cloudflare.
3. Rozszerzyć funkcję rozpoznawania Salonu: jeśli host kończy się na `.twojadomena.pl` i nie jest na liście zarezerwowanych nazw, pierwsza część hosta to Adres wizytówki.
4. Stare adresy ze ścieżką przekierować 301 na subdomenę, żeby nie zgubić linków wydrukowanych na ulotkach i pozycji w Google.
5. Ciasteczka sesji panelu ustawić na domenie panelu, nie na `.twojadomena.pl`, żeby Wizytówki nie dostawały ciasteczek Personelu.

Koszt: jednorazowa konfiguracja DNS i proxy, potem zero pracy na każdy nowy Salon.

### Własna domena Salonu: `studioanna.pl`

Co trzeba zrobić:

1. Dodać tabelę domen: `salon_id`, `domena`, `status` (oczekuje / zweryfikowana), `token_weryfikacji`.
2. Właściciel wpisuje domenę w panelu. Aplikacja pokazuje mu dwa rekordy do dodania u jego rejestratora:
   - `CNAME www.studioanna.pl -> salony.twojadomena.pl`
   - `TXT _bookit.studioanna.pl -> {token_weryfikacji}`, który potwierdza, że domena należy do niego.
3. Domena główna bez `www` nie może mieć rekordu CNAME. Właściciel ustawia tam rekord A na IP serwera albo przekierowanie u rejestratora na `www`. Instrukcję w panelu trzeba napisać pod to, bo tu salony utkną najczęściej.
4. Certyfikaty wystawiać na żądanie. Caddy ma `on_demand_tls` z opcją `ask`, która przed wystawieniem certyfikatu pyta backend, czy domena jest zweryfikowana. Bez tego ktokolwiek mógłby skierować dowolną domenę na serwer i zużywać limity Let's Encrypt. Alternatywa bez własnego proxy: Cloudflare for SaaS (Custom Hostnames), płatne od pewnej liczby domen.
5. Funkcja rozpoznawania Salonu sprawdza najpierw tabelę domen, potem subdomenę, potem ścieżkę.

Koszt: jednorazowo tabela, ekran w panelu i konfiguracja proxy. Potem każdy Salon z własną domeną to wsparcie przy DNS, więc to dobry kandydat na płatny dodatek.
