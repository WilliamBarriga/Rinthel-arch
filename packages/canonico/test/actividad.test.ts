import { describe, expect, it } from 'vitest';

import { crearLectorDeActividad } from '../src/index';
import type { EventoDeActividad } from '../src/index';

const evento = (comando: EventoDeActividad['command'], extra: Partial<EventoDeActividad> = {}): EventoDeActividad => ({
  contractVersion: 2,
  ts: '2026-11-19T10:00:00.000Z',
  pid: 42,
  command: comando,
  args: ['--workspace', '.'],
  exitCode: 0,
  durationMs: 3,
  ...extra,
});
const linea = (e: EventoDeActividad): string => `${JSON.stringify(e)}\n`;

describe('lector del Registro de actividad', () => {
  it('da los eventos nuevos en cada lectura y omite las lineas que no parsean o no cumplen el esquema', () => {
    const leer = crearLectorDeActividad();
    const uno = linea(evento('validate'));
    expect(leer(uno).map((e) => e.command)).toEqual(['validate']);
    expect(leer(uno)).toEqual([]);
    const texto = `${uno}{roto\n${JSON.stringify({ command: 'edit' })}\n${linea(evento('edit', { target: { view: 'v' } }))}`;
    expect(leer(texto)).toEqual([evento('edit', { target: { view: 'v' } })]);
  });

  it('una linea sin salto final espera a completarse', () => {
    const leer = crearLectorDeActividad();
    const completa = linea(evento('build'));
    expect(leer(completa.slice(0, 20))).toEqual([]);
    expect(leer(completa).map((e) => e.command)).toEqual(['build']);
  });

  it('un archivo acortado, rotado o ausente se vuelve a leer desde el principio', () => {
    const leer = crearLectorDeActividad();
    leer(linea(evento('validate')) + linea(evento('build')));
    expect(leer(linea(evento('inspect'))).map((e) => e.command)).toEqual(['inspect']);
    expect(leer(undefined)).toEqual([]);
    expect(leer(linea(evento('edit'))).map((e) => e.command)).toEqual(['edit']);
  });
});
