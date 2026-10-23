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
 *   `construirSlots(nombres)` devuelven todos los errores a la vez, con codigo
 *   estable y sugerencia "quisiste decir" cuando hay un candidato. Nunca recortan.
 * - Tema: `temaResueltoSchema` (estricto: `nodeStyles`/`edgeStyles` ya no existen),
 *   `resolverTema(tema)` (lanza si no cumple el contrato), `TEMA_NEUTRO`.
 * - Estilo resuelto: `estiloResuelto(tema) -> { metricas, pintura }`. Las
 *   Metricas (`metricasDe`) solo dependen de fuentes, tamano de texto y Slots;
 *   la pintura (Capas con colores literales) nunca las cambia.

 * - Cascada y parches: `aplicarOps(pila, ops, paleta, modo)` aplica parches por
 *   nombre de Capa (cambiar, anadir con `antes`/`despues`, quitar, `encima`) y
 *   devuelve todos los errores a la vez con el indice del parche y la Capa base
 *   que tocan; `validarOps` lo prueba contra varias pilas posibles. `cascada`
 *   da la pila para un Tipo, estado y override de la Vista (el ultimo gana).
 * - Color: `validarColor` / `resolverColor` (nombre, `nombre/alfa`, `mix(a, b, t)`,
 *   `COLOR`, `ORIGEN`); `resolverTokens` sustituye `$token` por numeros.
 * - Slots: `colocarNodo(titulo, atributos, metricas)` da el tamano de caja y el
 *   rectangulo de cada Slot y de cada fila de Atributo; `colocarEnCaja` lo hace
 *   sobre una caja ya medida. `layout` y `render` usan lo mismo.
 *   `atributosVisibles` es la regla unica de que Atributos se muestran.
 *
 * - Medicion de texto: el ancho viene de un origen `estimado` (por caracter; CLI,
 *   Workers, pruebas) o `medido` (`MedidasDeTexto`, que el visor toma tras
 *   `document.fonts.load` y entrega como datos: `tablaDeMetricas(tema, medidas)`).
 *   `textosAMedir(vista, tabla)` dice que medir. El nivel y el hash de cada fuente
 *   (`hashDeFuente`) entran en `claveDeMetricas`; los anchos no. Un texto sin
 *   medida cae a la estimacion.
 *
 * Invariantes: puro y determinista; sin I/O, reloj, azar ni DOM. Una Capa es
 * una instancia de una Primitiva del catalogo cerrado; el color es siempre un
 * nombre de Paleta. Modos de error: los datos invalidos se devuelven como
 * errores de catalogo; solo `resolverTema` lanza. Configuracion requerida: ninguna.
 * Solo importa `canonico`.
 */
export { CATALOGO, SLOTS, construirPrimitiva, construirSlots, resolverTokens, sugerir } from './catalogo';
export type { DefinicionDePrimitiva, DefinicionDePropiedad, ErrorDeCatalogo, NombreDePrimitiva, NombreDeSlot, Primitiva } from './catalogo';
export { crearPrng, fnv1a, giroDeCapa, semillaDeCapa } from './semilla';
export { TEMA_NEUTRO, leerOps, resolverTema, temaResueltoSchema } from './tema';
export type { TemaResuelto } from './tema';
export { atributosVisibles, claveDeMetricas, comoTabla, metricasDe, metricasDeHoja, metricasDeNodo, tablaDeMetricas, tablaUniforme, tamanoDeEtiqueta, textoDeAtributo } from './metricas';
export type { Metricas, TablaDeMetricas } from './metricas';
export { anchoDeTexto, claveDeTexto, hashDeFuente } from './medicion';
export type { MedicionDeMetricas, MedidasDeTexto, TextoAMedir } from './medicion';
export { textosAMedir } from './textos-a-medir';
export { colocarEnCaja, colocarNodo } from './slots';
export type { ColocacionDeNodo, Rect } from './slots';
export { estiloResuelto } from './estilo';
export type { CapaPintada, EstiloResuelto, OpcionesDeEstilo, Pintura, PinturaDeNodo } from './estilo';
export { aplicarOps, cascada, ESTADOS, opTocaMetricas, validarOps } from './parches';
export type { CapaDeTema, ErrorDeOp, Estado, ModoDeParche, OpDeCapa } from './parches';
export { resolverColor, validarColor } from './color';
export type { ContextoDeColor, ErrorDeColor } from './color';
