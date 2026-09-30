import { PhotoView } from './photos';

/**
 * `GET /api/gallery`: the Photos of the gallery in the order of the Wizytówka. A gallery
 * item is named by its `photoId` everywhere, so this is just the `PhotoView`.
 */
export type GalleryPhotoView = PhotoView;

/**
 * `POST /api/gallery` body: a Photo from `POST /api/photos`, added at the end.
 * Replies `201` with the `GalleryPhotoView`.
 */
export interface AddGalleryPhotoRequest {
  photoId: string;
}

/** `PUT /api/gallery/order` body: every Photo of the gallery, in the new order. Replies `204`. */
export interface GalleryOrderRequest {
  photoIds: string[];
}

/** Most Photos one Salon's gallery holds. */
export const GALLERY_MAX_PHOTOS = 30;

/** `422` from `POST /api/gallery` for the Photo over `GALLERY_MAX_PHOTOS`. */
export const GALLERY_FULL = `Galeria może mieć najwyżej ${GALLERY_MAX_PHOTOS} zdjęć`;
/** `400` from `POST` for a `photoId` the Salon does not have. */
export const GALLERY_PHOTO_NOT_FOUND = 'Nie ma takiego zdjęcia';
/** `409` from `POST` for a Photo that is already in the gallery. */
export const GALLERY_PHOTO_ALREADY_ADDED = 'To zdjęcie jest już w galerii';
/** `400` from `PUT /api/gallery/order`. */
export const GALLERY_ORDER_MISMATCH =
  'Lista musi zawierać każde zdjęcie galerii dokładnie raz';

/** How many more Photos fit in a gallery of `count`. */
export const galleryPlacesLeft = (count: number) =>
  Math.max(0, GALLERY_MAX_PHOTOS - count);
