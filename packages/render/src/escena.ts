/**
 * Escena de una Vista: el arbol de elementos que dibuja el componente `Diagram`.
 * Render hibrido (ADR 0008): bajo ellas, la pagina (fondo del Tema), y tres capas planas en coordenadas absolutas del
 * lienzo, en este orden de apilado (Grupos HTML, Aristas SVG, Nodos HTML), bajo un
 * unico contenedor con un solo `transform` de pan/zoom; asi HTML y SVG quedan
 * alineados a cualquier zoom. Pura: sin reloj, sin estado, sin DOM; la misma
 * entrada da el mismo arbol. Los valores de atributo van sin escapar: React los
 * escapa. Ordena y compone; el aspecto lo dan la hoja de estilo (`hoja.ts`) y los
 * pintores (`pintores.ts`) desde el Estilo resuelto.
 */
import { idDeArista } from 'canonico';
import type { AristaResuelta, IconProvider, NodoResuelto, Tema, VistaResuelta, Visibilidad } from 'canonico';
import { indiceDeGeometria } from 'layout';
import type { CajaDeNodo, Geometria } from 'layout';
import { atributosVisibles, colocarEnCaja, metricasDeHoja } from 'tema';
import type { Metricas } from 'tema';

import { pintarCapasAnimadas } from './animacion';
import { pintarCodigo } from './codigo';
import type { ComponentesDeTema } from './codigo';
import { limpiarValorCss, num } from './elemento';
import type { Elemento } from './elemento';
import { efectosDeElemento } from './efectos';
import { resolverEstilo } from './estilo';
import type { EstadoVisual, Estilo } from './estilo';
import { compilarHoja } from './hoja';
import { pintarArista, pintarControl, pintarEstadoDeCaja, pintarEstadoDeRuta, pintarEtiquetaDeArista, pintarGrupo, pintarNodo } from './pintores';

export type { Elemento } from './elemento';

