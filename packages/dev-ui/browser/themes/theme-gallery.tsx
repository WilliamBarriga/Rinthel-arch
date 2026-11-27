/**
 * Theme gallery: the Source's Themes (the Workspace's, those of `--theme-path` and the built-in ones) in a `listbox`
 * (`frame/use-listbox.ts`: arrows and Enter, or click). Choosing one previews it on the active View without writing and
 * shows its `extends` chain, its Palette and its Layers (via `inspect theme`). Themes changed outside carry the external
 * change mark until the gallery is left. "Pin" writes `theme` in that View with the `set-theme` Intent; "Remove" leaves
 * it without a pinned Theme.
 */
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import { clientDiffs } from '../diff/diffs';
import { viewGallery } from '../diff/projection';
import { ExternalMark, useExternalMarks } from '../diff/highlight';
import { ReadNotice } from '../frame/read-notice';
import { useDevUi } from '../frame/context';
import { useInspectByVersion } from '../frame/use-read-by-version';
import { useListbox } from '../frame/use-listbox';
import { siteText } from '../site';
import { useThemePreview } from './preview';

export function ThemeGallery(): ReactElement {
  const { source, view, client, write, canWrite } = useDevUi();
  // Pinning writes `theme` in the View: only in `dev`.
  const withPin = canWrite;
  const { previousTheme, previewTheme } = useThemePreview();
  const [chosen, setChosen] = useState<string>();
  const marks = useExternalMarks(client);
  const themes = source?.themes ?? [];
  const choose = (theme: string): void => {
    setChosen(theme);
    previewTheme(theme);
  };
  const list = useListbox({ name: 'Themes', prefix: 'ui-tema', order: themes.map(({ name }) => name), chosen, choose });
  // Themes changed outside stay marked while the gallery is shown; leaving it marks them as seen.
  useEffect(() => () => clientDiffs(client).update(viewGallery), [client]);
  if (source === undefined) return <p className="ui-tenue">The Workspace does not compile yet: no Themes to show.</p>;

  const pinned = source.views.find(({ id }) => id === view)?.theme;
  const pin = async (theme: string | undefined): Promise<void> => {
    if (view === undefined) return;
    const r = await write({ intent: { type: 'set-theme', view, ...(theme !== undefined && { theme }) }, failure: `Could not ${theme === undefined ? 'unpin' : 'pin'} the Theme` });
    if (r.ok) previewTheme(undefined);
  };

  return (
    <div className="ui-galeria">
      {view !== undefined && (
        <p className="ui-tenue">
          View {view}: {pinned === undefined ? 'no pinned Theme' : `pinned Theme ${pinned}`}
          {withPin && pinned !== undefined && (
            <button type="button" aria-label={`Unpin the Theme of ${view}`} onClick={() => void pin(undefined)}>
              Unpin
            </button>
          )}
        </p>
      )}
      <div {...list.listbox} className="ui-indice">
        {themes.map(({ name }) => (
          <div key={name} {...list.option(name)} className="ui-indice-vista">
            <span className="ui-mono">{name}</span>
            {marks.themes.has(name) && <ExternalMark />}
            {name === pinned && <span className="ui-enlaces">pinned</span>}
            {name === previousTheme && <span className="ui-enlaces">previewing</span>}
          </div>
        ))}
      </div>
      {chosen !== undefined && <ThemeCard name={chosen} palette={source.themes.find(({ name }) => name === chosen)?.palette ?? {}} view={withPin ? view : undefined} pinned={pinned} previewing={previousTheme === chosen} onPin={() => void pin(chosen)} onRelease={() => previewTheme(undefined)} />}
    </div>
  );
}

interface CardProps {
  name: string;
  palette: Readonly<Record<string, string>>;
  /** View where the Theme can be pinned; `undefined` if it cannot (no View, or a read-only export). */
  view: string | undefined;
  pinned: string | undefined;
  previewing: boolean;
  onPin: () => void;
  onRelease: () => void;
}

function ThemeCard({ name, palette, view, pinned, previewing, onPin, onRelease }: CardProps): ReactElement {
  const { client, state } = useDevUi();
  const reading = useInspectByVersion(client, state?.version, 'theme', name);
  const theme = reading.kind === 'dato' ? reading.datum.theme : undefined;

  return (
    <section aria-label={`Theme ${name}`} className="ui-detalle">
      <h2 className="ui-detalle-titulo">{name}</h2>
      <div className="ui-acciones">
        {view !== undefined && pinned !== name && (
          <button type="button" onClick={onPin}>
            {`Pin ${name} to ${view}`}
          </button>
        )}
        {previewing && (
          <button type="button" onClick={onRelease}>
            Stop previewing
          </button>
        )}
      </div>
      {theme === undefined ? (
        <ReadNotice reading={reading} what={name} />
      ) : (
        <>
          <p className="ui-mono ui-sitio">{siteText(theme)}</p>
          <h3 className="ui-subtitulo">Extends chain</h3>
          <p className="ui-mono">{[name, ...theme.extends].join(' > ')}</p>
        </>
      )}
      <h3 className="ui-subtitulo">Palette</h3>
      <ul aria-label="Palette" className="ui-lista ui-paleta">
        {Object.entries(palette).map(([key, color]) => (
          <li key={key} className="ui-mono">
            <span aria-hidden className="ui-muestra" style={{ background: color }} />
            <span>{key}</span> {color}
          </li>
        ))}
      </ul>
      {theme !== undefined && (
        <>
          <h3 className="ui-subtitulo">Layers</h3>
          <ul aria-label="Layers" className="ui-lista">
            {theme.layers.map((layer) => (
              <li key={layer.name} className="ui-mono">
                {layer.name} {layer.primitive}
                {layer.above ? ' [on top]' : ''}
                {layer.animated ? ' [animated]' : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
