import { ServiceView } from '@bookit/shared';

/** What of a Usługa the suggestion reads. */
export type TimedService = Pick<ServiceView, 'durationMin' | 'breakMin'>;

/**
 * The Czas trwania and Przerwa of the Wizyta form, and whether each still follows the
 * Usługi. A value typed by hand (or a quick length) stays put when Usługi change, until
 * "przelicz z Usług".
 */
export interface VisitTiming {
  durationMin: number;
  breakMin: number;
  autoDuration: boolean;
  autoBreak: boolean;
}

/** The quick lengths of the form, in minutes. */
export const QUICK_LENGTHS = [15, 30, 45, 60, 90, 120] as const;

/** A new Wizyta before any Usługa is picked. */
export const INITIAL_TIMING: VisitTiming = {
  durationMin: 30,
  breakMin: 0,
  autoDuration: true,
  autoBreak: true,
};

/**
 * The sum of the Czas trwania of the Usługi and the longest of their Przerwy (docs/mvp.md,
 * section 5); `null` without Usługi.
 */
export function suggestTiming(
  services: readonly TimedService[],
): { durationMin: number; breakMin: number } | null {
  if (!services.length) return null;
  return {
    durationMin: services.reduce((sum, s) => sum + s.durationMin, 0),
    breakMin: Math.max(...services.map((s) => s.breakMin)),
  };
}

/** After the Usługi changed: the values that follow them get the new suggestion. */
export function withServices(
  timing: VisitTiming,
  services: readonly TimedService[],
): VisitTiming {
  const suggested = suggestTiming(services);
  if (!suggested) return timing;
  return {
    ...timing,
    durationMin: timing.autoDuration
      ? suggested.durationMin
      : timing.durationMin,
    breakMin: timing.autoBreak ? suggested.breakMin : timing.breakMin,
  };
}

/** The Czas trwania typed by hand: it no longer follows the Usługi. */
export const typedDuration = (
  timing: VisitTiming,
  durationMin: number,
): VisitTiming => ({ ...timing, durationMin, autoDuration: false });

/** A quick length clicked works like a typed Czas trwania. */
export const quickLength = typedDuration;

/** The Przerwa typed by hand: it no longer follows the Usługi. */
export const typedBreak = (
  timing: VisitTiming,
  breakMin: number,
): VisitTiming => ({ ...timing, breakMin, autoBreak: false });

/** "Przelicz z Usług": both values follow the Usługi again. */
export const recalculate = (
  timing: VisitTiming,
  services: readonly TimedService[],
): VisitTiming =>
  withServices({ ...timing, autoDuration: true, autoBreak: true }, services);
