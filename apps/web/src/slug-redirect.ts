import { PublicPageRedirect, validateSlug } from '@bookit/shared';

/** The current Adres wizytówki for an old one, `null` for any other. */
export type CurrentSlugLookup = (slug: string) => Promise<string | null>;

/** A slow API must not hold up the Wizytówka; without an answer it just renders. */
const LOOKUP_TIMEOUT_MS = 2000;

/**
 * Where a request for an old Adres wizytówki goes now, with the rest of the path and the
 * query kept: `/stary-adres/prywatnosc?x=1` → `/nowy-adres/prywatnosc?x=1`.
 * `null` when the first segment is not an old address. Paths that cannot be an
 * Adres wizytówki (reserved, files) never reach `lookup`. Which Salon the address
 * belongs to, the api's resolver decides (ADR 0002); a subdomain would change both.
 */
export async function movedPath(
  url: string,
  lookup: CurrentSlugLookup,
): Promise<string | null> {
  const match = /^\/([^/?#]+)(.*)$/.exec(url);
  if (!match) return null;
  const [, slug, rest] = match;
  if (validateSlug(slug)) return null;
  const current = await lookup(slug);
  return current ? `/${current}${rest}` : null;
}

/** Asks `GET /api/public/pages/:slug`, which answers an old address with `301`. */
export function currentSlugFromApi(
  apiUrl: string,
  fetchFn: typeof fetch = fetch,
): CurrentSlugLookup {
  return async (slug) => {
    try {
      const res = await fetchFn(`${apiUrl}/api/public/pages/${slug}`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      });
      if (res.status !== 301) return null;
      const body = (await res.json()) as PublicPageRedirect;
      return body.slug;
    } catch {
      return null;
    }
  };
}
