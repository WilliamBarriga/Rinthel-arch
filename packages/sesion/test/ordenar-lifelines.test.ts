import { describe, expect, it } from 'vitest';

import { resolveView } from 'canonico';
import { abrirSesion, crearHistorial, deshacer, editarEnHistorial, rehacer } from 'sesion';

import { aplicarEnMemoria } from './ayudas';

const modelo = `specification { node servicio }
model {
  servicio cliente
  servicio sistema {
    servicio api
    servicio db
  }
  servicio cola
  servicio aux
  interaction i {
    cliente -> sistema.api "pedir"
    sistema.api -> sistema.db "consultar"
    sistema.db -> cola "evento"
    cola -> aux "log"
  }
}
`;
const con = (cuerpo: string) => `${modelo}view v {\n  type sequence\n  interaction i\n${cuerpo}}\n`;

const ordenar = (texto: string, orden: string[]) =>
  aplicarEnMemoria({ 'main.dg': texto }, { type: 'reorder-lifelines', view: 'v', order: orden });
const visibles = (texto: string) => resolveView(abrirSesion({ 'main.dg': texto }).fuente!, 'v')!.nodes.map((n) => n.id);

describe('Intencion reorder-lifelines', () => {
  it('sin order previo escribe el orden visible completo', () => {
    const texto = con('');
    const r = ordenar(texto, ['cola', 'cliente', 'sistema.api', 'sistema.db', 'aux']);
    if (!r.ok) throw new Error(r.message);
    expect(r.archivos['main.dg']).toBe(con('  order cola, cliente, sistema.api, sistema.db, aux\n'));
    expect(visibles(r.archivos['main.dg']!)).toEqual(['cola', 'cliente', 'sistema.api', 'sistema.db', 'aux']);
  });

  it('con order parcial lo reemplaza por el completo', () => {
    const texto = con('  order cola, cliente\n');
    const r = ordenar(texto, ['aux', 'cola', 'cliente', 'sistema.api', 'sistema.db']);
    if (!r.ok) throw new Error(r.message);
    expect(r.archivos['main.dg']).toBe(con('  order aux, cola, cliente, sistema.api, sistema.db\n'));
  });

  it('escribe aunque el orden coincida con la primera aparicion', () => {
    const texto = con('');
    const r = ordenar(texto, ['cliente', 'sistema.api', 'sistema.db', 'cola', 'aux']);
    if (!r.ok) throw new Error(r.message);
    expect(r.archivos['main.dg']).toContain('order cliente, sistema.api, sistema.db, cola, aux');
  });

  it('las entradas ocultas por collapsed conservan su posicion relativa', () => {
    const texto = con('  collapsed sistema\n  order cliente, sistema.api, sistema.db, cola\n');
    // Visible: cliente, sistema, cola, aux. Se mueve cola al principio.
    const r = ordenar(texto, ['cola', 'cliente', 'sistema', 'aux']);
    if (!r.ok) throw new Error(r.message);
    // Las hijas ocultas siguen tras su antecesor (cliente); el Grupo visible las sigue en pantalla.
    expect(r.archivos['main.dg']).toContain('order cola, cliente, sistema.api, sistema.db, sistema, aux');
    expect(visibles(r.archivos['main.dg']!)).toEqual(['cola', 'cliente', 'sistema', 'aux']);
  });

  it('las entradas ocultas por exclude conservan su posicion relativa', () => {
    const texto = con('  exclude aux\n  order cliente, aux, cola\n');
    const r = ordenar(texto, ['cola', 'cliente', 'sistema.api', 'sistema.db']);
    if (!r.ok) throw new Error(r.message);
    // aux iba tras cliente: sigue tras cliente.
    expect(r.archivos['main.dg']).toContain('order cola, cliente, aux, sistema.api, sistema.db');
    expect(visibles(r.archivos['main.dg']!)).toEqual(['cola', 'cliente', 'sistema.api', 'sistema.db']);
  });

  it('rechaza un hash viejo, una View not found y un nodo desconocido', () => {
    const texto = con('');
    expect(aplicarEnMemoria({ 'main.dg': texto }, { type: 'reorder-lifelines', view: 'v', order: ['cliente'] }, { 'main.dg': 'viejo' })).toMatchObject({ ok: false, reason: 'stale-hash' });
    expect(aplicarEnMemoria({ 'main.dg': texto }, { type: 'reorder-lifelines', view: 'nada', order: ['cliente'] })).toMatchObject({ ok: false, reason: 'unknown-view' });
    expect(ordenar(texto, ['fantasma'])).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('deshacer restaura el texto exacto y rehacer lo reaplica', () => {
    const texto = con('  order cola, cliente\n');
    const e = editarEnHistorial(crearHistorial({ 'main.dg': texto }), { type: 'reorder-lifelines', view: 'v', order: ['aux', 'cola', 'cliente', 'sistema.api', 'sistema.db'] });
    if (!e.ok) throw new Error(e.message);
    const d = deshacer(e.historial);
    expect(d?.archivos['main.dg']).toBe(texto);
    expect(d && rehacer(d)?.archivos).toEqual(e.historial.archivos);
  });
});
