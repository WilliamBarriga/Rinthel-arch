/**
 * Proyeccion de la Diferencia sobre la pagina, sin DOM: que se resalta en el lienzo de la Vista activa, que Vistas se
 * marcan en el indice y que Temas en la galeria. El navegador no recalcula la Diferencia: la recibe de `dev`.
 * Invariantes: un elemento dentro de un Grupo colapsado sube al Grupo (y su Arista, a la elevada); uno oculto en el Paso
 * actual no se resalta y marca la Vista activa en el indice; fuera de la Vista activa marca las Vistas que lo muestran.
 * El resaltado (`Resaltado`) es un valor: las rafagas se unen y cada elemento tocado reinicia su tiempo; lo quitado
 * dura hasta la siguiente Diferencia externa; el indice se limpia al visitar la Vista; la galeria, al verla.
 */
import { elementKey, edgeId, sequenceElementId, parentOf, resolveView, revealAt } from 'canonical';
import type { CollapseState, CanonicalForm, ResolvedNode, ResolvedView } from 'canonical';

import type { DiferenciaDeDev, ElementoDeDiferenciaDeDev } from '../../src/protocolo';

export interface ContextoDeProyeccion {
  /** Vista activa. */
  vista: string;
  /** Colapso vigente de la Vista activa (el del hash). */
  estado?: CollapseState;
  /** Paso vigente de la Vista activa; sin el no se mira la visibilidad por Pasos. */
  paso?: number;
}

export interface ProyeccionDeDiferencia {
  /** Ids del lienzo (Nodo, Grupo, Arista o Mensaje) que se resaltan, sin repetir. */
  lienzo: string[];
  /** Vistas que se marcan en el indice, en orden de declaracion. */
  indice: string[];
  /** Temas cambiados (agregados o cambiados), para la galeria. */
  temas: string[];
  /** El Tema de la Vista activa, si cambio. */
  temaDeLaVista: string | undefined;
  /** Vistas que toca la Diferencia (la activa incluida), en orden de declaracion. */
  vistas: string[];
}

const visibles = (nodos: readonly ResolvedNode[]): Map<string, ResolvedNode> => {
  const mapa = new Map<string, ResolvedNode>();
  const recorrer = (lista: readonly ResolvedNode[]): void => {
    for (const n of lista) {
      mapa.set(n.id, n);
      recorrer(n.children);
    }
  };
  recorrer(nodos);
  return mapa;
};

/** El Nodo tal como se ve en la Vista: el mismo, o el Grupo colapsado que lo contiene; `undefined` si no se ve. */
function representante(mapa: Map<string, ResolvedNode>, id: string): string | undefined {
  if (mapa.has(id)) return id;
  for (let padre = parentOf(id); padre !== ''; padre = parentOf(padre)) {
    const grupo = mapa.get(padre);
    if (grupo !== undefined) return grupo.collapsed ? grupo.id : undefined;
  }
  return undefined;
}

/** Id del elemento en el lienzo de la Vista resuelta, o `undefined` si no esta en ella. */
function idEnVista(elemento: ElementoDeDiferenciaDeDev, resuelta: ResolvedView): string | undefined {
  const mapa = visibles(resuelta.nodes);
  switch (elemento.kind) {
    case 'node':
      return representante(mapa, elemento.id);
    case 'attribute':
      return representante(mapa, elemento.node);
    case 'edge': {
      if (resuelta.type === 'sequence') return undefined;
      const desde = representante(mapa, elemento.from);
      const hasta = representante(mapa, elemento.to);
      const delPar = resuelta.edges.filter((a) => a.from.node === desde && a.to.node === hasta);
      // Sin elevar, el ordinal es el de la Arista entre esos Nodos; elevada a un Grupo colapsado, todas son la misma.
      const elevada = desde !== elemento.from || hasta !== elemento.to;
      const arista = elevada ? delPar[0] : delPar[elemento.ordinal];
      return arista === undefined ? undefined : edgeId(arista);
    }
    case 'message': {
      if (resuelta.type !== 'sequence' || resuelta.interaction.id !== elemento.interaction) return undefined;
      const mensaje = resuelta.interaction.messages.find((m) => m.path === elemento.path);
      return mensaje === undefined ? undefined : sequenceElementId(elemento.interaction, mensaje.path);
    }
    default:
      return undefined;
  }
}

/** Vistas que muestran el elemento sin estar en el lienzo (Interaccion, Vista); `undefined` si se proyecta por id. */
function vistasSinLienzo(elemento: ElementoDeDiferenciaDeDev, fuente: CanonicalForm): string[] | undefined {
  if (elemento.kind === 'interaction') return fuente.views.filter((v) => v.type === 'sequence' && v.interaction === elemento.id).map((v) => v.id);
  if (elemento.kind === 'view') return fuente.views.some((v) => v.id === elemento.id) ? [elemento.id] : [];
  if (elemento.kind === 'theme') return [];
  return undefined;
}

/**
 * El Tema con el que se dibuja la Vista: el que declara o, sin `theme`, `neutral` (el primero de la Fuente si no esta).
 * La Fuente trae los Temas ya resueltos (cadena `extends` aplanada): un cambio en un padre llega como cambio del hijo.
 */
const temaEfectivo = (fuente: CanonicalForm, vista: string): string | undefined => {
  const declarado = fuente.views.find((v) => v.id === vista)?.theme ?? 'neutral';
  return fuente.themes.some((t) => t.name === declarado) ? declarado : fuente.themes[0]?.name;
};

