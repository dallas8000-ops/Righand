// Words too common to tie an update to one specific rule on their own.
const GENERIC_KEYWORDS = new Set(['permit', 'import', 'export', 'weight', 'border', 'transit', 'insurance', 'registration', 'inspection', 'route', 'operator']);

/** Does a detected official-site change look related to this rule? Uses the rule's own keywords. */
export function updateMatchesRule(update, rule) {
  if (!update || !rule || update.status === 'dismissed') return false;
  const text = `${update.summary || ''} ${update.addedText || ''}`.toLowerCase();
  if (!text.trim()) return false;
  return (rule.keywords || [])
    .map((keyword) => keyword.toLowerCase())
    .filter((keyword) => !GENERIC_KEYWORDS.has(keyword))
    .some((keyword) => new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text));
}

export function updatesForRule(updates, rule) {
  return (updates || []).filter((update) => updateMatchesRule(update, rule));
}
