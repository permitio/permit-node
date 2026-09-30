export type Dict = Record<string, any>;

export function isDict(val: any): val is Dict {
  return (val as Dict) !== undefined;
}

/**
 * JS Equivalent to python dict(zip())
 *
 * generates a dict-like object (record) from two same-size lists
 * if lists are not same-size, returns undefined.
 * @param keys
 * @param values
 */
export function dictZip(keys: string[], values: string[]): Record<string, string> | undefined {
  if (keys.length === values.length) {
    return keys.reduce((acc: Record<string, string>, curr: string, index: number) => {
      const value = values[index];
      if (value === undefined) {
        throw new Error('dictZip requires dense arrays of strings; a value is missing.');
      }
      acc[curr] = value;
      return acc;
    }, {});
  } else {
    return undefined;
  }
}
