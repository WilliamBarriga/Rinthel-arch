/**
 * `tema` — dueno del concepto de Tema (ADR 0008): catalogo de Primitivas y
 * Slots, esquema del Tema ya resuelto, Estilo resuelto (Metricas y pintura) y
 * colocacion de Slots.
 *
 * Posicion en la cadena (enmienda del ADR 0004): `canonico -> tema -> dsl ->
 * layout -> sesion -> render -> shell / cli`. Va despues de `canonico` porque
 * reutiliza `Issue`, `CODIGOS` y `candidatosCercanos` sin duplicarlos, y antes
 * de `dsl` porque el compilador de Temas valida con el catalogo. La Fuente
 * canonica guarda cada Tema como un sobre (`name`, `palette`) que `canonico`
 * valida; el contenido lo lee y valida este paquete (`resolverTema`).
 *
 * Interfaz:
 * - Catalogo: `CATALOGO`, `SLOTS`, `construirPrimitiva(tipo, props, paleta)` y
 *   `construirDisposicion(arbol)` (el mini-layout de Slots) devuelven todos los
 *   errores a la vez, con codigo estable y sugerencia "quisiste decir" cuando hay
 *   un candidato. Nunca recortan.
 * - Tema: `temaResueltoSchema` (estricto: `nodeStyles`/`edgeStyles` ya no existen),
 *   `resolverTema(tema)` (lanza si no cumple el contrato), `TEMA_NEUTRO`.
 * - Estilo resuelto: `estiloResuelto(tema) -> { metricas, pintura }`. Las
 *   Metricas (`metricasDe`) solo dependen de fuentes, tamano de texto y la disposicion de Slots;
 *   la pintura (Capas con colores literales) nunca las cambia.

 * - Cascada y parches: `aplicarOps(pila, ops, paleta, modo)` aplica parches por
 *   nombre de Capa (cambiar, anadir con `antes`/`despues`, quitar, `encima`) y
 *   devuelve todos los errores a la vez con el indice del parche y la Capa base
 *   que tocan; `validarOps` lo prueba contra varias pilas posibles. `cascada`
 *   da la pila para un Tipo, estado y override de la Vista (el ultimo gana).
 * - Aristas (ADR 0008): `arista` del Tema es una pila de trazos (`line`; un segundo
 *   trazo ancho y translucido da glow), marcadores de `origen` y `fin` (`arrow`,
 *   `dot`, `diamond`, `bar`, `via`) y una `etiqueta` (`label`) con modelo de caja.
 *   Cada Primitiva declara su `ubicacion` y `construirPrimitiva` la comprueba.
 *   De las Aristas solo la etiqueta (`scale`, `pad`) entra en las Metricas.
 *   `nodo.textos` da el estilo de texto (`text`) de cada Slot; solo pinta.
 * - Animacion: `construirMovimiento`, `construirKeyframes`, `construirTransicion`,
 *   `construirEfecto`, `construirEscalonado` y `duracionEnMs` validan la animacion declarativa
 *   (catalogo `MOVIMIENTOS`, `EFECTOS`, `PROPIEDADES_ANIMABLES`) y rellenan defectos; una Capa
 *   lleva `animacion` y `pintura.nodo.animacion` trae `transition`/`enter`/`exit`/`stagger`.
 *   Nada animado entra en las Metricas.
 * - Color: `validarColor` / `resolverColor` (nombre, `nombre/alfa`, `mix(a, b, t)`,
 *   `COLOR`, `ORIGEN`); `resolverTokens` sustituye `$token` por numeros.
 * - Slots: el Tema declara un arbol de cajas `row`/`column` (`CajaDeSlots`: gap, pad,
 *   alineacion por hijo, anidable). `colocarDisposicion(arbol, medida, ancho)` es el
 *   nucleo: devuelve un rectangulo absoluto por Slot y no conoce ninguno por nombre.
 *   `colocarNodo(contenido, metricas)` da el tamano de caja, el rectangulo de cada
 *   Slot y de cada fila de Atributo; `colocarEnCaja` lo hace sobre una caja ya medida.
 *   `contenidoDeNodo(nodo, metricas)` es la regla unica de lo que un Nodo aporta
 *   (titulo, Atributos visibles segun `atributosVisibles`, icono). `layout` y
 *   `render` usan lo mismo. Un Slot fuera del arbol no se pinta ni se mide.
 *
 * - Accesibilidad: `advertenciasDeContraste(tema, tipos)` (4.5:1 texto, 3:1 graficos, por Tipo y estado),
 *   `tiposSoloColor` y `leyendaDelTema` (Tipo, forma, color; `necesaria` si hay solo-color) solo calculan:
 *   que sean warnings y no bloqueen lo decide `sesion`. `TEMA_ALTO_CONTRASTE` es el Tema incorporado del visor.
 *
 * - Medicion de texto: el ancho viene de un origen `estimado` (por caracter; CLI,
 *   Workers, pruebas) o `medido` (`MedidasDeTexto`, que el visor toma tras
 *   `document.fonts.load` y entrega como datos: `tablaDeMetricas(tema, medidas)`).
 *   `textosAMedir(vista, tabla)` dice que medir. El nivel y el hash de cada fuente
 *   (`hashDeFuente`) entran en `claveDeMetricas`; los anchos no. Un texto sin
 *   medida cae a la estimacion.
 *
 * - Codigo (via de escape): la Primitiva `code` (Familia codigo) es una Capa mas que nombra un
 *   Componente de Tema (`component`, obligatoria); las demas propiedades son los parametros
 *   declarados, numero o texto tal cual. Nunca afecta a las Metricas. `usosDeCodigo(tema, vista?)`
 *   y `componentesDeTema` dicen que componentes usa un Tema (el "Tema con codigo" de `inspect` y
 *   `validate`) recorriendo la cascada completa.
 *
 * - Referencia: `referenciaDelCatalogo()` genera en Markdown la tabla del catalogo (Primitivas por
 *   Familia, Slots, Movimientos, Efectos) desde las mismas tablas que validan; `pnpm docs:catalogo`
 *   la escribe en `docs/referencia-catalogo.md` y una prueba comprueba que no se desvia.
 *
 * Invariantes: puro y determinista; sin I/O, reloj, azar ni DOM. Una Capa es
 * una instancia de una Primitiva del catalogo cerrado; el color es siempre un
 * nombre de Paleta. Modos de error: los datos invalidos se devuelven como
 * errores de catalogo; solo `resolverTema` lanza. Configuracion requerida: ninguna.
 * Solo importa `canonico`.
 */
