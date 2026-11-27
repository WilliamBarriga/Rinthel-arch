/**
 * `tema` (ADR 0008): catalogo de Primitivas y Slots, esquema del Tema resuelto,
 * Estilo resuelto (`estiloResuelto` -> Metricas y pintura), colocacion de Slots,
 * cascada de parches, animacion, color, contraste y medicion de texto.
 * Invariantes: puro y determinista (sin I/O, reloj, azar ni DOM); las Metricas solo dependen
 * de fuentes, tamano de texto y disposicion de Slots, nunca de pintura, animacion ni `code`.
 * Errores: los datos invalidos se devuelven todos a la vez como errores; solo `resolverTema` lanza.
 * Dependencias: solo `canonical`.
 */
export { CATALOGO, DEFINICION_DE_SLOT, SLOTS, SLOTS_DE_TEXTO, construirPrimitiva, primitivasDe, primitivasDeFamilia, resolverTokens, sugerir, validarPropiedades } from './catalogo';
export { ALINEACIONES, CABECERA_POR_DEFECTO, DIRECCIONES, DISPOSICION_POR_DEFECTO, SLOTS_SOLO_DE_NODO, alineacionDe, construirDisposicion, describirDisposicion, esCaja, slotsDe } from './disposicion';
export type { Alineacion, CajaDeSlots, Direccion, ElementoDeSlots, EntradaDeCaja, EntradaDeSlot, ErrorDeDisposicion, HojaDeSlots, PropiedadEscrita } from './disposicion';
export type { DefinicionDePrimitiva, DefinicionDePropiedad, ErrorDeCatalogo, NombreDePrimitiva, NombreDePrimitivaEn, NombreDeSlot, NombreDeSlotDeTexto, Primitiva, UbicacionDePrimitiva } from './catalogo';
export { crearPrng, fnv1a, giroDeCapa, semillaDeCapa } from './semilla';
export { GRUPO_POR_DEFECTO, TEMA_NEUTRO, leerOps, resolverTema, temaParaDiagrama, temaResueltoSchema } from './tema';
export type { TemaResuelto } from './tema';
export { anchoDeChips, atributosVisibles, chipsDeClaves, contenidoDeNodo, muestra, piezasDeAtributo, textoDeAtributo } from './contenido';
export type { ChipDeClave } from './contenido';
export type { ContenidoDeNodo } from './contenido';
export { ANCHO_MAXIMO_DE_NOTA, ESQUINA_DE_NOTA, LARGO_DE_MARCADOR_ER, RELLENO_DE_NOTA, cajaDeNota, estiloDeTextoDeNota, palabrasDeNota, claveDeMetricas, comoTabla, metricasDe, metricasDeHoja, metricasDeNodo, tablaDeMetricas, tablaUniforme, tamanoDeEtiqueta, textoDeGuarda } from './metricas';
export type { Metricas, TablaDeMetricas } from './metricas';
export { anchoDeTexto, claveDeTexto, hashDeFuente } from './medicion';
export type { MedicionDeMetricas, MedidasDeTexto, TextoAMedir } from './medicion';
export { textosAMedir } from './textos-a-medir';
export { fuentesSinReserva, pilaDeFuente, resolverFuentes } from './fuentes';
export type { CaraDeFuente, FuenteFaltante } from './fuentes';
export { referenciaDelCatalogo } from './referencia';
export { PUNTO_DE_TITULO_EM, alturaDeCabecera, colocarDisposicion, colocarEnCaja, colocarNodo, medirDisposicion, textoDeSlot } from './slots';
export type { ColocacionDeNodo, MedidaDeSlot, Rect, Tamano } from './slots';
export { estiloResuelto, pilaDeFila } from './estilo';
export { ALTO_DE_FILA, CLAVES_DE_FILA, NOMBRES_DE_TEXTO_DE_FILA, TEXTOS_DE_FILA, claveDeFila } from './fila';
export type { TextoDeFila, VarianteDeFila } from './fila';
export { primitivaPintada } from './estilo';
export type { AnimacionDeNodo, CapaPintada, EstiloResuelto, FuentesResueltas, OpcionesDeEstilo, Pintura, PinturaDeActivacion, PinturaDeArista, PinturaDeCajaDeSecuencia, PinturaDeElemento, PinturaDeFila, PinturaDeFragmento, PinturaDeNodo, PinturaDeNota, PinturaDePagina, PinturaDeSecuencia, PinturaDeTrazoDeSecuencia, PrimitivaPintada, TrazoDeVariante, TrazosDeSecuencia } from './estilo';
export { capasDeAristaEr } from './mensajes';
export { elementosDeTema } from './elementos';
export type { CapaDescrita, ElementoDescrito, ElementosDescritos } from './elementos';
export { BLOQUES_DE_SECUENCIA, ESPECIFICACION_DE_SECUENCIA, metricasDeSecuencia } from './secuencia';
export type { BloqueDeSecuencia, EspecificacionDeBloque, MetricaDeBloque, MetricasDeSecuencia } from './secuencia';
export { aplicarOps, cascada, ESTADOS, TIPOS_DE_DIAGRAMA, opTocaMetricas, parsearEstado, validarOps } from './parches';
export type { CapaDeTema, ElementoDeTema, ErrorDeOp, Estado, ModoDeParche, OpDeCapa, ResultadoDeEstado, TipoDeDiagrama } from './parches';
export { resolverColor, validarColor } from './color';
export type { ContextoDeColor, ErrorDeColor } from './color';
export { advertenciasDeContraste, aristaIdentificanteSoloColor, leyendaDelTema, mensajesSoloColor, razonDeContraste, tiposSoloColor } from './contraste';
export type { AdvertenciaDeContraste, EntradaDeLeyenda, Leyenda, TipoParaLeyenda } from './contraste';
export { TEMA_ALTO_CONTRASTE } from './alto-contraste';
export { componentesDeTema, usosDeCodigo } from './codigo';
export type { UsoDeComponente } from './codigo';
export { EASINGS, EFECTOS, MOVIMIENTOS, PROPIEDADES_ANIMABLES, construirEfecto, construirEscalonado, construirKeyframes, construirMovimiento, construirTransicion, duracionEnMs } from './animacion';
export type { Animacion, Easing, Efecto, KeyframesDeCapa, Movimiento, NombreDeEfecto, NombreDeMovimiento, ParametroDeAnimacion, PasoDeKeyframes, PropiedadAnimable, Reducido, Transicion } from './animacion';
