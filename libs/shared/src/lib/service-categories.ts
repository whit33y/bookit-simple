/** One Kategoria Usług in `GET /api/service-categories`, in the order of the Cennik. */
export interface ServiceCategoryView {
  id: string;
  name: string;
}

/** `POST /api/service-categories` body. Replies `201` with the new `ServiceCategoryView`. */
export interface CreateServiceCategoryRequest {
  name: string;
}

/** `PATCH /api/service-categories/:id` body. Replies with the `ServiceCategoryView`. */
export interface UpdateServiceCategoryRequest {
  name: string;
}

/** `PUT /api/service-categories/order` body: every Kategoria, in the new order. Replies `204`. */
export interface ServiceCategoryOrderRequest {
  ids: string[];
}

export const SERVICE_CATEGORY_NAME_MAX_LENGTH = 100;

/** `409` from `DELETE`: Usługi, also archived ones, keep their Kategoria. */
export const SERVICE_CATEGORY_HAS_SERVICES =
  'Nie można usunąć Kategorii, która ma Usługi (także zarchiwizowane). Najpierw przenieś je do innej Kategorii';
/** `400` from `PUT /api/service-categories/order`. */
export const SERVICE_CATEGORY_ORDER_MISMATCH =
  'Lista musi zawierać każdą Kategorię dokładnie raz';
