/** Bloque `slots` de un Tema: disposicion validada por `construirDisposicion` de `tema` y estilo de cada Slot. */
import { DEFINICION_DE_SLOT, construirDisposicion } from 'tema';
import type { CajaDeSlots, ElementoDeTema, NombreDeSlot, EntradaDeCaja, EntradaDeSlot, ErrorDeCatalogo, Primitiva, PropiedadEscrita } from 'tema';

import type { LayerProp, SlotBox, SlotEntry, ThemeSlots } from './generated/ast';
import { aRango, rangoDe } from './posiciones';
import { aIssue, inicioDePropiedad, propiedadDeClave, propiedadesResueltas, primitivaSuelta } from './temas-comun';
import type { Contexto } from './temas-comun';

type Hijo = SlotBox | SlotEntry;
type Origen = ThemeSlots | SlotBox | SlotEntry | LayerProp;

const esCaja = (hijo: Hijo): hijo is SlotBox => hijo.$type === 'SlotBox';

/** La propiedad culpable (clave o valor segun el error) o, si no hay, el elemento. */
function sitio(origen: Origen, error: ErrorDeCatalogo): { line: number; column: number } {
  if (origen.$type === 'LayerProp') return inicioDePropiedad(origen, error);
  const propiedad = origen.$type === 'SlotEntry' ? 'name' : 'direction';
  const rango = rangoDe(origen, propiedad);
  // `slots { ... }` sin direccion escrita: se situa en el inicio del bloque.
  return rango.start.line === 1 && rango.start.column === 1 && origen.$cstNode !== undefined ? aRango(origen.$cstNode.range).start : rango.start;
}

/** El Nodo, la cabecera del Grupo o el Grupo cerrado. */
export interface DestinoDeSlots {
  slots?: CajaDeSlots | undefined;
  textos?: Partial<Record<NombreDeSlot, Primitiva>> | undefined;
}

/** Los errores quedan en `ctx.issues`. */
export function compilarSlots(item: ThemeSlots, destino: DestinoDeSlots, ctx: Contexto, elemento: ElementoDeTema = 'nodo'): void {
  const errores: Array<{ error: ErrorDeCatalogo; origen: Origen }> = [];
  const props = (lista: readonly LayerProp[]): Array<PropiedadEscrita<Origen>> => {
    const resueltas = propiedadesResueltas(lista, ctx.tokens);
    for (const error of resueltas.errores) errores.push({ error, origen: (error.clave === undefined ? undefined : propiedadDeClave(lista, error.clave)) ?? item });
    return resueltas.props;
  };
  const caja = (nodo: ThemeSlots | SlotBox): EntradaDeCaja<Origen> => ({
    ref: nodo,
    direccion: nodo.direction ?? 'column',
    props: props(nodo.props),
    hijos: nodo.children.map((hijo): EntradaDeCaja<Origen> | EntradaDeSlot<Origen> => {
      if (esCaja(hijo)) return caja(hijo);
      const align = hijo.props.find((p) => p.key === 'align');
      return { ref: hijo, slot: hijo.name, ...(align !== undefined && { align: { clave: 'align', valor: align.value, ref: align } }) };
    }),
  });
  const { disposicion, errores: delArbol } = construirDisposicion(caja(item), elemento);
  for (const { ref, ...error } of delArbol) errores.push({ error, origen: ref });
  for (const { error, origen } of errores) ctx.issues.push(aIssue(ctx.archivo, error, sitio(origen, error)));
  if (disposicion === undefined || errores.length > 0) return;

  destino.slots = disposicion;
  const entradas = hojas(item.children);
  const textos: NonNullable<DestinoDeSlots['textos']> = Object.fromEntries(Object.entries(destino.textos ?? {}).filter(([slot]) => entradas.some((e) => e.name === slot)));
  destino.textos = textos;
  for (const entrada of entradas) {
    const propias = entrada.props.filter((p) => p.key !== 'align');
    if (propias.length === 0 || !Object.hasOwn(DEFINICION_DE_SLOT, entrada.name)) continue;
    const estilo = primitivaSuelta(DEFINICION_DE_SLOT[entrada.name as NombreDeSlot].estilo, propias, 'texto-slot', ctx, rangoDe(entrada, 'name').start);
    if (estilo !== undefined) textos[entrada.name as NombreDeSlot] = estilo;
  }
}

const hojas = (hijos: readonly Hijo[]): SlotEntry[] => hijos.flatMap((hijo) => (esCaja(hijo) ? hojas(hijo.children) : [hijo]));
