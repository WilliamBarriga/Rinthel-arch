/**
 * Registro unico de comandos de la UI. De el salen los atajos (`use-atajos.ts`), las entradas del Buscador y el
 * dialogo de ayuda. Agregar un comando es una sola declaracion en `COMANDOS`: id estable, nombre (el texto del
 * Buscador), teclas (`Mod+K`, `E`, `?`; vacio si solo se llega por el Buscador), ambito del foco y `ejecutar`, que
 * recibe el contexto del estudio (`useEstudio()`). Las reglas de teclas y ambitos estan en `teclas.ts`.
 */
import { actividadDelCliente } from '../agente/actividad';
import { abrirTourDelPrototipo } from '../prototipo-tour/prototipo-tour';
import type { ContextoDelEstudio } from '../marco/contexto';
import { PESTANAS_DERECHAS, PESTANAS_IZQUIERDAS } from '../marco/pestanas';
import { sitioDeSalida } from '../sitio';
import type { DeclaracionDeTeclas } from './teclas';

export interface Comando extends DeclaracionDeTeclas {
  /** Texto del Buscador y de la ayuda ("Abrir Historial", "Seguir al agente: activar"). */
  nombre: string;
  /** `false` si no sale en el Buscador (abrir el propio Buscador). */
  enBuscador?: boolean;
  ejecutar(estudio: ContextoDelEstudio): void | Promise<void>;
}

const historial = (accion: 'deshacer' | 'rehacer') => async (e: ContextoDelEstudio): Promise<void> => void (await e.escribir({ historial: accion }));

/** Abre Codigo y, cuando `inspect` responde, salta al bloque del Nodo o de la Vista `id`. */
export async function abrirCodigoEnBloque(e: ContextoDelEstudio, comando: 'nodo' | 'vista', id: string): Promise<void> {
  const consulta = e.cliente.inspeccionar(comando, id);
  e.abrirCodigo();
  const r = await consulta;
  const sitio = r.ok ? sitioDeSalida(r.salida) : undefined;
  if (sitio !== undefined) e.abrirCodigo(sitio);
}

/** Codigo en el bloque del Nodo seleccionado o, sin seleccion, en el de la Vista activa. */
async function abrirCodigoAqui(e: ContextoDelEstudio): Promise<void> {
  if (e.seleccion !== null) await abrirCodigoEnBloque(e, 'nodo', e.seleccion);
  else if (e.vista !== undefined) await abrirCodigoEnBloque(e, 'vista', e.vista);
  else e.abrirCodigo();
}

/** Vuelve a la pestana Vistas con el foco en el lienzo. */
function volverAVistas(e: ContextoDelEstudio): void {
  e.abrirPestana('izquierda', 'vistas');
  document.querySelector<HTMLElement>('.ui-lienzo [tabindex]')?.focus();
}

const PROPIOS: readonly Comando[] = [
  // PROTOTIPO DESECHABLE (#224): el tour a pedido.
  { id: 'ver-tour', nombre: 'Ver tour', teclas: [], ambito: 'global', ejecutar: abrirTourDelPrototipo },
  { id: 'buscador', nombre: 'Buscar', teclas: ['Mod+K'], ambito: 'global', enBuscador: false, ejecutar: (e) => e.abrirDialogo('buscador') },
  { id: 'ayuda', nombre: 'Atajos de teclado', teclas: ['?', 'Mod+/'], ambito: 'global', ejecutar: (e) => e.abrirDialogo('ayuda') },
  { id: 'isla-izquierda', nombre: 'Ocultar o mostrar el panel izquierdo', teclas: ['Mod+B'], ambito: 'global', ejecutar: (e) => e.alternarIsla('izquierda') },
  { id: 'isla-derecha', nombre: 'Ocultar o mostrar el panel derecho', teclas: ['Mod+J'], ambito: 'global', ejecutar: (e) => e.alternarIsla('derecha') },
  { id: 'deshacer', nombre: 'Deshacer', teclas: ['Mod+Z'], ambito: 'global', enTexto: false, ejecutar: historial('deshacer') },
  { id: 'rehacer', nombre: 'Rehacer', teclas: ['Mod+Shift+Z', { combinacion: 'Ctrl+Y', soloEn: 'otras' }], ambito: 'global', enTexto: false, ejecutar: historial('rehacer') },
  { id: 'abrir-codigo', nombre: 'Abrir Codigo', teclas: ['E'], ambito: 'global', ejecutar: abrirCodigoAqui },
  // Global con modificador (spec #184): gana tambien en el editor y nunca abre el dialogo "Guardar pagina" del navegador.
  { id: 'guardar', nombre: 'Guardar el texto', teclas: ['Mod+S'], ambito: 'global', ejecutar: (e) => e.vaciarGuardado() },
  // Esc del editor: tecla sin modificador en ambito editor, asi que `resolverTecla` nunca la resuelve y cede a las capas
  // efimeras de CodeMirror (completado, busqueda, seleccion multiple); la ejecuta la ultima capa del keymap del editor.
  { id: 'salir-del-editor', nombre: 'Volver a Vistas desde el editor', teclas: ['Escape'], ambito: 'editor', enBuscador: false, ejecutar: volverAVistas },
  { id: 'seguir-al-agente-activar', nombre: 'Seguir al agente: activar', teclas: [], ambito: 'global', ejecutar: (e) => actividadDelCliente(e.cliente).seguir(true) },
  { id: 'seguir-al-agente-desactivar', nombre: 'Seguir al agente: desactivar', teclas: [], ambito: 'global', ejecutar: (e) => actividadDelCliente(e.cliente).seguir(false) },
];

/** "Abrir <pestana>" por cada pestana de las islas que no tenga ya un comando propio. */
const DE_PESTANAS: readonly Comando[] = [
  ...PESTANAS_IZQUIERDAS.map((p) => ({ lado: 'izquierda' as const, p })),
  ...PESTANAS_DERECHAS.map((p) => ({ lado: 'derecha' as const, p })),
]
  .filter(({ p }) => !PROPIOS.some((c) => c.id === `abrir-${p.id}`))
  .map(({ lado, p }) => ({ id: `abrir-${p.id}`, nombre: `Abrir ${p.nombre}`, teclas: [], ambito: 'global', ejecutar: (e: ContextoDelEstudio) => e.abrirPestana(lado, p.id) }));

export const COMANDOS: readonly Comando[] = [...PROPIOS, ...DE_PESTANAS];

export const comandoPorId = (id: string): Comando | undefined => COMANDOS.find((c) => c.id === id);
