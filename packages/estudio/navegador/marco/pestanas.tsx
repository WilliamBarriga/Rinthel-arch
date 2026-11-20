/**
 * Registro de las pestanas de las islas. Cada panel es un componente sin props que lee `useEstudio()`; el orden del
 * arreglo es el de las pestanas. Un ticket que llena un panel reemplaza aqui su `Contenido` (o anade una entrada);
 * el marco no cambia. Ids estables: los usan `abrirPestana(lado, id)` y el registro de comandos.
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

/** El editor (CodeMirror) es un trozo aparte: se carga la primera vez que se abre Codigo. */
const PanelDeCodigo = lazy(() => import('../editor/panel-de-codigo').then((m) => ({ default: m.PanelDeCodigo })));

export interface PestanaDelPanel {
  id: string;
  nombre: string;
  Contenido: ComponentType;
  /** Sigue montada (oculta) con otra pestana activa: el editor conserva su estado y su historial fino (historia 26). */
  conservar?: boolean;
}

export const PESTANAS_IZQUIERDAS: readonly PestanaDelPanel[] = [
  { id: 'vistas', nombre: 'Vistas', Contenido: PanelDeVistas },
  { id: 'codigo', nombre: 'Codigo', Contenido: PanelDeCodigo, conservar: true },
];

export const PESTANAS_DERECHAS: readonly PestanaDelPanel[] = [
  { id: 'detalle', nombre: 'Detalle', Contenido: Detalle },
  { id: 'issues', nombre: 'Issues', Contenido: PanelDeIssues },
  { id: 'temas', nombre: 'Temas', Contenido: GaleriaDeTemas },
  { id: 'historial', nombre: 'Historial', Contenido: PanelDelHistorial },
  { id: 'agente', nombre: 'Agente', Contenido: PanelDelAgente },
];

/**
 * Pildoras de la barra superior despues de la marca y las migas (Buscador, ultima linea del agente, "seguir al
 * agente"). Mismo contrato que los paneles: componentes sin props que leen `useEstudio()`.
 */
export const PILDORAS_DE_LA_BARRA: readonly { id: string; Contenido: ComponentType }[] = [
  { id: 'ultima-linea-del-agente', Contenido: UltimaLineaDelAgente },
  { id: 'seguir-al-agente', Contenido: SeguirAlAgente },
];
