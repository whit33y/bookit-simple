# Organizacja komponentów aplikacji web

Grupujemy kod aplikacji web według obszarów. Personel, Cennik, Godziny otwarcia, Ogłoszenia, Galeria, ustawienia Wizytówki i Historia zmian mają osobne podfoldery w `apps/web/src/app/settings`. Zachowujemy ich miejsce pod `settings`, żeby struktura katalogów odpowiadała nawigacji ustawień.

Każdy komponent ma własny folder, również gdy zawiera tylko plik TypeScript i test. Testy, szablon HTML i style SCSS komponentu pozostają razem z nim. Serwisy i funkcje należące do obszaru pozostają w tym obszarze; nie tworzymy wspólnych katalogów dla wszystkich komponentów lub serwisów aplikacji.

Kod używany przez kilka obszarów zachowuje swojego właściciela. Wyszukiwarka Klientów pozostaje w `clients`, choć korzysta z niej Kalendarz. Do `app/shared` trafiają elementy bez własnego obszaru, np. komunikat błędu i narzędzia do przesyłania oraz kadrowania zdjęć. Użycie w dwóch miejscach samo w sobie nie uzasadnia przeniesienia do `shared`.

Pierwsze porządki obejmują przeniesienie plików i aktualizację odwołań. Podział dużych komponentów na mniejsze wymaga osobnych decyzji.

## Granice i układ katalogów

Porządkujemy katalogi wewnątrz istniejącego projektu Nx `web`. Nie wydzielamy nowych bibliotek Nx. Obecna reguła `@nx/enforce-module-boundaries` kontroluje zależności między projektami, więc nie wymusza opisanego tu podziału wewnątrz `web`. `app/shared` zawiera wspólny kod frontendu i pozostaje odrębny od projektu `libs/shared`.

W `calendar` foldery komponentów leżą bezpośrednio pod obszarem. Nie dodajemy teraz podziału na `visits`, `absences` i `day-view`. W `settings` najpierw wybieramy podobszar, a w nim folder komponentu:

```text
app/
  calendar/
    calendar-page/
    visit-dialog/
    absence-dialog/
    calendar-day-grid/
    visits.service.ts
    visits.service.spec.ts
  settings/
    settings-layout/
    staff/
      staff-page/
      edit-staff-dialog/
      delete-staff-dialog/
      staff.service.ts
      staff.service.spec.ts
    pricing/
    opening-hours/
    announcements/
    gallery/
    page-settings/
    visit-history/
```

Zachowujemy obecne nazwy plików i klas, adresy stron oraz zachowanie aplikacji. Pliki zawierające kilka komponentów rozdzielamy, żeby każdy komponent miał własny folder; nie zmieniamy ich odpowiedzialności ani logiki. Wspólne style formularzy logowania pozostają w obszarze `auth`.

Po przeniesieniu plików uruchamiamy istniejące sprawdzenia `web:lint`, `web:test` i `web:build`.

Zakres wdrożenia i kryteria akceptacji opisuje [issue #93](https://github.com/whit33y/bookit-simple/issues/93).
