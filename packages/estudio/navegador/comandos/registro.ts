/**
 * Registro unico de comandos de la UI. De el salen los atajos (`use-atajos.ts`), las entradas del Buscador y el
 * dialogo de ayuda. Agregar un comando es una sola declaracion en `COMANDOS`: id estable, nombre (el texto del
 * Buscador), teclas (`Mod+K`, `E`, `?`; vacio si solo se llega por el Buscador), ambito del foco y `ejecutar`, que
 * recibe el contexto del estudio (`useEstudio()`). Las reglas de teclas y ambitos estan en `teclas.ts`.
 */
import { crearAlAtajo } from '../historial';
import type { AccionDeHistorial } from '../historial';
import type { ContextoDelEstudio } from '../marco/contexto';
import { PESTANAS_DERECHAS, PESTANAS_IZQUIERDAS } from '../marco/pestanas';
import type { DeclaracionDeTeclas } from './teclas';

export interface Comando extends DeclaracionDeTeclas {
  /** Texto del Buscador y de la ayuda ("Abrir Historial", "Seguir al agente: activar"). */
  nombre: string;
  /** `false` si no sale en el Buscador (abrir el propio Buscador). */
  enBuscador?: boolean;
  ejecutar(estudio: ContextoDelEstudio): void | Promise<void>;
}

const historial = (accion: AccionDeHistorial) => (e: ContextoDelEstudio) =>
  crearAlAtajo({ enviar: (a) => (a === 'deshacer' ? e.cliente.deshacer() : e.cliente.rehacer()), avisar: e.avisar, recargar: e.recargar })(accion);

/** Codigo en el bloque del Nodo seleccionado o, sin seleccion, en el de la Vista activa. */
async function abrirCodigoAqui(e: ContextoDelEstudio): Promise<void> {
  const consulta = e.seleccion !== null ? e.cliente.inspeccionar('nodo', e.seleccion) : e.vista !== undefined ? e.cliente.inspeccionar('vista', e.vista) : undefined;
  e.abrirCodigo();
  const r = await consulta;
  if (r?.ok !== true) return;
  const s = r.salida;
  if (s.comando === 'nodo') e.abrirCodigo({ file: s.nodo.file, line: s.nodo.line });
  else if (s.comando === 'vista') e.abrirCodigo({ file: s.vista.file, line: s.vista.line });
}

const PROPIOS: readonly Comando[] = [
  { id: 'buscador', nombre: 'Buscar', teclas: ['Mod+K'], ambito: 'global', enBuscador: false, ejecutar: (e) => e.abrirDialogo('buscador') },
  { id: 'ayuda', nombre: 'Atajos de teclado', teclas: ['?', 'Mod+/'], ambito: 'global', ejecutar: (e) => e.abrirDialogo('ayuda') },
  { id: 'isla-izquierda', nombre: 'Ocultar o mostrar el panel izquierdo', teclas: ['Mod+B'], ambito: 'global', ejecutar: (e) => e.alternarIsla('izquierda') },
  { id: 'isla-derecha', nombre: 'Ocultar o mostrar el panel derecho', teclas: ['Mod+J'], ambito: 'global', ejecutar: (e) => e.alternarIsla('derecha') },
  { id: 'deshacer', nombre: 'Deshacer', teclas: ['Mod+Z'], ambito: 'global', enTexto: false, ejecutar: historial('deshacer') },
  { id: 'rehacer', nombre: 'Rehacer', teclas: ['Mod+Shift+Z', { combinacion: 'Ctrl+Y', soloEn: 'otras' }], ambito: 'global', enTexto: false, ejecutar: historial('rehacer') },
  { id: 'abrir-codigo', nombre: 'Abrir Codigo', teclas: ['E'], ambito: 'global', ejecutar: abrirCodigoAqui },
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
