import {
  INITIAL_TIMING,
  quickLength,
  recalculate,
  suggestTiming,
  typedBreak,
  typedDuration,
  withServices,
} from './visit-timing';

const service = (durationMin: number, breakMin = 0) => ({
  durationMin,
  breakMin,
});

describe('suggestTiming', () => {
  it('sums the Czas trwania and takes the longest Przerwa', () => {
    expect(
      suggestTiming([service(30, 5), service(45, 15), service(20, 10)]),
    ).toEqual({ durationMin: 95, breakMin: 15 });
  });

  it('suggests nothing without Usługi', () => {
    expect(suggestTiming([])).toBeNull();
  });
});

describe('the timing of the form', () => {
  it('follows the Usługi while nothing was typed', () => {
    let timing = withServices(INITIAL_TIMING, [service(30, 5)]);
    expect(timing).toMatchObject({ durationMin: 30, breakMin: 5 });
    timing = withServices(timing, [service(30, 5), service(45, 10)]);
    expect(timing).toMatchObject({ durationMin: 75, breakMin: 10 });
  });

  it('keeps the last values when every Usługa is taken off', () => {
    const timing = withServices(
      withServices(INITIAL_TIMING, [service(45, 10)]),
      [],
    );
    expect(timing).toMatchObject({ durationMin: 45, breakMin: 10 });
  });

  it('keeps a typed Czas trwania when a Usługa is added', () => {
    let timing = withServices(INITIAL_TIMING, [service(30), service(45)]);
    timing = typedDuration(timing, 90);
    timing = withServices(timing, [service(30), service(45), service(15, 5)]);
    expect(timing).toMatchObject({ durationMin: 90, breakMin: 5 });
  });

  it('keeps a quick length when a Usługa is added', () => {
    let timing = quickLength(INITIAL_TIMING, 60);
    timing = withServices(timing, [service(30, 10)]);
    expect(timing).toMatchObject({ durationMin: 60, breakMin: 10 });
  });

  it('keeps a typed Przerwa but still follows the Czas trwania', () => {
    let timing = typedBreak(INITIAL_TIMING, 0);
    timing = withServices(timing, [service(30, 15)]);
    expect(timing).toMatchObject({ durationMin: 30, breakMin: 0 });
  });

  it('"przelicz z Usług" follows the Usługi again', () => {
    const services = [service(30, 5), service(45, 15)];
    let timing = typedBreak(
      typedDuration(withServices(INITIAL_TIMING, services), 90),
      0,
    );
    timing = recalculate(timing, services);
    expect(timing).toEqual({
      durationMin: 75,
      breakMin: 15,
      autoDuration: true,
      autoBreak: true,
    });
    timing = withServices(timing, [...services, service(20)]);
    expect(timing.durationMin).toBe(95);
  });
});
