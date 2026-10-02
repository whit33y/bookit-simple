import { expect, Page } from '@playwright/test';

export interface AbsenceInput {
  /** The person to pick; left as the form starts without it. */
  person?: string;
  /** `YYYY-MM-DD`, both days included. */
  from: string;
  to: string;
  /** `HH:mm` on the Warsaw clock; without them the Nieobecność is on whole days. */
  times?: { from: string; to: string };
  reason?: string;
}

/**
 * Adds a Nieobecność through "Nowa Nieobecność" in the calendar shown on `page`, as the
 * Personel does, e.g. the "dzień recepcji" scenario (#38).
 */
export async function addAbsence(
  page: Page,
  input: AbsenceInput,
): Promise<void> {
  await page.getByRole('button', { name: 'Nowa Nieobecność' }).click();
  const form = page.getByRole('dialog', { name: 'Nowa Nieobecność' });
  if (input.person) {
    await form.getByRole('combobox', { name: 'Osoba' }).click();
    await page.getByRole('option', { name: input.person, exact: true }).click();
  }
  await form.getByLabel('Od', { exact: true }).fill(input.from);
  await form.getByLabel('Do', { exact: true }).fill(input.to);
  if (input.times) {
    await form.getByRole('switch', { name: 'Cały dzień' }).click();
    await form.getByLabel('Od godziny').fill(input.times.from);
    await form.getByLabel('Do godziny').fill(input.times.to);
  }
  if (input.reason) await form.getByLabel('Powód').fill(input.reason);
  await form.getByRole('button', { name: 'Zapisz' }).click();
  await expect(form).toBeHidden();
}
