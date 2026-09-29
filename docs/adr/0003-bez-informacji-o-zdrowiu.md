# Kartoteka Klienta nie przechowuje informacji o zdrowiu

Kartoteka Klienta nie ma pola na alergie, przeciwwskazania ani choroby, a pole "Uwagi" pokazuje podpowiedź, żeby nie wpisywać tam informacji o zdrowiu. Klient sam przypomina o uczuleniu przed zabiegiem.

Informacje o zdrowiu to szczególna kategoria danych (art. 9 RODO). Ich zapis wymaga wyraźnej zgody Klienta, a platforma jako podmiot przetwarzający musiałaby ją obsłużyć: zapisać, kto i kiedy ją odebrał, i usuwać dane po jej wycofaniu. Rozważaliśmy osobne pole "Przeciwwskazania" odblokowane zgodą. Odrzuciliśmy je, żeby w MVP nie przetwarzać danych art. 9 wcale.

## Consequences

- Nie dodawaj pola "alergie" do Klienta bez wrócenia do tej decyzji. Wymaga to mechanizmu zgody i aktualizacji umowy powierzenia z Salonami.
