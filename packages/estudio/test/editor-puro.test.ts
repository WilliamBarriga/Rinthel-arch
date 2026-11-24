import { readFileSync } from 'node:fs';

import { ChangeSet, EditorState, Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { abrirSesion } from 'sesion';

import { edicionesDesdeCambios } from '../navegador/editor/cambios';
import { opcionesDeCompletado } from '../navegador/editor/completado';
import { diagnosticosDe } from '../navegador/editor/diagnosticos';
import { moduloDePalabrasClave, palabrasClaveDeGramatica } from '../scripts/palabras-clave';

const GRAMATICA = readFileSync(new URL('../../dsl/src/gramatica/diagramas.langium', import.meta.url), 'utf8');

describe('palabras clave del resaltado', () => {
  it('salen de la gramatica y la lista generada en build esta al dia', () => {
    const extraidas = palabrasClaveDeGramatica(GRAMATICA);
    expect(extraidas).toEqual(expect.arrayContaining(['specification', 'model', 'view', 'include', 'theme', 'interaction', 'ease-in-out']));
    expect(extraidas).not.toContain('->');
    expect(readFileSync(new URL('../navegador/editor/palabras-clave.ts', import.meta.url), 'utf8')).toBe(moduloDePalabrasClave(extraidas));
  });
});

describe('ediciones minimas desde los cambios del editor', () => {
  const base = 'linea uno\nlinea dos\nlinea tres\n';
  const cambio = (especificacion: Parameters<typeof ChangeSet.of>[0]) => ChangeSet.of(especificacion, base.length);

  it('una insercion es una edicion vacia en su punto, en lineas y columnas 1-based', () => {
    const insertar = cambio({ from: base.indexOf('dos'), insert: 'numero ' });
    expect(edicionesDesdeCambios('main.dg', base, insertar)).toEqual([
      { file: 'main.dg', range: { start: { line: 2, column: 7 }, end: { line: 2, column: 7 } }, replacement: 'numero ' },
    ]);
  });

  it('varios cambios (multicursor) son varias ediciones sobre el texto base; los cambios compuestos se unen', () => {
    const primero = cambio([
      { from: 0, to: 5, insert: 'LINEA' },
      { from: base.indexOf('tres'), to: base.indexOf('tres') + 4, insert: '3' },
    ]);
    const despues = primero.apply(Text.of(base.split('\n')));
    const segundo = ChangeSet.of({ from: despues.length, insert: 'fin\n' }, despues.length);
    expect(edicionesDesdeCambios('main.dg', base, primero.compose(segundo))).toEqual([
      { file: 'main.dg', range: { start: { line: 1, column: 1 }, end: { line: 1, column: 6 } }, replacement: 'LINEA' },
      { file: 'main.dg', range: { start: { line: 3, column: 7 }, end: { line: 3, column: 11 } }, replacement: '3' },
      { file: 'main.dg', range: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } }, replacement: 'fin\n' },
    ]);
  });

  it('sin cambios no hay ediciones', () => {
    expect(edicionesDesdeCambios('main.dg', base, ChangeSet.empty(base.length))).toEqual([]);
  });
});

const DSL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  api -> db
  interaction login "Login" {
    api -> db "consulta"
  }
}

view mapa {
  type architecture
  include **
}
`;

describe('completado', () => {
  it('ofrece las palabras clave y los ids de la ultima Fuente buena (Nodos, Vistas, Tipos, Interacciones)', () => {
    const fuente = abrirSesion({ 'main.dg': DSL }).fuente;
    const opciones = opcionesDeCompletado(fuente);
    const de = (tipo: string) => opciones.filter((o) => o.type === tipo).map((o) => o.label);
    expect(de('keyword')).toEqual(expect.arrayContaining(['view', 'include']));
    expect(de('variable')).toEqual(['api', 'db']);
    expect(de('class')).toEqual(['servicio']);
    expect(de('namespace')).toEqual(['mapa']);
    expect(de('function')).toEqual(['login']);
    expect(opcionesDeCompletado(undefined).every((o) => o.type === 'keyword')).toBe(true);
  });
});

describe('issues en linea', () => {
  it('los issues del archivo se vuelven diagnosticos en su posicion, con el fix como accion', () => {
    const doc = EditorState.create({ doc: DSL }).doc;
    const issue = { code: 'x', severity: 'warning' as const, file: 'main.dg', line: 6, column: 3, message: 'aviso', href: '', fix: { file: 'main.dg', range: { start: { line: 6, column: 3 }, end: { line: 6, column: 11 } }, replacement: 'servicio' } };
    const otro = { ...issue, file: 'otro.dg' };
    const aplicados: unknown[] = [];
    const diagnosticos = diagnosticosDe(doc, 'main.dg', [issue, otro], (fix) => aplicados.push(fix));
    expect(diagnosticos).toHaveLength(1);
    const [d] = diagnosticos;
    expect(d).toMatchObject({ from: doc.line(6).from + 2, severity: 'warning', message: 'aviso', source: 'x' });
    expect(d?.actions?.map((a) => a.name)).toEqual(['Apply fix']);
    d?.actions?.[0]?.apply(undefined as never, 0, 0);
    expect(aplicados).toEqual([issue.fix]);
  });
});
