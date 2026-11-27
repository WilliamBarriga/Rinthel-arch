/**
 * Escena de una Vista: el arbol de elementos que dibuja `Diagram`. Sobre la pagina, tres capas planas en coordenadas
 * absolutas (Grupos HTML, Aristas SVG, Nodos HTML) bajo un solo `transform` de pan/zoom, asi HTML y SVG quedan alineados
 * a cualquier zoom. Pura: la misma entrada da el mismo arbol. Los valores de atributo van sin escapar: React los escapa.
 */
import { edgeId, sequenceElementId } from 'canonical';
import type { ResolvedEdge, NodeBox, Geometry, GraphGeometry, IconProvider, ResolvedNode, Theme, Visibility, GraphView, ResolvedView } from 'canonical';
import { indiceDeGeometria } from 'layout';
import { STATES, visibleAttributes, placeInBox, nodeContent, leafMetrics } from 'theme';
import type { Metrics } from 'theme';

import { pintarCapasAnimadas } from './animacion';
import { filtrosDeTrazo } from './aristas';
import { pintarCodigo } from './codigo';
import type { ComponentesDeTema } from './codigo';
import { limpiarValorCss, num } from './elemento';
import type { Elemento } from './elemento';
import { efectosDeElemento } from './efectos';
import { resolverEstilo } from './estilo';
import type { EstadoVisual, Estilo } from './estilo';
import { compilarHoja } from './hoja';
import { ELEMENTOS, pilaDeNodo, pinturaDeElemento } from './pilas';
import { construirEscenaDeSecuencia } from './secuencia';
import { pintarArista, pintarControl, pintarEstadoDeCaja, pintarEstadoDeRuta, pintarEtiquetaDeArista, pintarGrupo, pintarNodo, pintarZonas } from './pintores';

export type { Elemento } from './elemento';

