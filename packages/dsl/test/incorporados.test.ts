import { describe, expect, it } from 'vitest';

import { resolverTema } from 'tema';

import { compile } from '../src';

const modelo = `specification {
  node servicio { color blue }
  node base { color green }
}
model { servicio a  base b  a -> b }
view v { type architecture include ** }
`;

const compilar = () => {
  const resultado = compile({ 'main.dg': modelo });
  expect(resultado.issues).toEqual([]);
  return resultado.canonico!;
};

const luminancia = (hex: string): number => {
  const canales = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canales.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a: string, b: string): number => {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (oscuro + 0.05);
};

describe('Temas incorporados', () => {
  it('estan siempre en la Fuente, el neutro primero, y compilan sin issues', () => {
    expect(compilar().themes.map((t) => t.name)).toEqual(['neutral', 'neutral-dark', 'alto-contraste']);
  });

  it('el neutro dibuja con Capas, Slots, estados y animacion minima', () => {
    const neutro = resolverTema(compilar().themes[0]!);
    expect(neutro.nodo.capas.map((c) => c.nombre)).toEqual(['forma', 'relleno', 'borde']);
    expect(Object.keys(neutro.nodo.estados).sort()).toEqual(['en-ruta', 'hover']);
    expect(neutro.nodo.animacion?.transicionesDeEstado?.hover).toBeDefined();
  });

  it('un Tema del usuario no puede llamarse como un incorporado', () => {
    const resultado = compile({ 'main.dg': `${modelo}theme neutral-dark { }\n` });
    expect(resultado.issues.map((i) => i.code)).toContain('E_DUPLICATE_THEME');
  });

  it.each(['neutral', 'neutral-dark', 'alto-contraste'])('%s cumple el contraste: texto 4.5:1 y partes graficas 3:1', (nombre) => {
    const tema = resolverTema(compilar().themes.find((t) => t.name === nombre)!);
    const { palette: p, tokens } = tema;
    expect(contraste(tokens.foreground, tokens.background)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(p['tinta']!, p['papel']!)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(p['tinta']!, tokens.background)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(p['linea']!, tokens.background)).toBeGreaterThanOrEqual(3);
    expect(contraste(tokens.border, tokens.background)).toBeGreaterThanOrEqual(3);
    for (const color of ['gray', 'blue', 'green', 'amber', 'red', 'purple']) {
      expect(contraste(p[color]!, p['papel']!), `${nombre}/${color} sobre papel`).toBeGreaterThanOrEqual(3);
      expect(contraste(p[color]!, tokens.background), `${nombre}/${color} sobre fondo`).toBeGreaterThanOrEqual(3);
    }
  });
});
