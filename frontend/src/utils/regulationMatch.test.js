import { updateMatchesRule, updatesForRule } from './regulationMatch';

const loadRule = { id: 'ug-load', keywords: ['axle', 'weighbridge', 'overload', 'permit', 'weight', 'special load'] };
const customsRule = { id: 'ug-customs', keywords: ['ura', 'customs', 'seal', 'bond', 'transit', 'yellow card'] };

describe('updateMatchesRule', () => {
  test('matches an update that mentions one of the rule keywords', () => {
    const update = { status: 'pending_review', summary: 'New axle load amendment published.', addedText: '' };
    expect(updateMatchesRule(update, loadRule)).toBe(true);
    expect(updateMatchesRule(update, customsRule)).toBe(false);
  });

  test('also looks at the added text of the change', () => {
    const update = { status: 'pending_review', summary: 'Page changed.', addedText: 'Revised COMESA Yellow Card procedure' };
    expect(updateMatchesRule(update, customsRule)).toBe(true);
  });

  test('generic words alone do not tie an update to a rule', () => {
    const update = { status: 'pending_review', summary: 'A new permit and weight notice for transit goods.', addedText: '' };
    expect(updateMatchesRule(update, loadRule)).toBe(false);
    expect(updateMatchesRule(update, customsRule)).toBe(false);
  });

  test('keywords match at the start of a word, not inside other words', () => {
    const update = { status: 'pending_review', summary: 'Cargo news from the ministry of works today.', addedText: '' };
    expect(updateMatchesRule({ ...update, summary: 'ura' }, customsRule)).toBe(true);
    expect(updateMatchesRule(update, customsRule)).toBe(false);
  });

  test('dismissed or empty updates never match', () => {
    expect(updateMatchesRule({ status: 'dismissed', summary: 'axle load' }, loadRule)).toBe(false);
    expect(updateMatchesRule({ status: 'pending_review', summary: '', addedText: '' }, loadRule)).toBe(false);
  });

  test('updatesForRule returns only the related updates', () => {
    const updates = [
      { id: 'a', status: 'pending_review', summary: 'axle load limits changed' },
      { id: 'b', status: 'approved', summary: 'customs entry form updated' },
    ];
    expect(updatesForRule(updates, loadRule).map((u) => u.id)).toEqual(['a']);
    expect(updatesForRule(updates, customsRule).map((u) => u.id)).toEqual(['b']);
  });
});
