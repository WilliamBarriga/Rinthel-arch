import { describe, expect, it } from 'vitest';

import { contentHash } from 'session';
import type { Intent } from 'session';

import { applyInMemory } from './helpers';

const ws = (view: string) => `specification { node servicio }
model { servicio a  servicio b }
theme claro extends neutral { palette { acento "#0ea5e9" } }
${view}
`;

const setTheme = (theme?: string, view = 'v'): Intent => ({ type: 'set-theme', view, ...(theme !== undefined && { theme }) });

const apply = (text: string, intent: Intent): string => {
  const r = applyInMemory({ 'main.dg': text }, intent);
  if (!r.ok) throw new Error(`${r.reason}: ${r.message}`);
  return r.files['main.dg'] as string;
};

describe('Intent set-theme', () => {
  it('with theme in the View rewrites the name and keeps the patch', () => {
    const text = ws(`view v {
  type architecture
  theme neutral { layer border { color amber  width 3 } }
  include **
}`);
    expect(apply(text, setTheme('claro'))).toBe(
      ws(`view v {
  type architecture
  theme claro { layer border { color amber  width 3 } }
  include **
}`),
    );
  });

  it('without theme inserts theme <name> as the first line of the View body', () => {
    const text = ws(`view v {
  type architecture
  include **
}`);
    expect(apply(text, setTheme('claro'))).toBe(
      ws(`view v {
  theme claro
  type architecture
  include **
}`),
    );
  });

  it('without a theme removes the theme line if there is no patch', () => {
    const text = ws(`view v {
  type architecture
  theme claro
  include **
}`);
    expect(apply(text, setTheme())).toBe(
      ws(`view v {
  type architecture
  include **
}`),
    );
  });

  it('without a theme and with a patch writes theme neutral { patch }', () => {
    const text = ws(`view v {
  type architecture
  theme claro { layer border { color amber  width 3 } }
  include **
}`);
    expect(apply(text, setTheme())).toBe(
      ws(`view v {
  type architecture
  theme neutral { layer border { color amber  width 3 } }
  include **
}`),
    );
  });

  it('an undeclared Theme is rejected with unknown-theme and names the nearest ones', () => {
    const text = ws(`view v {
  type architecture
  include **
}`);
    const r = applyInMemory({ 'main.dg': text }, setTheme('clar'));
    expect(r).toMatchObject({ ok: false, reason: 'unknown-theme' });
    expect(!r.ok && r.message).toContain('claro');
  });

  it('a View not found rejects with unknown-view and a stale seen hash with stale-hash', () => {
    const text = ws(`view v {
  type architecture
  include **
}`);
    expect(applyInMemory({ 'main.dg': text }, setTheme('claro', 'nada'))).toMatchObject({ ok: false, reason: 'unknown-view' });
    expect(applyInMemory({ 'main.dg': text }, setTheme('claro'), { 'main.dg': 'viejo' })).toMatchObject({ ok: false, reason: 'stale-hash' });
    expect(applyInMemory({ 'main.dg': text }, setTheme('claro'), { 'main.dg': contentHash(text) }).ok).toBe(true);
  });
});
