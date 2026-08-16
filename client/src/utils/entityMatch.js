// client/src/utils/entityMatch.js
//
// Shared fuzzy matcher used by both emailPermitParser.js and
// permitLogParser.js, so an airline/warehouse resolves the same way no
// matter which paste flow found it.
//
// Strategy: exact word-boundary code match first (codes are short, so we
// require a boundary to avoid false positives — e.g. code "CA" shouldn't
// match inside "CARGOSPRINT" or "CANADA"), then a NAME substring match
// checked in BOTH directions. Both directions matter: a full legal name
// ("American Airlines") needs to match a short label ("AMERICAN"), and a
// short label needs to match if it happens to appear inside a longer
// pasted snippet.

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {Array<{id, name, code}>} list
 * @param {string} snippet - the specifically-labeled text, if any (preferred)
 * @param {string} fullText - fallback text to search if snippet has no match
 * @returns {object|null} the matched record, or null
 */
export function matchEntity(list, snippet, fullText) {
  if (!list || !list.length) return null;

  const tryMatch = (haystack) => {
    if (!haystack) return null;
    const lower = haystack.toLowerCase().trim();
    if (!lower) return null;

    for (const item of list) {
      if (item.code) {
        const code = item.code.toLowerCase();
        if (code && new RegExp(`\\b${escapeRegex(code)}\\b`).test(lower)) {
          return item;
        }
      }
    }
    for (const item of list) {
      if (item.name) {
        const name = item.name.toLowerCase();
        if (name && (lower.includes(name) || name.includes(lower))) {
          return item;
        }
      }
    }
    return null;
  };

  return tryMatch(snippet) || tryMatch(fullText);
}