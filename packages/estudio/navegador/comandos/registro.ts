/**
 * Registro unico de comandos de la UI. De el salen los atajos (`use-atajos.ts`), las entradas del Buscador y el
 * dialogo de ayuda. Agregar un comando es una sola declaracion en `COMANDOS`: id estable, nombre (el texto del
 * Buscador), teclas (`Mod+K`, `E`, `?`; vacio si solo se llega por el Buscador), ambito del foco y `ejecutar`, que
 * recibe el contexto del estudio (`useEstudio()`). Las reglas de teclas y ambitos estan en `teclas.ts`.
 */
import { actividadDelCliente } from '../agente/actividad';
import type { ContextoDelEstudio } from '../marco/contexto';
import { disponiblesEn } from '../marco/modo';
import type { ConModo, ModoDelEstudio } from '../marco/modo';
import { PESTANAS_DERECHAS, PESTANAS_IZQUIERDAS } from '../marco/pestanas';
import { sitioDeSalida } from '../sitio';
import type { DeclaracionDeTeclas } from './teclas';

export interface Comando extends DeclaracionDeTeclas, ConModo {
  /** Texto del Buscador y de la ayuda ("Abrir Historial", "Seguir al agente: activar"). */
  nombre: string;
  /** `false` si no sale en el Buscador (abrir el propio Buscador). */
  enBuscador?: boolean;
  ejecutar(estudio: ContextoDelEstudio): void | Promise<void>;
}

const historial = (accion: 'deshacer' | 'rehacer') => async (e: ContextoDelEstudio): Promise<void> => void (await e.escribir({ historial: accion }));

/** Abre Codigo y, cuando `inspect` responde, salta al bloque del Nodo o de la Vista `id`. */
export async function abrirCodigoEnBloque(e: ContextoDelEstudio, comando: 'node' | 'view', id: string): Promise<void> {
  const consulta = e.cliente.inspeccionar(comando, id);
  e.abrirCodigo();
  const r = await consulta;
  const sitio = r.ok ? sitioDeSalida(r.salida) : undefined;
  if (sitio !== undefined) e.abrirCodigo(sitio);
}

/** Codigo en el bloque del Nodo seleccionado o, sin seleccion, en el de la Vista activa. */
async function abrirCodigoAqui(e: ContextoDelEstudio): Promise<void> {
  if (e.seleccion !== null) await abrirCodigoEnBloque(e, 'node', e.seleccion);
  else if (e.vista !== undefined) await abrirCodigoEnBloque(e, 'view', e.vista);
  else e.abrirCodigo();
}

/** Vuelve a la pestana Vistas con el foco en el lienzo. */
function volverAVistas(e: ContextoDelEstudio): void {
  e.abrirPestana('izquierda', 'vistas');
  document.querySelector<HTMLElement>('.ui-lienzo [tabindex]')?.focus();
}

const PROPIOS: readonly Comando[] = [
  { id: 'buscador', nombre: 'Search', teclas: ['Mod+K'], ambito: 'global', enBuscador: false, ejecutar: (e) => e.abrirDialogo('buscador') },
  { id: 'ver-tour', nombre: 'View tour', teclas: [], ambito: 'global', ejecutar: (e) => e.abrirDialogo('tour') },
  { id: 'ayuda', nombre: 'Keyboard shortcuts', teclas: ['?', 'Mod+/'], ambito: 'global', ejecutar: (e) => e.abrirDialogo('ayuda') },
  { id: 'isla-izquierda', nombre: 'Toggle the left panel', teclas: ['Mod+B'], ambito: 'global', ejecutar: (e) => e.alternarIsla('izquierda') },
  { id: 'isla-derecha', nombre: 'Toggle the right panel', teclas: ['Mod+J'], ambito: 'global', ejecutar: (e) => e.alternarIsla('derecha') },
  { id: 'deshacer', nombre: 'Undo', teclas: ['Mod+Z'], ambito: 'global', enTexto: false, ejecutar: historial('deshacer'), soloEnDev: true },
  { id: 'rehacer', nombre: 'Redo', teclas: ['Mod+Shift+Z', { combinacion: 'Ctrl+Y', soloEn: 'otras' }], ambito: 'global', enTexto: false, ejecutar: historial('rehacer'), soloEnDev: true },
  { id: 'abrir-codigo', nombre: 'Open Code', teclas: ['E'], ambito: 'global', ejecutar: abrirCodigoAqui, soloEnDev: true },
  // Global con modificador (spec #184): gana tambien en el editor y nunca abre el dialogo "Guardar pagina" del navegador.
  { id: 'guardar', nombre: 'Save the text', teclas: ['Mod+S'], ambito: 'global', ejecutar: (e) => e.vaciarGuardado(), soloEnDev: true },
  // Esc del editor: tecla sin modificador en ambito editor, asi que `resolverTecla` nunca la resuelve y cede a las capas
  // efimeras de CodeMirror (completado, busqueda, seleccion multiple); la ejecuta la ultima capa del keymap del editor.
  { id: 'salir-del-editor', nombre: 'Back to Views from the editor', teclas: ['Escape'], ambito: 'editor', enBuscador: false, ejecutar: volverAVistas, soloEnDev: true },
  { id: 'seguir-al-agente-activar', nombre: 'Follow the agent: on', teclas: [], ambito: 'global', ejecutar: (e) => actividadDelCliente(e.cliente).seguir(true), soloEnDev: true },
  { id: 'seguir-al-agente-desactivar', nombre: 'Follow the agent: off', teclas: [], ambito: 'global', ejecutar: (e) => actividadDelCliente(e.cliente).seguir(false), soloEnDev: true },
];

/** "Abrir <pestana>" por cada pestana de las islas que no tenga ya un comando propio. */
const DE_PESTANAS: readonly Comando[] = [
  ...PESTANAS_IZQUIERDAS.map((p) => ({ lado: 'izquierda' as const, p })),
  ...PESTANAS_DERECHAS.map((p) => ({ lado: 'derecha' as const, p })),
]
  .filter(({ p }) => !PROPIOS.some((c) => c.id === `abrir-${p.id}`))
  .map(({ lado, p }) => ({ id: `abrir-${p.id}`, nombre: `Open ${p.nombre}`, teclas: [], ambito: 'global', ...(p.soloEnDev === true && { soloEnDev: true }), ejecutar: (e: ContextoDelEstudio) => e.abrirPestana(lado, p.id) }));

export const COMANDOS: readonly Comando[] = [...PROPIOS, ...DE_PESTANAS];

export const comandoPorId = (id: string): Comando | undefined => COMANDOS.find((c) => c.id === id);

/** The commands of `modo` (shortcuts, Finder and help); the export has no writing ones. */
export const comandosDe = (modo: ModoDelEstudio): readonly Comando[] => disponiblesEn(COMANDOS, modo);
