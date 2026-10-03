import { UnsupportedMediaTypeException } from '@nestjs/common';
import { CropPhotoRequest, PHOTO_UNSUPPORTED_TYPE } from '@bookit/shared';
import convertHeic from 'heic-convert';
import sharp from 'sharp';

/** Longest side of a stored Photo, in pixels. */
export const PHOTO_MAX_SIDE = 1600;

const DECODED_BY_SHARP = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** iPhones save HEIC; the prebuilt `sharp` binaries decode only AVIF out of the HEIF family. */
const HEIF = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

export interface ProcessedPhoto {
  webp: Buffer;
  width: number;
  height: number;
}

/**
 * Upload rules of docs/mvp.md, section 5: the type comes from the file's signature,
 * never its name or `Content-Type`. The result is a WebP at most `PHOTO_MAX_SIDE` on
 * the longer side, turned upright by EXIF and without any metadata (GPS included).
 * `415` for anything but JPEG, PNG, WebP and HEIC/HEIF.
 */
export async function processPhoto(file: Buffer): Promise<ProcessedPhoto> {
  const mime = await detectMime(file);
  let input: Buffer;
  if (mime && HEIF.has(mime)) {
    input = await heicToJpeg(file);
  } else if (mime && DECODED_BY_SHARP.has(mime)) {
    input = file;
  } else {
    throw new UnsupportedMediaTypeException(PHOTO_UNSUPPORTED_TYPE);
  }

  try {
    // No `withMetadata()`: sharp then drops EXIF, ICC and XMP from the output.
    const { data, info } = await sharp(input)
      .rotate()
      .resize({
        width: PHOTO_MAX_SIDE,
        height: PHOTO_MAX_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { webp: data, width: info.width, height: info.height };
  } catch {
    // A valid signature with a broken body.
    throw new UnsupportedMediaTypeException(PHOTO_UNSUPPORTED_TYPE);
  }
}

/**
 * The square `x`, `y`, `size` of a stored WebP, scaled down to `side` px, never up.
 * The caller checks that the square lies within the photo.
 */
export async function cropPhoto(
  webp: Buffer,
  { x, y, size }: CropPhotoRequest,
  side: number,
): Promise<ProcessedPhoto> {
  const { data, info } = await sharp(webp)
    .extract({ left: x, top: y, width: size, height: size })
    .resize({ width: side, height: side, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  return { webp: data, width: info.width, height: info.height };
}

/** `file-type` is ESM only; `api` is CommonJS, hence the dynamic `import()`. */
async function detectMime(file: Buffer): Promise<string | undefined> {
  const { fileTypeFromBuffer } = await import('file-type');
  return (await fileTypeFromBuffer(file))?.mime;
}

async function heicToJpeg(file: Buffer): Promise<Buffer> {
  try {
    const jpeg = await convertHeic({
      buffer: file,
      format: 'JPEG',
      quality: 1,
    });
    return Buffer.from(jpeg);
  } catch {
    throw new UnsupportedMediaTypeException(PHOTO_UNSUPPORTED_TYPE);
  }
}
