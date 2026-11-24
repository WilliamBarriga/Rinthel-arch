/**
 * Eventos del Registro de actividad para las pruebas de `sesion`. `estudio/contrato` (codigo fuente, publicado para
 * `estudio` y `cli`) tiene los suyos: el codigo fuente no importa de `tests/ayudas` y `sesion` no importa de `estudio`.
 */
import type { EventoDeActividad } from 'canonico';

/** Un `validate` exitoso del proceso `pid`, con la hora derivada de `pid`; `extra` pisa cualquier campo. */
export const eventoDeActividad = (pid: number, extra: Partial<EventoDeActividad> = {}): EventoDeActividad => ({
  contractVersion: 2,
  ts: `2026-11-19T10:00:${String(pid % 60).padStart(2, '0')}.000Z`,
  pid,
  command: 'validate',
  args: [],
  exitCode: 0,
  durationMs: 1,
  ...extra,
});

/** Las lineas de `.diagrams/actividad.jsonl` con esos Eventos. */
export const lineasDeActividad = (...eventos: EventoDeActividad[]): string => eventos.map((e) => `${JSON.stringify(e)}\n`).join('');
