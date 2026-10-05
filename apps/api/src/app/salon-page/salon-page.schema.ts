import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ACCENT_COLOR_INVALID,
  ACCENT_COLOR_PATTERN,
  ALL_PAGE_SECTIONS,
  isSafeMapUrl,
  MAP_URL_INVALID,
  MAP_URL_MAX_LENGTH,
  MAP_URL_TOO_LONG,
  PageSections,
  PAGE_HEADER_LAYOUTS,
  PAGE_HEADER_LAYOUT_INVALID,
  parsePhone,
  PHONE_INVALID,
  POSTAL_CODE_INVALID,
  POSTAL_CODE_PATTERN,
  PRIVACY_NOTICE_MAX_LENGTH,
  PRIVACY_NOTICE_TOO_LONG,
  SALON_ABOUT_MAX_LENGTH,
  SALON_ABOUT_TOO_LONG,
  SALON_EMAIL_INVALID,
  SALON_PHOTO_NOT_FOUND,
  SALON_SECTIONS_INVALID,
  SALON_TEXT_MAX_LENGTH,
  SALON_TEXT_TOO_LONG,
  UpdateSalonPageRequest,
} from '@bookit/shared';
import { z } from 'zod';

/** `null` or blank is `null`. */
const text = (max: number, message: string) =>
  z
    .string({ error: message })
    .trim()
    .max(max, message)
    .nullable()
    .transform((value) => value || null);

const shortText = text(SALON_TEXT_MAX_LENGTH, SALON_TEXT_TOO_LONG);

const photoId = z.uuid({ error: SALON_PHOTO_NOT_FOUND }).nullable();

const sections = z
  .strictObject(
    Object.fromEntries(
      Object.keys(ALL_PAGE_SECTIONS).map((key) => [key, z.boolean()]),
    ) as Record<keyof PageSections, z.ZodBoolean>,
    { error: SALON_SECTIONS_INVALID },
  )
  .partial();

/** Fields left out stay as they are; unknown ones, `name` and `slug` too, are dropped. */
const updateSchema = z
  .object({
    about: text(SALON_ABOUT_MAX_LENGTH, SALON_ABOUT_TOO_LONG),
    street: shortText,
    postalCode: shortText.pipe(
      z.string().regex(POSTAL_CODE_PATTERN, POSTAL_CODE_INVALID).nullable(),
    ),
    city: shortText,
    phone: shortText.transform((raw, ctx) => {
      if (raw === null) return null;
      const phone = parsePhone(raw);
      if (!phone) ctx.addIssue({ code: 'custom', message: PHONE_INVALID });
      return phone?.e164 ?? null;
    }),
    email: shortText.pipe(
      z.email(SALON_EMAIL_INVALID).toLowerCase().nullable(),
    ),
    mapUrl: text(MAP_URL_MAX_LENGTH, MAP_URL_TOO_LONG).refine(
      (url) => url === null || isSafeMapUrl(url),
      MAP_URL_INVALID,
    ),
    accentColor: z
      .string({ error: ACCENT_COLOR_INVALID })
      .trim()
      .regex(ACCENT_COLOR_PATTERN, ACCENT_COLOR_INVALID)
      .toLowerCase(),
    headerLayout: z.enum(PAGE_HEADER_LAYOUTS, {
      error: PAGE_HEADER_LAYOUT_INVALID,
    }),
    logoPhotoId: photoId,
    heroPhotoId: photoId,
    sections,
    privacyNotice: text(PRIVACY_NOTICE_MAX_LENGTH, PRIVACY_NOTICE_TOO_LONG),
  })
  .partial() satisfies z.ZodType<unknown, UpdateSalonPageRequest>;

export type SalonPageChanges = z.output<typeof updateSchema>;

/** `400` for a body that is not an object; `422` with the first issue for an invalid value. */
export function parseChanges(body: unknown): SalonPageChanges {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException();
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityException(parsed.error.issues[0]?.message);
  }
  return parsed.data;
}
