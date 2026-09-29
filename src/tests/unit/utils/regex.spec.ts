import { escapeRegex, matchAll } from '../../../utils/regex';

describe('escapeRegex (unit)', () => {
  it('escapes every regex metacharacter', () => {
    expect(escapeRegex('a.b*c')).toBe('a\\.b\\*c');
    expect(escapeRegex('1+1')).toBe('1\\+1');
    expect(escapeRegex('(group)')).toBe('\\(group\\)');
  });

  it('leaves non-special characters untouched', () => {
    expect(escapeRegex('abc123')).toBe('abc123');
  });

  it('produces a pattern that matches the original string literally', () => {
    const literal = 'a.b(c)+';
    const re = new RegExp(`^${escapeRegex(literal)}$`);

    expect(re.test(literal)).toBe(true);
    // The unescaped `.` would otherwise match any character here.
    expect(re.test('axb(c)+')).toBe(false);
  });
});

describe('matchAll (unit)', () => {
  it('reports start, end, length and the matched group for every match', () => {
    const result = matchAll(/\d+/, 'a12b345');

    expect(result).toEqual([
      { start: 1, end: 2, length: 2, groups: ['12'] },
      { start: 4, end: 6, length: 3, groups: ['345'] },
    ]);
  });

  it('includes capturing groups after the full match', () => {
    const result = matchAll(/(\w)(\d)/, 'a1 b2');

    expect(result).toEqual([
      { start: 0, end: 1, length: 2, groups: ['a1', 'a', '1'] },
      { start: 3, end: 4, length: 2, groups: ['b2', 'b', '2'] },
    ]);
  });

  it('auto-globalizes a non-global regex (avoiding an infinite loop)', () => {
    const result = matchAll(/a/, 'aaa');

    expect(result).toHaveLength(3);
    expect(result.map((m) => m.start)).toEqual([0, 1, 2]);
  });

  it('preserves the ignoreCase flag when globalizing', () => {
    const source = /foo/i;

    const result = matchAll(source, 'foo FOO Foo');

    expect(result).toHaveLength(3);
    // The caller's regex is not mutated into a global one.
    expect(source.global).toBe(false);
  });

  it('preserves the multiline flag when globalizing', () => {
    const result = matchAll(/^a/im, 'A\nbb\na');

    // With m+i, `^a` anchors to the start of each line case-insensitively.
    expect(result.map((m) => m.start)).toEqual([0, 5]);
  });

  it('passes an already-global regex through unchanged', () => {
    const result = matchAll(/\d/g, '1a2b3');

    expect(result.map((m) => m.groups[0])).toEqual(['1', '2', '3']);
  });

  it('returns an empty array when there is no match', () => {
    expect(matchAll(/z/, 'abc')).toEqual([]);
  });
});
