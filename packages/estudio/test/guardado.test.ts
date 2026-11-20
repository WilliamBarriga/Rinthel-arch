import { ChangeSet, Text } from '@codemirror/state';
import { hashDeContenido } from 'canonico';
import { describe, expect, it } from 'vitest';

import type { ResultadoDeEnvio } from '../navegador/cliente';
import { crearGuardador } from '../navegador/editor/guardado';
import type { Fusion } from '../navegador/editor/reconciliacion';
import type { PeticionDeEdiciones } from '../src/protocolo';

const BASE = 'model {\n  servicio api "API"\n  servicio db "Base"\n}\n';

/** Un `dev` minimo: un archivo con su version; rechaza con 409 si la version no es la vigente. */
function discoFalso(texto: string) {
  const disco = { texto, version: 1 };
  const enviados: PeticionDeEdiciones[] = [];
  const fusiones: Fusion[] = [];
  let lecturas = 0;
  let buffer = texto;
  const guardador = crearGuardador({
    file: 'main.dg',
    base: texto,
    version: 1,
    esperaMs: 1_000_000,
    async enviar(peticion): Promise<ResultadoDeEnvio> {
      enviados.push(peticion);
      if (peticion.version !== disco.version) return { ok: false, desactualizado: true, mensaje: 'hash-desactualizado', motivo: 'hash-desactualizado' };
      const doc = Text.of(disco.texto.split('\n'));
      const cambios = ChangeSet.of(
        peticion.ediciones.map((e) => ({ from: doc.line(e.range.start.line).from + e.range.start.column - 1, to: doc.line(e.range.end.line).from + e.range.end.column - 1, insert: e.replacement })),
        disco.texto.length,
      );
      disco.texto = cambios.apply(doc).toString();
      disco.version += 1;
      return { ok: true, version: disco.version };
    },
    async leerDisco() {
      lecturas += 1;
      return { ...disco };
    },
    alReconciliar(fusion) {
      fusiones.push(fusion);
      buffer = fusion.alBuffer.apply(Text.of(buffer.split('\n'))).toString();
    },
  });
  const teclear = (antes: string, despues: string): void => {
    const desde = buffer.indexOf(antes);
    const cambios = ChangeSet.of({ from: desde, to: desde + antes.length, insert: despues }, buffer.length);
    buffer = cambios.apply(Text.of(buffer.split('\n'))).toString();
    guardador.cambiar(cambios);
  };
  const escribirFuera = (nuevo: string): void => {
    disco.texto = nuevo;
    disco.version += 1;
  };
  return { guardador, disco, enviados, fusiones, teclear, escribirFuera, buffer: () => buffer, lecturas: () => lecturas };
}

describe('guardador frente a escrituras externas', () => {
  it('ante 409 mergea con el disco, rebasa las teclas pendientes y reintenta el guardado sobre la version nueva', async () => {
    const f = discoFalso(BASE);
    f.escribirFuera(BASE.replace('"API"', '"API publica"'));
    f.teclear('"Base"', '"Postgres"');
    await f.guardador.guardar();
    expect(f.enviados.map((p) => p.version)).toEqual([1, 2]);
    expect(f.disco.texto).toBe(BASE.replace('"API"', '"API publica"').replace('"Base"', '"Postgres"'));
    expect(f.buffer()).toBe(f.disco.texto);
    expect(f.guardador.estado()).toEqual({ tipo: 'guardado' });
    expect(f.guardador.sucio()).toBe(false);
  });

  it('si solapa gana el disco, se informa el fragmento perdido y no queda nada que guardar', async () => {
    const f = discoFalso(BASE);
    f.escribirFuera(BASE.replace('"Base"', '"MySQL"'));
    f.teclear('"Base"', '"Postgres"');
    await f.guardador.guardar();
    expect(f.disco.texto).toBe(BASE.replace('"Base"', '"MySQL"'));
    expect(f.buffer()).toBe(f.disco.texto);
    expect(f.fusiones.flatMap((x) => x.perdidos)).toEqual([{ texto: '  servicio db "Postgres"', linea: 3, reemplaza: 1 }]);
    expect(f.guardador.sucio()).toBe(false);
  });

  it('el eco de un guardado propio se reconoce por hash: no lee el disco ni toca el buffer', async () => {
    const f = discoFalso(BASE);
    f.teclear('"Base"', '"Postgres"');
    await f.guardador.guardar();
    await f.guardador.sincronizar({ hash: hashDeContenido(f.disco.texto), version: f.disco.version });
    expect(f.lecturas()).toBe(0);
    expect(f.fusiones).toEqual([]);
  });

  it('un cambio externo con el buffer limpio llega al buffer con cambios minimos y no se reenvia', async () => {
    const f = discoFalso(BASE);
    f.escribirFuera(BASE.replace('"API"', '"Gateway"'));
    await f.guardador.sincronizar({ hash: hashDeContenido(f.disco.texto), version: f.disco.version });
    expect(f.buffer()).toBe(f.disco.texto);
    expect(f.fusiones).toHaveLength(1);
    expect(f.enviados).toEqual([]);
    expect(f.guardador.sucio()).toBe(false);
  });

  it('otro archivo que cambia (solo sube la version) actualiza la version base sin leer este', async () => {
    const f = discoFalso(BASE);
    f.disco.version = 5;
    await f.guardador.sincronizar({ hash: hashDeContenido(BASE), version: 5 });
    f.teclear('"Base"', '"Postgres"');
    await f.guardador.guardar();
    expect(f.lecturas()).toBe(0);
    expect(f.enviados.map((p) => p.version)).toEqual([5]);
  });
});
