// eslint-disable-next-line @typescript-eslint/no-require-imports
const BadWordsFilter = require('bad-words');

const filter = new BadWordsFilter();

// Slurs/hate speech that warrant an outright 400 rather than silent cleaning.
// bad-words handles general profanity; this layer catches targeted hate speech.
const SEVERE_RE = /\b(n[i1!][g@][g@][ae3]r|f[a@4][g@][g@][o0]t|k[i1!]k[e3]|ch[i1!]nk|sp[i1!][ck]|tr[a@4]nn[yi])\b/i;

/**
 * Replace profanity in `text` with asterisks and return the cleaned string.
 * Safe to call on any input — falls back to the original string on error.
 */
export function filterText(text: string): string {
  if (!text) return text;
  try {
    return filter.clean(text) as string;
  } catch {
    return text;
  }
}

/**
 * Return true if `text` contains slurs or hate speech that should be rejected
 * outright (return 400) rather than silently cleaned.
 */
export function containsSevereProfanity(text: string): boolean {
  if (!text) return false;
  return SEVERE_RE.test(text);
}
