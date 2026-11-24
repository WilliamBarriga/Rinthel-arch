/**
 * Galeria de Temas: los Temas de la Fuente (los del Workspace, los de `--theme-path` y los incorporados) en un `listbox`
 * (`marco/use-listbox.ts`: flechas y Enter, o clic). Elegir uno lo previsualiza en la Vista activa sin escribir y muestra su cadena `extends`, su Paleta y sus Capas (via
 * `inspect theme`). Los Temas cambiados por fuera llevan la marca de cambio externo hasta dejar la galeria. "Fijar" escribe `theme` en esa Vista con la Intencion `set-theme`; "Quitar" la deja sin Tema fijado.
 */
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import { diferenciasDelCliente } from '../diferencia/diferencias';
import { verGaleria } from '../diferencia/proyeccion';
import { MarcaExterna, useMarcasExternas } from '../diferencia/resaltado';
import { AvisoDeLectura } from '../marco/aviso-de-lectura';
import { useEstudio } from '../marco/contexto';
import { useInspectPorVersion } from '../marco/use-lectura-por-version';
import { useListbox } from '../marco/use-listbox';
import { textoDeSitio } from '../sitio';
import { usePrevisualizacionDeTema } from './previsualizacion';

export function GaleriaDeTemas(): ReactElement {
  const { fuente, vista, cliente, escribir } = useEstudio();
  const { temaPrevio, previsualizarTema } = usePrevisualizacionDeTema();
  const [elegido, setElegido] = useState<string>();
  const marcas = useMarcasExternas(cliente);
  const temas = fuente?.themes ?? [];
  const elegir = (tema: string): void => {
    setElegido(tema);
    previsualizarTema(tema);
  };
  const lista = useListbox({ nombre: 'Themes', prefijo: 'ui-tema', orden: temas.map(({ name }) => name), elegida: elegido, elegir });
  // Los Temas cambiados por fuera quedan marcados mientras se ve la galeria; al dejarla se dan por vistos.
  useEffect(() => () => diferenciasDelCliente(cliente).actualizar(verGaleria), [cliente]);
  if (fuente === undefined) return <p className="ui-tenue">The Workspace does not compile yet: no Themes to show.</p>;

  const fijado = fuente.views.find(({ id }) => id === vista)?.theme;
  const fijar = async (tema: string | undefined): Promise<void> => {
    if (vista === undefined) return;
    const r = await escribir({ intencion: { type: 'set-theme', view: vista, ...(tema !== undefined && { theme: tema }) }, fallo: `Could not ${tema === undefined ? 'unpin' : 'pin'} the Theme` });
    if (r.ok) previsualizarTema(undefined);
  };

  return (
    <div className="ui-galeria">
      {vista !== undefined && (
        <p className="ui-tenue">
          View {vista}: {fijado === undefined ? 'no pinned Theme' : `pinned Theme ${fijado}`}
          {fijado !== undefined && (
            <button type="button" aria-label={`Unpin the Theme of ${vista}`} onClick={() => void fijar(undefined)}>
              Unpin
            </button>
          )}
        </p>
      )}
      <div {...lista.listbox} className="ui-indice">
        {temas.map(({ name }) => (
          <div key={name} {...lista.opcion(name)} className="ui-indice-vista">
            <span className="ui-mono">{name}</span>
            {marcas.temas.has(name) && <MarcaExterna />}
            {name === fijado && <span className="ui-enlaces">pinned</span>}
            {name === temaPrevio && <span className="ui-enlaces">previewing</span>}
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
  const lectura = useInspectPorVersion(cliente, estado?.version, 'theme', nombre);
  const tema = lectura.tipo === 'dato' ? lectura.dato.theme : undefined;

  return (
    <section aria-label={`Theme ${nombre}`} className="ui-detalle">
      <h2 className="ui-detalle-titulo">{nombre}</h2>
      <div className="ui-acciones">
        {vista !== undefined && fijado !== nombre && (
          <button type="button" onClick={alFijar}>
            {`Pin ${nombre} to ${vista}`}
          </button>
        )}
        {previsualizando && (
          <button type="button" onClick={alSoltar}>
            Stop previewing
          </button>
        )}
      </div>
      {tema === undefined ? (
        <AvisoDeLectura lectura={lectura} que={nombre} />
      ) : (
        <>
          <p className="ui-mono ui-sitio">{textoDeSitio(tema)}</p>
          <h3 className="ui-subtitulo">Extends chain</h3>
          <p className="ui-mono">{[nombre, ...tema.extends].join(' > ')}</p>
        </>
      )}
      <h3 className="ui-subtitulo">Palette</h3>
      <ul aria-label="Palette" className="ui-lista ui-paleta">
        {Object.entries(paleta).map(([clave, color]) => (
          <li key={clave} className="ui-mono">
            <span aria-hidden className="ui-muestra" style={{ background: color }} />
            <span>{clave}</span> {color}
          </li>
        ))}
      </ul>
      {tema !== undefined && (
        <>
          <h3 className="ui-subtitulo">Layers</h3>
          <ul aria-label="Layers" className="ui-lista">
            {tema.layers.map((capa) => (
              <li key={capa.name} className="ui-mono">
                {capa.name} {capa.primitive}
                {capa.above ? ' [on top]' : ''}
                {capa.animated ? ' [animated]' : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