/** `elementos`: lo agregado y lo cambiado (lo quitado no se proyecta: se lista). */
export function proyectarDiferencia(elementos: readonly ElementoDeDiferenciaDeDev[], fuente: CanonicalForm, contexto: ContextoDeProyeccion): ProyeccionDeDiferencia {
  const { vista: activa, estado, paso } = contexto;
  const resueltas = new Map<string, ResolvedView | undefined>();
  const resolver = (vista: string): ResolvedView | undefined => {
    if (!resueltas.has(vista)) resueltas.set(vista, resolveView(fuente, vista, vista === activa ? estado : undefined));
    return resueltas.get(vista);
  };
  const activaResuelta = resolver(activa);
  const visibilidad = activaResuelta === undefined || paso === undefined ? undefined : revealAt(activaResuelta, paso);

  const lienzo = new Set<string>();
  const tocadas = new Set<string>();
  const marcadas = new Set<string>();
  const temas = new Set<string>();
  for (const elemento of elementos) {
    if (elemento.kind === 'theme') temas.add(elemento.name);
    const sinLienzo = vistasSinLienzo(elemento, fuente);
    if (sinLienzo !== undefined) {
      for (const v of sinLienzo) {
        tocadas.add(v);
        if (v !== activa) marcadas.add(v);
      }
      continue;
    }
    for (const { id: vista } of fuente.views) {
      const resuelta = resolver(vista);
      const id = resuelta === undefined ? undefined : idEnVista(elemento, resuelta);
      if (id === undefined) continue;
      tocadas.add(vista);
      if (vista !== activa) marcadas.add(vista);
      else if (visibilidad !== undefined && visibilidad(id) === 0) marcadas.add(vista);
      else lienzo.add(id);
    }
  }
  const enOrden = (conjunto: Set<string>): string[] => fuente.views.map((v) => v.id).filter((v) => conjunto.has(v));
  const temaActivo = temaEfectivo(fuente, activa);
  return { lienzo: [...lienzo], indice: enOrden(marcadas), temas: [...temas], temaDeLaVista: temaActivo !== undefined && temas.has(temaActivo) ? temaActivo : undefined, vistas: enOrden(tocadas) };
}

/** Lo agregado y lo cambiado de una Diferencia: lo que se proyecta. */
export const tocadosDe = (diferencia: Pick<DiferenciaDeDev, 'agregados' | 'cambiados'>): ElementoDeDiferenciaDeDev[] => [...diferencia.agregados, ...diferencia.cambiados.map((c) => c.elemento)];

/** Lo que la pagina recuerda de las Diferencias externas. */
export interface Resaltado {
  /** Elementos resaltados en el lienzo y hasta cuando (ms); se proyectan sobre la Vista activa al dibujar. */
  lienzo: { elemento: ElementoDeDiferenciaDeDev; hasta: number }[];
  /** Vistas marcadas en el indice hasta visitarlas. */
  indice: string[];
  /** Temas marcados en la galeria hasta verla. */
  temas: string[];
  /** Lo quitado por la ultima Diferencia externa. */
  quitados: ElementoDeDiferenciaDeDev[];
  /** Tema de la Vista activa que cambio la ultima Diferencia unida (para avisar en el marco). */
  temaDeLaVista?: string;
}

export const RESALTADO_VACIO: Resaltado = { lienzo: [], indice: [], temas: [], quitados: [] };

/** Duracion por defecto del resaltado en el lienzo (la fija el chrome, no el contrato). */
export const DURACION_DEL_RESALTADO_MS = 5000;

/** Une una Diferencia externa: cada elemento tocado reinicia su tiempo, el indice y la galeria acumulan, lo quitado se reemplaza. */
export function unirDiferencia(resaltado: Resaltado, diferencia: DiferenciaDeDev, opciones: ContextoDeProyeccion & { fuente: CanonicalForm; ahora: number; duracionMs: number }): Resaltado {
  const { fuente, ahora, duracionMs, ...contexto } = opciones;
  const tocados = tocadosDe(diferencia);
  const p = proyectarDiferencia(tocados, fuente, contexto);
  const nuevos = new Map(tocados.filter((e) => e.kind !== 'theme' && e.kind !== 'view' && e.kind !== 'interaction').map((e) => [elementKey(e), e]));
  const sinRenovar = resaltado.lienzo.filter(({ elemento }) => !nuevos.has(elementKey(elemento)));
  const sinRepetir = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])];
  const { temaDeLaVista: _anterior, ...resto } = resaltado;
  return {
    ...resto,
    lienzo: [...sinRenovar, ...[...nuevos.values()].map((elemento) => ({ elemento, hasta: ahora + duracionMs }))],
    indice: sinRepetir(resaltado.indice, p.indice),
    temas: sinRepetir(resaltado.temas, p.temas),
    quitados: diferencia.quitados,
    ...(p.temaDeLaVista !== undefined && { temaDeLaVista: p.temaDeLaVista }),
  };
}

/** Quita del lienzo lo que vencio en `ahora`. */
export function vencerResaltado(resaltado: Resaltado, ahora: number): Resaltado {
  const lienzo = resaltado.lienzo.filter((e) => e.hasta > ahora);
  return lienzo.length === resaltado.lienzo.length ? resaltado : { ...resaltado, lienzo };
}

/** Visitar una Vista quita su marca del indice. */
export function visitarVista(resaltado: Resaltado, vista: string): Resaltado {
  return resaltado.indice.includes(vista) ? { ...resaltado, indice: resaltado.indice.filter((v) => v !== vista) } : resaltado;
}

/** Ver la galeria quita las marcas de los Temas. */
export const verGaleria = (resaltado: Resaltado): Resaltado => (resaltado.temas.length === 0 ? resaltado : { ...resaltado, temas: [] });