/** Ventana visible del lienzo, en unidades de la geometria. */
export interface Camara {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Todos los niveles dibujan el `label` de la Vista; `completo` anade los Atributos. Cajas, rutas y camara no cambian. */
export type NivelDeDetalle = 'etiqueta' | 'titulo' | 'completo';

/** Estados visuales por id de elemento (Nodo, Arista o `nodo#atributo`); un elemento puede tener varios. */
export type Estados = Readonly<Record<string, readonly EstadoVisual[]>>;

export interface EntradaDeEscena {
  /** Vista ya resuelta con su colapso (`resolveView`); render no guarda estado de colapso. */
  view: ResolvedView;
  geometry: Geometry;
  theme: Theme;
  icons?: IconProvider;
  width: number;
  height: number;
  /** Visibilidad 0..1 de Nodos y Aristas; sin ella, todo vale 1. */
  visibility?: Visibility;
  camera?: Camara;
  /** Sin el, como `completo`. */
  detail?: NivelDeDetalle;
  onSelect?: (id: string) => void;
  /** Con ella, cada Grupo (o Grupo colapsado sin enlace) lleva un control de colapso; solo avisa, el colapso llega en `view`. */
  onToggle?: (id: string) => void;
  /** Metricas con las que dibujar; deben ser las del layout. Por defecto las derivadas del Tema. */
  metricas?: Metrics;
  /**
   * Estados visuales por id; un id no dibujado se ignora. `dimmed` baja la opacidad sin contorno y el anillo de `focus`
   * no baja de `ANILLO_DE_FOCO_MINIMO` px.
   */
  estados?: Estados;
  /** Estilo resuelto con el que dibujar; por defecto el del Tema (`resolverEstilo`). */
  estilo?: Estilo;
  /** URL de un archivo de fuente del Workspace; con ella el dibujo declara los `@font-face` de `estilo.caras`. */
  urlDeFuente?: (ruta: string) => string;
  /** Reduced-motion: `on` reduce siempre, `off` nunca; sin el, manda `prefers-reduced-motion`. */
  reducedMotion?: 'on' | 'off';
  /** Ids recien revelados (un Paso): el `stagger` de `enter` cuenta solo entre ellos; sin ella, entre todos los visibles. */
  nuevos?: readonly string[];
  /** Componentes de Tema (Capa `code`) por nombre. Un nombre sin componente deja su contenedor vacio; uno que lanza solo pierde su Capa. */
  componentes?: ComponentesDeTema;
}

export interface Contexto extends EntradaDeEscena {
  visibility: Visibility;
  estilo: Estilo;
  /** Cajas en coordenadas del lienzo (las de la geometria son relativas al Grupo padre). */
  cajas: ReadonlyMap<string, NodeBox>;
  /** Nombre accesible de cada Nodo, sacado solo del Modelo (nunca del Tema). */
  nombres?: ReadonlyMap<string, string>;
  /** Color de Paleta de cada Nodo: el de su Tipo o override; `ORIGIN` de una Arista toma el de su origen. */
  coloresDeNodo: ReadonlyMap<string, string | undefined>;
  /** Posicion de cada Nodo en el escalonado de `enter`; vacio si el Tema no declara `stagger`. */
  escalonado: ReadonlyMap<string, number>;
}

type ContextoDeGrafo = Contexto & { view: GraphView; geometry: GraphGeometry };

/**
 * Lanza si un Nodo de la Vista is not in the geometry, si la Geometria es de otro Tipo de diagrama que la Vista o si
 * el Tema no cumple el contrato.
 */
export function construirEscena(dada: EntradaDeEscena): Elemento {
  const entrada = conPlaneados(dada);
  const { view, geometry } = entrada;
  switch (view.type) {
    case 'sequence':
      if (geometry.kind !== 'secuencia') throw new Error(`construirEscena: the View is a sequence and the Geometry is '${geometry.kind}'`);
      return construirEscenaDeSecuencia({ ...entrada, view, geometry });
    case 'architecture':
    case 'flow':
    case 'er':
      if (geometry.kind !== 'grafo') throw new Error(`construirEscena: the View is '${view.type}' and the Geometry is '${geometry.kind}'`);
      return construirEscenaDeGrafo({ ...entrada, view, geometry });
  }
}

/**
 * Lo Planeado del Modelo (ADR 0011, ya heredado en la Vista resuelta) es un estado visual mas: `planned` va delante de
 * los estados del llamador en cada Nodo, Arista, Mensaje y Atributo marcado (este, solo con su marca propia).
 */
function conPlaneados(entrada: EntradaDeEscena): EntradaDeEscena {
  const { view } = entrada;
  const ids = [
    ...view.nodes.filter((nodo) => nodo.planned === true).map((nodo) => nodo.id),
    ...view.nodes.flatMap((nodo) => nodo.attributes.filter((atributo) => atributo.planned === true).map((atributo) => `${nodo.id}#${atributo.name}`)),
    ...(view.type === 'sequence'
      ? view.interaction.messages.filter((mensaje) => mensaje.planned === true).map((mensaje) => sequenceElementId(view.interaction.id, mensaje.path))
      : view.edges.filter((arista) => arista.planned === true).map(edgeId)),
  ];
  if (ids.length === 0) return entrada;
  const estados: Record<string, readonly EstadoVisual[]> = { ...entrada.estados };
  for (const id of ids) estados[id] = ['planned', ...(estados[id] ?? []).filter((estado) => estado !== 'planned')];
  return { ...entrada, estados };
}

function construirEscenaDeGrafo(entrada: EntradaDeEscena & { view: GraphView; geometry: GraphGeometry }): Elemento {
  const { view, geometry, theme } = entrada;
  const estilo = entrada.estilo ?? resolverEstilo(theme, entrada.view.type, entrada.metricas);
  const { raices, cajas } = indiceDeGeometria(view, geometry);
  const visibility = entrada.visibility ?? (() => 1);
  const coloresDeNodo = new Map(raices.flatMap((raiz) => aplanar(raiz)).map((nodo) => [nodo.id, nodo.color]));
  const contexto: ContextoDeGrafo = { ...entrada, visibility, estilo, cajas, coloresDeNodo, escalonado: posicionesDeEscalonado(raices, visibility, estilo, entrada.nuevos) };
  const nodos = raices.flatMap((nodo) => aplanar(nodo));
  contexto.nombres = nombresAccesibles(view.edges, nodos);

  return marcoDeEscena(entrada, estilo, [
    { tag: 'div', attrs: { class: 'rd-capa rd-grupos', 'data-capa': 'grupos' }, hijos: nodos.filter(esGrupo).map((nodo) => cajaDeNodo(nodo, contexto)) },
    capaSvg('aristas', geometry, [
      ...filtrosDeTrazo(estilo, geometry.width, geometry.height),
      ...view.edges.flatMap((arista) => aristaSvg(arista, contexto)),
      ...view.edges.flatMap((arista) => etiquetaSvg(arista, contexto)),
    ]),
    { tag: 'div', attrs: { class: 'rd-capa rd-nodos', 'data-capa': 'nodos' }, hijos: nodos.filter((n) => !esGrupo(n)).map((nodo) => cajaDeNodo(nodo, contexto)) },
  ]);
}

/** Capa SVG de trazos (Aristas, o Lifelines y Mensajes) a tamano de la geometria. */
export function capaSvg(capa: string, geometry: { width: number; height: number }, hijos: Elemento[]): Elemento {
  return {
    tag: 'svg',
    attrs: {
      class: 'rd-capa rd-aristas',
      'data-capa': capa,
      xmlns: 'http://www.w3.org/2000/svg',
      width: num(geometry.width),
      height: num(geometry.height),
      viewBox: `0 0 ${num(geometry.width)} ${num(geometry.height)}`,
      'aria-hidden': 'true',
    },
    hijos,
  };
}

/**
 * Marco comun de toda escena: contenedor `[data-diagram]` con hoja de estilo, fondo de pagina y el mundo con la
 * camara (un solo `transform`), que lleva las `capas` en orden de apilado.
 */
export function marcoDeEscena(entrada: EntradaDeEscena, estilo: Estilo, capas: Elemento[]): Elemento {
  const { geometry, width, height, camera } = entrada;
  const vista = camera ?? { x: 0, y: 0, width: geometry.width, height: geometry.height };
  const hoja = compilarHoja(estilo, entrada.urlDeFuente);

  // Mismo encuadre que un `viewBox` con `preserveAspectRatio` por defecto: escala uniforme, centrada.
  const k = Math.min(width / vista.width, height / vista.height);
  const tx = (width - vista.width * k) / 2 - vista.x * k;
  const ty = (height - vista.height * k) / 2 - vista.y * k;

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
        hijos: [...paginaMovil, ...capas],
      },
    ],
  };
}

