/**
 * Galeria de Temas: los Temas de la Fuente (los del Workspace, los de `--theme-path` y los incorporados) en un `listbox`.
 * Elegir uno lo previsualiza en la Vista activa sin escribir y muestra su cadena `extends`, su Paleta y sus Capas (via
 * `inspect tema`). Los Temas cambiados por fuera llevan la marca de cambio externo hasta dejar la galeria. "Fijar" escribe `theme` en esa Vista con la Intencion `fijar-tema`; "Quitar" la deja sin Tema fijado.
 */
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import type { SalidaDeInspect } from 'canonico';

import { diferenciasDelCliente } from '../diferencia/diferencias';
import { verGaleria } from '../diferencia/proyeccion';
import { MarcaExterna, useMarcasExternas } from '../diferencia/resaltado';
import { useEstudio } from '../marco/contexto';

type SalidaDeTema = Extract<SalidaDeInspect, { comando: 'tema' }>['tema'];
type Lectura = { tipo: 'cargando' } | { tipo: 'tema'; tema: SalidaDeTema } | { tipo: 'fallo'; mensaje: string };

const idDeOpcion = (tema: string): string => `ui-tema-${tema}`;

export function GaleriaDeTemas(): ReactElement {
  const { fuente, vista, estado, cliente, temaPrevio, previsualizarTema, avisar } = useEstudio();
  const [elegido, setElegido] = useState<string>();
  const marcas = useMarcasExternas(cliente);
  // Los Temas cambiados por fuera quedan marcados mientras se ve la galeria; al dejarla se dan por vistos.
  useEffect(() => () => diferenciasDelCliente(cliente).actualizar(verGaleria), [cliente]);
  if (fuente === undefined) return <p className="ui-tenue">El Workspace aun no compila: no hay Temas que mostrar.</p>;

  const fijado = fuente.views.find(({ id }) => id === vista)?.theme;
  const fijar = async (tema: string | undefined): Promise<void> => {
    if (vista === undefined || estado === undefined) return;
    const r = await cliente.editar({ tipo: 'fijar-tema', vista, ...(tema !== undefined && { tema }) }, estado.version);
    if (r.ok) previsualizarTema(undefined);
    else avisar(`No se pudo ${tema === undefined ? 'quitar' : 'fijar'} el Tema: ${r.mensaje}`);
  };
  const elegir = (tema: string): void => {
    setElegido(tema);
    previsualizarTema(tema);
  };

  return (
    <div className="ui-galeria">
      {vista !== undefined && (
        <p className="ui-tenue">
          Vista {vista}: {fijado === undefined ? 'sin Tema fijado' : `Tema fijado ${fijado}`}
          {fijado !== undefined && (
            <button type="button" aria-label={`Quitar el Tema fijado de ${vista}`} onClick={() => void fijar(undefined)}>
              Quitar
            </button>
          )}
        </p>
      )}
      <div role="listbox" aria-label="Temas" tabIndex={0} className="ui-indice" {...(elegido !== undefined && { 'aria-activedescendant': idDeOpcion(elegido) })}>
        {fuente.themes.map(({ name }) => (
          <div key={name} id={idDeOpcion(name)} role="option" aria-label={name} aria-selected={name === elegido} className="ui-indice-vista" onClick={() => elegir(name)}>
            <span className="ui-mono">{name}</span>
            {marcas.temas.has(name) && <MarcaExterna />}
            {name === fijado && <span className="ui-enlaces">fijado</span>}
            {name === temaPrevio && <span className="ui-enlaces">previsualizando</span>}
          </div>
        ))}
      </div>
      {elegido !== undefined && <FichaDeTema nombre={elegido} paleta={fuente.themes.find(({ name }) => name === elegido)?.palette ?? {}} vista={vista} fijado={fijado} previsualizando={temaPrevio === elegido} alFijar={() => void fijar(elegido)} alSoltar={() => previsualizarTema(undefined)} />}
    </div>
  );
}

interface PropsDeFicha {
  nombre: string;
  paleta: Readonly<Record<string, string>>;
  vista: string | undefined;
  fijado: string | undefined;
  previsualizando: boolean;
  alFijar: () => void;
  alSoltar: () => void;
}

function FichaDeTema({ nombre, paleta, vista, fijado, previsualizando, alFijar, alSoltar }: PropsDeFicha): ReactElement {
  const { cliente, estado } = useEstudio();
  const [lectura, setLectura] = useState<Lectura>({ tipo: 'cargando' });
  const version = estado?.version;
  useEffect(() => {
    let vigente = true;
    setLectura({ tipo: 'cargando' });
    void cliente.inspeccionar('tema', nombre).then((r) => {
      if (!vigente) return;
      if (r.ok && r.salida.comando === 'tema') setLectura({ tipo: 'tema', tema: r.salida.tema });
      else setLectura({ tipo: 'fallo', mensaje: r.ok ? 'Respuesta inesperada de inspect' : r.mensaje });
    });
    return () => {
      vigente = false;
    };
  }, [nombre, version, cliente]);

  return (
    <section aria-label={`Tema ${nombre}`} className="ui-detalle">
      <h2 className="ui-detalle-titulo">{nombre}</h2>
      <div className="ui-acciones">
        {vista !== undefined && fijado !== nombre && (
          <button type="button" onClick={alFijar}>
            {`Fijar ${nombre} en ${vista}`}
          </button>
        )}
        {previsualizando && (
          <button type="button" onClick={alSoltar}>
            Dejar de previsualizar
          </button>
        )}
      </div>
      {lectura.tipo === 'cargando' ? (
        <p className="ui-tenue" role="status">
          Cargando {nombre}...
        </p>
      ) : lectura.tipo === 'fallo' ? (
        <p className="ui-tenue" role="status">
          {lectura.mensaje}
        </p>
      ) : (
        <>
          <p className="ui-mono ui-sitio">{`${lectura.tema.file}:${lectura.tema.line}`}</p>
          <h3 className="ui-subtitulo">Cadena extends</h3>
          <p className="ui-mono">{[nombre, ...lectura.tema.extends].join(' > ')}</p>
        </>
      )}
      <h3 className="ui-subtitulo">Paleta</h3>
      <ul aria-label="Paleta" className="ui-lista ui-paleta">
        {Object.entries(paleta).map(([clave, color]) => (
          <li key={clave} className="ui-mono">
            <span aria-hidden className="ui-muestra" style={{ background: color }} />
            <span>{clave}</span> {color}
          </li>
        ))}
      </ul>
      {lectura.tipo === 'tema' && (
        <>
          <h3 className="ui-subtitulo">Capas</h3>
          <ul aria-label="Capas" className="ui-lista">
            {lectura.tema.capas.map((capa) => (
              <li key={capa.nombre} className="ui-mono">
                {capa.nombre} {capa.primitiva}
                {capa.encima ? ' [encima]' : ''}
                {capa.animada ? ' [animada]' : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
