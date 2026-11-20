/** Panel Detalle: el Nodo seleccionado tal como lo da `inspect nodo` (`GET /api/inspect/nodo/<id>`), releido en cada version. */
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import type { SalidaDeInspect } from 'canonico';

import { useEstudio } from '../marco/contexto';
import { textoDeSitio } from '../sitio';

type SalidaDeNodo = Extract<SalidaDeInspect, { comando: 'nodo' }>;
type Lectura = { tipo: 'cargando' } | { tipo: 'nodo'; salida: SalidaDeNodo } | { tipo: 'fallo'; mensaje: string };

export function Detalle(): ReactElement {
  const { seleccion, cliente, estado, irAVista } = useEstudio();
  const [lectura, setLectura] = useState<Lectura>({ tipo: 'cargando' });
  const version = estado?.version;
  useEffect(() => {
    if (seleccion === null) return;
    let vigente = true;
    setLectura({ tipo: 'cargando' });
    void cliente.inspeccionar('nodo', seleccion).then((r) => {
      if (!vigente) return;
      if (r.ok && r.salida.comando === 'nodo') setLectura({ tipo: 'nodo', salida: r.salida });
      else setLectura({ tipo: 'fallo', mensaje: r.ok ? 'Respuesta inesperada de inspect' : r.mensaje });
    });
    return () => {
      vigente = false;
    };
  }, [seleccion, version, cliente]);

  return (
    <section aria-label="Detalle" className="ui-detalle">
      {seleccion === null ? (
        <p className="ui-tenue">Selecciona un Nodo en el lienzo para ver su detalle.</p>
      ) : lectura.tipo === 'cargando' ? (
        <p className="ui-tenue" role="status">
          Cargando {seleccion}...
        </p>
      ) : lectura.tipo === 'fallo' ? (
        <p className="ui-tenue" role="status">
          {lectura.mensaje}
        </p>
      ) : (
        <FichaDeNodo salida={lectura.salida} irAVista={irAVista} />
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
      {nodo.parent !== undefined && <p className="ui-mono">Padre: {nodo.parent}</p>}
      {nodo.children.length > 0 && <p className="ui-mono">Hijos: {nodo.children.join(', ')}</p>}
      {nodo.attributes.length > 0 && (
        <ul aria-label="Atributos" className="ui-lista">
          {nodo.attributes.map((a) => (
            <li key={a.name} className="ui-mono">
              {a.name}: {a.type}
            </li>
          ))}
        </ul>
      )}
      <h3 className="ui-subtitulo">Aristas</h3>
      <ul aria-label="Aristas" className="ui-lista">
        {aristas.map((a, i) => (
          <li key={i} className="ui-mono">
            {a.direction === 'out' ? `-> ${a.to}` : `<- ${a.from}`}
            {a.label === undefined ? '' : ` "${a.label}"`}
          </li>
        ))}
      </ul>
      <h3 className="ui-subtitulo">Vistas</h3>
      <ul aria-label="Vistas del Nodo" className="ui-lista">
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
