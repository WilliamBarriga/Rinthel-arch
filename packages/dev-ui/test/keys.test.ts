import { describe, expect, it } from 'vitest';

import { ariaShortcut, keyLabels, resolveKey } from '../browser/commands/keys';
import type { Scope, KeysDeclaration, PressedKey } from '../browser/commands/keys';

const REGISTRY: KeysDeclaration[] = [
  { id: 'buscador', keys: ['Mod+K'], scope: 'global' },
  { id: 'isla-izquierda', keys: ['Mod+B'], scope: 'global' },
  { id: 'ayuda', keys: ['?', 'Mod+/'], scope: 'global' },
  { id: 'deshacer', keys: ['Mod+Z'], scope: 'global', inText: false },
  { id: 'rehacer', keys: ['Mod+Shift+Z', { combo: 'Ctrl+Y', onlyIn: 'otras' }], scope: 'global', inText: false },
  { id: 'abrir-codigo', keys: ['E'], scope: 'global' },
  { id: 'centrar', keys: ['C'], scope: 'lienzo' },
  { id: 'guardar', keys: ['Mod+S'], scope: 'editor' },
  { id: 'guardar-global', keys: ['Mod+S'], scope: 'global' },
];

const press = (key: string, o: Partial<PressedKey> = {}): PressedKey => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, repeat: false, ...o });
const ctrl = (key: string, o: Partial<PressedKey> = {}) => press(key, { ctrlKey: true, ...o });
const cmd = (key: string, o: Partial<PressedKey> = {}) => press(key, { metaKey: true, ...o });
const resolve = (t: PressedKey, scope: Scope, platform: 'mac' | 'otras' = 'otras') => resolveKey(REGISTRY, t, scope, platform)?.id;

describe('resolveKey: platform', () => {
  it('Mod is Ctrl outside mac and Cmd on mac', () => {
    expect(resolve(ctrl('k'), 'global')).toBe('buscador');
    expect(resolve(cmd('k'), 'global')).toBeUndefined();
    expect(resolve(cmd('k'), 'global', 'mac')).toBe('buscador');
    expect(resolve(ctrl('k'), 'global', 'mac')).toBeUndefined();
  });

  it('Ctrl+Y redoes only outside mac; Mod+Shift+Z on both', () => {
    expect(resolve(ctrl('y'), 'global')).toBe('rehacer');
    expect(resolve(ctrl('y'), 'global', 'mac')).toBeUndefined();
    expect(resolve(cmd('y'), 'global', 'mac')).toBeUndefined();
    expect(resolve(ctrl('Z', { shiftKey: true }), 'global')).toBe('rehacer');
    expect(resolve(cmd('z', { shiftKey: true }), 'global', 'mac')).toBe('rehacer');
    expect(resolve(ctrl('z'), 'global')).toBe('deshacer');
  });

  it('letters ignore case but not Shift; `?` does not require declaring Shift', () => {
    expect(resolve(ctrl('K'), 'global')).toBe('buscador');
    expect(resolve(ctrl('k', { shiftKey: true }), 'global')).toBeUndefined();
    expect(resolve(press('?', { shiftKey: true }), 'global')).toBe('ayuda');
    expect(resolve(ctrl('/'), 'global')).toBe('ayuda');
    expect(resolve(ctrl('k', { altKey: true }), 'global')).toBeUndefined();
  });

  it('autorepeat does not trigger commands', () => {
    expect(resolve(ctrl('z', { repeat: true }), 'global')).toBeUndefined();
  });
});

describe('resolveKey: scopes', () => {
  it('globals with a modifier win from any scope', () => {
    for (const scope of ['editor', 'texto', 'lienzo', 'global'] as const) {
      expect(resolve(ctrl('k'), scope)).toBe('buscador');
      expect(resolve(ctrl('b'), scope)).toBe('isla-izquierda');
      expect(resolve(ctrl('/'), scope)).toBe('ayuda');
    }
  });

  it('`dev` undo and redo do not act in the editor nor in a text field (their own history rules there)', () => {
    expect(resolve(ctrl('z'), 'editor')).toBeUndefined();
    expect(resolve(ctrl('z'), 'texto')).toBeUndefined();
    expect(resolve(ctrl('y'), 'texto')).toBeUndefined();
    expect(resolve(ctrl('z'), 'lienzo')).toBe('deshacer');
  });

  it('keys without a modifier act only with the focus outside text', () => {
    expect(resolve(press('e'), 'global')).toBe('abrir-codigo');
    expect(resolve(press('e'), 'lienzo')).toBe('abrir-codigo');
    expect(resolve(press('e'), 'texto')).toBeUndefined();
    expect(resolve(press('e'), 'editor')).toBeUndefined();
    expect(resolve(press('?', { shiftKey: true }), 'texto')).toBeUndefined();
  });

  it('a canvas-scope command acts only with the focus on the canvas', () => {
    expect(resolve(press('c'), 'lienzo')).toBe('centrar');
    expect(resolve(press('c'), 'global')).toBeUndefined();
  });

  it('the focus scope command beats the global one with the same key', () => {
    expect(resolve(ctrl('s'), 'editor')).toBe('guardar');
    expect(resolve(ctrl('s'), 'global')).toBe('guardar-global');
  });

  it('Tab, arrows, Enter and Space belong to InteractiveView with the focus on the canvas', () => {
    const withAll: KeysDeclaration[] = [{ id: 'x', keys: ['Tab', 'ArrowLeft', 'Enter', 'Space'], scope: 'global' }];
    for (const key of ['Tab', 'ArrowLeft', 'Enter', ' ']) {
      expect(resolveKey(withAll, press(key), 'lienzo', 'otras')).toBeUndefined();
      expect(resolveKey(withAll, press(key), 'global', 'otras')?.id).toBe('x');
    }
  });
});

describe('keyLabels', () => {
  it('translates Mod per platform and omits the keys of another platform', () => {
    const redo = REGISTRY.find((c) => c.id === 'rehacer')!;
    expect(keyLabels(redo, 'otras')).toEqual(['Ctrl+Shift+Z', 'Ctrl+Y']);
    expect(keyLabels(redo, 'mac')).toEqual(['Cmd+Shift+Z']);
    expect(keyLabels(REGISTRY.find((c) => c.id === 'ayuda')!, 'mac')).toEqual(['?', 'Cmd+/']);
  });
});

describe('ariaShortcut', () => {
  it('gives the platform value of `aria-keyshortcuts`', () => {
    const redo = REGISTRY.find((c) => c.id === 'rehacer')!;
    expect(ariaShortcut(redo, 'otras')).toBe('Control+Shift+Z Control+Y');
    expect(ariaShortcut(redo, 'mac')).toBe('Meta+Shift+Z');
    expect(ariaShortcut(REGISTRY.find((c) => c.id === 'ayuda')!, 'otras')).toBe('? Control+/');
  });
});
