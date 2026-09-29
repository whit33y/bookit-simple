# MinIO lokalnie z obrazów `pgsty/minio` i `pgsty/mc`

Lokalne środowisko (`docker-compose.yml`) uruchamia MinIO z obrazów `pgsty/minio` i `pgsty/mc`, z przypiętym tagiem `RELEASE.*`. Oficjalne obrazy `minio/minio` i `minio/mc` nie są już publikowane: Docker Hub odpowiada "repository does not exist", a `quay.io/minio/*` zwraca 401. Wynika to z przejścia MinIO Community Edition na dystrybucję tylko w kodzie źródłowym.

`pgsty/minio` to budowany przez społeczność (Pigsty) obraz z tego samego kodu MinIO (AGPLv3). Ma te same porty (9000 API, 9001 konsola), zmienne `MINIO_ROOT_*` i narzędzie `mc` w środku, więc to podmiana jednej linii. Rozważaliśmy też `cgr.dev/chainguard/minio` (za darmo tylko tag `latest`, obraz bez powłoki) i RustFS (inna implementacja S3, inna konsola). Wybraliśmy `pgsty`, bo zachowuje się jak dotychczasowy MinIO i pozwala przypiąć wersję.

## Consequences

- Aplikacja rozmawia z plikami wyłącznie przez API S3 (`@aws-sdk/client-s3`), więc obraz dotyczy tylko środowiska lokalnego. Na hostingu podmieniamy endpoint i klucze, jak w docs/mvp.md.
- Tag podbijamy ręcznie. Gdyby `pgsty` przestał publikować obrazy, najbliższą podmianą jest inny serwer zgodny z S3 (np. RustFS), bez zmian w kodzie `api`.