export { CATALOGO, DEFINICION_DE_SLOT, SLOTS, construirPrimitiva, primitivasDe, resolverTokens, sugerir } from './catalogo';
export { ALINEACIONES, CABECERA_POR_DEFECTO, DIRECCIONES, DISPOSICION_POR_DEFECTO, SLOTS_SOLO_DE_NODO, alineacionDe, construirDisposicion, describirDisposicion, esCaja, slotsDe } from './disposicion';
export type { Alineacion, CajaDeSlots, Direccion, ElementoDeSlots, EntradaDeCaja, EntradaDeSlot, ErrorDeDisposicion, HojaDeSlots, PropiedadEscrita } from './disposicion';
export type { DefinicionDePrimitiva, DefinicionDePropiedad, ErrorDeCatalogo, NombreDePrimitiva, NombreDePrimitivaEn, NombreDeSlot, Primitiva, UbicacionDePrimitiva } from './catalogo';
export { crearPrng, fnv1a, giroDeCapa, semillaDeCapa } from './semilla';
export { GRUPO_POR_DEFECTO, TEMA_NEUTRO, leerOps, resolverTema, temaResueltoSchema } from './tema';
export type { TemaResuelto } from './tema';
export { atributosVisibles, claveDeMetricas, contenidoDeNodo, muestra, comoTabla, metricasDe, metricasDeHoja, metricasDeNodo, tablaDeMetricas, tablaUniforme, tamanoDeEtiqueta } from './metricas';
export type { Metricas, TablaDeMetricas } from './metricas';
export { anchoDeTexto, claveDeTexto, hashDeFuente } from './medicion';
export type { MedicionDeMetricas, MedidasDeTexto, TextoAMedir } from './medicion';
export { textosAMedir } from './textos-a-medir';
export { pilaDeFuente, resolverFuentes } from './fuentes';
export type { CaraDeFuente, FuenteFaltante } from './fuentes';
export { referenciaDelCatalogo } from './referencia';
export { PUNTO_DE_TITULO_EM, alturaDeCabecera, colocarDisposicion, colocarEnCaja, colocarNodo, medirDisposicion, textoDeAtributo, textoDeTitulo } from './slots';
export type { ColocacionDeNodo, ContenidoDeNodo, MedidaDeSlot, Rect, Tamano } from './slots';
export { estiloResuelto } from './estilo';
export type { AnimacionDeNodo, CapaPintada, EstiloResuelto, FuentesResueltas, OpcionesDeEstilo, Pintura, PinturaDeArista, PinturaDeElemento, PinturaDeNodo, PinturaDePagina, PrimitivaPintada } from './estilo';
export { aplicarOps, cascada, ESTADOS, opTocaMetricas, parsearEstado, validarOps } from './parches';
export type { CapaDeTema, ElementoDeTema, ErrorDeOp, Estado, ModoDeParche, OpDeCapa, ResultadoDeEstado } from './parches';
export { resolverColor, validarColor } from './color';
export type { ContextoDeColor, ErrorDeColor } from './color';
export { advertenciasDeContraste, leyendaDelTema, razonDeContraste, tiposSoloColor } from './contraste';
export type { AdvertenciaDeContraste, EntradaDeLeyenda, Leyenda, TipoParaLeyenda } from './contraste';
export { TEMA_ALTO_CONTRASTE } from './alto-contraste';
export { componentesDeTema, usosDeCodigo } from './codigo';
export type { UsoDeComponente } from './codigo';
export { EASINGS, EFECTOS, MOVIMIENTOS, PROPIEDADES_ANIMABLES, construirEfecto, construirEscalonado, construirKeyframes, construirMovimiento, construirTransicion, duracionEnMs } from './animacion';
export type { Animacion, Easing, Efecto, KeyframesDeCapa, Movimiento, NombreDeEfecto, NombreDeMovimiento, ParametroDeAnimacion, PasoDeKeyframes, PropiedadAnimable, Reducido, Transicion } from './animacion';
