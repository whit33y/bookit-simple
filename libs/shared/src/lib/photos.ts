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

/**
 * `POST /api/photos/:id/crop` body: a square in pixels of that Photo. Replies `201` with
 * the new Photo: at most 480 px for a profile (default), 1200 px for an announcement.
 * Smaller squares stay smaller; the source Photo is gone.
 */
export interface CropPhotoRequest {
  x: number;
  y: number;
  size: number;
  purpose?: 'profile' | 'announcement';
}

/** Side of a cropped Zdjęcie profilowe; a smaller square stays smaller. */
export const PROFILE_PHOTO_SIDE = 480;

/** Side of a cropped Zdjęcie Ogłoszenia; never enlarges a smaller square. */
export const ANNOUNCEMENT_PHOTO_SIDE = 1200;

/** `400` from `POST /api/photos/:id/crop` for a square that leaves the photo. */
export const PHOTO_CROP_OUTSIDE = 'Kadr wychodzi poza zdjęcie';

/** `400` from `POST /api/photos/:id/crop` for a Photo that is already in use. */
export const PHOTO_CROP_USED = 'Wgraj zdjęcie ponownie, aby je wykadrować';

/** `409` when a write keeps losing to concurrent changes of the same data. */
export const WRITE_CONFLICT =
  'Ktoś właśnie zmienił te dane. Odśwież stronę i spróbuj ponownie';
