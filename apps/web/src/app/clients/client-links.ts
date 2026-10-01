/** The Kartoteka Klientów. */
export const CLIENTS_PATH = '/panel/klienci';

/** The karta Klienta, also for the link from the karta Wizyty (#30). */
export const clientCardPath = (id: string) => `${CLIENTS_PATH}/${id}`;

/**
 * The query parameter of the calendar that opens the Wizyta form with this Klient
 * picked: `/panel/kalendarz?klient=<id>` (#30).
 */
export const NEW_VISIT_CLIENT_PARAM = 'klient';
