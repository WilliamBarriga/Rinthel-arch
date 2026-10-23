/**
 * `shell` — capa interactiva sobre `render`: pan/zoom, seleccion, filtrado por
 * viewport, colapso con relayout en Worker, drill-down con breadcrumbs, Pasos,
 * zoom semantico, estado en el hash de URL y recarga de Tema.
 *
 * Interfaz publica:
 * - `<VistaInteractiva source view theme layout width height ... />`: resuelve la
 *   Vista `view` de la Fuente canonica (`resolveView`, con `state` opcional de
 *   colapso), pide la Geometria al adaptador `layout` y la dibuja con `Diagram`.
 * - `AdaptadorDeLayout = (vista, tema) => Promise<Geometria>`: seam de layout.
 *   En produccion envuelve `layoutView` (ELK, o su motor en Web Worker); en
 *   pruebas es un fake en memoria.
 * - `Camara` (`{x, y, width, height}` en unidades de la geometria; escala 1 =
 *   `width`/`height` del lienzo) y `VistaInteractivaProps`.
 *
 * Camara: controlada con `camera` + `onCameraChange` (el padre decide; si
 * ignora el aviso, la camara no se mueve) o interna si no se pasa `camera`.
 * Pan y zoom los da d3-zoom (arrastre, rueda, tactil); escala entre 0.05 y 16.
 * Seleccion: `selected` controlada o interna; `onSelect(id)` al pulsar un Nodo, una Arista,
 * su etiqueta o la fila de un Atributo (`nodo#atributo`); la marca la dibuja `render` (prop
 * `estados`, estado `seleccionado`, con `data-selected="<id>"`); el shell no pinta overlays propios.
 * Chrome (pasos, breadcrumbs): clases `rd-*` y variables CSS `--rd-fondo|texto|borde|acento|fuente`
 * emitidas en el contenedor desde el Estilo resuelto del Tema, sin estilos en linea. Con mayusculas, ctrl o meta la Seleccion crece
 * (o decrece) en lugar de reemplazarse. Que hay bajo el clic lo decide el nucleo de
 * interaccion (`elementoBajo`, puro y sin DOM, sobre la Vista completa: el culling del
 * viewport no lo afecta); `VistaInteractiva` solo traduce el raton a un punto del lienzo.
 * Nucleo de interaccion: `elementoBajo(vista, geometria, tema, punto, {tolerancia?, atributos?})`
 * devuelve el `ElementoSeleccionable` superior (`{tipo: nodo|arista|etiqueta|atributo, id}`) o
 * `undefined`; `cajaDeElemento` da su caja en el lienzo; `seleccionar(seleccion, elemento, modo)`
 * (`reemplazar|agregar|quitar|alternar`) es el reductor de la `Seleccion`, inmutable.
 * Pasos: si la Vista tiene `steps`, el Paso actual (`step` controlado con
 * `onStepChange`, o interno desde `defaultStep`, 0 por defecto) se pasa por
 * `revealAt` y se dibujan controles anterior/siguiente; la geometria no cambia.
 * Una `visibility` explicita manda sobre la derivada; sin `steps` no hay controles.
 * Drill-down: un Nodo con `link` en la Vista activa, al pulsarlo, lleva a la Vista
 * enlazada. La ruta recorrida (`path`, ids de Vista; la ultima es la activa) se
 * dibuja como breadcrumbs con boton `Atras`; pulsar un breadcrumb vuelve a esa
 * posicion y descarta lo posterior. No hay jerarquia: la ruta admite repetidos
 * (ciclos). Vista activa y ruta son controlables: `view`/`onViewChange` y
 * `path`/`onPathChange` (ambos avisos se emiten en cada navegacion); sin ellas
 * manda el estado interno desde `defaultView`. Si `view` y `path` difieren, la
 * ruta se trunca hasta `view` (si ya estaba) o la agrega. Falta `view`, `path` y
 * `defaultView`: lanza. Cambiar de Vista remonta la Vista activa (se pierde el
 * estado no controlado). `cachedGeometry` vale para la Vista declarada
 * (`view ?? defaultView`); con navegacion usa `cachedGeometries` por id.
 * Iconos: `icons` (`IconProvider`) resuelve la clave `icon` de cada Nodo; sin el no se dibujan.
 * Recarga de Tema: `themeUpdates` (`SuscripcionDeTema`) es el puerto por el que el
 * consumidor entrega el Tema resuelto al guardar el archivo de tema. La Geometria
 * solo se recalcula si cambia `claveDeLayout` (fuentes, tamano de texto); la
 * paleta recolorea sin relayout y sin recomputar la Vista (el Modelo no se
 * recompila). Quien alimenta el puerto es el consumidor: observa el archivo de
 * tema, recompila (`compile` de `dsl`), toma el Tema resuelto de la Fuente
 * canonica y lo entrega a `alCambiar`. Limitacion de v1: no hay consumidor
 * incluido (el HTML de `cli export --format html` es estatico, sin servidor ni
 * watch, y no pasa `themeUpdates`); la historia 35 queda cubierta por el puerto y
 * sus pruebas, y el watch/dev server queda fuera de alcance.
 * Arrastre de Nodos (solo bajo `dev`): con `onMoveNode({id, x, y})` los Nodos se arrastran y al
 * soltar avisan su posicion nueva (relativa al Grupo padre, unidades de la geometria; es el
 * valor de un Pin). El Nodo se queda donde se solto hasta que llega otra geometria, o vuelve
 * si el aviso resuelve `false`. Sin `onMoveNode` (export estatico) no hay arrastre de Nodos.
 * `crearControlDeEdicion(archivos)` conecta las Intenciones y el historial de `sesion` a
 * `aplicar`, `deshacer` y `rehacer` (ADR 0007).
 * `crearEnviadorDePin(fetch)` envia la intencion a `POST /api/pin` de dev y devuelve
 * `{ok:true}` o `{ok:false, desactualizado, mensaje}` (409 por hash); nunca lanza.
 * La intencion es `IntencionDePin` (`{vista, nodo, x, y, hash}`, declarada en `canonico` y
 * reexportada aqui).
 * Filtrado por viewport: solo se dibujan Nodos y Aristas cuya caja o ruta cruza
 * la camara; un Grupo visible conserva solo sus hijos visibles.
 *
 * Colapso (ADR 0003): los controles de Grupo de `render` alternan el Grupo. El
 * estado (`EstadoDeColapso`) es controlado con `state` + `onStateChange` o
 * interno. Relayout solo en estados no cacheados: la cache es por estructura
 * (`claveDeLayout`) y `cachedGeometry` (geometria del estado por defecto, p. ej.
 * la del build) la siembra sin llamar al adaptador. El Grupo tocado se mantiene
 * fijo en pantalla: la camara se compensa (`onCameraChange` avisa) y la geometria
 * se interpola `morphMs` ms (0 lo desactiva; un gesto del usuario lo corta). Una
 * expansion que dejaria mas de `maxNodes` (1000) Nodos visibles se rechaza y se
 * avisa por `onLimit`.
 * Worker: `adaptadorDeWorker(puerto)` (pagina) y `servirLayout(puerto)` (dentro
 * del Worker: `servirLayout(self)`) corren el mismo `layoutView` que el build.
 * Zoom semantico: la escala (`width` del lienzo / ancho de la camara) elige el nivel de
 * detalle del texto que pasa a `render` (`nivelDeDetalle`: etiqueta, titulo, titulo +
 * Atributos; el `label` de la Vista se respeta en los tres, y solo `completo` anade Atributos; umbrales por defecto 0.4 y 0.8, ajustables con `detailThresholds`). La
 * geometria, la estructura y el colapso no dependen de la escala: colapsar o expandir
 * sigue siendo una accion explicita (`state`).
 *
 * Hash de URL: `useEstadoEnHash({ source, hash, defaultView?, camera? })` devuelve las
 * props controladas de `VistaInteractiva` (`view`, `path`, `state`, `selected`, `step`,
 * `camera?` y sus avisos) para esparcirlas: `<VistaInteractiva {...props} ... />`.
 * `hash` es el adaptador `AdaptadorDeHash` (`hashDelNavegador(window)` en produccion,
 * un fake en pruebas). Formato: `p` (ruta, repetido), `e`/`c` (Grupos abiertos/cerrados),
 * `s` (seleccion), `t` (Paso), `cam=x,y,w,h` (solo con `camera: true`); lo que vale su
 * default se omite. `serializarEstado`/`deserializarEstado` son las funciones puras:
 * ida y vuelta sin perdida; hash invalido o con ids inexistentes cae al default por
 * campo, sin lanzar. Cambiar de Vista (ultimo de la ruta) reinicia colapso, seleccion,
 * Paso y viewport y empuja una entrada de historial; el resto reemplaza la entrada. El
 * atras del navegador (hashchange/popstate) reemplaza el estado.
 *
 * Invariantes: no guarda verdad propia salvo camara y seleccion cuando no son
 * controladas; solo dibuja lo que `render` devuelve; un layout que llega tarde
 * (Vista, Tema o adaptador cambiaron) se descarta, y mientras llega el nuevo se
 * sigue mostrando el anterior. Modos de error: Vista inexistente lanza al
 * renderizar; un rechazo del adaptador va a `onError` o, sin el, se lanza al
 * renderizar (para un error boundary). Configuracion requerida: Fuente canonica,
 * Vista, Tema, adaptador de layout y tamano del lienzo. Peer React 18 y 19.
 * Solo importa paquetes anteriores en la cadena `canonico -> dsl -> layout -> render -> shell`.
 */
