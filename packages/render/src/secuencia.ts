/**
 * Escena de una Vista de secuencia (ADR 0009): Lifelines, activaciones y Mensajes sobre la Geometria `secuencia`.
 * Un Tema que no declara `message`, `lifeline` ni `activation` los obtiene por derivacion de `edge` y `node`:
 * - `message` y `lifeline` salen de la pila de trazos de la Arista (la Lifeline, discontinua y sin marcadores); el
 *   marcador final depende del tipo (`sync` flecha, `async` y `reply` chevron);
 * - `reply` lleva la continuidad opuesta a la del trazo base de la Arista, asi se distingue siempre de `sync`;
 * - `activation` toma solo la forma, el relleno y el borde de la pila del Nodo de su Lifeline, sin sombras ni efectos.
 * Las cabeceras de las Lifelines son los Nodos de la Vista, dibujados como cualquier Nodo.
 */
import type { MensajeResuelto } from 'canonico';
import { indiceDeGeometria } from 'layout';
import type { CajaDeActivacion, GeometriaSecuencia } from 'layout';
import { primitivasDeFamilia } from 'tema';
import type { CapaPintada, NombreDePrimitiva, PinturaDeArista, PrimitivaPintada } from 'tema';

import { num } from './elemento';
import type { Elemento } from './elemento';
import { resolverEstilo } from './estilo';
import { aplanar, atenuado, cajaDeNodo, capaSvg, colorDeTrazo, contornos, marcoDeEscena, nombresAccesibles, posicionesDeEscalonado, visibilidadSvg } from './escena';
import type { Contexto, EntradaDeEscena } from './escena';
import { declaracionesDeCaja } from './hoja';
import { pilaDeNodo } from './pilas';
import { pintarEtiquetaDeArista, pintarEstadoDeRuta } from './pintores';
import { pintarMarcadores, pintarTrazos } from './aristas';

/** Capas que una activacion toma del Nodo: solo su forma, relleno y borde. */
const FAMILIAS_DE_ACTIVACION: readonly string[] = [...primitivasDeFamilia('forma'), ...primitivasDeFamilia('relleno'), ...primitivasDeFamilia('borde')];

/** Marcador final de cada tipo de Mensaje. */
const MARCADOR_DE_MENSAJE: Record<MensajeResuelto['kind'], string> = { sync: 'arrow', async: 'chevron', reply: 'chevron' };

/** Estilo de trazo de la Capa principal: el de la Arista base. */
const estiloDeTrazo = (capas: readonly CapaPintada[]): string => String(capas[capas.length - 1]?.props['style'] ?? 'solid');

/** Pintura derivada de la Arista para un Mensaje de ese tipo: continuidad opuesta en `reply` y el marcador del tipo. */
export function pinturaDeMensaje(base: PinturaDeArista, kind: MensajeResuelto['kind']): PinturaDeArista {
  const continuo = estiloDeTrazo(base.capas) === 'solid';
  const estilo = kind === 'reply' ? (continuo ? 'dashed' : 'solid') : undefined;
  const capas: CapaPintada[] = estilo === undefined ? base.capas : base.capas.map((capa) => ({ ...capa, props: { ...capa.props, style: estilo } }));
  const principal = capas[capas.length - 1];
  const fin: PrimitivaPintada = { tipo: MARCADOR_DE_MENSAJE[kind] as NombreDePrimitiva, props: { size: Number(base.fin?.props['size'] ?? 10), color: base.fin?.props['color'] ?? principal?.props['color'] ?? '#000000' } };
  const { origen: _origen, ...resto } = base;
  return { ...resto, capas, fin };
}

/** Pintura derivada de la Arista para una Lifeline: trazo discontinuo y sin marcadores. */
function pinturaDeLifeline(base: PinturaDeArista): PinturaDeArista {
  const { origen: _origen, fin: _fin, ...resto } = base;
  return { ...resto, capas: base.capas.map((capa) => ({ ...capa, props: { ...capa.props, style: 'dashed' } })) };
}

