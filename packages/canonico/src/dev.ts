/**
 * Protocolo de `dev`, con un solo dueno, que comparten el Workspace vivo (`sesion`), el servidor (`cli`) y la pagina
 * (`estudio`): rutas, eventos SSE con nombre, esquemas de lo que el Workspace vivo produce (estado, Diferencia, Historial de archivos,
 * actividad, archivos, `inspect` no encontrado) y de las peticiones de escritura, la identidad de los elementos de una
 * Diferencia y la traduccion de un rechazo a estado HTTP (ADR 0004, 0007). `estudio/protocolo` lo reexporta para la pagina.
 * Invariantes: sin I/O; un valor de aqui (ruta, evento, comando, estado HTTP) es el unico que usan el servidor real y `devEnMemoria`.
 */
import { z } from 'zod';

import { eventoDeActividadSchema } from './actividad';
import { edicionDeTextoSchema } from './edit';
import { fuenteCanonicaSchema } from './esquema';
import { MOTIVOS_DE_RECHAZO } from './pin';
import type { MotivoDeRechazo } from './pin';
import { RUTA_DE_FUENTES } from './ruta-de-fuentes';
import { issueSchema } from './salida';

/** Rutas de `dev`; las que terminan en `/` son prefijos (`<prefijo><argumento>`). */
export const RUTAS_DE_DEV = {
  estado: '/api/estado',
  eventos: '/eventos',
  archivos: '/api/archivos',
  archivo: '/api/archivo/',
  edit: '/api/edit',
  deshacer: '/api/deshacer',
  rehacer: '/api/rehacer',
  saltar: '/api/historial/saltar',
  confiar: '/api/confiar',
  codigo: '/api/codigo',
  componentes: '/componentes.js',
  inspect: '/api/inspect/',
  vista: '/api/vista/',
  fuentes: RUTA_DE_FUENTES,
} as const;

/** 409 si lo que vio quien escribe ya no esta en disco; 422 el resto (ADR 0007). */
export const estadoHttpDeRechazo = (motivo: MotivoDeRechazo): 409 | 422 => (motivo === 'stale-hash' ? 409 : 422);

export const issueDeDevSchema = issueSchema.extend({
  /** Enlace `vscode://file/<ruta>:<linea>:<columna>`. */
  href: z.string(),
});

/**
 * `pintura`: Capas o animacion, se reaplica el Estilo sobre la Geometria vigente; `estructura`: Metricas,
 * fuentes, Modelo o Vistas, relayout; `codigo`: un `.tsx`, se re-registra el componente sin relayout.
 * Con varios a la vez gana el mas fuerte: estructura, codigo, pintura.
 */
export const TIPOS_DE_CAMBIO = ['pintura', 'estructura', 'codigo'] as const;
export type TipoDeCambio = (typeof TIPOS_DE_CAMBIO)[number];

/**
 * La pagina devuelve `version` al editar y el servidor la traduce a los hashes que vio (resuelve la concurrencia).
 * Con `cambio: 'pintura'` la pagina no pide Geometria.
 */
export const estadoDeDevSchema = z.object({
  version: z.number().int(),
  /** Ausente en el estado inicial y cuando la recompilacion fallo (se conserva el ultimo dibujo bueno). */
  cambio: z.enum(TIPOS_DE_CAMBIO).optional(),
  /** Ausente mientras el Workspace nunca compilo sin errores. */
  fuente: fuenteCanonicaSchema.optional(),
  iconos: z.record(z.string(), z.string()),
  vistas: z.array(z.string()),
  /** Ruta relativa -> hash del contenido; se sirven en `/fuentes/<ruta>`. Ausente si el adaptador no los conoce. */
  fuentes: z.record(z.string(), z.string()).optional(),
  issues: z.array(issueDeDevSchema),
});

export type IssueDeDev = z.infer<typeof issueDeDevSchema>;
export type EstadoDeDev = z.infer<typeof estadoDeDevSchema>;

/**
 * Elemento de una Diferencia con su identidad: Nodo por `id`; Atributo por Nodo + `name`; Arista por `from` + `to`
 * (ids de Nodo) + ordinal dentro del mismo par; Interaccion por `id`; Mensaje por `id` o, sin el, por Interaccion +
 * `posicion` (indice entre sus Mensajes, aplanando Fragmentos; `ruta` es la del visor, `2.0.1`); Vista por `id`; Tema por `name`.
 */
