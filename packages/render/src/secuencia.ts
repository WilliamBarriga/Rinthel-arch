/**
 * Escena de una Vista de secuencia (ADR 0009): Lifelines, activaciones, Mensajes, Fragmentos y Notas sobre la Geometria
 * `secuencia`, con las pilas ya resueltas en `estilo.pintura.secuencia`. Las cabeceras de las Lifelines son Nodos.
 */
import { idDeElementoDeSecuencia } from 'canonico';
import type { MensajeResuelto, NodoResuelto, VistaDeSecuencia, Visibilidad } from 'canonico';
import { indiceDeGeometria } from 'layout';
import type { CajaDeActivacion, CajaDeGrupoColocada, GeometriaSecuencia, MarcoDeFragmento, NotaColocada } from 'layout';
import { ESTADOS, RELLENO_DE_NOTA, primitivasDeFamilia } from 'tema';
import type { CapaPintada, PinturaDeCajaDeSecuencia, PinturaDeTrazoDeSecuencia, TrazosDeSecuencia } from 'tema';

import { estiloEnLinea, num } from './elemento';
import type { Elemento } from './elemento';
import { resolverEstilo } from './estilo';
import { aplanar, atenuado, cajaDeNodo, capaSvg, colorDeTrazo, contornos, marcoDeEscena, nombresAccesibles, opacidad, posicionesDeEscalonado, visibilidadSvg } from './escena';
import type { Contexto, EntradaDeEscena, Estados } from './escena';
import { declaracionesDeCaja } from './hoja';
import { pilaDeNodo } from './pilas';
import { pintarEtiquetaDeArista, pintarEstadoDeRuta } from './pintores';
import { pintarMarcadores, pintarTrazos } from './aristas';

/** Caja absoluta `x,y,ancho,alto` (px), con el borde dentro del tamano: el marco de todo lo de secuencia que se pinta en HTML. */
const cajaAbsoluta = (x: number, y: number, ancho: number, alto: number): string => `position:absolute;box-sizing:border-box;left:${num(x)}px;top:${num(y)}px;width:${num(ancho)}px;height:${num(alto)}px`;

/** El trazo de un Elemento de secuencia para un Nodo de origen del color de Paleta `color`. */
const deColor = (trazos: TrazosDeSecuencia, color: string | undefined): PinturaDeTrazoDeSecuencia => (color === undefined ? undefined : trazos.origenes[color]) ?? trazos.base;

