/**
 * Buscador (Mod+K): dialogo de Base UI con Autocomplete. Encuentra comandos del registro (con su atajo), Vistas (de
 * la Fuente), Nodos (`inspect buscar`, con su `archivo:linea`) y un `archivo:linea` escrito tal cual, que abre Codigo.
 * El filtrado es propio (`filter={null}`): los Nodos llegan del servidor y descartan respuestas viejas.
 */
import { Autocomplete } from '@base-ui/react/autocomplete';
import { Dialog } from '@base-ui/react/dialog';
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { useEstudio } from '../marco/contexto';
import type { ContextoDelEstudio } from '../marco/contexto';
import { sitioEscrito, textoDeSitio } from '../sitio';
import { destinoDeNodo } from '../vistas/destino';
import { indiceDeVistas } from '../vistas/indice';
import { BotonConAtajo } from './atajo';
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

type Nodos = { consulta: string; entradas: Entrada[] };

function useNodos(consulta: string): Entrada[] {
  const { cliente, estado } = useEstudio();
  const [nodos, setNodos] = useState<Nodos>({ consulta: '', entradas: [] });
  const version = estado?.version;
  useEffect(() => {
    const limpia = consulta.trim();
    if (limpia === '' || sitioEscrito(limpia) !== undefined) return;
    let vigente = true;
    void cliente.inspeccionar('buscar', limpia).then((r) => {
      if (!vigente || !r.ok || r.salida.comando !== 'buscar') return;
      const entradas = r.salida.resultados
        .filter((n) => n.kind === 'nodo')
        .map((n) => ({ value: `nodo:${n.id}`, label: n.title, detalle: `${n.id} · ${textoDeSitio(n)}`, ejecutar: (e: ContextoDelEstudio) => irANodo(e, n.id) }));
      setNodos({ consulta, entradas });
    });
    return () => {
      vigente = false;
    };
  }, [consulta, cliente, version]);
  return nodos.consulta === consulta ? nodos.entradas : [];
}

function Contenido({ alElegir }: { alElegir: () => void }): ReactElement {
  const estudio = useEstudio();
  const { fuente, plataforma } = estudio;
  const [consulta, setConsulta] = useState('');
  const vistas = useMemo(() => (fuente === undefined ? [] : indiceDeVistas(fuente).flatMap((g) => g.vistas)), [fuente]);
  const nodos = useNodos(consulta);

  const sitio = sitioEscrito(consulta);
  const todos: Grupo[] = [
    { value: 'Archivo', items: sitio === undefined ? [] : [{ value: `sitio:${textoDeSitio(sitio)}`, label: `Abrir ${textoDeSitio(sitio)}`, ejecutar: (e) => e.abrirCodigo(sitio) }] },
    {
      value: 'Comandos',
      items: COMANDOS.filter((c) => c.enBuscador !== false && contiene(c.nombre, consulta.trim())).map((c) => ({ value: `comando:${c.id}`, label: c.nombre, teclas: etiquetasDeTeclas(c, plataforma), ejecutar: c.ejecutar })),
    },
    {
      value: 'Vistas',
      items: vistas.filter((v) => contiene(v.id, consulta.trim())).map((v) => ({ value: `vista:${v.id}`, label: v.id, detalle: v.tipo, ejecutar: (e) => e.irAVista(v.id) })),
    },
    { value: 'Nodos', items: nodos },
  ];
  const grupos = todos.filter((g) => g.items.length > 0);

  const elegir = (entrada: Entrada): void => {
    alElegir();
    void entrada.ejecutar(estudio);
  };

  return (
    <Autocomplete.Root open inline items={grupos} filter={null} value={consulta} onValueChange={setConsulta} autoHighlight="always" keepHighlight>
      <Autocomplete.Input className="ui-buscador-campo" aria-label="Buscar" placeholder="Vistas, Nodos, archivo:linea o comandos" />
      <Autocomplete.Empty>
        <p className="ui-tenue">Sin resultados.</p>
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
        <Dialog.Popup className="ui-dialogo ui-buscador" aria-label="Buscador">
          <Contenido alElegir={() => alCambiar(false)} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Pildora de la barra que abre el Buscador y anuncia Mod+K. */
export function PildoraDelBuscador(): ReactElement {
  const { abrirDialogo } = useEstudio();
  return (
    <BotonConAtajo comando="buscador" className="ui-pildora ui-pildora-buscador" aria-label="Buscar" onClick={() => abrirDialogo('buscador')}>
      Buscar
    </BotonConAtajo>
  );
}
