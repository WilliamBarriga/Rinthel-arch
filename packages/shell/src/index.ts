/**
 * `shell` — capa interactiva sobre `render` (pan/zoom, colapso, drill-down).
 *
 * Invariantes: estado de hash entra como props (no guarda verdad propia);
 * pan/zoom y relayout en Worker son adaptadores inyectados; solo dibuja lo
 * que `render` devuelve. Modos de error: hash ilegible degrada al default;
 * fallos de uso e internos lanzan excepcion. Configuracion requerida:
 * Fuente canonica, Vista inicial, Tema y adaptador de layout.
 * Solo importa paquetes anteriores en la cadena `canonico -> dsl -> layout -> render -> shell`.
 */
export const paquete = 'shell';
