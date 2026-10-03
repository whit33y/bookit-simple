import { squareWithin } from './photo-cropper';

describe('squareWithin', () => {
  const photo = { width: 1200, height: 1600 };

  it('rounds the square to whole pixels', () => {
    expect(squareWithin(100.4, 0.6, 899.5, photo)).toEqual({
      x: 100,
      y: 1,
      size: 900,
    });
  });

  it('moves a square that sticks out back into the photo', () => {
    expect(squareWithin(400.7, -2, 800.6, photo)).toEqual({
      x: 399,
      y: 0,
      size: 801,
    });
  });

  it('never makes the square larger than the shorter side', () => {
    expect(squareWithin(0, 0, 1300, photo)).toEqual({ x: 0, y: 0, size: 1200 });
  });
});