export const elementoDeDiferenciaSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('nodo'), id: z.string() }),
  z.object({ tipo: z.literal('atributo'), nodo: z.string(), name: z.string() }),
  z.object({ tipo: z.literal('arista'), from: z.string(), to: z.string(), ordinal: z.number().int() }),
  z.object({ tipo: z.literal('interaccion'), id: z.string() }),
  z.object({ tipo: z.literal('mensaje'), interaccion: z.string(), id: z.string().optional(), posicion: z.number().int(), ruta: z.string() }),
  z.object({ tipo: z.literal('vista'), id: z.string() }),
  z.object({ tipo: z.literal('tema'), name: z.string() }),
]);
export type ElementoDeDiferencia = z.infer<typeof elementoDeDiferenciaSchema>;
export type TipoDeElementoDeDiferencia = ElementoDeDiferencia['tipo'];

/** Clave de identidad de un elemento (dos elementos con la misma clave son el mismo). */
export function claveDeElemento(elemento: ElementoDeDiferencia): string {
  switch (elemento.tipo) {
    case 'nodo':
    case 'interaccion':
    case 'vista':
      return `${elemento.tipo}:${elemento.id}`;
    case 'atributo':
      return `atributo:${elemento.nodo}#${elemento.name}`;
    case 'arista':
      return `arista:${elemento.from}->${elemento.to}:${elemento.ordinal}`;
    case 'mensaje':
      return `mensaje:${elemento.interaccion}:${elemento.id ?? `#${elemento.posicion}`}`;
    case 'tema':
      return `tema:${elemento.name}`;
  }
}