export function construirEscenaDeSecuencia(entrada: EntradaDeEscena & { view: VistaDeSecuencia; geometry: GeometriaSecuencia }): Elemento {
  const { view, geometry, theme } = entrada;
  const estilo = entrada.estilo ?? resolverEstilo(theme, view.type, entrada.metricas);
  const { raices, cajas } = indiceDeGeometria(view, geometry);
  const visibility = entrada.visibility ?? (() => 1);
  const coloresDeNodo = new Map(raices.flatMap((raiz) => aplanar(raiz)).map((nodo) => [nodo.id, nodo.color]));
  const contexto: Contexto = { ...entrada, visibility, estilo, cajas, coloresDeNodo, escalonado: posicionesDeEscalonado(raices, visibility, estilo, entrada.nuevos) };
  // Una Vista de secuencia no tiene Aristas: el nombre accesible de una Lifeline no anuncia relaciones.
  contexto.nombres = nombresAccesibles([], raices);

  const interaccion = view.interaction;
  const mensajes = interaccion.messages;
  const secuencia = estilo.pintura.secuencia;
  if (secuencia === undefined) throw new Error('construirEscenaDeSecuencia: el Estilo no es de una Vista sequence');
  const lifelines = raices.flatMap((nodo): Elemento[] => {
    const linea = geometry.lifelines[nodo.id];
    if (linea === undefined) return [];
    // Solo una Lifeline destruida lleva su marcador final.
    const { capas, fin } = deColor(secuencia.lifeline, coloresDeNodo.get(nodo.id));
    const pintura = { capas, ...(linea.destroyed === true && fin !== undefined && { fin }) };
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

  const idDe = (mensaje: MensajeResuelto): string => idDeElementoDeSecuencia(interaccion.id, mensaje.ruta);
  // Corte de los Pasos: la `y` del ultimo Mensaje revelado. Con todos revelados no se recorta nada.
  const reveladas = mensajes.flatMap((mensaje) => {
    const ruta = geometry.messages[mensaje.ruta];
    return ruta !== undefined && visibility(idDe(mensaje)) > 0 ? [Math.max(...ruta.points.map((p) => p.y))] : [];
  });
  const hayOcultos = mensajes.some((mensaje) => geometry.messages[mensaje.ruta] !== undefined && visibility(idDe(mensaje)) <= 0);
  const corte = hayOcultos ? Math.max(-Infinity, ...reveladas) : Infinity;
  // Una Lifeline recortada por el viewport (su cabecera quedo fuera de la camara) no pinta sus activaciones.
  const nodoPorId = new Map(view.nodes.map((nodo) => [nodo.id, nodo]));
  const activaciones = geometry.activations.flatMap((activacion) => {
    const nodo = nodoPorId.get(activacion.lifeline);
    return nodo === undefined ? [] : [activacionHtml(activacion, nodo, contexto, corte)];
  });
  const idDeInteraccion = interaccion.id;
  const rutas = mensajes.flatMap((mensaje) => {
    const ruta = geometry.messages[mensaje.ruta];
    return ruta === undefined ? [] : [{ mensaje, ruta }];
  });
  const trazos = rutas.map(({ mensaje, ruta }): Elemento => {
    const id = idDe(mensaje);
    const v = visibilidadSvg(visibility(id));
    const pintura = deColor(secuencia.mensaje, coloresDeNodo.get(mensaje.from)).tipos[mensaje.kind]!;
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
  const fragmentos = geometry.fragments.map((marco) => fragmentoHtml(marco, contexto, idDeInteraccion));
  // Las guardas van sobre las activaciones.
  const textosDeFragmento = geometry.fragments.flatMap((marco) => textosDeFragmentoSvg(marco, estilo, visibility, idDeInteraccion));

  return marcoDeEscena(entrada, estilo, [
    { tag: 'div', attrs: { class: 'rd-capa rd-grupos', 'data-capa': 'grupos' }, hijos: grupos },
    { tag: 'div', attrs: { class: 'rd-capa rd-fragmentos', 'data-capa': 'fragmentos' }, hijos: fragmentos },
    capaSvg('lifelines', geometry, lifelines),
    { tag: 'div', attrs: { class: 'rd-capa rd-activaciones', 'data-capa': 'activaciones' }, hijos: activaciones },
    capaSvg('mensajes', geometry, [...trazos, ...etiquetas]),
    capaSvg('guardas', geometry, textosDeFragmento),
    capaSvg('notas', geometry, geometry.notes.map((nota) => notaSvg(nota, estilo, idDeInteraccion, visibility, entrada.estados))),
    { tag: 'div', attrs: { class: 'rd-capa rd-nodos', 'data-capa': 'nodos' }, hijos: raices.map((nodo) => cajaDeNodo(nodo, contexto)) },
  ]);
}

/** Barra de activacion: la pila de `activation` (la derivada va por el Nodo de su Lifeline), con el color de ese Nodo. */
function activacionHtml(activacion: CajaDeActivacion, nodo: NodoResuelto, contexto: Contexto, corte: number): Elemento {
  const { estilo, onSelect } = contexto;
  const pintura = estilo.pintura.secuencia!.activacion;
  const capas = pintura.porNodo === undefined ? pintura.capas : pilaDeNodo(pintura.porNodo, nodo).pila.capas;
  const estilos = estiloEnLinea(declaracionesDeCaja(estilo, { capas, estados: {} }));
  // Un Paso recorta la activacion en el corte (no anuncia el `reply`); una que aun no empezo no se ve.
  const y2 = Math.min(activacion.y2, corte);
  const alto = Math.max(y2 - activacion.y1, 0);
  const oculta = activacion.y1 > corte ? 'opacity:0;pointer-events:none;' : '';
  return {
    tag: 'div',
    attrs: {
      'data-activation': activacion.lifeline,
      'data-nivel': String(activacion.nivel),
      style: `${cajaAbsoluta(activacion.x, activacion.y1, activacion.width, alto)};--trazo:${colorDeTrazo(nodo, estilo)};pointer-events:auto;${estilos}${oculta}`,
    },
    ...(onSelect !== undefined && { alClic: () => onSelect(activacion.lifeline) }),
    hijos: [],
  };
}

/** Estilo en linea de una caja con las `capas` de su Elemento de Tema. */
const estiloDeCaja = (contexto: Contexto, capas: readonly CapaPintada[]): string => estiloEnLinea(declaracionesDeCaja(contexto.estilo, { capas: [...capas], estados: {} }));

/** Estados del elemento (`seleccionado`, `hover`) como atributo; Fragmentos y Notas se estilan con sus Elementos de Tema. */
const atributoDeEstados = (estados: Estados | undefined, id: string): Record<string, string> => {
  const lista = contornos(estados?.[id]);
  return lista.length === 0 ? {} : { 'data-estados': lista.join(' ') };
};

/** `box` de un Grupo abierto: contorno discontinuo del color del trazo con el nombre del Grupo arriba a la izquierda. */
function grupoHtml(grupo: CajaDeGrupoColocada, contexto: Contexto): Elemento {
  const { estilo } = contexto;
  const tamano = estilo.metricas.fontSize * estilo.metricas.escalaEtiqueta;
  return {
    tag: 'div',
    attrs: { 'data-group-box': grupo.id, 'data-nivel': String(grupo.nivel), style: `${cajaAbsoluta(grupo.x, grupo.y, grupo.width, grupo.height)};pointer-events:none;border:1px dashed ${estilo.borde}` },
    hijos: [
      {
        tag: 'div',
        attrs: { 'data-group-box-title': grupo.id, style: `${cajaAbsoluta(grupo.title.x - grupo.x, grupo.title.y - grupo.y, grupo.title.width, grupo.title.height)};font-family:${estilo.fuenteCuerpo};font-size:${num(tamano)}px;line-height:${num(grupo.title.height)}px;color:${estilo.texto};white-space:nowrap` },
        hijos: [grupo.label],
      },
    ],
  };
}

/** Pila de Capas del marco de un Fragmento: la de su `op` o la del bloque `fragment`, en el estado vigente. */
function capasDeFragmento(pintura: PinturaDeCajaDeSecuencia, operador: string, estado?: PinturaDeCajaDeSecuencia['estados'][keyof PinturaDeCajaDeSecuencia['estados']]): readonly CapaPintada[] {
  return estado === undefined ? (pintura.variantes[operador] ?? pintura.capas) : (estado.variantes[operador] ?? estado.capas);
}

/** Pila del estado que manda sobre un elemento: el ultimo de `ESTADOS` que el elemento lleva y el Tema declara (el orden de la hoja de los Nodos). */
function pilaDeEstado(declarado: PinturaDeCajaDeSecuencia | undefined, estados: Estados | undefined, id: string): PinturaDeCajaDeSecuencia['estados'][keyof PinturaDeCajaDeSecuencia['estados']] {
  const activos = contornos(estados?.[id]);
  const vigente = ESTADOS.filter((estado) => activos.includes(estado) && declarado?.estados[estado] !== undefined).at(-1);
  return vigente === undefined ? undefined : declarado?.estados[vigente];
}

/** Declaracion CSS `border-top` del trazo `divider` (`line`) del Fragmento: su ancho, estilo y color. */
function bordeDeDivisor(pintura: PinturaDeCajaDeSecuencia): string {
  const { props } = pintura.textos['divider']!;
  const estilo = String(props['style']);
  return `${num(Number(props['width']))}px ${estilo === 'dashed' || estilo === 'dotted' ? estilo : 'solid'} ${String(props['color'])}`;
}

/** Marco de un Fragmento con la pila de `fragment`; con su pestana y un divisor por operando a partir del segundo. */
function fragmentoHtml(marco: MarcoDeFragmento, contexto: Contexto, interaccion: string): Elemento {
  const pintura = contexto.estilo.pintura.secuencia!.fragmento;
  const estilos = estiloDeCaja(contexto, capasDeFragmento(pintura, marco.operator, pilaDeEstado(pintura, contexto.estados, idDeElementoDeSecuencia(interaccion, marco.ruta))));
  const borde = bordeDeDivisor(pintura);
  const divisores = marco.operands.flatMap((operando, k): Elemento[] =>
    operando.divider === undefined ? [] : [{ tag: 'div', attrs: { 'data-fragment-divider': `${marco.ruta}:${k}`, style: `${cajaAbsoluta(0, operando.divider - marco.y, marco.width, 0)};border-top:${borde};${opacidad(contexto.visibility(idDeElementoDeSecuencia(interaccion, marco.ruta, k)))}` }, hijos: [] }],
  );
  return {
    tag: 'div',
    attrs: { 'data-fragment': marco.ruta, 'data-operator': marco.operator, 'data-nivel': String(marco.nivel), ...atributoDeEstados(contexto.estados, idDeElementoDeSecuencia(interaccion, marco.ruta)), style: `${cajaAbsoluta(marco.x, marco.y, marco.width, marco.height)};pointer-events:none;${estilos};${opacidad(contexto.visibility(idDeElementoDeSecuencia(interaccion, marco.ruta)))}` },
    hijos: [{ tag: 'div', attrs: { 'data-fragment-tab': marco.ruta, style: `${cajaAbsoluta(marco.tab.x - marco.x, marco.tab.y - marco.y, marco.tab.width, marco.tab.height)};${estilos}` }, hijos: [] }, ...divisores],
  };
}

/** Texto SVG de la pestana (operador) y de cada guarda, centrados en sus cajas medidas. `operator` y `guard` del Tema dan color y peso. */
function textosDeFragmentoSvg(marco: MarcoDeFragmento, estilo: Contexto['estilo'], visibility: Visibilidad, interaccion: string): Elemento[] {
  const tamano = estilo.metricas.fontSize * estilo.metricas.escalaEtiqueta;
  const pintura = estilo.pintura.secuencia!.fragmento;
  const deOperador = pintura.textos['operator']?.props;
  const deGuarda = pintura.textos['guard']?.props;
  const color = pintura.colorDeGuarda;
  const texto = (visibilidad: number, atributos: Record<string, string>, caja: { x: number; y: number; width: number; height: number }, contenido: string, relleno: string, props?: Record<string, number | string>): Elemento => ({
    tag: 'text',
    attrs: {
      ...atributos,
      ...visibilidadSvg(visibilidad),
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
    texto(visibility(idDeElementoDeSecuencia(interaccion, marco.ruta)), { 'data-fragment-operator': marco.ruta }, marco.tab, marco.operator, estilo.texto, deOperador),
    ...(marco.title === undefined ? [] : [texto(visibility(idDeElementoDeSecuencia(interaccion, marco.ruta)), { 'data-ref-title': marco.ruta }, marco.title.box, marco.title.text, estilo.texto, deGuarda)]),
    ...marco.operands.flatMap((operando, k): Elemento[] => (operando.guard === undefined ? [] : [texto(visibility(idDeElementoDeSecuencia(interaccion, marco.ruta, k)), { 'data-fragment-guard': `${marco.ruta}:${k}` }, operando.guard.box, operando.guard.text, color, deGuarda)])),
  ];
}

/**
 * Nota "papel": poligono con la esquina superior derecha doblada, el relleno y el borde de la pila de `note` (con el
 * color y la opacidad de su papel) y el texto ya envuelto por el layout. No es un Nodo: no lleva cabecera, icono ni insignia.
 */
function notaSvg(nota: NotaColocada, estilo: Contexto['estilo'], interaccion: string, visibility: Visibilidad, estados: Estados | undefined): Elemento {
  const pintura = estilo.pintura.secuencia!.nota;
  const capasVigentes = pilaDeEstado(pintura, estados, idDeElementoDeSecuencia(interaccion, nota.ruta))?.capas ?? pintura.capas;
  const ultima = (familia: 'relleno' | 'borde'): CapaPintada | undefined => capasVigentes.filter((capa) => primitivasDeFamilia(familia).includes(capa.tipo)).at(-1);
  const { papel } = pintura;
  const capaDeRelleno = ultima('relleno');
  const capaDeBorde = ultima('borde');
  const color = String(capaDeBorde?.props['color'] ?? papel.color);
  const relleno = capaDeRelleno === undefined ? 'none' : String(capaDeRelleno.props['color'] ?? papel.color);
  const opacidadDeRelleno = num(papel.opacidadDeRelleno);
  const anchoDeTrazo = num(Number(capaDeBorde?.props['width'] ?? 1));
  const estiloDeTexto = pintura.textos['text']?.props;
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
    attrs: { 'data-note': idDeElementoDeSecuencia(interaccion, nota.ruta), 'data-anchor': nota.anchor, ...atributoDeEstados(estados, idDeElementoDeSecuencia(interaccion, nota.ruta)), ...visibilidadSvg(visibility(idDeElementoDeSecuencia(interaccion, nota.ruta))) },
    hijos: [
      { tag: 'path', attrs: { 'data-note-paper': '', d: contorno, fill: relleno, 'fill-opacity': opacidadDeRelleno, stroke: color, 'stroke-width': anchoDeTrazo }, hijos: [] },
      { tag: 'path', attrs: { d: doblez, fill: 'none', stroke: color, 'stroke-width': anchoDeTrazo }, hijos: [] },
      ...lineas,
    ],
  };
}
