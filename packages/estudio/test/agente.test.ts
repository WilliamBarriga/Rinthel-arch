import { describe, expect, it } from 'vitest';

import type { EventoDeActividad, FuenteCanonica } from 'canonico';
import { abrirSesion } from 'sesion';

import { eventoDeActividad } from '../src/contrato';
import { destinoDelObjetivo, marcaDelEvento, resumenDelEvento } from '../navegador/agente/actividad';

const DSL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  servicio cache "Cache"
  api -> db
}

view mapa {
  type architecture
  include api, db
}

view datos {
  type architecture
  include db, cache
}

view solo-cache {
  type architecture
  include cache
}
`;

const fuente = abrirSesion({ 'main.dg': DSL }).fuente as FuenteCanonica;

const evento = (extra: Partial<EventoDeActividad> = {}): EventoDeActividad => eventoDeActividad(7, { args: [], ...extra });

describe('seguir al agente: destino de un objetivo', () => {
  it('objetivo.vista navega a esa Vista; si ademas nombra un Nodo que contiene, lo selecciona', () => {
    expect(destinoDelObjetivo({ vista: 'datos' }, fuente, 'mapa')).toEqual({ vista: 'datos' });
    expect(destinoDelObjetivo({ vista: 'datos', nodo: 'cache' }, fuente, 'mapa')).toEqual({ vista: 'datos', seleccion: 'cache' });
    expect(destinoDelObjetivo({ vista: 'nada' }, fuente, 'mapa')).toBeUndefined();
  });

  it('objetivo.nodo se queda en la Vista activa si lo contiene; si no, va a la primera Vista que lo contenga', () => {
    expect(destinoDelObjetivo({ nodo: 'db' }, fuente, 'datos')).toEqual({ vista: 'datos', seleccion: 'db' });
    expect(destinoDelObjetivo({ nodo: 'cache' }, fuente, 'mapa')).toEqual({ vista: 'datos', seleccion: 'cache' });
    expect(destinoDelObjetivo({ nodo: 'nada' }, fuente, 'mapa')).toBeUndefined();
  });

  it('archivos (o un objetivo vacio) no mueve', () => {
    expect(destinoDelObjetivo({ archivos: ['main.dg'] }, fuente, 'mapa')).toBeUndefined();
    expect(destinoDelObjetivo(undefined, fuente, 'mapa')).toBeUndefined();
  });
});

describe('linea del feed', () => {
  it('marks ok, errors, warnings or usage failure', () => {
    expect(marcaDelEvento(evento())).toEqual({ tipo: 'ok', texto: 'ok' });
    expect(marcaDelEvento(evento({ comando: 'validate', exitCode: 1, resumen: { errores: 3, avisos: 1 } }))).toEqual({ tipo: 'errores', texto: '3 errors' });
    expect(marcaDelEvento(evento({ exitCode: 1 }))).toEqual({ tipo: 'errores', texto: 'error' });
    expect(marcaDelEvento(evento({ comando: 'build', resumen: { errores: 0, avisos: 1 } }))).toEqual({ tipo: 'avisos', texto: '1 warning' });
    expect(marcaDelEvento(evento({ exitCode: 2 }))).toEqual({ tipo: 'fallo', texto: 'usage failure' });
  });

  it('resume quien, comando y objetivo en una linea', () => {
    expect(resumenDelEvento(evento({ agente: 'claude', objetivo: { vista: 'mapa', nodo: 'api' } }))).toBe('claude edit mapa api');
    expect(resumenDelEvento(evento({ comando: 'validate' }))).toBe('pid 7 validate');
    expect(resumenDelEvento(evento({ objetivo: { archivos: ['a.dg', 'b.dg'] } }))).toBe('pid 7 edit a.dg, b.dg');
  });
});
