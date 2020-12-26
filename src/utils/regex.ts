
export function escapeRegex(s: string): string {
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function makeRegexGlobal(re: RegExp): RegExp {
  if (re.global) {
    return re;
  }

  let flags = "g";
  flags += (re.ignoreCase ? 'i' : '');
  flags += (re.multiline ? 'm' : '');

  return new RegExp(re.source, flags);
}

export interface RegexMatch {
  start: number; // index of match first letter
  end: number; // index of match last letter
  length: number; // length of matched string
  groups: string[];
}

/**
 * RegExp: Get all matches and capturing groups
 * @param {RegExp} re
 * @param {String} str
 * @returns {Array<Array<String>>}
 */
export function matchAll(re: RegExp, str: string): RegexMatch[] {
  const matches = []

  const regex = makeRegexGlobal(re);

  let groups;
  while ((groups = regex.exec(str)) !== null) {
    const found = Array.from(groups);
    const length = found[0].length;
    matches.push({
      start: groups.index,
      end: groups.index + length - 1,
      length: length,
      groups: found,
    });
  }

  return matches;
}
