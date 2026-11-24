import { describe, expect, it } from 'vitest';

import { abrirSesion, diferenciar } from 'sesion';
import type { FuenteCanonica } from 'canonico';

const BASE = `specification {
  node servicio
}

model {
  servicio api "API" "Atiende"
  servicio db "Base" {
    id: uuid pk
    total: decimal "en centavos"
  }
  api -> db "lee"
  api -> db "escribe"
  interaction compra "Compra" {
    pedir: api -> db "pedir"
    reply db -> api "ok"
  }
}

view general {
  type architecture
  include **
}

theme claro extends neutral {
  palette { acento "#0ea5e9" }
}
`;

const fuenteDe = (texto: string): FuenteCanonica => {
  const fuente = abrirSesion({ 'main.dg': texto }).fuente;
  if (fuente === undefined) throw new Error('el DSL de prueba no compila');
  return fuente;
};

const dif = (despues: string, antes = BASE) => diferenciar(fuenteDe(antes), fuenteDe(despues));

describe('diferenciar', () => {
  it('dos Fuentes iguales no tienen diferencia', () => {
    expect(dif(BASE)).toEqual({ agregados: [], quitados: [], cambiados: [] });
  });

  it('un Nodo nuevo es agregado; uno que falta, quitado', () => {
    expect(dif(BASE.replace('servicio api "API" "Atiende"', 'servicio api "API" "Atiende"\n  servicio cola "Cola"'))).toEqual({
      agregados: [{ kind: 'node', id: 'cola' }],
      quitados: [],
      cambiados: [],
    });
  });

  it('un renombre es un quitado mas un agregado, no un cambio', () => {
    const r = dif(BASE.replace('interaction compra', 'interaction compra2').replace('view general', 'view todo'));
    expect(r.quitados).toEqual(expect.arrayContaining([{ kind: 'interaction', id: 'compra' }, { kind: 'view', id: 'general' }]));
    expect(r.agregados).toEqual(expect.arrayContaining([{ kind: 'interaction', id: 'compra2' }, { kind: 'view', id: 'todo' }]));
  });

  it('las propiedades cambiadas de un Nodo se etiquetan texto (titulo, descripcion) o estructura (tipo)', () => {
    const r = dif(BASE.replace('servicio api "API" "Atiende"', 'servicio api "API v2" "Atiende todo"'));
    expect(r.cambiados).toEqual([
      {
        elemento: { kind: 'node', id: 'api' },
        propiedades: [
          { nombre: 'title', clase: 'texto' },
          { nombre: 'description', clase: 'texto' },
        ],
      },
    ]);
  });

  it('un Atributo se identifica por Nodo y name: cambiar su tipo es estructura y sus notas, texto', () => {
    const r = dif(BASE.replace('total: decimal "en centavos"', 'total: integer "en pesos"'));
    expect(r.cambiados).toEqual([
      {
        elemento: { kind: 'attribute', node: 'db', name: 'total' },
        propiedades: [
          { nombre: 'type', clase: 'estructura' },
          { nombre: 'notes', clase: 'texto' },
        ],
      },
    ]);
  });

  it('una Arista se identifica por from, to y ordinal dentro del par: cambiar la etiqueta de la segunda es texto', () => {
    const r = dif(BASE.replace('api -> db "escribe"', 'api -> db "guarda"'));
    expect(r.cambiados).toEqual([{ elemento: { kind: 'edge', from: 'api', to: 'db', ordinal: 1 }, propiedades: [{ nombre: 'label', clase: 'texto' }] }]);
  });

  it('un Mensaje con id se identifica por id; sin id, por Interaccion y posicion; sus extremos son estructura', () => {
    const r = dif(BASE.replace('pedir: api -> db "pedir"', 'pedir: api -> api "pedir"').replace('reply db -> api "ok"', 'reply db -> api "listo"'));
    expect(r.cambiados).toEqual([
      { elemento: { kind: 'message', interaction: 'compra', id: 'pedir', position: 0, path: '0' }, propiedades: [{ nombre: 'to', clase: 'estructura' }] },
      { elemento: { kind: 'message', interaction: 'compra', position: 1, path: '1' }, propiedades: [{ nombre: 'label', clase: 'texto' }] },
    ]);
  });

  it('el Tema de una Vista y sus Pasos son estructura; un Tema se identifica por name', () => {
    const r = dif(BASE.replace('include **', 'include **\n  theme claro').replace('acento "#0ea5e9"', 'acento "#f43f5e"'));
    expect(r.cambiados).toEqual([
      { elemento: { kind: 'view', id: 'general' }, propiedades: [{ nombre: 'theme', clase: 'estructura' }] },
      { elemento: { kind: 'theme', name: 'claro' }, propiedades: [{ nombre: 'palette', clase: 'estructura' }] },
    ]);
  });
});
