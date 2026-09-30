/**
 * One Photo from `POST /api/photos` (`201`, multipart field `file`). `url` serves the WebP
 * without a login, so it can go straight into `<img src>` on the Wizytówka.
 */
export interface PhotoView {
  id: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
}

/** Largest upload `POST /api/photos` accepts; the web checks it before sending. */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** `413` for a file over `PHOTO_MAX_BYTES`. */
export const PHOTO_TOO_LARGE = 'Zdjęcie może mieć najwyżej 10 MB';
/** `415` for a file that is not a JPEG, PNG, WebP or HEIC, whatever its extension says. */
export const PHOTO_UNSUPPORTED_TYPE =
  'Obsługujemy tylko zdjęcia JPEG, PNG, WebP i HEIC';
/** `400` for a request without the `file` field. */
export const PHOTO_FILE_REQUIRED = 'Wybierz zdjęcie';

/** Public address of a Photo, also for Photos referenced by other views. */
export const photoUrl = (id: string) => `/api/public/photos/${id}`;
