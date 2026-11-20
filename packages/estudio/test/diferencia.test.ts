import { describe, expect, it } from 'vitest';

import type { FuenteCanonica } from 'canonico';
import { abrirSesion } from 'sesion';

import type { DiferenciaDeDev, ElementoDeDiferenciaDeDev } from '../src/protocolo';
import { proyectarDiferencia, unirDiferencia, visitarVista, vencerResaltado, RESALTADO_VACIO } from '../navegador/diferencia/proyeccion';

const DSL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base" {
    servicio tabla "Tabla"
  }
  api -> db.tabla "lee"
  interaction compra "Compra" {
    api -> db "pedir"
  }
}

view general {
  type architecture
  include **
  theme claro
  steps { step "solo api" { show api } }
}

view plegada {
  type architecture
  include **
  collapsed db
}

view secuencia {
  type sequence
  interaction compra
}

theme claro extends neutral {
  palette { acento "#0ea5e9" }
}
`;

const fuente: FuenteCanonica = abrirSesion({ 'main.dg': DSL }).fuente!;

const nodo = (id: string): ElementoDeDiferenciaDeDev => ({ tipo: 'nodo', id });

describe('proyectarDiferencia', () => {
  it('en la Vista activa, lo agregado o cambiado que se ve se resalta; las otras Vistas que lo muestran se marcan en el indice', () => {
    const p = proyectarDiferencia([nodo('api')], fuente, { vista: 'plegada' });
    expect(p.lienzo).toEqual(['api']);
    expect(p.indice).toEqual(['general', 'secuencia']);
  });

  it('un elemento dentro de un Grupo colapsado sube al Grupo, tambien su Arista', () => {
    const p = proyectarDiferencia([nodo('db.tabla'), { tipo: 'arista', from: 'api', to: 'db.tabla', ordinal: 0 }, { tipo: 'atributo', nodo: 'db.tabla', name: 'id' }], fuente, { vista: 'plegada' });
    expect(p.lienzo).toEqual(['db', 'api -> db']);
  });

  it('oculto en el Paso actual no se resalta y la Vista activa se marca en el indice', () => {
    const p = proyectarDiferencia([nodo('db.tabla'), nodo('api')], fuente, { vista: 'general', paso: 1 });
    expect(p.lienzo).toEqual(['api']);
    expect(p.indice).toContain('general');
  });

  it('un Mensaje se resalta en la Vista de secuencia que proyecta su Interaccion', () => {
    const p = proyectarDiferencia([{ tipo: 'mensaje', interaccion: 'compra', posicion: 0, ruta: '0' }], fuente, { vista: 'secuencia' });
    expect(p.lienzo).toEqual(['compra:0']);
    expect(proyectarDiferencia([{ tipo: 'interaccion', id: 'compra' }], fuente, { vista: 'general' }).indice).toEqual(['secuencia']);
  });

  it('un cambio de Tema marca la galeria y, si es el de la Vista activa, lo dice', () => {
    expect(proyectarDiferencia([{ tipo: 'tema', name: 'claro' }], fuente, { vista: 'general' })).toMatchObject({ temas: ['claro'], temaDeLaVista: 'claro' });
    expect(proyectarDiferencia([{ tipo: 'tema', name: 'claro' }], fuente, { vista: 'plegada' })).toMatchObject({ temas: ['claro'], temaDeLaVista: undefined });
  });

  it('una Vista cambiada se marca en el indice salvo que sea la activa', () => {
    expect(proyectarDiferencia([{ tipo: 'vista', id: 'plegada' }, { tipo: 'vista', id: 'general' }], fuente, { vista: 'general' }).indice).toEqual(['plegada']);
  });
});

const diferencia = (version: number, extra: Partial<DiferenciaDeDev> = {}): DiferenciaDeDev => ({ version, origen: 'externo', agregados: [], quitados: [], cambiados: [], ...extra });

describe('resaltado de las Diferencias externas', () => {
  it('las rafagas se unen y cada elemento tocado reinicia su tiempo; al vencer deja de resaltarse', () => {
    let r = unirDiferencia(RESALTADO_VACIO, diferencia(1, { agregados: [nodo('api')] }), { fuente, vista: 'general', ahora: 0, duracionMs: 5000 });
    r = unirDiferencia(r, diferencia(2, { cambiados: [{ elemento: nodo('db'), propiedades: [{ nombre: 'title', clase: 'texto' }] }] }), { fuente, vista: 'general', ahora: 3000, duracionMs: 5000 });
    expect(r.lienzo.map((e) => e.elemento)).toEqual([nodo('api'), nodo('db')]);
    r = vencerResaltado(r, 5000);
    expect(r.lienzo.map((e) => e.elemento)).toEqual([nodo('db')]);
    r = unirDiferencia(r, diferencia(3, { cambiados: [{ elemento: nodo('db'), propiedades: [{ nombre: 'title', clase: 'texto' }] }] }), { fuente, vista: 'general', ahora: 7000, duracionMs: 5000 });
    expect(vencerResaltado(r, 9000).lienzo).toEqual([{ elemento: nodo('db'), hasta: 12000 }]);
  });

  it('lo quitado dura hasta la siguiente Diferencia externa; el indice se limpia al visitar la Vista', () => {
    let r = unirDiferencia(RESALTADO_VACIO, diferencia(1, { quitados: [nodo('cola')], agregados: [nodo('api')] }), { fuente, vista: 'secuencia', ahora: 0, duracionMs: 5000 });
    expect(r.quitados).toEqual([nodo('cola')]);
    expect(r.indice).toEqual(['general', 'plegada']);
    r = visitarVista(r, 'general');
    expect(r.indice).toEqual(['plegada']);
    r = unirDiferencia(r, diferencia(2, { agregados: [nodo('db')] }), { fuente, vista: 'secuencia', ahora: 10, duracionMs: 5000 });
    expect(r.quitados).toEqual([]);
  });
});
