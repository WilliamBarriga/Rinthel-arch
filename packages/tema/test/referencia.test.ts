import { describe, expect, it } from 'vitest';

import { CATALOGO, EFECTOS, MOVIMIENTOS, SLOTS, referenciaDelCatalogo } from '../src';

describe('referenciaDelCatalogo', () => {
  const texto = referenciaDelCatalogo();
  const fila = (nombre: string): string => texto.split('\n').find((linea) => linea.startsWith(`| \`${nombre}\` |`)) ?? '';

  it('es determinista', () => {
    expect(referenciaDelCatalogo()).toBe(texto);
  });

  it('lista cada Primitiva, Slot, Movimiento y Efecto del catalogo', () => {
    for (const nombre of Object.keys(CATALOGO)) expect(fila(nombre), nombre).not.toBe('');
    for (const nombre of [...SLOTS, ...Object.keys(MOVIMIENTOS), ...EFECTOS]) expect(fila(nombre), nombre).not.toBe('');
  });

  it('muestra rango y defecto de una propiedad numerica', () => {
    expect(fila('glow')).toContain('`radius` 1 a 100 (12)');
  });

  it('muestra las opciones y marca las Primitivas que afectan a las Metricas', () => {
    expect(fila('circle')).toMatch(/\| si \|/);
    expect(fila('rect')).toMatch(/\| no \|/);
    expect(fila('line')).toMatch(/`style` solid\|/);
  });

  it('declara que esta generada', () => {
    expect(texto).toContain('Generado');
  });
});
