/**
 * Elementos de Tema de secuencia y ER descritos (`inspect theme`). Un declarado sale tal como lo escribe el Tema
 * (colores como nombre de Paleta); uno no declarado solo sale en su Tipo de diagrama, derivado y marcado `derivado`.
 */
import type { Theme } from 'canonical';

import { estiloResuelto } from './estilo';
import type { CapaPintada, PinturaDeActivacion, PinturaDeCajaDeSecuencia, PinturaDeSecuencia, PrimitivaPintada, TrazosDeSecuencia } from './estilo';
import { aplicarOps } from './parches';
import type { CapaDeTema, TipoDeDiagrama } from './parches';
import { BLOQUES_DE_SECUENCIA, ESPECIFICACION_DE_SECUENCIA } from './secuencia';
import type { BloqueDeSecuencia } from './secuencia';
import { resolverTema, temaParaDiagrama } from './tema';

export interface CapaDescrita {
  nombre: string;
  primitiva: string;
  props: Record<string, number | string>;
  encima: boolean;
  animada: boolean;
}

export interface ElementoDescrito {
  capas: CapaDescrita[];
  marcadores: Partial<Record<'start' | 'end', string>>;
  parches: Record<string, CapaDescrita[]>;
  metricas: Record<string, number>;
  derivado?: true;
}

export interface ElementosDescritos {
  secuencia?: Partial<Record<BloqueDeSecuencia, ElementoDescrito>>;
  fila?: { alto?: number; capas: CapaDescrita[]; derivado?: true };
}

const EN_LA_PINTURA: Record<BloqueDeSecuencia, keyof PinturaDeSecuencia> = { lifeline: 'lifeline', message: 'mensaje', activation: 'activacion', fragment: 'fragmento', note: 'nota' };

const deTema = (capa: CapaDeTema): CapaDescrita => ({ nombre: capa.nombre, primitiva: capa.primitiva.tipo, props: capa.primitiva.props, encima: capa.encima === true, animada: capa.animacion !== undefined });
const pintada = (capa: CapaPintada): CapaDescrita => ({ nombre: capa.nombre, primitiva: capa.tipo, props: capa.props, encima: capa.encima === true, animada: capa.animacion !== undefined });
const marcadoresDe = (origen: { tipo: string } | undefined, fin: { tipo: string } | undefined): ElementoDescrito['marcadores'] => ({
  ...(origen !== undefined && { start: origen.tipo }),
  ...(fin !== undefined && { end: fin.tipo }),
});

/** `tipo` elige la pila de la activacion del Nodo de ese Tipo. */
function derivado(nombre: BloqueDeSecuencia, pintura: PinturaDeSecuencia, tipo: string | undefined): ElementoDescrito {
  const metricas = Object.fromEntries(Object.entries(ESPECIFICACION_DE_SECUENCIA[nombre].metricas).map(([clave, m]) => [clave, m.defecto]));
  const elemento = pintura[EN_LA_PINTURA[nombre]];
  if ('base' in elemento) {
    const { base } = elemento as TrazosDeSecuencia;
    const variantes: Record<string, { capas: CapaPintada[]; origen?: PrimitivaPintada; fin?: PrimitivaPintada }> = nombre === 'message' ? base.tipos : base.variantes;
    return { capas: base.capas.map(pintada), marcadores: marcadoresDe(base.origen, base.fin), parches: Object.fromEntries(Object.entries(variantes).map(([v, t]) => [v, t.capas.map(pintada)])), metricas, derivado: true };
  }
  const caja = elemento as PinturaDeCajaDeSecuencia & Pick<PinturaDeActivacion, 'porNodo'>;
  const capas = (tipo === undefined ? undefined : caja.porNodo?.nodo.tipos[tipo]?.capas) ?? caja.capas;
  return { capas: capas.map(pintada), marcadores: {}, parches: Object.fromEntries(Object.entries(caja.variantes).map(([v, c]) => [v, c.map(pintada)])), metricas, derivado: true };
}

/** Los declarados llevan los parches de `diagrama`; `tipo` es el Tipo de Nodo de la activacion derivada. */
export function elementosDeTema(tema: Theme, diagrama: TipoDeDiagrama | undefined, tipo?: string): ElementosDescritos {
  const resuelto = temaParaDiagrama(resolverTema(tema), diagrama);
  const pinturaDerivada = diagrama === 'sequence' ? estiloResuelto(tema, { diagrama }).pintura.secuencia : undefined;
  const secuencia = Object.fromEntries(
    BLOQUES_DE_SECUENCIA.flatMap((nombre): Array<[BloqueDeSecuencia, ElementoDescrito]> => {
      const bloque = resuelto.secuencia?.[nombre];
      if (bloque === undefined) return pinturaDerivada === undefined ? [] : [[nombre, derivado(nombre, pinturaDerivada, tipo)]];
      const base = bloque.capas as CapaDeTema[];
      const parches = Object.entries(bloque.parches).map(([variante, parche]) => [variante, aplicarOps(base, parche.ops, resuelto.palette, 'parchear', ESPECIFICACION_DE_SECUENCIA[nombre].capas).pila.map(deTema)]);
      return [[nombre, { capas: base.map(deTema), marcadores: marcadoresDe(bloque.origen, bloque.fin), parches: Object.fromEntries(parches), metricas: bloque.metricas }]];
    }),
  );
  const fila: ElementosDescritos['fila'] =
    resuelto.fila !== undefined
      ? { ...(resuelto.fila.alto !== undefined && { alto: resuelto.fila.alto }), capas: (resuelto.fila.capas as CapaDeTema[]).map(deTema) }
      : diagrama === 'er'
        ? { capas: (estiloResuelto(tema, { diagrama }).pintura.fila?.base ?? []).map(pintada), derivado: true }
        : undefined;
  return { ...(Object.keys(secuencia).length > 0 && { secuencia }), ...(fila !== undefined && { fila }) };
}
