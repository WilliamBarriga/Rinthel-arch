/**
 * Buscador (Mod+K): dialogo de Base UI con Autocomplete. Encuentra comandos del registro (con su atajo), Vistas (de
 * la Fuente), Nodos (`inspect search`, con su `archivo:linea`) y un `archivo:linea` escrito tal cual, que abre Codigo.
 * El filtrado es propio (`filter={null}`): los Nodos llegan del servidor y descartan respuestas viejas.
 */
import { Autocomplete } from '@base-ui/react/autocomplete';
import { Dialog } from '@base-ui/react/dialog';
import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { useEstudio } from '../marco/contexto';
import type { ContextoDelEstudio } from '../marco/contexto';
import { useInspectPorVersion } from '../marco/use-lectura-por-version';
import { sitioEscrito, textoDeSitio } from '../sitio';
import { destinoDeNodo } from '../vistas/destino';
import { indiceDeVistas } from '../vistas/indice';
import { COMANDOS } from './registro';
import { etiquetasDeTeclas } from './teclas';

interface Entrada {
  value: string;
  label: string;
  detalle?: string;
  teclas?: string[];
  ejecutar(e: ContextoDelEstudio): void | Promise<void>;
}

interface Grupo {
  value: string;
  items: Entrada[];
}


const contiene = (texto: string, consulta: string): boolean => texto.toLowerCase().includes(consulta.toLowerCase());

/** Un Nodo elegido: se selecciona y se abre su Detalle. Si la Vista activa no lo muestra, primero se va a la primera que si. */
function irANodo(e: ContextoDelEstudio, id: string): void {
  const destino = e.fuente === undefined ? undefined : destinoDeNodo(e.fuente, id, e.vista);
  if (destino !== undefined && destino.vista !== e.vista) e.irAVista(destino.vista);
  e.seleccionar(id);
  e.abrirPestana('derecha', 'detalle');
}

/** Los Nodos de `inspect search`; mientras no llegan los de la consulta vigente (o si falla), ninguno. */
function useNodos(consulta: string): Entrada[] {
  const { cliente, estado } = useEstudio();
  const limpia = consulta.trim();
  const lectura = useInspectPorVersion(cliente, estado?.version, 'search', limpia === '' || sitioEscrito(limpia) !== undefined ? undefined : limpia);
  return useMemo(
    () =>
      lectura.tipo !== 'dato'
        ? []
        : lectura.dato.resultados
            .filter((n) => n.kind === 'node')
            .map((n) => ({ value: `nodo:${n.id}`, label: n.title, detalle: `${n.id} · ${textoDeSitio(n)}`, ejecutar: (e: ContextoDelEstudio) => irANodo(e, n.id) })),
    [lectura],
  );
}

function Contenido({ alElegir }: { alElegir: () => void }): ReactElement {
  const estudio = useEstudio();
  const { fuente, plataforma } = estudio;
  const [consulta, setConsulta] = useState('');
  const vistas = useMemo(() => (fuente === undefined ? [] : indiceDeVistas(fuente).flatMap((g) => g.vistas)), [fuente]);
  const nodos = useNodos(consulta);

  const sitio = sitioEscrito(consulta);
  const todos: Grupo[] = [
    { value: 'File', items: sitio === undefined ? [] : [{ value: `sitio:${textoDeSitio(sitio)}`, label: `Open ${textoDeSitio(sitio)}`, ejecutar: (e) => e.abrirCodigo(sitio) }] },
    {
      value: 'Commands',
      items: COMANDOS.filter((c) => c.enBuscador !== false && contiene(c.nombre, consulta.trim())).map((c) => ({ value: `comando:${c.id}`, label: c.nombre, teclas: etiquetasDeTeclas(c, plataforma), ejecutar: c.ejecutar })),
    },
    {
      value: 'Views',
      items: vistas.filter((v) => contiene(v.id, consulta.trim())).map((v) => ({ value: `vista:${v.id}`, label: v.id, detalle: v.tipo, ejecutar: (e) => e.irAVista(v.id) })),
    },
    { value: 'Nodes', items: nodos },
  ];
  const grupos = todos.filter((g) => g.items.length > 0);

  const elegir = (entrada: Entrada): void => {
    alElegir();
    void entrada.ejecutar(estudio);
  };

  return (
    <Autocomplete.Root open inline items={grupos} filter={null} value={consulta} onValueChange={setConsulta} autoHighlight="always" keepHighlight>
      <Autocomplete.Input className="ui-buscador-campo" aria-label="Search" placeholder="Views, Nodes, file:line or commands" />
      <Autocomplete.Empty>
        <p className="ui-tenue">No results.</p>
      </Autocomplete.Empty>
      <Autocomplete.List className="ui-buscador-lista">
        {(grupo: Grupo) => (
          <Autocomplete.Group key={grupo.value} items={grupo.items} className="ui-buscador-grupo">
            <Autocomplete.GroupLabel className="ui-indice-titulo">{grupo.value}</Autocomplete.GroupLabel>
            <Autocomplete.Collection>
              {(entrada: Entrada) => (
                <Autocomplete.Item key={entrada.value} value={entrada} className="ui-buscador-item" onClick={() => elegir(entrada)}>
                  <span>{entrada.label}</span>
                  {entrada.detalle !== undefined && <span className="ui-mono ui-tenue">{` ${entrada.detalle}`}</span>}
                  {entrada.teclas?.map((t) => (
                    <kbd key={t} className="ui-tecla">
                      {t}
                    </kbd>
                  ))}
                </Autocomplete.Item>
              )}
            </Autocomplete.Collection>
          </Autocomplete.Group>
        )}
      </Autocomplete.List>
    </Autocomplete.Root>
  );
}

export function Buscador({ abierto, alCambiar }: { abierto: boolean; alCambiar: (abierto: boolean) => void }): ReactElement {
  const { portales } = useEstudio();
  return (
    <Dialog.Root open={abierto} onOpenChange={alCambiar}>
      <Dialog.Portal container={portales}>
        <Dialog.Backdrop className="ui-fondo-dialogo" />
        <Dialog.Popup className="ui-dialogo ui-buscador" aria-label="Finder">
          <Contenido alElegir={() => alCambiar(false)} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