/** Ventana visible del lienzo, en unidades de la geometria. */
export interface Camara {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Nivel de detalle del texto: `etiqueta` y `titulo` dibujan la etiqueta del Nodo
 * en la Vista (el `label` del override o, si no hay, su titulo; el override se
 * respeta en todos los niveles) y `completo` anade los Atributos. Solo cambia el texto: las
 * cajas, rutas y la camara son identicas en los tres.
 */
export type NivelDeDetalle = 'etiqueta' | 'titulo' | 'completo';

/** Estados visuales por id de elemento (Nodo, Arista o `nodo#atributo`); un elemento puede tener varios. */
export type Estados = Readonly<Record<string, readonly EstadoVisual[]>>;

export interface EntradaDeEscena {
  view: VistaResuelta;
  geometry: Geometria;
  theme: Tema;
  icons?: IconProvider;
  width: number;
  height: number;
  /** Visibilidad 0..1 de Nodos y Aristas; sin ella, todo vale 1. */
  visibility?: Visibilidad;
  camera?: Camara;
  /** Nivel de detalle del texto; sin el, etiqueta de la Vista y Atributos (como `completo` pero con la etiqueta). */
  detail?: NivelDeDetalle;
  onSelect?: (id: string) => void;
  /** Con ella, cada Grupo (o Grupo colapsado sin enlace) lleva un control de colapso. */
  onToggle?: (id: string) => void;
  /** Metricas con las que dibujar; deben ser las del layout. Por defecto las derivadas del Tema. */
  metricas?: Metricas;
  /** Estados visuales (seleccionado, hover, fantasma, en-ruta, atenuado, foco) que se dibujan con el Estilo resuelto; sin ellos, ninguno. */
  estados?: Estados;
  /** Estilo resuelto con el que dibujar; por defecto el del Tema (`resolverEstilo`). */
  estilo?: Estilo;
  /**
   * Interruptor manual de reduced-motion, independiente de la preferencia del sistema:
   * `on` reduce siempre, `off` nunca; sin el, manda `prefers-reduced-motion`.
   */
  reducedMotion?: 'on' | 'off';
  /** Ids recien revelados (un Paso): el `stagger` de `enter` cuenta solo entre ellos; sin ella, entre todos los visibles. */
  nuevos?: readonly string[];
  /**
   * Componentes de Tema (Capa `code`) por nombre: el puerto por el que entra el codigo del Workspace. `render`
   * nunca lo importa; `dev` compila el `.tsx` y las pruebas pasan un registro en memoria. Un nombre sin
   * componente deja su contenedor vacio.
   */
  componentes?: ComponentesDeTema;
}

interface Contexto extends EntradaDeEscena {
  visibility: Visibilidad;
  estilo: Estilo;
  /** Cajas en coordenadas del lienzo (las de la geometria son relativas al Grupo padre). */
  cajas: ReadonlyMap<string, CajaDeNodo>;
  /** Nombre accesible de cada Nodo, sacado solo del Modelo (nunca del Tema). */
  nombres?: ReadonlyMap<string, string>;
  /** Color de Paleta de cada Nodo: el de su Tipo o override; `ORIGEN` de una Arista toma el de su origen. */
  coloresDeNodo: ReadonlyMap<string, string | undefined>;
  /** Posicion de cada Nodo en el escalonado de `enter`; vacio si el Tema no declara `stagger`. */
  escalonado: ReadonlyMap<string, number>;
}

/**
 * Construye la escena. Nodos y Grupos con el Estilo resuelto del Tema (un color es siempre
 * un nombre de Paleta resuelto contra la paleta; sin color, o con un nombre
 * que el Tema no tiene, se usa el borde), y entre ambos las Aristas. Lanza si
 * un Nodo de la Vista no esta en la geometria (geometria de otra Vista) o si el
 * Tema no cumple el contrato.
 */
export function construirEscena(entrada: EntradaDeEscena): Elemento {
  const { view, geometry, theme, width, height, camera } = entrada;
  const estilo = entrada.estilo ?? resolverEstilo(theme, entrada.metricas);
  const { raices, cajas } = indiceDeGeometria(view, geometry);
  const visibility = entrada.visibility ?? (() => 1);
  const coloresDeNodo = new Map(raices.flatMap((raiz) => aplanar(raiz)).map((nodo) => [nodo.id, nodo.color]));
  const contexto: Contexto = { ...entrada, visibility, estilo, cajas, coloresDeNodo, escalonado: posicionesDeEscalonado(raices, visibility, estilo, entrada.nuevos) };
  const vista = camera ?? { x: 0, y: 0, width: geometry.width, height: geometry.height };
  const hoja = compilarHoja(estilo);

  // Mismo encuadre que un `viewBox` con `preserveAspectRatio` por defecto: escala uniforme, centrada.
  const k = Math.min(width / vista.width, height / vista.height);
  const tx = (width - vista.width * k) / 2 - vista.x * k;
  const ty = (height - vista.height * k) / 2 - vista.y * k;
  const nodos = raices.flatMap((nodo) => aplanar(nodo));
  contexto.nombres = nombresAccesibles(view, nodos);

  const { pagina } = estilo.pintura;
  // Fijo al visor: hermana del mundo. Sin fijar: dentro del mundo, con margen para cubrir el visor al alejar o desplazar.
  const fondo = (extra: string): Elemento => ({ tag: 'div', attrs: { class: 'rd-pagina', 'data-capa': 'pagina', ...(extra !== '' && { style: extra }) }, hijos: [] });
  const paginaFija = pagina.capas.length > 0 && pagina.fijo ? [fondo('')] : [];
  const paginaMovil =
    pagina.capas.length > 0 && !pagina.fijo
      ? [fondo(`left:${num(-MARGEN_DE_PAGINA)}px;top:${num(-MARGEN_DE_PAGINA)}px;width:${num(geometry.width + 2 * MARGEN_DE_PAGINA)}px;height:${num(geometry.height + 2 * MARGEN_DE_PAGINA)}px;`)]
      : [];

  return {
    tag: 'div',
    attrs: {
      class: hoja.clase,
      'data-diagram': '',
      'data-camara': `${num(vista.x)} ${num(vista.y)} ${num(vista.width)} ${num(vista.height)}`,
      ...(entrada.reducedMotion !== undefined && { 'data-reduced-motion': entrada.reducedMotion }),
      style: `width:${num(width)}px;height:${num(height)}px;`,
    },
    hijos: [
      { tag: 'style', attrs: {}, html: hoja.css },
      ...paginaFija,
      {
        tag: 'div',
        attrs: {
          class: 'rd-mundo',
          style: `width:${num(geometry.width)}px;height:${num(geometry.height)}px;transform:translate(${num(tx)}px,${num(ty)}px) scale(${num(k)});`,
        },
        hijos: [
          ...paginaMovil,
          { tag: 'div', attrs: { class: 'rd-capa rd-grupos', 'data-capa': 'grupos' }, hijos: nodos.filter(esGrupo).map((nodo) => cajaDeNodo(nodo, contexto)) },
          {
            tag: 'svg',
            attrs: {
              class: 'rd-capa rd-aristas',
              'data-capa': 'aristas',
              xmlns: 'http://www.w3.org/2000/svg',
              width: num(geometry.width),
              height: num(geometry.height),
              viewBox: `0 0 ${num(geometry.width)} ${num(geometry.height)}`,
              'aria-hidden': 'true',
            },
            hijos: [...view.edges.flatMap((arista) => aristaSvg(arista, contexto)), ...view.edges.flatMap((arista) => etiquetaSvg(arista, contexto))],
          },
          { tag: 'div', attrs: { class: 'rd-capa rd-nodos', 'data-capa': 'nodos' }, hijos: nodos.filter((n) => !esGrupo(n)).map((nodo) => cajaDeNodo(nodo, contexto)) },
        ],
      },
    ],
  };
}

/** Cuanto sobresale, en unidades del lienzo, la pagina que se mueve con la camara. */
const MARGEN_DE_PAGINA = 4000;

const esGrupo = (nodo: NodoResuelto): boolean => nodo.children.length > 0;

/**
 * Nombre accesible de cada Nodo (ADR 0008): etiqueta, Tipo y relaciones ("va a" /
 * "viene de", con la etiqueta de la Arista). Sale solo del Modelo: el Tema no puede
 * cambiarlo. El SVG de Aristas es decorativo, asi que la relacion se anuncia aqui.
 */
function nombresAccesibles(view: VistaResuelta, nodos: readonly NodoResuelto[]): Map<string, string> {
  const etiqueta = new Map(nodos.map((n) => [n.id, n.label]));
  const destino = (id: string, arista: AristaResuelta): string => `${etiqueta.get(id) ?? id}${arista.label === undefined ? '' : ` (${arista.label})`}`;
  return new Map(
    nodos.map((nodo) => {
      const sale = view.edges.filter((e) => e.from.node === nodo.id).map((e) => destino(e.to.node, e));
      const entra = view.edges.filter((e) => e.to.node === nodo.id).map((e) => destino(e.from.node, e));
      const partes = [
        nodo.label,
        nodo.type,
        ...(nodo.childCount > 0 ? [`grupo con ${nodo.childCount} hijos${nodo.collapsed ? ', colapsado' : ''}`] : []),
        ...(sale.length > 0 ? [`va a ${sale.join(', ')}`] : []),
        ...(entra.length > 0 ? [`viene de ${entra.join(', ')}`] : []),
      ];
      return [nodo.id, partes.join(', ')];
    }),
  );
}

/**
 * Posicion de cada Nodo visible en el `stagger` de `enter`: en orden de dibujo, entre los
 * `nuevos` si se dan o entre todos los visibles. Vacio sin `stagger` en el Tema.
 */
function posicionesDeEscalonado(raices: readonly NodoResuelto[], visibility: Visibilidad, estilo: Estilo, nuevos?: readonly string[]): Map<string, number> {
  const posiciones = new Map<string, number>();
  if (estilo.pintura.nodo.animacion?.escalonadoMs === undefined) return posiciones;
  const elegidos = nuevos === undefined ? undefined : new Set(nuevos);
  for (const nodo of raices.flatMap((raiz) => aplanar(raiz))) {
    if (acotar(visibility(nodo.id)) > 0 && (elegidos === undefined || elegidos.has(nodo.id))) posiciones.set(nodo.id, posiciones.size);
  }
  return posiciones;
}

/** Nodos en preorden (un Grupo antes que sus hijos): el orden de apilado dentro de cada capa. */
function aplanar(nodo: NodoResuelto): NodoResuelto[] {
  return [nodo, ...nodo.children.flatMap(aplanar)];
}

/** Estilo en linea de la caja de un Nodo/Grupo: su posicion absoluta y tamano (unicos valores que vienen de la geometria). */
function posicion(caja: CajaDeNodo): string {
  return `width:${num(caja.width)}px;height:${num(caja.height)}px;transform:translate(${num(caja.x)}px,${num(caja.y)}px);`;
}

function cajaDeNodo(nodo: NodoResuelto, contexto: Contexto): Elemento {
  const caja = contexto.cajas.get(nodo.id);
  if (caja === undefined) throw new Error(`El Nodo '${nodo.id}' no esta en la geometria`);
  const { estilo, onSelect, onToggle, icons, detail } = contexto;
  const grupo = esGrupo(nodo);
  const trazo = colorDeTrazo(nodo, estilo);
  // El `label` de la Vista (override o, si no hay, el titulo) manda en todos los niveles.
  const texto = nodo.collapsed ? `${nodo.label} (${nodo.childCount})` : nodo.label;
  const datos = { nodo, caja, trazo, texto, icons };
  const conmutable = grupo || (nodo.collapsed && nodo.link === undefined);
  const efectos = efectosDeElemento(estilo, nodo.id);
  const codigo = {
    nodo,
    ancho: caja.width,
    alto: caja.height,
    trazo,
    estados: contexto.estados?.[nodo.id] ?? [],
    tieneContenido: grupo ? nodo.children.length > 0 : tieneFilas(nodo, estilo, detail),
    componentes: contexto.componentes,
  };

  return {
    tag: 'div',
    attrs: { class: 'rd-caja', 'data-id': nodo.id, ...(atenuado(contexto.estados, nodo.id) && { 'data-atenuado': '' }), style: posicion(caja) + efectos.caja },
    hijos: [
      {
        tag: 'div',
        attrs: {
          class: grupo ? 'rd-grupo' : 'rd-nodo',
          'data-part': 'nodo',
          role: 'group',
          'aria-label': contexto.nombres?.get(nodo.id) ?? nodo.label,
          ...(nodo.collapsed && { 'data-collapsed': '' }),
          ...(acotar(contexto.visibility(nodo.id)) === 0 && { 'data-oculto': '' }),
          ...((contexto.estados?.[nodo.id]?.length ?? 0) > 0 && { 'data-estados': (contexto.estados?.[nodo.id] ?? []).join(' ') }),
          style: `--trazo:${limpiarValorCss(trazo)};${contexto.escalonado.has(nodo.id) ? `--rd-n:${contexto.escalonado.get(nodo.id)};` : ''}${opacidad(contexto.visibility(nodo.id))}${efectos.nodo}`,
        },
        ...(onSelect !== undefined && { alClic: () => onSelect(nodo.id) }),
        hijos: [
          ...efectos.debajo,
          ...pintarCapasAnimadas(estilo, false),
          ...pintarCodigo(estilo, codigo, false),
          ...(grupo ? pintarGrupo(estilo, datos) : pintarNodo(estilo, { ...datos, conAtributos: tieneFilas(nodo, estilo, detail) })),
          ...pintarCapasAnimadas(estilo, true),
          ...pintarCodigo(estilo, codigo, true),
          ...(onToggle !== undefined && conmutable ? [pintarControl(estilo, { nodo, caja, alClic: () => onToggle(nodo.id) })] : []),
          ...efectos.encima,
        ],
      },
      ...estadosDeNodo(nodo, caja, contexto),
    ],
  };
}

function estadosDeNodo(nodo: NodoResuelto, caja: CajaDeNodo, { estados, estilo, detail }: Contexto): Elemento[] {
  if (estados === undefined) return [];
  const propios = contornos(estados[nodo.id]).map((e) => pintarEstadoDeCaja(e, nodo.id));
  if (esGrupo(nodo) || !tieneFilas(nodo, estilo, detail)) return propios;
  const metricas = metricasDeHoja(estilo.tabla, nodo);
  const atributos = atributosVisibles(nodo, metricas);
  const rectas = colocarEnCaja(metricas, atributos.length, caja.width).filas;
  const filas = atributos.flatMap((atributo, i) => {
    const id = `${nodo.id}#${atributo.name}`;
    return contornos(estados[id]).map((e) => pintarEstadoDeCaja(e, id, rectas[i]!));
  });
  return [...propios, ...filas];
}

/** `atenuado` no tiene contorno: atenua el elemento entero (marca `data-atenuado`, estilada por la hoja). */
const atenuado = (estados: Estados | undefined, id: string): boolean => estados?.[id]?.includes('atenuado') === true;
const contornos = (lista: readonly EstadoVisual[] | undefined): EstadoVisual[] => (lista ?? []).filter((e) => e !== 'atenuado');

function tieneFilas(nodo: NodoResuelto, estilo: Estilo, detail?: NivelDeDetalle): boolean {
  return (detail === undefined || detail === 'completo') && atributosVisibles(nodo, metricasDeHoja(estilo.tabla, nodo)).length > 0;
}

/** Valor de la Paleta para el color del Nodo; sin color, o desconocido, el borde del Estilo. */
function colorDeTrazo(nodo: NodoResuelto, estilo: Estilo): string {
  return (nodo.color !== undefined ? estilo.paleta[nodo.color] : undefined) ?? estilo.borde;
}

/** Arista con su etiqueta. Una Arista sin ruta en la geometria (ELK no la enruto) se omite. */
function aristaSvg(arista: AristaResuelta, { geometry, estilo, onSelect, visibility, estados, coloresDeNodo }: Contexto): Elemento[] {
  const id = idDeArista(arista);
  const puntos = geometry.edges[id]?.points;
  if (puntos === undefined || puntos.length < 2) return [];
  const v = visibilidadSvg(visibility(id));
  const colorDelOrigen = coloresDeNodo.get(arista.from.node);
  return [
    pintarArista(estilo, {
      id,
      puntos,
      ...(colorDelOrigen !== undefined && { origen: colorDelOrigen }),
      desde: arista.fromCardinality,
      hasta: arista.toCardinality,
      atributos: atenuado(estados, id) ? { ...v, 'data-atenuado': '' } : v,
      extra: contornos(estados?.[id]).map((e) => pintarEstadoDeRuta(estilo, e, id, puntos)),
      ...(onSelect !== undefined && { alClic: () => onSelect(id) }),
    }),
  ];
}

/**
 * Etiqueta de una Arista, en una pasada posterior a todos los trazos para que
 * ningun trazo (de esta ni de otra Arista) la tape. Hereda la visibilidad, el
 * atenuado y el clic de su Arista.
 */
function etiquetaSvg(arista: AristaResuelta, { geometry, estilo, onSelect, visibility, estados }: Contexto): Elemento[] {
  const id = idDeArista(arista);
  const puntos = geometry.edges[id]?.points;
  if (arista.label === undefined || puntos === undefined || puntos.length < 2) return [];
  const v = visibilidadSvg(visibility(id));
  return [
    {
      tag: 'g',
      attrs: { 'data-edge-labels': id, ...(atenuado(estados, id) ? { ...v, 'data-atenuado': '' } : v) },
      ...(onSelect !== undefined && { alClic: () => onSelect(id) }),
      hijos: [pintarEtiquetaDeArista(estilo, { id, texto: arista.label, puntos, caja: geometry.labels[id] })],
    },
  ];
}

/** Visibilidad acotada a [0, 1]; un NaN cuenta como 0. */
function acotar(visibilidad: number): number {
  return Number.isNaN(visibilidad) ? 0 : Math.min(Math.max(visibilidad, 0), 1);
}

/** `opacity` en linea solo si no es 1. Con 0 no recibe clics. */
function opacidad(visibilidad: number): string {
  const valor = acotar(visibilidad);
  if (valor === 1) return '';
  return valor === 0 ? 'opacity:0;pointer-events:none;' : `opacity:${num(valor)};`;
}

/** Lo mismo para un elemento SVG, como atributos. */
function visibilidadSvg(visibilidad: number): Record<string, string> {
  const valor = acotar(visibilidad);
  if (valor === 1) return {};
  return valor === 0 ? { opacity: '0', 'pointer-events': 'none' } : { opacity: num(valor) };
}