/** Cuanto sobresale, en unidades del lienzo, la pagina que se mueve con la camara. */
const MARGEN_DE_PAGINA = 4000;

const esGrupo = (nodo: ResolvedNode): boolean => nodo.children.length > 0;

/**
 * Nombre accesible de cada Nodo: etiqueta, Tipo y relaciones ("va a" / "viene de"). Sale solo del Modelo, nunca del
 * Tema; el SVG de Aristas es decorativo, asi que la relacion se anuncia aqui.
 */
export function nombresAccesibles(aristas: readonly ResolvedEdge[], nodos: readonly ResolvedNode[]): Map<string, string> {
  const etiqueta = new Map(nodos.map((n) => [n.id, n.label]));
  const destino = (id: string, arista: ResolvedEdge): string => `${etiqueta.get(id) ?? id}${arista.label === undefined ? '' : ` (${arista.label})`}`;
  return new Map(
    nodos.map((nodo) => {
      const sale = aristas.filter((e) => e.from.node === nodo.id).map((e) => destino(e.to.node, e));
      const entra = aristas.filter((e) => e.to.node === nodo.id).map((e) => destino(e.from.node, e));
      const partes = [
        nodo.label,
        nodo.type,
        ...(nodo.childCount > 0 ? [`group with ${nodo.childCount} children${nodo.collapsed ? ', collapsed' : ''}`] : []),
        ...(sale.length > 0 ? [`va a ${sale.join(', ')}`] : []),
        ...(entra.length > 0 ? [`comes from ${entra.join(', ')}`] : []),
      ];
      return [nodo.id, partes.join(', ')];
    }),
  );
}

