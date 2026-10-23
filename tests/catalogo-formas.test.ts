import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { compile } from 'dsl';
import { PINTORES } from 'render';
import { CATALOGO, construirPrimitiva, estiloResuelto } from 'tema';
import type { DefinicionDePropiedad } from 'tema';

const ejemplo = readFileSync(resolve(import.meta.dirname, '../examples/temas/catalogo-formas.dg'), 'utf8');
const { canonico, issues } = compile({ 'catalogo-formas.dg': ejemplo });

const FAMILIAS = ['forma', 'relleno', 'borde'];
const delCatalogo = Object.entries(CATALOGO).filter(([, p]) => FAMILIAS.includes(p.familia));

/** Valor valido de una propiedad para ejercitar el pintor: el defecto, o un color de Paleta. */
const valorDe = (p: DefinicionDePropiedad): string | number => (p.tipo === 'color' ? 'ink' : (p.defecto ?? p.min));

type TemaConCapas = { nodo?: { capas: Array<{ primitiva: { tipo: string } }> } };

describe('catalogo de formas, rellenos y bordes', () => {
  it('el Tema de ejemplo compila sin issues', () => {
    expect(issues).toEqual([]);
  });

  it.each(delCatalogo.map(([nombre]) => nombre))('%s tiene pintor y aparece en un Tema de ejemplo', (nombre) => {
    const definicion = CATALOGO[nombre as keyof typeof CATALOGO];
    const props = Object.entries(definicion.propiedades).map(([clave, p]) => ({ clave, valor: valorDe(p as DefinicionDePropiedad) }));
    const { primitiva, errores } = construirPrimitiva(nombre, props, { ink: '#111111' });
    const usadoEn = (canonico?.themes ?? []).filter((t) => ((t as unknown as TemaConCapas).nodo?.capas ?? []).some((c) => c.primitiva.tipo === nombre));

    expect(errores).toEqual([]);
    expect(Object.keys(PINTORES[nombre as keyof typeof PINTORES](primitiva!.props))).not.toHaveLength(0);
    expect(usadoEn.length).toBeGreaterThan(0);
  });

  it('cada Tema de ejemplo resuelve su Estilo sin lanzar', () => {
    for (const tema of canonico!.themes) expect(() => estiloResuelto(tema)).not.toThrow();
  });
});
