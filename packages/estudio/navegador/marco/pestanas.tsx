/**
 * Registro de las pestanas de las islas. Cada panel es un componente sin props que lee `useEstudio()`; el orden del
 * arreglo es el de las pestanas. Un ticket que llena un panel reemplaza aqui su `Contenido` (o anade una entrada);
 * el marco no cambia. Ids estables: los usan `abrirPestana(lado, id)` y el registro de comandos.
 */
import type { ComponentType, ReactElement } from 'react';

import { Detalle } from '../detalle/detalle';
import { PanelDeIssues } from '../issues/panel-de-issues';
import { GaleriaDeTemas } from '../temas/galeria-de-temas';
import { PanelDeVistas } from '../vistas/panel-de-vistas';
import { useEstudio } from './contexto';

export interface PestanaDelPanel {
  id: string;
  nombre: string;
  Contenido: ComponentType;
}

/** Panel aun sin contenido: lo llena el ticket que se nombra. */
const pendiente = (texto: string): ComponentType =>
  function Pendiente(): ReactElement {
    return <p className="ui-tenue">{texto}</p>;
  };

/** Hasta que llegue el editor (#190): dice a que `archivo:linea` saltaria (`useEstudio().sitioDeCodigo`). */
function CodigoPendiente(): ReactElement {
  const { sitioDeCodigo } = useEstudio();
  return (
    <p className="ui-tenue">
      El editor del DSL aun no esta disponible.
      {sitioDeCodigo !== undefined && <span className="ui-mono ui-sitio">{` ${sitioDeCodigo.file}:${sitioDeCodigo.line}`}</span>}
    </p>
  );
}

export const PESTANAS_IZQUIERDAS: readonly PestanaDelPanel[] = [
  { id: 'vistas', nombre: 'Vistas', Contenido: PanelDeVistas },
  { id: 'codigo', nombre: 'Codigo', Contenido: CodigoPendiente },
];

export const PESTANAS_DERECHAS: readonly PestanaDelPanel[] = [
  { id: 'detalle', nombre: 'Detalle', Contenido: Detalle },
  { id: 'issues', nombre: 'Issues', Contenido: PanelDeIssues },
  { id: 'temas', nombre: 'Temas', Contenido: GaleriaDeTemas },
  { id: 'historial', nombre: 'Historial', Contenido: pendiente('El Historial aun no esta disponible.') },
  { id: 'agente', nombre: 'Agente', Contenido: pendiente('La actividad del agente aun no esta disponible.') },
];

/**
 * Pildoras de la barra superior despues de la marca y las migas (Buscador, ultima linea del agente, "seguir al
 * agente"). Mismo contrato que los paneles: componentes sin props que leen `useEstudio()`.
 */
export const PILDORAS_DE_LA_BARRA: readonly { id: string; Contenido: ComponentType }[] = [];
