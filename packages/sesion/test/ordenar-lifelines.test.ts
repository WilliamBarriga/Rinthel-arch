import { describe, expect, it } from 'vitest';

import { resolveView } from 'canonico';
import { abrirSesion, aplicarIntencion, crearHistorial, deshacer, editarEnHistorial, hashDeContenido, rehacer } from 'sesion';

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
  aplicarIntencion({ 'main.dg': texto }, { tipo: 'ordenar-lifelines', vista: 'v', orden, hash: hashDeContenido(texto) });
const visibles = (texto: string) => resolveView(abrirSesion({ 'main.dg': texto }).fuente!, 'v')!.nodes.map((n) => n.id);

describe('Intencion ordenar-lifelines', () => {
  it('sin order previo escribe el orden visible completo', () => {
    const texto = con('');
    const r = ordenar(texto, ['cola', 'cliente', 'sistema.api', 'sistema.db', 'aux']);
    if (!r.ok) throw new Error(r.mensaje);
    expect(r.archivos['main.dg']).toBe(con('  order cola, cliente, sistema.api, sistema.db, aux\n'));
    expect(visibles(r.archivos['main.dg']!)).toEqual(['cola', 'cliente', 'sistema.api', 'sistema.db', 'aux']);
  });

  it('con order parcial lo reemplaza por el completo', () => {
    const texto = con('  order cola, cliente\n');
    const r = ordenar(texto, ['aux', 'cola', 'cliente', 'sistema.api', 'sistema.db']);
    if (!r.ok) throw new Error(r.mensaje);
    expect(r.archivos['main.dg']).toBe(con('  order aux, cola, cliente, sistema.api, sistema.db\n'));
  });

  it('escribe aunque el orden coincida con la primera aparicion', () => {
    const texto = con('');
    const r = ordenar(texto, ['cliente', 'sistema.api', 'sistema.db', 'cola', 'aux']);
    if (!r.ok) throw new Error(r.mensaje);
    expect(r.archivos['main.dg']).toContain('order cliente, sistema.api, sistema.db, cola, aux');
  });

  it('las entradas ocultas por collapsed conservan su posicion relativa', () => {
    const texto = con('  collapsed sistema\n  order cliente, sistema.api, sistema.db, cola\n');
    // Visible: cliente, sistema, cola, aux. Se mueve cola al principio.
    const r = ordenar(texto, ['cola', 'cliente', 'sistema', 'aux']);
    if (!r.ok) throw new Error(r.mensaje);
    // Las hijas ocultas siguen tras su antecesor (cliente); el Grupo visible las sigue en pantalla.
    expect(r.archivos['main.dg']).toContain('order cola, cliente, sistema.api, sistema.db, sistema, aux');
    expect(visibles(r.archivos['main.dg']!)).toEqual(['cola', 'cliente', 'sistema', 'aux']);
  });

  it('las entradas ocultas por exclude conservan su posicion relativa', () => {
    const texto = con('  exclude aux\n  order cliente, aux, cola\n');
    const r = ordenar(texto, ['cola', 'cliente', 'sistema.api', 'sistema.db']);
    if (!r.ok) throw new Error(r.mensaje);
    // aux iba tras cliente: sigue tras cliente.
    expect(r.archivos['main.dg']).toContain('order cola, cliente, aux, sistema.api, sistema.db');
    expect(visibles(r.archivos['main.dg']!)).toEqual(['cola', 'cliente', 'sistema.api', 'sistema.db']);
  });

  it('rechaza un hash viejo, una Vista inexistente y un nodo desconocido', () => {
    const texto = con('');
    expect(aplicarIntencion({ 'main.dg': texto }, { tipo: 'ordenar-lifelines', vista: 'v', orden: ['cliente'], hash: 'viejo' })).toMatchObject({ ok: false, motivo: 'hash-desactualizado' });
    expect(aplicarIntencion({ 'main.dg': texto }, { tipo: 'ordenar-lifelines', vista: 'nada', orden: ['cliente'], hash: hashDeContenido(texto) })).toMatchObject({ ok: false, motivo: 'vista-desconocida' });
    expect(ordenar(texto, ['fantasma'])).toMatchObject({ ok: false, motivo: 'invalida' });
  });

  it('deshacer restaura el texto exacto y rehacer lo reaplica', () => {
    const texto = con('  order cola, cliente\n');
    const e = editarEnHistorial(crearHistorial({ 'main.dg': texto }), { tipo: 'ordenar-lifelines', vista: 'v', orden: ['aux', 'cola', 'cliente', 'sistema.api', 'sistema.db'], hash: hashDeContenido(texto) });
    if (!e.ok) throw new Error(e.mensaje);
    const d = deshacer(e.historial);
    expect(d?.archivos['main.dg']).toBe(texto);
    expect(d && rehacer(d)?.archivos).toEqual(e.historial.archivos);
  });
});
