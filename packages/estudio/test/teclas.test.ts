import { describe, expect, it } from 'vitest';

import { atajoAria, etiquetasDeTeclas, resolverTecla } from '../navegador/comandos/teclas';
import type { Ambito, DeclaracionDeTeclas, TeclaPulsada } from '../navegador/comandos/teclas';

const REGISTRO: DeclaracionDeTeclas[] = [
  { id: 'buscador', teclas: ['Mod+K'], ambito: 'global' },
  { id: 'isla-izquierda', teclas: ['Mod+B'], ambito: 'global' },
  { id: 'ayuda', teclas: ['?', 'Mod+/'], ambito: 'global' },
  { id: 'deshacer', teclas: ['Mod+Z'], ambito: 'global', enTexto: false },
  { id: 'rehacer', teclas: ['Mod+Shift+Z', { combinacion: 'Ctrl+Y', soloEn: 'otras' }], ambito: 'global', enTexto: false },
  { id: 'abrir-codigo', teclas: ['E'], ambito: 'global' },
  { id: 'centrar', teclas: ['C'], ambito: 'lienzo' },
  { id: 'guardar', teclas: ['Mod+S'], ambito: 'editor' },
  { id: 'guardar-global', teclas: ['Mod+S'], ambito: 'global' },
];

const pulsar = (key: string, o: Partial<TeclaPulsada> = {}): TeclaPulsada => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, repeat: false, ...o });
const ctrl = (key: string, o: Partial<TeclaPulsada> = {}) => pulsar(key, { ctrlKey: true, ...o });
const cmd = (key: string, o: Partial<TeclaPulsada> = {}) => pulsar(key, { metaKey: true, ...o });
const resolver = (t: TeclaPulsada, ambito: Ambito, plataforma: 'mac' | 'otras' = 'otras') => resolverTecla(REGISTRO, t, ambito, plataforma)?.id;

describe('resolverTecla: plataforma', () => {
  it('Mod es Ctrl fuera de mac y Cmd en mac', () => {
    expect(resolver(ctrl('k'), 'global')).toBe('buscador');
    expect(resolver(cmd('k'), 'global')).toBeUndefined();
    expect(resolver(cmd('k'), 'global', 'mac')).toBe('buscador');
    expect(resolver(ctrl('k'), 'global', 'mac')).toBeUndefined();
  });

  it('Ctrl+Y rehace solo fuera de mac; Mod+Shift+Z en ambas', () => {
    expect(resolver(ctrl('y'), 'global')).toBe('rehacer');
    expect(resolver(ctrl('y'), 'global', 'mac')).toBeUndefined();
    expect(resolver(cmd('y'), 'global', 'mac')).toBeUndefined();
    expect(resolver(ctrl('Z', { shiftKey: true }), 'global')).toBe('rehacer');
    expect(resolver(cmd('z', { shiftKey: true }), 'global', 'mac')).toBe('rehacer');
    expect(resolver(ctrl('z'), 'global')).toBe('deshacer');
  });

  it('las letras ignoran mayusculas pero no Mayus; `?` no exige declarar Mayus', () => {
    expect(resolver(ctrl('K'), 'global')).toBe('buscador');
    expect(resolver(ctrl('k', { shiftKey: true }), 'global')).toBeUndefined();
    expect(resolver(pulsar('?', { shiftKey: true }), 'global')).toBe('ayuda');
    expect(resolver(ctrl('/'), 'global')).toBe('ayuda');
    expect(resolver(ctrl('k', { altKey: true }), 'global')).toBeUndefined();
  });

  it('la autorepeticion no dispara comandos', () => {
    expect(resolver(ctrl('z', { repeat: true }), 'global')).toBeUndefined();
  });
});

describe('resolverTecla: ambitos', () => {
  it('los globales con modificador ganan desde cualquier ambito', () => {
    for (const ambito of ['editor', 'texto', 'lienzo', 'global'] as const) {
      expect(resolver(ctrl('k'), ambito)).toBe('buscador');
      expect(resolver(ctrl('b'), ambito)).toBe('isla-izquierda');
      expect(resolver(ctrl('/'), ambito)).toBe('ayuda');
    }
  });

  it('deshacer y rehacer de `dev` no actuan en el editor ni en un campo de texto (alli manda su propio historial)', () => {
    expect(resolver(ctrl('z'), 'editor')).toBeUndefined();
    expect(resolver(ctrl('z'), 'texto')).toBeUndefined();
    expect(resolver(ctrl('y'), 'texto')).toBeUndefined();
    expect(resolver(ctrl('z'), 'lienzo')).toBe('deshacer');
  });

  it('las teclas sin modificador solo actuan con el foco fuera del texto', () => {
    expect(resolver(pulsar('e'), 'global')).toBe('abrir-codigo');
    expect(resolver(pulsar('e'), 'lienzo')).toBe('abrir-codigo');
    expect(resolver(pulsar('e'), 'texto')).toBeUndefined();
    expect(resolver(pulsar('e'), 'editor')).toBeUndefined();
    expect(resolver(pulsar('?', { shiftKey: true }), 'texto')).toBeUndefined();
  });

  it('un comando de ambito lienzo solo actua con el foco en el lienzo', () => {
    expect(resolver(pulsar('c'), 'lienzo')).toBe('centrar');
    expect(resolver(pulsar('c'), 'global')).toBeUndefined();
  });

  it('el comando del ambito del foco gana al global con la misma tecla', () => {
    expect(resolver(ctrl('s'), 'editor')).toBe('guardar');
    expect(resolver(ctrl('s'), 'global')).toBe('guardar-global');
  });

  it('Tab, flechas, Enter y Espacio son de VistaInteractiva con el foco en el lienzo', () => {
    const conTodo: DeclaracionDeTeclas[] = [{ id: 'x', teclas: ['Tab', 'ArrowLeft', 'Enter', 'Space'], ambito: 'global' }];
    for (const key of ['Tab', 'ArrowLeft', 'Enter', ' ']) {
      expect(resolverTecla(conTodo, pulsar(key), 'lienzo', 'otras')).toBeUndefined();
      expect(resolverTecla(conTodo, pulsar(key), 'global', 'otras')?.id).toBe('x');
    }
  });
});

describe('etiquetasDeTeclas', () => {
  it('traduce Mod por plataforma y omite las teclas de otra plataforma', () => {
    const rehacer = REGISTRO.find((c) => c.id === 'rehacer')!;
    expect(etiquetasDeTeclas(rehacer, 'otras')).toEqual(['Ctrl+Shift+Z', 'Ctrl+Y']);
    expect(etiquetasDeTeclas(rehacer, 'mac')).toEqual(['Cmd+Shift+Z']);
    expect(etiquetasDeTeclas(REGISTRO.find((c) => c.id === 'ayuda')!, 'mac')).toEqual(['?', 'Cmd+/']);
  });
});

describe('atajoAria', () => {
  it('da el valor de `aria-keyshortcuts` de la plataforma', () => {
    const rehacer = REGISTRO.find((c) => c.id === 'rehacer')!;
    expect(atajoAria(rehacer, 'otras')).toBe('Control+Shift+Z Control+Y');
    expect(atajoAria(rehacer, 'mac')).toBe('Meta+Shift+Z');
    expect(atajoAria(REGISTRO.find((c) => c.id === 'ayuda')!, 'otras')).toBe('? Control+/');
  });
});