/**
 * Posicion de cada Nodo visible en el `stagger` de `enter`: en orden de dibujo, entre los
 * `nuevos` si se dan o entre todos los visibles. Vacio sin `stagger` en el Tema.
 */
export function posicionesDeEscalonado(raices: readonly ResolvedNode[], visibility: Visibility, estilo: Estilo, nuevos?: readonly string[]): Map<string, number> {
  const posiciones = new Map<string, number>();
  if (ELEMENTOS.every((clave) => pinturaDeElemento(estilo.pintura, clave).animacion?.escalonadoMs === undefined)) return posiciones;
  const elegidos = nuevos === undefined ? undefined : new Set(nuevos);
  for (const nodo of raices.flatMap((raiz) => aplanar(raiz))) {
    if (acotar(visibility(nodo.id)) > 0 && (elegidos === undefined || elegidos.has(nodo.id))) posiciones.set(nodo.id, posiciones.size);
  }
  return posiciones;
}

/** Nodos en preorden (un Grupo antes que sus hijos): el orden de apilado dentro de cada capa. */
export function aplanar(nodo: ResolvedNode): ResolvedNode[] {
  return [nodo, ...nodo.children.flatMap(aplanar)];
}

/**
 * Estilo en linea de la caja de un Nodo/Grupo: su posicion absoluta y tamano (unicos valores que vienen de la geometria)
 * y su giro. El giro va en el mismo `transform`, tras la traslacion: gira la caja sobre su centro sin moverla de su sitio
 * (la propiedad `rotate` se aplicaria antes de la traslacion y la desplazaria).
 */
function posicion(caja: NodeBox, giro = 0): string {
  return `width:${num(caja.width)}px;height:${num(caja.height)}px;transform:translate(${num(caja.x)}px,${num(caja.y)}px)${giro === 0 ? '' : ` rotate(${num(giro)}deg)`};`;
}

export function cajaDeNodo(nodo: ResolvedNode, contexto: Contexto): Elemento {
  const caja = contexto.cajas.get(nodo.id);
  if (caja === undefined) throw new Error(`Node '${nodo.id}' is not in the geometry`);
  const { estilo, onSelect, onToggle, icons, detail } = contexto;
  const grupo = esGrupo(nodo);
  const { clave, tipo, pila } = pilaDeNodo(estilo.pintura, nodo);
  const trazo = colorDeTrazo(nodo, estilo);
  // El `label` de la Vista (override o, si no hay, el titulo) manda en todos los niveles.
  const datos = { nodo, caja, trazo, texto: nodo.label, icons, ...(contexto.estados !== undefined && { estados: contexto.estados }) };
  const conmutable = grupo || (nodo.collapsed && nodo.link === undefined);
  const efectos = efectosDeElemento(estilo, pila, nodo.id);
  // Sin parche `planned` propio, la caja toma el aspecto por defecto: atenuada y con contorno discontinuo.
  const planeadoPorDefecto = planeado(contexto.estados, nodo.id) && pila.estados.planned === undefined;
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
    attrs: { class: 'rd-caja', 'data-id': nodo.id, 'data-elemento': clave, ...(tipo !== undefined && { 'data-tipo': tipo }), ...(atenuado(contexto.estados, nodo.id) && { 'data-atenuado': '' }), ...(planeadoPorDefecto && { 'data-planeado': '' }), style: posicion(caja, efectos.giro) },
    hijos: [
      {
        tag: 'div',
        attrs: {
          class: `rd-${clave}`,
          'data-part': 'nodo',
          ...(tipo !== undefined && { 'data-tipo': tipo }),
          role: 'group',
          'aria-label': contexto.nombres?.get(nodo.id) ?? nodo.label,
          ...(nodo.collapsed && { 'data-collapsed': '' }),
          ...(acotar(contexto.visibility(nodo.id)) === 0 && { 'data-oculto': '' }),
          ...((contexto.estados?.[nodo.id]?.length ?? 0) > 0 && { 'data-estados': (contexto.estados?.[nodo.id] ?? []).join(' ') }),
          style: `--trazo:${limpiarValorCss(trazo)};--rd-ancho:${num(caja.width)};--rd-alto:${num(caja.height)};${contexto.escalonado.has(nodo.id) ? `--rd-n:${contexto.escalonado.get(nodo.id)};` : ''}${opacidad(contexto.visibility(nodo.id))}${efectos.nodo}`,
        },
        ...(onSelect !== undefined && { alClic: () => onSelect(nodo.id) }),
        hijos: [
          ...efectos.debajo,
          ...(grupo ? [] : pintarZonas(estilo, datos, pila.capas)),
          ...pintarCapasAnimadas(pila, false),
          ...pintarCodigo(estilo, pila, codigo, false),
          ...(grupo ? pintarGrupo(estilo, datos) : pintarNodo(estilo, { ...datos, conAtributos: tieneFilas(nodo, estilo, detail) })),
          ...pintarCapasAnimadas(pila, true),
          ...pintarCodigo(estilo, pila, codigo, true),
          ...(onToggle !== undefined && conmutable ? [pintarControl(estilo, { nodo, caja, alClic: () => onToggle(nodo.id) })] : []),
          ...efectos.encima,
        ],
      },
      ...(planeadoPorDefecto ? [pintarEstadoDeCaja('planned', nodo.id)] : []),
      ...estadosDeNodo(nodo, caja, contexto),
    ],
  };
}

