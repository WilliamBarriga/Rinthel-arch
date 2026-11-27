import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { compile } from 'dsl';
import { CATALOG, buildPrimitive, resolvedStyle } from 'theme';
import type { PropertyDefinition } from 'theme';

const ejemplo = readFileSync(resolve(import.meta.dirname, '../examples/themes/shape-catalog.dg'), 'utf8');
const { canonico, issues } = compile({ 'shape-catalog.dg': ejemplo });

const FAMILIAS = ['forma', 'relleno', 'borde'];
const delCatalogo = Object.entries(CATALOG).filter(([, p]) => FAMILIAS.includes(p.familia));

/** Valor valido de una propiedad para construir la Primitiva: el defecto, o un color de Paleta. */
const valorDe = (p: PropertyDefinition): string | number => (p.tipo === 'color' ? 'ink' : p.tipo === 'nombre' ? 'Ejemplo' : p.tipo === 'opcion' ? (p.defecto ?? p.valores[0]!) : p.tipo === 'texto' ? 'x' : (p.defecto ?? p.min));

type TemaConCapas = { nodo?: { capas: Array<{ primitiva: { tipo: string } }> } };

describe('catalogo de formas, rellenos y bordes', () => {
  it('el Tema de ejemplo compila sin issues', () => {
    expect(issues).toEqual([]);
  });

  it.each(delCatalogo.map(([nombre]) => nombre))('%s aparece en un Tema de ejemplo', (nombre) => {
    const definicion = CATALOG[nombre as keyof typeof CATALOG];
    const props = Object.entries(definicion.propiedades).map(([clave, p]) => ({ clave, valor: valorDe(p as PropertyDefinition) }));
    const { errores } = buildPrimitive(nombre, props, { ink: '#111111' });
    const usadoEn = (canonico?.themes ?? []).filter((t) => ((t as unknown as TemaConCapas).nodo?.capas ?? []).some((c) => c.primitiva.tipo === nombre));

    expect(errores).toEqual([]);
    expect(usadoEn.length).toBeGreaterThan(0);
  });

  it('cada Tema de ejemplo resuelve su Estilo sin lanzar', () => {
    for (const tema of canonico!.themes) expect(() => resolvedStyle(tema, { diagrama: 'architecture' })).not.toThrow();
  });
});