export { VistaInteractiva } from './vista-interactiva';
export type { AdaptadorDeLayout, VistaInteractivaProps } from './vista-interactiva';
export { SELECCION_VACIA, cajaDeElemento, elementoBajo, seleccionar } from './interaccion';
export type { ElementoSeleccionable, ModoDeSeleccion, OpcionesDeHitTest, Seleccion, TipoDeElemento } from './interaccion';
export type { PropsDeNavegacion } from './navegacion';
export type { PropsDePasos } from './pasos';
export type { AjustesDeInteraccion } from './configuracion';
export type { RelojDeCuadros } from './morph';
export type { SuscripcionDeTema } from './tema-vigente';
export { UMBRALES_POR_DEFECTO, nivelDeDetalle } from './zoom-semantico';
export type { UmbralesDeDetalle } from './zoom-semantico';
export type { Camara, NivelDeDetalle } from 'render';
export type { IconProvider } from 'canonico';
export { deserializarEstado, hashDelNavegador, serializarEstado, vistaPorDefecto } from './hash';
export type { AdaptadorDeHash, EstadoDeShell } from './hash';
export { useEstadoEnHash } from './estado-en-hash';
export type { OpcionesDeEstadoEnHash, PropsDeEstadoEnHash } from './estado-en-hash';
// La `IntencionDePin` vive en `canonico`; se reexporta para no renombrar la interfaz de `shell`.
export { crearEnviadorDePin } from './enviar-pin';
export type { EnviadorDePin, ResultadoDeEnvioDePin } from './enviar-pin';
export type { IntencionDePin } from 'canonico';
export { crearControlDeEdicion } from './control-de-edicion';
export type { ControlDeEdicion, ResultadoDeEdicion } from './control-de-edicion';
export type { Historial, Intencion } from 'sesion';
export { adaptadorDeWorker } from './layout-en-worker';
export { servirLayout } from './servir-layout';
export type { PuertoDeMensajes } from './layout-en-worker';