function estadosDeNodo(nodo: ResolvedNode, caja: NodeBox, { estados, estilo, detail }: Contexto): Elemento[] {
  if (estados === undefined) return [];
  const propios = contornos(estados[nodo.id]).map((e) => pintarEstadoDeCaja(e, nodo.id));
  if (esGrupo(nodo) || !tieneFilas(nodo, estilo, detail)) return propios;
  const metricas = leafMetrics(estilo.tabla, nodo);
  const atributos = visibleAttributes(nodo, metricas);
  const rectas = placeInBox(metricas, nodeContent(nodo, metricas), caja.width).filas;
  const filas = atributos.flatMap((atributo, i) => {
    const id = `${nodo.id}#${atributo.name}`;
    return contornos(estados[id]).map((e) => pintarEstadoDeCaja(e, id, rectas[i]!));
  });
  return [...propios, ...filas];
}

/** `dimmed` no tiene contorno: atenua el elemento entero (marca `data-atenuado`, estilada por la hoja). */
export const atenuado = (estados: Estados | undefined, id: string): boolean => estados?.[id]?.includes('dimmed') === true;
/** `planned` atenua el elemento (marca `data-planeado`) y discontinua sus lineas; su contorno de caja lo pone quien la dibuja. */
export const planeado = (estados: Estados | undefined, id: string): boolean => estados?.[id]?.includes('planned') === true;
/**
 * Marcas de `dimmed` y `planned` de un trazo (Arista, Mensaje, Lifeline) o de su etiqueta. With `plannedPropio` (the
 * Theme patches `planned` for that stroke) there is no `data-planeado`: the Theme's stack replaces the default look.
 */
export const marcasDeTrazo = (estados: Estados | undefined, id: string, plannedPropio = false): Record<string, string> => ({
  ...(atenuado(estados, id) && { 'data-atenuado': '' }),
  ...(planeado(estados, id) && !plannedPropio && { 'data-planeado': '' }),
});

/** The stack of the state that rules a stroke: the last of `STATES` that `id` carries and the Theme declares (paint-only). */
export function estadoDeTrazo<T>(declarados: Partial<Record<EstadoVisual, T>> | undefined, estados: Estados | undefined, id: string): T | undefined {
  const activos = estados?.[id] ?? [];
  const vigente = STATES.filter((estado) => activos.includes(estado) && declarados?.[estado] !== undefined).at(-1);
  return vigente === undefined ? undefined : declarados?.[vigente];
}
/** Estados con contorno propio sobre el elemento: todos menos `dimmed` y `planned`. */
export const contornos = (lista: readonly EstadoVisual[] | undefined): EstadoVisual[] => (lista ?? []).filter((e) => e !== 'dimmed' && e !== 'planned');

