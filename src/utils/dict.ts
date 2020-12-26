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
      acc[curr] = values[index];
      return acc;
    }, {});
  } else {
    return undefined;
  }
}
