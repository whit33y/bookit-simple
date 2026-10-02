import { Page } from '@playwright/test';

type TouchType = 'touchStart' | 'touchMove' | 'touchEnd';

/** A finger moving `dx` px across the middle of the calendar grid, as a real touch screen sends it. */
export async function swipe(page: Page, dx: number): Promise<void> {
  const box = await page.locator('app-calendar-day-grid').boundingBox();
  if (!box) throw new Error('The grid is not drawn');
  const x = box.x + box.width / 2;
  const y = 400;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: TouchType, points: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await touch('touchStart', [{ x, y }]);
  for (let i = 1; i <= 10; i++) {
    await touch('touchMove', [{ x: x + (dx * i) / 10, y }]);
  }
  await touch('touchEnd', []);
  await cdp.detach();
}