function tieneFilas(nodo: ResolvedNode, estilo: Estilo, detail?: NivelDeDetalle): boolean {
  return (detail === undefined || detail === 'completo') && visibleAttributes(nodo, leafMetrics(estilo.tabla, nodo)).length > 0;
}

/** Valor de la Paleta para el color del Nodo; sin color, o desconocido, el borde del Estilo. */
export function colorDeTrazo(nodo: ResolvedNode, estilo: Estilo): string {
  return (nodo.color !== undefined ? estilo.paleta[nodo.color] : undefined) ?? estilo.borde;
}

/** Arista con su etiqueta. Una Arista sin ruta en la geometria (ELK no la enruto) se omite. */
function aristaSvg(arista: ResolvedEdge, { view, geometry, estilo, onSelect, visibility, estados, coloresDeNodo }: ContextoDeGrafo): Elemento[] {
  const id = edgeId(arista);
  const puntos = geometry.edges[id]?.points;
  if (puntos === undefined || puntos.length < 2) return [];
  const v = visibilidadSvg(visibility(id));
  const colorDelOrigen = coloresDeNodo.get(arista.from.node);
  const delTema = (colorDelOrigen === undefined ? undefined : estilo.pintura.arista.origenes[colorDelOrigen]) ?? estilo.pintura.arista;
  const enEstado = estadoDeTrazo(delTema.estadosDeArista, estados, id);
  return [
    pintarArista(estilo, {
      id,
      puntos,
      ...(colorDelOrigen !== undefined && { origen: colorDelOrigen }),
      desde: arista.fromCardinality,
      hasta: arista.toCardinality,
      ...(view.type === 'er' && { er: { identificante: arista.identifying === true } }),
      ...(enEstado !== undefined && { enEstado }),
      atributos: { ...v, ...marcasDeTrazo(estados, id, delTema.estadosDeArista?.planned !== undefined) },
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
function etiquetaSvg(arista: ResolvedEdge, { geometry, estilo, onSelect, visibility, estados, coloresDeNodo }: ContextoDeGrafo): Elemento[] {
  const id = edgeId(arista);
  const puntos = geometry.edges[id]?.points;
  if (arista.label === undefined || puntos === undefined || puntos.length < 2) return [];
  const v = visibilidadSvg(visibility(id));
  const colorDelOrigen = coloresDeNodo.get(arista.from.node);
  const delTema = (colorDelOrigen === undefined ? undefined : estilo.pintura.arista.origenes[colorDelOrigen]) ?? estilo.pintura.arista;
  return [
    {
      tag: 'g',
      attrs: { 'data-edge-labels': id, ...v, ...marcasDeTrazo(estados, id, delTema.estadosDeArista?.planned !== undefined) },
      ...(onSelect !== undefined && { alClic: () => onSelect(id) }),
      hijos: [pintarEtiquetaDeArista(estilo, { id, texto: arista.label, puntos, caja: geometry.labels[id] })],
    },
  ];
}

/** Visibilidad acotada a [0, 1]; un NaN cuenta como 0. */
export function acotar(visibilidad: number): number {
  return Number.isNaN(visibilidad) ? 0 : Math.min(Math.max(visibilidad, 0), 1);
}

/** `opacity` en linea solo si no es 1. Con 0 no recibe clics. */
export function opacidad(visibilidad: number): string {
  const valor = acotar(visibilidad);
  if (valor === 1) return '';
  return valor === 0 ? 'opacity:0;pointer-events:none;' : `opacity:${num(valor)};`;
}

/** Lo mismo para un elemento SVG, como atributos. */
export function visibilidadSvg(visibilidad: number): Record<string, string> {
  const valor = acotar(visibilidad);
  if (valor === 1) return {};
  return valor === 0 ? { opacity: '0', 'pointer-events': 'none' } : { opacity: num(valor) };
}
