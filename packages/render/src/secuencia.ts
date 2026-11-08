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
import type { CajaDeActivacion, CajaDeGrupoColocada, GeometriaSecuencia, MarcoDeFragmento, NotaColocada } from 'layout';
import { RELLENO_DE_NOTA, pinturaDeMensajeConTema, primitivasDeFamilia } from 'tema';
import type { CapaPintada, NombreDePrimitiva, PinturaDeArista, PinturaDeCajaDeSecuencia, PinturaDeSecuencia } from 'tema';

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

/** Pintura de una Lifeline: la del bloque `lifeline` del Tema si lo declara y, si no, la derivada de la Arista (trazo discontinuo, sin marcadores). */
function pinturaDeLifeline(base: PinturaDeArista, destruida: boolean, secuencia: PinturaDeSecuencia | undefined, color: string | undefined): PinturaDeArista {
  const declarada = secuencia?.lifeline;
  const trazo = declarada === undefined ? undefined : ((color === undefined ? undefined : declarada.origenes[color]) ?? declarada.base);
  const { origen: _origen, fin: _fin, ...resto } = base;
  const capas: CapaPintada[] = trazo?.capas ?? base.capas.map((capa) => ({ ...capa, props: { ...capa.props, style: 'dashed' } }));
  if (!destruida) return { ...resto, capas };
  // Una Lifeline destruida termina en `end` (defecto `cross`), del color del trazo.
  if (trazo?.fin !== undefined) return { ...resto, capas, fin: trazo.fin };
  const colorDelTrazo = capas[capas.length - 1]?.props['color'] ?? '#000000';
  return { ...resto, capas, fin: { tipo: 'cross' as NombreDePrimitiva, props: { size: Number(base.fin?.props['size'] ?? 10), color: colorDelTrazo } } };
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

  const secuencia = estilo.pintura.secuencia;
  const lifelines = raices.flatMap((nodo): Elemento[] => {
    const linea = geometry.lifelines[nodo.id];
    if (linea === undefined) return [];
    const pintura = pinturaDeLifeline(deOrigen(nodo.id), linea.destroyed === true, secuencia, coloresDeNodo.get(nodo.id));
    const v = visibilidadSvg(visibility(nodo.id));
    const puntos = [{ x: linea.x, y: linea.y1 }, { x: linea.x, y: linea.y2 }];
    return [
      {
        tag: 'g',
        attrs: { 'data-lifeline': nodo.id, ...(atenuado(entrada.estados, nodo.id) ? { ...v, 'data-atenuado': '' } : v) },
        ...(entrada.onSelect !== undefined && { alClic: () => entrada.onSelect!(nodo.id) }),
        hijos: [...pintarTrazos(pintura, puntos, estilo.pintura.semilla), ...pintarMarcadores(estilo, pintura, puntos)],
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
    const pintura = pinturaDeMensajeConTema(secuencia, deOrigen(mensaje.from), coloresDeNodo.get(mensaje.from), mensaje.kind);
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

  const grupos = geometry.groups.map((grupo) => grupoHtml(grupo, contexto));
  const fragmentos = geometry.fragments.map((marco) => fragmentoHtml(marco, contexto));
  // Las guardas (y las pestanas) llevan el color del trazo de la Arista, no el `foreground`, y van sobre las activaciones.
  const colorDeGuarda = String(base.capas[base.capas.length - 1]?.props['color'] ?? estilo.borde);
  const textosDeFragmento = geometry.fragments.flatMap((marco) => textosDeFragmentoSvg(marco, estilo, colorDeGuarda));

  return marcoDeEscena(entrada, estilo, [
    { tag: 'div', attrs: { class: 'rd-capa rd-grupos', 'data-capa': 'grupos' }, hijos: grupos },
    { tag: 'div', attrs: { class: 'rd-capa rd-fragmentos', 'data-capa': 'fragmentos' }, hijos: fragmentos },
    capaSvg('lifelines', geometry, lifelines),
    { tag: 'div', attrs: { class: 'rd-capa rd-activaciones', 'data-capa': 'activaciones' }, hijos: activaciones },
    capaSvg('mensajes', geometry, [...trazos, ...etiquetas]),
    capaSvg('guardas', geometry, textosDeFragmento),
    capaSvg('notas', geometry, geometry.notes.map((nota) => notaSvg(nota, estilo, interaccion?.id ?? ''))),
    { tag: 'div', attrs: { class: 'rd-capa rd-nodos', 'data-capa': 'nodos' }, hijos: raices.map((nodo) => cajaDeNodo(nodo, contexto)) },
  ]);
}

/** Barra de activacion: la forma, el relleno y el borde del Nodo de su Lifeline, con su color. */
function activacionHtml(activacion: CajaDeActivacion, contexto: Contexto): Elemento {
  const { estilo, view, onSelect } = contexto;
  const nodo = view.nodes.find((n) => n.id === activacion.lifeline)!;
  const { pila } = pilaDeNodo(estilo.pintura, nodo);
  // Con bloque `activation` en el Tema, su pila; si no, solo la forma, el relleno y el borde del Nodo de su Lifeline.
  const declarada = estilo.pintura.secuencia?.activacion;
  const capas = declarada?.capas ?? pila.capas.filter((capa) => FAMILIAS_DE_ACTIVACION.includes(capa.tipo));
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

/** Estilo en linea de una caja con la forma, el relleno y el borde del Nodo (sin decoraciones ni efectos), o con las `capas` del Tema. */
function estiloDeCajaDeNodo(contexto: Contexto, declaradas?: readonly CapaPintada[]): string {
  const { estilo } = contexto;
  const { pila } = pilaDeNodo(estilo.pintura, { collapsed: false, children: [], type: '' });
  const capas = declaradas ?? pila.capas.filter((capa) => FAMILIAS_DE_ACTIVACION.includes(capa.tipo));
  return Object.entries(declaracionesDeCaja(estilo, { capas: [...capas], estados: {} })).map(([propiedad, valor]) => `${propiedad}:${valor}`).join(';');
}

/** `box` de un Grupo abierto: contorno discontinuo del color del trazo con el nombre del Grupo arriba a la izquierda. */
function grupoHtml(grupo: CajaDeGrupoColocada, contexto: Contexto): Elemento {
  const { estilo } = contexto;
  const tamano = estilo.metricas.fontSize * estilo.metricas.escalaEtiqueta;
  const caja = (x: number, y: number, ancho: number, alto: number): string => `position:absolute;box-sizing:border-box;left:${num(x)}px;top:${num(y)}px;width:${num(ancho)}px;height:${num(alto)}px`;
  return {
    tag: 'div',
    attrs: { 'data-group-box': grupo.id, 'data-nivel': String(grupo.nivel), style: `${caja(grupo.x, grupo.y, grupo.width, grupo.height)};pointer-events:none;border:1px dashed ${estilo.borde}` },
    hijos: [
      {
        tag: 'div',
        attrs: { 'data-group-box-title': grupo.id, style: `${caja(grupo.title.x - grupo.x, grupo.title.y - grupo.y, grupo.title.width, grupo.title.height)};font-family:${estilo.fuenteCuerpo};font-size:${num(tamano)}px;line-height:${num(grupo.title.height)}px;color:${estilo.texto};white-space:nowrap` },
        hijos: [grupo.label],
      },
    ],
  };
}

/** Pila de Capas del marco de un Fragmento: la de su `op` en el Tema, la del bloque `fragment` o la derivada del Nodo. */
function capasDeFragmento(declarado: PinturaDeCajaDeSecuencia | undefined, operador: string): readonly CapaPintada[] | undefined {
  return declarado === undefined ? undefined : (declarado.variantes[operador] ?? declarado.capas);
}

/** Declaraciones CSS del trazo `divider` del Tema (`line`): `border-top` con su ancho, estilo y color; sin el, discontinuo del color del borde. */
function bordeDeDivisor(declarado: PinturaDeCajaDeSecuencia | undefined, colorDeBorde: string): string {
  const divisor = declarado?.textos['divider'];
  if (divisor === undefined) return `1px dashed ${colorDeBorde}`;
  const estilo = String(divisor.props['style'] ?? 'solid');
  return `${num(Number(divisor.props['width'] ?? 1))}px ${estilo === 'dashed' || estilo === 'dotted' ? estilo : 'solid'} ${String(divisor.props['color'] ?? colorDeBorde)}`;
}

/** Marco de un Fragmento: forma, relleno y borde del Nodo (o del bloque `fragment`); con su pestana y un divisor por operando a partir del segundo. */
function fragmentoHtml(marco: MarcoDeFragmento, contexto: Contexto): Elemento {
  const declarado = contexto.estilo.pintura.secuencia?.fragmento;
  const estilos = estiloDeCajaDeNodo(contexto, capasDeFragmento(declarado, marco.operator));
  const caja = (x: number, y: number, ancho: number, alto: number): string => `position:absolute;box-sizing:border-box;left:${num(x)}px;top:${num(y)}px;width:${num(ancho)}px;height:${num(alto)}px`;
  const borde = bordeDeDivisor(declarado, contexto.estilo.borde);
  const divisores = marco.operands.flatMap((operando, k): Elemento[] =>
    operando.divider === undefined ? [] : [{ tag: 'div', attrs: { 'data-fragment-divider': `${marco.ruta}:${k}`, style: `${caja(0, operando.divider - marco.y, marco.width, 0)};border-top:${borde}` }, hijos: [] }],
  );
  return {
    tag: 'div',
    attrs: { 'data-fragment': marco.ruta, 'data-operator': marco.operator, 'data-nivel': String(marco.nivel), style: `${caja(marco.x, marco.y, marco.width, marco.height)};pointer-events:none;${estilos}` },
    hijos: [{ tag: 'div', attrs: { 'data-fragment-tab': marco.ruta, style: `${caja(marco.tab.x - marco.x, marco.tab.y - marco.y, marco.tab.width, marco.tab.height)};${estilos}` }, hijos: [] }, ...divisores],
  };
}

/** Texto SVG de la pestana (operador) y de cada guarda, centrados en sus cajas medidas. `operator` y `guard` del Tema dan color y peso. */
function textosDeFragmentoSvg(marco: MarcoDeFragmento, estilo: Contexto['estilo'], color: string): Elemento[] {
  const tamano = estilo.metricas.fontSize * estilo.metricas.escalaEtiqueta;
  const declarado = estilo.pintura.secuencia?.fragmento;
  const deOperador = declarado?.textos['operator']?.props;
  const deGuarda = declarado?.textos['guard']?.props;
  const texto = (atributos: Record<string, string>, caja: { x: number; y: number; width: number; height: number }, contenido: string, relleno: string, props?: Record<string, number | string>): Elemento => ({
    tag: 'text',
    attrs: {
      ...atributos,
      x: num(caja.x + caja.width / 2),
      y: num(caja.y + caja.height / 2 + tamano * estilo.etiqueta.centradoVertical),
      'text-anchor': 'middle',
      'font-family': estilo.fuenteCuerpo,
      'font-size': num(tamano),
      fill: props?.['color'] === undefined ? relleno : String(props['color']),
      ...(props?.['weight'] !== undefined && { 'font-weight': String(props['weight']) }),
    },
    hijos: [contenido],
  });
  return [
    texto({ 'data-fragment-operator': marco.ruta }, marco.tab, marco.operator, estilo.texto, deOperador),
    ...(marco.title === undefined ? [] : [texto({ 'data-ref-title': marco.ruta }, marco.title.box, marco.title.text, estilo.texto, deGuarda)]),
    ...marco.operands.flatMap((operando, k): Elemento[] => (operando.guard === undefined ? [] : [texto({ 'data-fragment-guard': `${marco.ruta}:${k}` }, operando.guard.box, operando.guard.text, color, deGuarda)])),
  ];
}

/**
 * Nota "papel": poligono con la esquina superior derecha doblada, tinte suave del color de nota de la Paleta (`amber`,
 * si no el borde), trazo fino y el texto ya envuelto por el layout. No es un Nodo: no lleva cabecera, icono ni insignia.
 */
function notaSvg(nota: NotaColocada, estilo: Contexto['estilo'], interaccion: string): Elemento {
  // Con bloque `note` en el Tema: el relleno y el borde de su pila y el estilo `text`; si no, el tinte de `amber`.
  const declarada = estilo.pintura.secuencia?.nota;
  const ultima = (familia: string): CapaPintada | undefined => declarada?.capas.filter((capa) => primitivasDeFamilia(familia as 'relleno' | 'borde').includes(capa.tipo)).at(-1);
  const derivado = estilo.paleta['amber'] ?? estilo.borde;
  const rellenoDeclarado = ultima('relleno');
  const bordeDeclarado = ultima('borde');
  const color = declarada === undefined ? derivado : String(bordeDeclarado?.props['color'] ?? derivado);
  const relleno = declarada === undefined ? derivado : rellenoDeclarado === undefined ? 'none' : String(rellenoDeclarado.props['color'] ?? derivado);
  const opacidad = declarada === undefined ? '0.2' : '1';
  const anchoDeTrazo = declarada === undefined ? '1' : num(Number(bordeDeclarado?.props['width'] ?? 1));
  const estiloDeTexto = declarada?.textos['text']?.props;
  const { x, y, width, height, fold } = nota;
  const contorno = `M${num(x)},${num(y)} H${num(x + width - fold)} L${num(x + width)},${num(y + fold)} V${num(y + height)} H${num(x)} Z`;
  const doblez = `M${num(x + width - fold)},${num(y)} V${num(y + fold)} H${num(x + width)}`;
  const tamano = estilo.metricas.fontSize;
  const lineas = nota.lines.map((linea, i): Elemento => ({
    tag: 'text',
    attrs: { x: num(x + RELLENO_DE_NOTA), y: num(y + RELLENO_DE_NOTA + i * nota.lineHeight + nota.lineHeight / 2 + tamano * estilo.etiqueta.centradoVertical), 'font-family': estilo.fuenteCuerpo, 'font-size': num(tamano), fill: estiloDeTexto?.['color'] === undefined ? estilo.texto : String(estiloDeTexto['color']), ...(estiloDeTexto?.['weight'] !== undefined && { 'font-weight': String(estiloDeTexto['weight']) }) },
    hijos: [linea],
  }));
  return {
    tag: 'g',
    attrs: { 'data-note': `${interaccion}:${nota.ruta}`, 'data-anchor': nota.anchor },
    hijos: [
      { tag: 'path', attrs: { 'data-note-paper': '', d: contorno, fill: relleno, 'fill-opacity': opacidad, stroke: color, 'stroke-width': anchoDeTrazo }, hijos: [] },
      { tag: 'path', attrs: { d: doblez, fill: 'none', stroke: color, 'stroke-width': anchoDeTrazo }, hijos: [] },
      ...lineas,
    ],
  };
}
