/**
 * Registro de las pestanas de las islas. Cada panel es un componente sin props que lee `useEstudio()`; el orden del
 * arreglo es el de las pestanas. Un ticket que llena un panel reemplaza aqui su `Contenido` (o anade una entrada);
 * el marco no cambia. Ids estables: los usan `abrirPestana(lado, id)` y el registro de comandos. `soloEnDev` las quita
 * del export de solo lectura (`modo.ts`).
 */
import { lazy } from 'react';
import type { ComponentType } from 'react';

import { PanelDelAgente } from '../agente/panel-del-agente';
import { SeguirAlAgente, UltimaLineaDelAgente } from '../agente/pildoras';
import { Detalle } from '../detalle/detalle';
import { PanelDelHistorial } from '../historial/panel-del-historial';
import { PanelDeIssues } from '../issues/panel-de-issues';
import { GaleriaDeTemas } from '../temas/galeria-de-temas';
import { PanelDeVistas } from '../vistas/panel-de-vistas';
import type { ConModo } from './modo';

/** El editor (CodeMirror) es un trozo aparte: se carga la primera vez que se abre Codigo. */
const PanelDeCodigo = lazy(() => import('../editor/panel-de-codigo').then((m) => ({ default: m.PanelDeCodigo })));

export interface PestanaDelPanel extends ConModo {
  id: string;
  nombre: string;
  Contenido: ComponentType;
  /** Sigue montada (oculta) con otra pestana activa: el editor conserva su estado y su historial fino (historia 26). */
  conservar?: boolean;
  /** Al activarla, la isla se ensancha hasta este ancho (si es mas angosta y el lienzo lo permite). */
  anchoMinimo?: number;
}

/** Ancho con el que el editor muestra lineas de DSL tipicas sin cortarlas. */
const ANCHO_DEL_EDITOR = 560;

export const PESTANAS_IZQUIERDAS: readonly PestanaDelPanel[] = [
  { id: 'vistas', nombre: 'Views', Contenido: PanelDeVistas },
  { id: 'codigo', nombre: 'Code', Contenido: PanelDeCodigo, conservar: true, anchoMinimo: ANCHO_DEL_EDITOR, soloEnDev: true },
];

export const PESTANAS_DERECHAS: readonly PestanaDelPanel[] = [
  { id: 'detalle', nombre: 'Details', Contenido: Detalle, soloEnDev: true },
  { id: 'issues', nombre: 'Issues', Contenido: PanelDeIssues, soloEnDev: true },
  { id: 'temas', nombre: 'Themes', Contenido: GaleriaDeTemas },
  { id: 'historial', nombre: 'Undo history', Contenido: PanelDelHistorial, soloEnDev: true },
  { id: 'agente', nombre: 'Agent', Contenido: PanelDelAgente, soloEnDev: true },
];

/**
 * Pildoras de la barra superior despues de la marca y las migas (Buscador, ultima linea del agente, "seguir al
 * agente"). Mismo contrato que los paneles: componentes sin props que leen `useEstudio()`.
 */
export const PILDORAS_DE_LA_BARRA: readonly ({ id: string; Contenido: ComponentType } & ConModo)[] = [
  { id: 'ultima-linea-del-agente', Contenido: UltimaLineaDelAgente, soloEnDev: true },
  { id: 'seguir-al-agente', Contenido: SeguirAlAgente, soloEnDev: true },
];
