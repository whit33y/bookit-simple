# Jedna aplikacja i jedna baza dla wszystkich Salonów

Wszystkie Salony działają w jednym deploymencie i jednej bazie. Każdy wiersz danych należący do Salonu ma kolumnę `salon_id`, a backend filtruje po niej każde zapytanie. Administrator zakłada nowy Salon formularzem w panelu, bez stawiania serwera ani uruchamiania migracji.

Osobny deployment na Salon dawałby pełną izolację danych, ale każdy nowy klient oznaczałby nowy serwer, a każda aktualizacja N migracji. Przy małych salonach nie ma wymagań prawnych ani wydajnościowych, które by to uzasadniały.

## Consequences

- Wyciek danych między Salonami to najgroźniejszy błąd w tym systemie. Filtrowanie po `salon_id` musi siedzieć w jednym miejscu (guard/interceptor w NestJS albo Row Level Security w Postgresie), nie w każdym serwisie osobno. Testy integracyjne sprawdzają, że Personel Salonu A nie odczyta niczego z Salonu B.
- Administrator ma osobną ścieżkę dostępu, która omija filtr `salon_id`.
