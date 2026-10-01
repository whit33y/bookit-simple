import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

/** The iPhone photo of the upload tests, so the seed sends one HEIC through the converter. */
const HEIC_FIXTURE = join(__dirname, '../../../test/fixtures/iphone.heic');

/** Shapes only, no text: `sharp` renders SVG text with whatever fonts the machine has. */
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" fill="#f6efe9"/>
  <circle cx="256" cy="256" r="200" fill="#9c4f3c"/>
  <path d="M196 140v232M196 256l120-116M220 236l100 136" stroke="#f6efe9" stroke-width="36" stroke-linecap="round" fill="none"/>
</svg>`;

const HERO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1000">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f3d9c8"/>
      <stop offset="1" stop-color="#9c4f3c"/>
    </linearGradient>
  </defs>
  <rect width="2400" height="1000" fill="url(#g)"/>
  <circle cx="1900" cy="300" r="380" fill="#ffffff" fill-opacity="0.18"/>
  <circle cx="500" cy="850" r="300" fill="#ffffff" fill-opacity="0.12"/>
</svg>`;

/** Five gallery pictures, each its own palette. */
const GALLERY_COLOURS = [
  ['#e8c4b0', '#7a3b2e'],
  ['#d7e3e0', '#3e6b63'],
  ['#f2e1c2', '#a8742a'],
  ['#e6d3e8', '#6b4a7a'],
  ['#dfe6d0', '#5b6e3a'],
];

const gallerySvg = ([light, dark]: string[], index: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
  <rect width="1200" height="900" fill="${light}"/>
  <circle cx="${300 + index * 150}" cy="450" r="260" fill="${dark}" fill-opacity="0.85"/>
  <rect x="700" y="${150 + index * 40}" width="320" height="320" rx="40" fill="${dark}" fill-opacity="0.4"/>
</svg>`;

const render = (svg: string, format: 'png' | 'jpeg') =>
  sharp(Buffer.from(svg))[format]().toBuffer();

export interface StudioKoraPhotoFiles {
  logo: Buffer;
  hero: Buffer;
  /** In the order of the Wizytówka; the last one is the HEIC. */
  gallery: Buffer[];
}

/** The files the Właściciel would upload: PNG and JPEG, as phones and laptops send them. */
export async function studioKoraPhotoFiles(): Promise<StudioKoraPhotoFiles> {
  const [logo, hero, heic, ...pictures] = await Promise.all([
    render(LOGO_SVG, 'png'),
    render(HERO_SVG, 'jpeg'),
    readFile(HEIC_FIXTURE),
    ...GALLERY_COLOURS.map((colours, index) =>
      render(gallerySvg(colours, index), 'jpeg'),
    ),
  ]);
  return { logo, hero, gallery: [...pictures, heic] };
}
