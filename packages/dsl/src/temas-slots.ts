/**
 * Compilacion del bloque `slots` de un Tema (ADR 0008): traduce el arbol del
 * AST (cajas `row`/`column` anidables, Slots con `align` y estilo) a la
 * disposicion que valida `tema` (`construirDisposicion`) y deja el estilo de
 * cada Slot (Primitiva `text` o `icon`) en `nodo.textos`. Solo traduce y situa
 * los errores; las reglas son del catalogo.
 */
import { CODIGOS } from 'canonico';
import { DEFINICION_DE_SLOT, construirDisposicion, resolverTokens } from 'tema';
import type { NombreDeSlot, EntradaDeCaja, EntradaDeSlot, ErrorDeCatalogo, Primitiva, PropiedadEscrita, TemaResuelto } from 'tema';

import type { LayerProp, SlotBox, SlotEntry, ThemeSlots } from './generated/ast';
import { aRango, rangoDe } from './posiciones';
import { aIssue, primitivaSuelta } from './temas-arista';
import type { Contexto } from './temas-arista';

type Hijo = SlotBox | SlotEntry;
type Origen = ThemeSlots | SlotBox | SlotEntry | LayerProp;

const esCaja = (hijo: Hijo): hijo is SlotBox => hijo.$type === 'SlotBox';

/** Posicion donde situar un error: la propiedad culpable (clave o valor segun el error) o el elemento. */
function sitio(origen: Origen, error: ErrorDeCatalogo): { line: number; column: number } {
  if (origen.$type === 'LayerProp') return rangoDe(origen, error.codigo === CODIGOS.E_THEME_UNKNOWN_PROPERTY ? 'key' : 'value').start;
  const propiedad = origen.$type === 'SlotEntry' ? 'name' : 'direction';
  const rango = rangoDe(origen, propiedad);
  // `slots { ... }` sin direccion escrita: se situa en el inicio del bloque.
  return rango.start.line === 1 && rango.start.column === 1 && origen.$cstNode !== undefined ? aRango(origen.$cstNode.range).start : rango.start;
}

/** Aplica un bloque `slots { ... }` sobre `tema.nodo`: disposicion y estilo de cada Slot. Los errores quedan en `ctx.issues`. */
export function compilarSlots(item: ThemeSlots, tema: TemaResuelto, ctx: Contexto): void {
  const errores: Array<{ error: ErrorDeCatalogo; origen: Origen }> = [];
  const props = (lista: readonly LayerProp[]): Array<PropiedadEscrita<Origen>> => {
    const resueltas = resolverTokens(lista.map(({ key, value }) => ({ clave: key, valor: value })), ctx.tokens);
    for (const error of resueltas.errores) errores.push({ error, origen: lista.find((p) => p.key === error.clave) ?? item });
    return resueltas.props.flatMap(({ clave, valor }) => {
      const prop = lista.find((p) => p.key === clave);
      return prop === undefined ? [] : [{ clave, valor, ref: prop }];
    });
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
  const { disposicion, errores: delArbol } = construirDisposicion(caja(item));
  for (const { ref, ...error } of delArbol) errores.push({ error, origen: ref });
  for (const { error, origen } of errores) ctx.issues.push(aIssue(ctx.archivo, error, sitio(origen, error)));
  if (disposicion === undefined || errores.length > 0) return;

  tema.nodo.slots = disposicion;
  const entradas = hojas(item.children);
  tema.nodo.textos = Object.fromEntries(Object.entries(tema.nodo.textos).filter(([slot]) => entradas.some((e) => e.name === slot)));
  for (const entrada of entradas) {
    const propias = entrada.props.filter((p) => p.key !== 'align');
    if (propias.length === 0 || !Object.hasOwn(DEFINICION_DE_SLOT, entrada.name)) continue;
    const estilo = primitivaSuelta(DEFINICION_DE_SLOT[entrada.name as NombreDeSlot].estilo, propias, 'texto-slot', ctx, rangoDe(entrada, 'name').start);
    if (estilo !== undefined) (tema.nodo.textos as Record<string, Primitiva>)[entrada.name] = estilo;
  }
}

/** Los Slots (hojas) del arbol, en orden. */
const hojas = (hijos: readonly Hijo[]): SlotEntry[] => hijos.flatMap((hijo) => (esCaja(hijo) ? hojas(hijo.children) : [hijo]));