export function construirEscenaDeSecuencia(entrada: EntradaDeEscena & { geometry: GeometriaSecuencia }): Elemento {
  const { view, geometry, theme } = entrada;
  const estilo = entrada.estilo ?? resolverEstilo(theme, entrada.metricas, undefined, undefined, view.type);
  const { raices, cajas } = indiceDeGeometria(view, geometry);
  const visibility = entrada.visibility ?? (() => 1);
  const coloresDeNodo = new Map(raices.flatMap((raiz) => aplanar(raiz)).map((nodo) => [nodo.id, nodo.color]));
  const contexto: Contexto = { ...entrada, visibility, estilo, cajas, coloresDeNodo, escalonado: posicionesDeEscalonado(raices, visibility, estilo, entrada.nuevos) };
  contexto.nombres = nombresAccesibles(view, raices);

  const interaccion = view.interaction;
  const mensajes = interaccion === undefined ? [] : interaccion.messages;
  const base = estilo.pintura.arista;
  const deOrigen = (id: string): PinturaDeArista => {
    const color = coloresDeNodo.get(id);
    return (color === undefined ? undefined : base.origenes[color]) ?? base;
  };

  const lifelines = raices.flatMap((nodo): Elemento[] => {
    const linea = geometry.lifelines[nodo.id];
    if (linea === undefined) return [];
    const v = visibilidadSvg(visibility(nodo.id));
    return [
      {
        tag: 'g',
        attrs: { 'data-lifeline': nodo.id, ...(atenuado(entrada.estados, nodo.id) ? { ...v, 'data-atenuado': '' } : v) },
        ...(entrada.onSelect !== undefined && { alClic: () => entrada.onSelect!(nodo.id) }),
        hijos: [...pintarTrazos(pinturaDeLifeline(deOrigen(nodo.id)), [{ x: linea.x, y: linea.y1 }, { x: linea.x, y: linea.y2 }], estilo.pintura.semilla)],
      },
    ];
  });

  const activaciones = geometry.activations.map((activacion) => activacionHtml(activacion, contexto));

  const idDe = (mensaje: MensajeResuelto): string => `${interaccion!.id}:${mensaje.ruta}`;
  const rutas = mensajes.flatMap((mensaje) => {
    const ruta = geometry.messages[mensaje.ruta];
    return ruta === undefined ? [] : [{ mensaje, ruta }];
  });
  const trazos = rutas.map(({ mensaje, ruta }): Elemento => {
    const id = idDe(mensaje);
    const v = visibilidadSvg(visibility(id));
    const pintura = pinturaDeMensaje(deOrigen(mensaje.from), mensaje.kind);
    return {
      tag: 'g',
      attrs: { 'data-edge': id, 'data-message': id, 'data-kind': mensaje.kind, ...(atenuado(entrada.estados, id) ? { ...v, 'data-atenuado': '' } : v) },
      hijos: [...pintarTrazos(pintura, ruta.points, estilo.pintura.semilla), ...pintarMarcadores(estilo, pintura, ruta.points), ...contornos(entrada.estados?.[id]).map((e) => pintarEstadoDeRuta(estilo, e, id, ruta.points))],
    };
  });
  const etiquetas = rutas.flatMap(({ mensaje, ruta }): Elemento[] => {
    if (mensaje.label === undefined) return [];
    const id = idDe(mensaje);
    return [{ tag: 'g', attrs: { 'data-edge-labels': id, ...visibilidadSvg(visibility(id)) }, hijos: [pintarEtiquetaDeArista(estilo, { id, texto: mensaje.label, puntos: ruta.points, caja: ruta.label })] }];
  });

  return marcoDeEscena(entrada, estilo, [
    capaSvg('lifelines', geometry, lifelines),
    { tag: 'div', attrs: { class: 'rd-capa rd-activaciones', 'data-capa': 'activaciones' }, hijos: activaciones },
    capaSvg('mensajes', geometry, [...trazos, ...etiquetas]),
    { tag: 'div', attrs: { class: 'rd-capa rd-nodos', 'data-capa': 'nodos' }, hijos: raices.map((nodo) => cajaDeNodo(nodo, contexto)) },
  ]);
}

/** Barra de activacion: la forma, el relleno y el borde del Nodo de su Lifeline, con su color. */
function activacionHtml(activacion: CajaDeActivacion, contexto: Contexto): Elemento {
  const { estilo, view, onSelect } = contexto;
  const nodo = view.nodes.find((n) => n.id === activacion.lifeline)!;
  const { pila } = pilaDeNodo(estilo.pintura, nodo);
  const capas = pila.capas.filter((capa) => FAMILIAS_DE_ACTIVACION.includes(capa.tipo));
  const declaraciones = declaracionesDeCaja(estilo, { capas, estados: {} });
  const estilos = Object.entries(declaraciones).map(([propiedad, valor]) => `${propiedad}:${valor}`).join(';');
  return {
    tag: 'div',
    attrs: {
      'data-activation': activacion.lifeline,
      'data-nivel': String(activacion.nivel),
      style: `position:absolute;box-sizing:border-box;left:${num(activacion.x)}px;top:${num(activacion.y1)}px;width:${num(activacion.width)}px;height:${num(activacion.y2 - activacion.y1)}px;--trazo:${colorDeTrazo(nodo, estilo)};pointer-events:auto;${estilos}`,
    },
    ...(onSelect !== undefined && { alClic: () => onSelect(activacion.lifeline) }),
    hijos: [],
  };
}
