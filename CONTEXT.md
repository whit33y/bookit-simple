# Bookit

Platforma dla małych i średnich salonów beauty. Każdy salon dostaje publiczną wizytówkę dla klientów i wewnętrzny kalendarz wizyt, który zastępuje papierowy zeszyt na recepcji.

## Language

### Platforma i role

**Salon**:
Jeden biznes korzystający z platformy, z jednym adresem, własnym personelem, cennikiem i wizytówką.
_Avoid_: tenant, instancja, firma, konto

**Administrator**:
Operator całej platformy, który zakłada Salony i ma dostęp do wszystkich.
_Avoid_: superadmin, admin salonu

**Właściciel**:
Osoba zarządzająca jednym Salonem: personelem, cennikiem, treścią wizytówki i kalendarzem.
_Avoid_: manager, admin, kierownik

**Pracownik**:
Osoba z personelu Salonu, która przyjmuje Wizyty i prowadzi kalendarz, ale nie zarządza ustawieniami Salonu.
_Avoid_: stylista, specjalista, user

**Personel**:
Właściciel i Pracownicy jednego Salonu razem, czyli wszyscy, którzy logują się do panelu tego Salonu.
_Avoid_: zespół, staff

**Usunięta osoba z Personelu**:
Była osoba z Personelu, która nie ma już konta ani danych w Salonie. Zostaje tylko jej imię na Wizytach, które Właściciel zdecydował się zachować, a jej kolumna jest w kalendarzu do dnia jej ostatniej Wizyty.
_Avoid_: zwolniony, nieaktywny, zarchiwizowany

**Zaproszenie**:
E-mail z jednorazowym linkiem do ustawienia hasła, ważnym 7 dni, który dostaje nowa osoba z Personelu. Na liście Personelu ma stan: Oczekuje (link jest ważny), Wygasło (trzeba wysłać nowe) albo Przyjęte (osoba ustawiła hasło). Jeden e-mail to jedno konto w jednym Salonie.
_Avoid_: invite, aktywacja

**Przyjmuje Wizyty**:
Cecha osoby z Personelu: ma własną kolumnę w kalendarzu i można jej wpisać Wizytę. Domyślnie ma ją każdy, także Właściciel.
_Avoid_: aktywny, dostępny

### Wizytówka

**Wizytówka**:
Publiczna strona Salonu dla Klientów, z cennikiem, godzinami otwarcia, ogłoszeniami i kontaktem. Nie pokazuje kalendarza.
_Avoid_: strona salonu, landing, profil

**Układ Wizytówki**:
Wybrany przez Właściciela sposób prezentacji góry Wizytówki: Klasyczny, Zdjęcie obok danych albo Kompaktowy. Nie zmienia wyglądu sekcji poniżej ani ich kolejności.
_Avoid_: szablon strony, motyw

**Kolejność sekcji Wizytówki**:
Ustawiona przez Właściciela kolejność sekcji poniżej nagłówka Wizytówki. Jest niezależna od Układu Wizytówki; wyłączone i puste sekcje zachowują swoje miejsca, a nagłówek i stopka mają stałe miejsca.
_Avoid_: kolejność bloków

**Ogłoszenie**:
Krótka informacja na Wizytówce (promocja, zamknięcie, nowość), pokazywana tylko między datą "od" i "do".
_Avoid_: aktualność, post, news

**Galeria**:
Do 30 zdjęć Salonu na Wizytówce, w kolejności ustawionej przez Właściciela. Zdjęcie usunięte z Galerii jest usuwane na dobre, razem z plikiem.
_Avoid_: album, portfolio, zdjęcia prac

**Zdjęcie profilowe**:
Kwadratowe zdjęcie osoby z Personelu, które Właściciel wgrywa i kadruje. Wizytówka pokazuje je w kółku w sekcji Zespół, a osoba bez Zdjęcia profilowego ma tam kółko z pierwszą literą imienia. Nowe zdjęcie, usunięcie zdjęcia albo usunięcie osoby z Personelu usuwa stary plik na dobre.
_Avoid_: avatar, zdjęcie (bez dopowiedzenia), fotka

**Adres wizytówki**:
Krótka nazwa Salonu w adresie URL, pod którą Klient znajduje Wizytówkę, np. `studio-anna`.
_Avoid_: slug (w rozmowie z Właścicielem), link

### Kalendarz

**Wizyta**:
Zarezerwowany czas u jednej osoby z Personelu dla jednego Klienta, z zero lub więcej Usługami i opcjonalnym opisem. Wpisuje ją wyłącznie Personel.
_Avoid_: rezerwacja, termin, booking, spotkanie

