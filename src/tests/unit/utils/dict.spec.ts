import { dictZip, isDict } from '../../../utils/dict';

describe('dictZip (unit)', () => {
  it('zips equal-length keys and values into a record', () => {
    expect(dictZip(['a', 'b', 'c'], ['1', '2', '3'])).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('returns undefined when the lists differ in length', () => {
    expect(dictZip(['a', 'b'], ['1'])).toBeUndefined();
    expect(dictZip(['a'], ['1', '2'])).toBeUndefined();
  });

  it('returns an empty record for two empty lists', () => {
    expect(dictZip([], [])).toEqual({});
  });

  it('lets the last value win when a key is repeated', () => {
    expect(dictZip(['a', 'a'], ['1', '2'])).toEqual({ a: '2' });
  });
});

describe('isDict (unit)', () => {
  // isDict is implemented as `val !== undefined`, so it is true for every value
  // except `undefined` (including null and falsy primitives).
  it('is false only for undefined', () => {
    expect(isDict(undefined)).toBe(false);
  });

  it('is true for null (null is not undefined)', () => {
    expect(isDict(null)).toBe(true);
  });

  it('is true for objects, arrays and falsy primitives', () => {
    expect(isDict({})).toBe(true);
    expect(isDict({ a: 1 })).toBe(true);
    expect(isDict([])).toBe(true);
    expect(isDict(0)).toBe(true);
    expect(isDict('')).toBe(true);
    expect(isDict(false)).toBe(true);
  });
});