/** Tipo (en CONTEXT.md) y nombre legibles de un elemento; ordinales y posiciones desde 1. */
export function etiquetaDeElemento(elemento: ElementoDeDiferencia): { tipo: string; id: string } {
  switch (elemento.tipo) {
    case 'nodo':
      return { tipo: 'Nodo', id: elemento.id };
    case 'atributo':
      return { tipo: 'Atributo', id: `${elemento.nodo}#${elemento.name}` };
    case 'arista':
      return { tipo: 'Arista', id: `${elemento.from} -> ${elemento.to}${elemento.ordinal > 0 ? ` (${elemento.ordinal + 1})` : ''}` };
    case 'interaccion':
      return { tipo: 'Interaccion', id: elemento.id };
    case 'mensaje':
      return { tipo: 'Mensaje', id: `${elemento.interaccion}:${elemento.id ?? `#${elemento.posicion + 1}`}` };
    case 'vista':
      return { tipo: 'Vista', id: elemento.id };
    case 'tema':
      return { tipo: 'Tema', id: elemento.name };
  }
}

/** `texto`: etiqueta, descripcion, texto del Mensaje; `estructura`: lo demas. */
export const CLASES_DE_PROPIEDAD = ['texto', 'estructura'] as const;
export type ClaseDePropiedad = (typeof CLASES_DE_PROPIEDAD)[number];
const propiedadCambiadaSchema = z.object({ nombre: z.string(), clase: z.enum(CLASES_DE_PROPIEDAD) });
export type PropiedadCambiada = z.infer<typeof propiedadCambiadaSchema>;
const elementoCambiadoSchema = z.object({ elemento: elementoDeDiferenciaSchema, propiedades: z.array(propiedadCambiadaSchema) });
export type ElementoCambiado = z.infer<typeof elementoCambiadoSchema>;

/** Diferencia (CONTEXT.md) entre dos Fuentes canonicas; la calcula `diferenciar` de `sesion`. */
export const diferenciaSchema = z.object({
  agregados: z.array(elementoDeDiferenciaSchema),
  quitados: z.array(elementoDeDiferenciaSchema),
  cambiados: z.array(elementoCambiadoSchema),
});
export type Diferencia = z.infer<typeof diferenciaSchema>;

/** Una Diferencia sin agregados, quitados ni cambiados. */
export const diferenciaVacia = (d: Diferencia): boolean => d.agregados.length === 0 && d.quitados.length === 0 && d.cambiados.length === 0;

/**
 * `propio`: la produjo una escritura de la UI (Intencion, ediciones de texto, `fix`, deshacer, rehacer, saltar),
 * reconocida por el hash de lo escrito; `externo`: cualquier otra (agente, otro editor, CLI).
 */
export const ORIGENES_DE_DIFERENCIA = ['propio', 'externo'] as const;
export type OrigenDeDiferencia = (typeof ORIGENES_DE_DIFERENCIA)[number];

/**
 * Datos de `event: diferencia`: la Diferencia de la Fuente contra la ultima Sesion buena, empujada tras el `estado` de
 * la misma `version` y solo si no es vacia. Varias Sesiones con errores seguidas dan una sola al volver a compilar
 * (externa si alguna de las escrituras intermedias lo fue). La pagina no recalcula: solo proyecta.
 */
export const diferenciaDeDevSchema = diferenciaSchema.extend({ version: z.number().int(), origen: z.enum(ORIGENES_DE_DIFERENCIA) });
export type DiferenciaDeDev = z.infer<typeof diferenciaDeDevSchema>;

/**
 * Datos de `event: historial` (al conectar y tras cada recompilacion): el Historial de archivos de `dev`, `pasado` de la
 * entrada mas vieja a la mas reciente y `futuro` desde la siguiente a rehacer. `id` es un contador estable del proceso
 * (`0` es Inicio), `cuando` la hora en ms y `descripcion` la arma el servidor. `alcanzable: false` (con `motivo`) si
 * saltar a ella restauraria un archivo que cambio por fuera.
 */
const alcanceSchema = { alcanzable: z.boolean(), motivo: z.string().optional() };
export const entradaDelHistorialDeDevSchema = z.object({ id: z.number().int().positive(), descripcion: z.string(), archivos: z.array(z.string()), cuando: z.number(), ...alcanceSchema });
export const historialDeDevSchema = z.object({ pasado: z.array(entradaDelHistorialDeDevSchema), futuro: z.array(entradaDelHistorialDeDevSchema), inicio: z.object(alcanceSchema) });
export type EntradaDelHistorialDeDev = z.infer<typeof entradaDelHistorialDeDevSchema>;
export type HistorialDeDev = z.infer<typeof historialDeDevSchema>;

/** `POST /api/historial/saltar { id }`: 200 tras escribir el destino, 409 si cambio por fuera, 422 `unknown-entry`. */
export const peticionDeSaltoSchema = z.object({ id: z.number().int().nonnegative() });
export const INICIO_DEL_HISTORIAL_DE_DEV = 0;

/** Subcomandos de `inspect` y de `GET /api/inspect/<comando>/<argumento>`; las opciones de `tema` van en la query. */
export const COMANDOS_DE_INSPECT = ['search', 'node', 'view', 'interaction', 'theme'] as const;
export type ComandoDeInspect = (typeof COMANDOS_DE_INSPECT)[number];

export function rutaDeInspect(comando: ComandoDeInspect, argumento: string, opciones: Readonly<Record<string, string>> = {}): string {
  const query = new URLSearchParams(opciones).toString();
  return `${RUTAS_DE_DEV.inspect}${comando}/${encodeURIComponent(argumento)}${query === '' ? '' : `?${query}`}`;
}

/** `GET /api/archivos`: los `.dg` del Workspace y los de `--theme-path` (`soloLectura: true`), ordenados por ruta. */
export const archivosDeDevSchema = z.object({
  version: z.number().int(),
  archivos: z.array(z.object({ file: z.string(), hash: z.string(), soloLectura: z.boolean() })),
});
export type ArchivosDeDev = z.infer<typeof archivosDeDevSchema>;

/** `GET /api/archivo/<ruta>` (404 si no existe): la `version` es la base de la siguiente edicion del editor. */
export const archivoDeDevSchema = z.object({ file: z.string(), texto: z.string(), hash: z.string(), version: z.number().int() });
export type ArchivoDeDev = z.infer<typeof archivoDeDevSchema>;

export const rutaDeArchivo = (file: string): string => `${RUTAS_DE_DEV.archivo}${file.split('/').map(encodeURIComponent).join('/')}`;

/** Inversa de `rutaDeArchivo` sobre el resto tras el prefijo; `undefined` si esta mal codificada. */
export function archivoDeRuta(resto: string): string | undefined {
  try {
    return resto.split('/').map(decodeURIComponent).join('/');
  } catch {
    return undefined;
  }
}

/**
 * `POST /api/edit` con texto (ADR 0007): la misma forma y puerta que `edit --edits`, con la `version` que vio la pagina
 * (el servidor la traduce a `visto`). `descripcion` nombra la entrada del Historial de archivos (por defecto "texto de <archivo>").
 * `aunqueNoCompile` (guardado del editor, historia 21) escribe aunque el texto introduzca errores; sin el, un error nuevo
 * rechaza con `invalid` (`fix` y "Aplicar N fix", todo o nada).
 */
export const peticionDeEdicionesSchema = z.object({
  ediciones: z.array(edicionDeTextoSchema).min(1),
  version: z.number().int().nonnegative().optional(),
  descripcion: z.string().optional(),
  aunqueNoCompile: z.boolean().optional(),
});
export type PeticionDeEdiciones = z.infer<typeof peticionDeEdicionesSchema>;

/** `GET /api/codigo`: si los Temas del Workspace usan Componentes con codigo, cuales, y si ya se sirven (`/componentes.js`). */
export const codigoDeDevSchema = z.object({ temaConCodigo: z.boolean(), componentes: z.array(z.string()), confiado: z.boolean() });
export type CodigoDeDev = z.infer<typeof codigoDeDevSchema>;

/** `POST /api/confiar`: desde aqui el codigo de los Temas se sirve. */
export const confianzaDeDevSchema = z.object({ ok: z.literal(true) });

/** Cuerpo de los bordes de `/api/*`: 400 (JSON o forma invalida), 404 (ruta o recurso), 405 (metodo, con `allow`) y 500 (fallo de I/O). */
export const errorDeDevSchema = z.object({ ok: z.literal(false), mensaje: z.string() });
export type ErrorDeDev = z.infer<typeof errorDeDevSchema>;

/** `POST /api/edit`, `/api/deshacer`, `/api/rehacer` y `/api/historial/saltar` aceptados: la `version` del estado tras escribir. */
export const escrituraDeDevSchema = z.object({ ok: z.literal(true), version: z.number().int() });
export type EscrituraDeDev = z.infer<typeof escrituraDeDevSchema>;

/** Un borde (`errorDeDevSchema`) o el rechazo de una escritura (409/422), que trae ademas `motivo` y, si lo hay, `file`. */
export const rechazoDeDevSchema = errorDeDevSchema.extend({ motivo: z.enum(MOTIVOS_DE_RECHAZO).optional(), file: z.string().optional() });
export type RechazoDeDev = z.infer<typeof rechazoDeDevSchema>;

/** Cuerpo de un 404 de `/api/inspect` (o 422 si el Workspace nunca compilo): el mensaje de `inspect` y los ids cercanos. */
export const inspectNoEncontradoSchema = z.object({ ok: z.literal(false), mensaje: z.string(), cercanos: z.array(z.string()) });
export type InspectNoEncontrado = z.infer<typeof inspectNoEncontradoSchema>;

/**
 * Eventos SSE de `/eventos`, cada uno con `event: <nombre>` y los datos en JSON. Al conectar llegan `estado`,
 * `historial` y `actividad` con `previos: true`; tras cada `estado`, el `historial` y, si la hay, la `diferencia` de esa
 * `version`; y una `actividad` con `previos: false` por cada tanda que se anexa al registro. Quien decide la secuencia
 * es el Workspace vivo (`conexion` y `escuchar` en `sesion`); el servidor real y `devEnMemoria` solo la serializan.
 */
export const EVENTOS_DE_DEV = ['estado', 'actividad', 'diferencia', 'historial'] as const;
export type NombreDeEventoDeDev = (typeof EVENTOS_DE_DEV)[number];

/**
 * Datos de `event: actividad`: Eventos del Registro de actividad en orden. Al conectar llega uno con `previos: true` y
 * los ultimos 50 del registro (quiza ninguno); despues, uno con `previos: false` por cada tanda que el CLI anexa.
 */
export const actividadDeDevSchema = z.object({ previos: z.boolean(), eventos: z.array(eventoDeActividadSchema) });
export type ActividadDeDev = z.infer<typeof actividadDeDevSchema>;

/** Un evento de `/eventos` con su nombre y sus datos. */
export type EventoDeDev =
  | { nombre: 'estado'; datos: EstadoDeDev }
  | { nombre: 'historial'; datos: HistorialDeDev }
  | { nombre: 'actividad'; datos: ActividadDeDev }
  | { nombre: 'diferencia'; datos: DiferenciaDeDev };
