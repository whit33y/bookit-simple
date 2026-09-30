// Regenerates the fixtures made here (all but iphone.heic): node apps/api/test/fixtures/generate.mjs
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const here = import.meta.dirname;
const out = (name, data) => writeFileSync(join(here, name), data);

// 40x20 as stored: red left half, blue right half. EXIF orientation 6 turns it
// 90° clockwise for display, so upright it is 20x40 with red on top.
const halves = (left, right) =>
  sharp({
    create: { width: 40, height: 20, channels: 4, background: right },
  }).composite([
    {
      input: {
        create: { width: 20, height: 20, channels: 4, background: left },
      },
      left: 0,
      top: 0,
    },
  ]);

out(
  'rotated-exif-6.jpg',
  await sharp(
    await halves({ r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 255 })
      .png()
      .toBuffer(),
  )
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Make: 'Apple', Model: 'iPhone 15' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '52/1 13/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '21/1 0/1 0/1',
      },
    })
    .jpeg({ quality: 95 })
    .toBuffer(),
);

// 40x20: transparent left half, opaque green right half.
out(
  'transparent.png',
  await sharp({
    create: {
      width: 40,
      height: 20,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: {
          create: {
            width: 20,
            height: 20,
            channels: 4,
            background: { r: 0, g: 255, b: 0, alpha: 1 },
          },
        },
        left: 20,
        top: 0,
      },
    ])
    .png()
    .toBuffer(),
);

// A one-page PDF saved under an image name.
out(
  'document-pdf.jpg',
  [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj',
    'trailer << /Root 1 0 R >>',
    '%%EOF',
    '',
  ].join('\n'),
);