**Czas trwania Wizyty**:
Czas pracy przy Kliencie. Podpowiada go suma domyślnych czasów Usług albo gotowa długość, ale Pracownik zawsze może wpisać własny.
_Avoid_: długość, slot

**Przerwa po Wizycie**:
Czas po Wizycie, w którym Pracownik sprząta lub przygotowuje stanowisko. Zajmuje kalendarz Pracownika, ale Klient w nim nie uczestniczy. Domyślnie to najdłuższa domyślna Przerwa spośród Usług Wizyty.
_Avoid_: bufor, sprzątanie, zapas

**Stan Wizyty**:
Zaplanowana, Odwołana (Klient odwołał, Wizyta zostaje w historii) albo Nieodbyta (Klient nie przyszedł). Zaplanowana Wizyta z przeszłości to Wizyta, która się odbyła. Na karcie Klienta ma stan "Odbyta".
_Avoid_: status, anulowana, no-show

**Historia zmian**:
Zapis, kto i kiedy utworzył, zmienił, odwołał lub usunął Wizytę, z wartościami przed i po. Widzi ją tylko Właściciel.
_Avoid_: log, audyt

**Kolizja**:
Sytuacja, w której Wizyta lub jej Przerwa nachodzi na inną Wizytę albo Nieobecność tego samego Pracownika. System ostrzega, ale pozwala zapisać.
_Avoid_: konflikt, overbooking

**Nieobecność**:
Zablokowany czas w kalendarzu Pracownika, w którym nie przyjmuje Wizyt (urlop, L4, sprawy prywatne).
_Avoid_: urlop, blokada, wolne

**Godziny otwarcia**:
Tygodniowy plan, kiedy Salon jest otwarty, pokazywany na Wizytówce. Nie ma wyjątków na konkretne dni i nie ogranicza Wizyt: Pracownik może wpisać Wizytę poza nimi.
_Avoid_: grafik, godziny pracy

**Święto**:
Polskie święto ustawowe, które kalendarz oznacza na danym dniu. Nie blokuje Wizyt i nie zmienia Godzin otwarcia.
_Avoid_: dzień wolny, wyjątek

**Kategoria Usług**:
Grupa Usług w Cenniku, np. "Strzyżenie" albo "Paznokcie".
_Avoid_: dział, sekcja

**Usługa**:
Pozycja z Cennika Salonu, z nazwą, opisem, ceną, domyślnym czasem trwania i opcjonalną domyślną Przerwą po Wizycie. Nazwa jest unikalna w Kategorii (bez względu na wielkość liter) wśród Usług, które nie są zarchiwizowane. Ukryta Usługa nie jest na Wizytówce, ale Personel nadal wybiera ją przy Wizycie.
_Avoid_: zabieg, pozycja cennika, oferta

**Zarchiwizowana Usługa**:
Usługa zdjęta z Cennika: nie ma jej na Wizytówce ani w wyborze Usług przy Wizycie, ale Wizyty, które już ją mają, nadal ją pokazują. Usługi się nie usuwa, tylko archiwizuje. Przywrócona wraca na koniec swojej Kategorii.
_Avoid_: usunięta, nieaktywna

**Cena**:
Kwota Usługi podana jako stała ("80 zł") albo minimalna ("od 80 zł"). Od czego zależy cena, Właściciel opisuje w opisie Usługi.
_Avoid_: koszt, stawka

**Cennik**:
Lista Usług Salonu pokazywana na Wizytówce.
_Avoid_: oferta, menu

**Klient**:
Osoba umawiająca się na Wizytę w Salonie, zapisana w kartotece tego Salonu z imieniem i opcjonalnym telefonem. Nie loguje się do platformy. Ta sama osoba w dwóch Salonach to dwóch różnych Klientów. Kartoteka nie przechowuje informacji o zdrowiu Klienta.
_Avoid_: klientka, użytkownik, gość

**Usunięty Klient**:
Klient usunięty przez Właściciela na swoje żądanie (RODO). Nie ma już imienia, telefonu ani uwag, a jego przeszłe Wizyty pokazują "Klient usunięty". Zaplanowane Wizyty od chwili usunięcia znikają, odwołane i nieodbyte zostają w historii. Nie ma go w wyszukiwaniu ani w kartotece, a Historia zmian też pokazuje "Klient usunięty".
_Avoid_: zanonimizowany, archiwalny, nieaktywny
