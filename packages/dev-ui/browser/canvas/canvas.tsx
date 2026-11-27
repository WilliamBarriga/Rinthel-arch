/**
 * Dev UI canvas: `VistaInteractiva` (`chrome={false}`) over the drawn Source (with the previewed Theme, if any), the
 * halo of external changes and the legend. It runs inside the providers: a click on a Node opens Details, a double
 * click opens Code at its block and the Gestures write through the Dev UI writing path.
 */
import { useMemo } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { resolveView } from 'canonical';
import type { CanonicalForm } from 'canonical';
import type { ComponentesDeTema } from 'render';
import { Leyenda, VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout, PropsDeEstadoEnHash } from 'shell';

import { openCodeInBlock } from '../commands/registry';
import { CanvasHighlight, useExternalDiffs } from '../diff/highlight';
import type { WriteRequest } from '../writing/writing';
import { useDevUi } from '../frame/context';
import { usePreviewedSource, useThemePreview } from '../themes/preview';
import { useDataProps } from './view-data';
import type { Drawable } from './geometries';

export interface CanvasOptions {
  drawable: Drawable;
  hashProps: PropsDeEstadoEnHash;
  layout: AdaptadorDeLayout;
  components: ComponentesDeTema | undefined;
  /** URL of a font file of `state.fuentes` (`/fonts/` in `dev`, `data:` in an export). */
  fontUrlOf: (route: string) => string;
}

/** Returns the canvas (with its halo) and the legend of the active View; without a Theme, neither. */
export function useDevUiCanvas({ drawable, hashProps: props, layout, components, fontUrlOf }: CanvasOptions): { canvas: ReactNode; legend: ReactNode } {
  const devUi = useDevUi();
  const { client, notify, reasonWithoutGestures, canWrite } = devUi;
  // Read-only (export): no Gestures and no Code to open.
  const withGestures = canWrite && reasonWithoutGestures === undefined;
  const { previousTheme } = useThemePreview();
  const { state } = drawable;
  const source = state.fuente;
  const drawn = usePreviewedSource(client, state.version, { source, geometries: drawable.geometries }, props.view, previousTheme);
  const data = useDataProps({ source: drawn.source, icons: state.iconos, geometries: drawn.geometries }, props.view);
  const highlights = useExternalDiffs({ client, source, version: state.version, view: props.view, state: props.state, step: props.step, notify });
  const theme = data.theme;
  const halo = <CanvasHighlight ids={highlights} />;
  if (theme === undefined) return { canvas: halo, legend: null };

  /** The handler resolves `false` if it was rejected (the Node goes back to its place). */
  const writeFromCanvas = async (request: WriteRequest): Promise<boolean> => (await devUi.write(request)).ok;
  const canvas = (
    <>
      <VistaInteractiva
        {...props}
        onSelect={(id) => {
          props.onSelect(id);
          devUi.openTab('derecha', 'detalle');
        }}
        onOpen={(element) => {
          if (canWrite && element.tipo === 'nodo') void openCodeInBlock(devUi, 'node', element.id);
        }}
        source={drawn.source}
        theme={theme}
        layout={layout}
        {...(state.fuentes !== undefined && { fontFiles: state.fuentes, fontUrl: fontUrlOf })}
        icons={data.icons}
        {...(components !== undefined && { componentes: components })}
        width={data.width}
        height={data.height}
        cachedGeometries={data.cachedGeometries}
        {...(withGestures && {
          onMoveNode: ({ id, x, y }) => writeFromCanvas({ intent: { type: 'move-pin', view: props.view, node: id, x, y }, failure: 'Could not move the Pin' }),
          onReorderLifelines: ({ orden: order }) => writeFromCanvas({ intent: { type: 'reorder-lifelines', view: props.view, order }, failure: 'Could not reorder the Lifelines' }),
        })}
        chrome={false}
      />
      {halo}
    </>
  );
  return { canvas, legend: <ViewLegend source={source} props={props} theme={theme} /> };
}

function ViewLegend({ source, props, theme }: { source: CanonicalForm; props: PropsDeEstadoEnHash; theme: Parameters<typeof Leyenda>[0]['tema'] }): ReactElement | null {
  const view = useMemo(() => resolveView(source, props.view, props.state), [source, props.view, props.state]);
  if (view === undefined) return null;
  return (
    <div className="ui-leyenda">
      <Leyenda fuente={source} vista={view} tema={theme} modo="auto" />
    </div>
  );
}
