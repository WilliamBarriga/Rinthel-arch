/** Details panel: the selected Node as `inspect node` gives it (`GET /api/inspect/node/<id>`), read again on each version. */
import type { ReactElement } from 'react';

import type { InspectOutput } from 'canonical';

import { ReadNotice } from '../frame/read-notice';
import { useDevUi } from '../frame/context';
import { useInspectByVersion } from '../frame/use-read-by-version';
import { siteText } from '../site';

type NodeOutput = Extract<InspectOutput, { command: 'node' }>;

export function Detail(): ReactElement {
  const { selection, client, state, goToView } = useDevUi();
  const reading = useInspectByVersion(client, state?.version, 'node', selection ?? undefined);

  return (
    <section aria-label="Details" className="ui-detalle">
      {selection === null ? (
        <p className="ui-tenue">Select a Node on the canvas to see its details.</p>
      ) : reading.kind === 'dato' ? (
        <NodeCard output={reading.datum} goToView={goToView} />
      ) : (
        <ReadNotice reading={reading} what={selection} />
      )}
    </section>
  );
}

function NodeCard({ output: { node, edges, views }, goToView }: { output: NodeOutput; goToView: (view: string) => void }): ReactElement {
  return (
    <>
      <h2 className="ui-detalle-titulo">{node.title}</h2>
      <p className="ui-mono ui-tenue">
        {node.id} · {node.type}
      </p>
      {node.description !== '' && <p>{node.description}</p>}
      <p className="ui-mono ui-sitio">{siteText(node)}</p>
      {node.parent !== undefined && <p className="ui-mono">Parent: {node.parent}</p>}
      {node.children.length > 0 && <p className="ui-mono">Children: {node.children.join(', ')}</p>}
      {node.attributes.length > 0 && (
        <ul aria-label="Attributes" className="ui-lista">
          {node.attributes.map((a) => (
            <li key={a.name} className="ui-mono">
              {a.name}: {a.type}
            </li>
          ))}
        </ul>
      )}
      <h3 className="ui-subtitulo">Edges</h3>
      <ul aria-label="Edges" className="ui-lista">
        {edges.map((a, i) => (
          <li key={i} className="ui-mono">
            {a.direction === 'out' ? `-> ${a.to}` : `<- ${a.from}`}
            {a.label === undefined ? '' : ` "${a.label}"`}
          </li>
        ))}
      </ul>
      <h3 className="ui-subtitulo">Views</h3>
      <ul aria-label="Views of the Node" className="ui-lista">
        {views.map((v) => (
          <li key={v.id}>
            <button type="button" className="ui-enlace ui-mono" onClick={() => goToView(v.id)}>
              {v.id}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
