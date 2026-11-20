import { describe, expect, it } from 'vitest';

import { aplicarIntencion, hashDeContenido } from 'sesion';
import type { Intencion } from 'sesion';

const ws = (vista: string) => `specification { node servicio }
model { servicio a  servicio b }
theme claro extends neutral { palette { acento "#0ea5e9" } }
${vista}
`;

const fijar = (tema?: string, vista = 'v'): Intencion => ({ tipo: 'fijar-tema', vista, ...(tema !== undefined && { tema }) });

const aplicar = (texto: string, intencion: Intencion): string => {
  const r = aplicarIntencion({ 'main.dg': texto }, intencion);
  if (!r.ok) throw new Error(`${r.motivo}: ${r.mensaje}`);
  return r.archivos['main.dg'] as string;
};

describe('Intencion fijar-tema', () => {
  it('con theme en la Vista reescribe el nombre y conserva el parche', () => {
    const texto = ws(`view v {
  type architecture
  theme neutral { layer borde { color amber  width 3 } }
  include **
}`);
    expect(aplicar(texto, fijar('claro'))).toBe(
      ws(`view v {
  type architecture
  theme claro { layer borde { color amber  width 3 } }
  include **
}`),
    );
  });

  it('sin theme inserta theme <nombre> como primera linea del cuerpo de la Vista', () => {
    const texto = ws(`view v {
  type architecture
  include **
}`);
    expect(aplicar(texto, fijar('claro'))).toBe(
      ws(`view v {
  theme claro
  type architecture
  include **
}`),
    );
  });

  it('sin tema quita la linea theme si no hay parche', () => {
    const texto = ws(`view v {
  type architecture
  theme claro
  include **
}`);
    expect(aplicar(texto, fijar())).toBe(
      ws(`view v {
  type architecture
  include **
}`),
    );
  });

  it('sin tema y con parche escribe theme neutral { parche }', () => {
    const texto = ws(`view v {
  type architecture
  theme claro { layer borde { color amber  width 3 } }
  include **
}`);
    expect(aplicar(texto, fijar())).toBe(
      ws(`view v {
  type architecture
  theme neutral { layer borde { color amber  width 3 } }
  include **
}`),
    );
  });

  it('un Tema no declarado se rechaza con tema-desconocido y nombra los cercanos', () => {
    const texto = ws(`view v {
  type architecture
  include **
}`);
    const r = aplicarIntencion({ 'main.dg': texto }, fijar('clar'));
    expect(r).toMatchObject({ ok: false, motivo: 'tema-desconocido' });
    expect(!r.ok && r.mensaje).toContain('claro');
  });

  it('una Vista inexistente rechaza con vista-desconocida y un visto viejo con hash-desactualizado', () => {
    const texto = ws(`view v {
  type architecture
  include **
}`);
    expect(aplicarIntencion({ 'main.dg': texto }, fijar('claro', 'nada'))).toMatchObject({ ok: false, motivo: 'vista-desconocida' });
    expect(aplicarIntencion({ 'main.dg': texto }, fijar('claro'), { 'main.dg': 'viejo' })).toMatchObject({ ok: false, motivo: 'hash-desactualizado' });
    expect(aplicarIntencion({ 'main.dg': texto }, fijar('claro'), { 'main.dg': hashDeContenido(texto) }).ok).toBe(true);
  });
});
