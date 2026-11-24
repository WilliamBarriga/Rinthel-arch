/** Panel Detalle: el Nodo seleccionado tal como lo da `inspect nodo` (`GET /api/inspect/nodo/<id>`), releido en cada version. */
import type { ReactElement } from 'react';

import type { SalidaDeInspect } from 'canonico';

import { AvisoDeLectura } from '../marco/aviso-de-lectura';
import { useEstudio } from '../marco/contexto';
import { useInspectPorVersion } from '../marco/use-lectura-por-version';
import { textoDeSitio } from '../sitio';

type SalidaDeNodo = Extract<SalidaDeInspect, { comando: 'nodo' }>;

export function Detalle(): ReactElement {
  const { seleccion, cliente, estado, irAVista } = useEstudio();
  const lectura = useInspectPorVersion(cliente, estado?.version, 'nodo', seleccion ?? undefined);

  return (
    <section aria-label="Details" className="ui-detalle">
      {seleccion === null ? (
        <p className="ui-tenue">Select a Node on the canvas to see its details.</p>
      ) : lectura.tipo === 'dato' ? (
        <FichaDeNodo salida={lectura.dato} irAVista={irAVista} />
      ) : (
        <AvisoDeLectura lectura={lectura} que={seleccion} />
      )}
    </section>
  );
}

function FichaDeNodo({ salida: { nodo, aristas, vistas }, irAVista }: { salida: SalidaDeNodo; irAVista: (vista: string) => void }): ReactElement {
  return (
    <>
      <h2 className="ui-detalle-titulo">{nodo.title}</h2>
      <p className="ui-mono ui-tenue">
        {nodo.id} · {nodo.type}
      </p>
      {nodo.description !== '' && <p>{nodo.description}</p>}
      <p className="ui-mono ui-sitio">{textoDeSitio(nodo)}</p>
      {nodo.parent !== undefined && <p className="ui-mono">Parent: {nodo.parent}</p>}
      {nodo.children.length > 0 && <p className="ui-mono">Children: {nodo.children.join(', ')}</p>}
      {nodo.attributes.length > 0 && (
        <ul aria-label="Attributes" className="ui-lista">
          {nodo.attributes.map((a) => (
            <li key={a.name} className="ui-mono">
              {a.name}: {a.type}
            </li>
          ))}
        </ul>
      )}
      <h3 className="ui-subtitulo">Edges</h3>
      <ul aria-label="Edges" className="ui-lista">
        {aristas.map((a, i) => (
          <li key={i} className="ui-mono">
            {a.direction === 'out' ? `-> ${a.to}` : `<- ${a.from}`}
            {a.label === undefined ? '' : ` "${a.label}"`}
          </li>
        ))}
      </ul>
      <h3 className="ui-subtitulo">Views</h3>
      <ul aria-label="Views of the Node" className="ui-lista">
        {vistas.map((v) => (
          <li key={v.id}>
            <button type="button" className="ui-enlace ui-mono" onClick={() => irAVista(v.id)}>
              {v.id}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
