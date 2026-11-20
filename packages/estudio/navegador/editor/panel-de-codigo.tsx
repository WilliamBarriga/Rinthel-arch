/**
 * Pestana Codigo: editor CodeMirror 6 del DSL sobre un archivo del Workspace (o de `--theme-path`, en solo lectura).
 * Guarda solo (`guardado.ts`), pinta los issues del estado en linea (`diagnosticos.ts`), completa palabras clave e ids
 * (`completado.ts`) y salta a la definicion con F12 (consulta `inspect` de `dev`). Responde a `sitioDeCodigo`
 * (E, el Buscador, F12, un issue) abriendo el archivo y llevando el cursor a la linea.
 * Escrituras externas (#191): con cada `version` el panel relee `/api/archivos` y pasa el hash del archivo al guardador,
 * que reconcilia el buffer (`reconciliacion.ts`); el texto del disco entra anotado `desdeElDisco` con sus lineas
 * marcadas, y si gano el disco en un solape un aviso ofrece recuperar lo perdido durante `DURACION_DEL_AVISO_MS`.
 * Teclas: Mod+S, deshacer y rehacer de `dev` viven en el registro de comandos; Mod+Z, Mod+F y las capas de Esc
 * (completado, busqueda, seleccion multiple) son de CodeMirror; el ultimo Esc vuelve a Vistas con el foco en el lienzo.
 */
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { lintKeymap, setDiagnostics } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import type { ArchivosDeDev, IssueDeDev } from '../../src/protocolo';
import type { ClienteDeDev } from '../cliente';
import { comandoPorId } from '../comandos/registro';
import { aplicarFixes, fixDelIssue } from '../issues/aplicar-fix';
import { useEstudio } from '../marco/contexto';
import type { ContextoDelEstudio, SitioDeCodigo } from '../marco/contexto';
import { useCaducidad } from '../marco/use-caducidad';
import { sitioDeSalida } from '../sitio';
import { completarDsl } from './completado';
import { diagnosticosDe } from './diagnosticos';
import type { FixDeIssue } from './diagnosticos';
import { crearGuardador } from './guardado';
import type { EstadoDelGuardado, Guardador } from './guardado';
import { lenguajeDelDsl } from './lenguaje';
import { desdeElDisco, limpiarMarcasDelDisco, marcasDelDisco } from './marcas-del-disco';
import type { Fusion, FragmentoPerdido } from './reconciliacion';

export { desdeElDisco };

/** Cuanto quedan marcadas las lineas que trajo el disco. */
export const DURACION_DE_LAS_MARCAS_MS = 4000;
/** Cuanto se ofrece recuperar lo que perdio el buffer en un solape. */
export const DURACION_DEL_AVISO_MS = 15000;

const TEXTO_DEL_GUARDADO: Record<EstadoDelGuardado['tipo'], string> = { guardado: 'Guardado', 'sin-guardar': 'Sin guardar', guardando: 'Guardando...', error: 'No se guardo' };

export function PanelDeCodigo(): ReactElement {
  const estudio = useEstudio();
  const { cliente, sitioDeCodigo, estado } = estudio;
  const [listado, setListado] = useState<ArchivosDeDev>();
  const lista = listado?.archivos;
  const [elegido, setElegido] = useState<string>();
  const [guardado, setGuardado] = useState<EstadoDelGuardado>({ tipo: 'guardado' });

  const version = estado?.version;
  useEffect(() => {
    let vigente = true;
    void cliente.archivos().then((leidos) => {
      if (vigente && leidos !== undefined) setListado(leidos);
    });
    return () => {
      vigente = false;
    };
  }, [cliente, version]);
  useEffect(() => {
    if (sitioDeCodigo !== undefined) setElegido(sitioDeCodigo.file);
  }, [sitioDeCodigo]);

  const archivo = elegido ?? lista?.find((a) => !a.soloLectura)?.file ?? lista?.[0]?.file;
  const delArchivo = lista?.find((a) => a.file === archivo);
  const soloLectura = delArchivo?.soloLectura ?? false;
  const hashEnDisco = delArchivo?.hash;
  const versionDelListado = listado?.version;
  const enDisco = useMemo(() => (hashEnDisco === undefined || versionDelListado === undefined ? undefined : { hash: hashEnDisco, version: versionDelListado }), [hashEnDisco, versionDelListado]);
  const textoDelGuardado = soloLectura ? 'Solo lectura' : guardado.tipo === 'error' ? `${TEXTO_DEL_GUARDADO.error}: ${guardado.mensaje}` : TEXTO_DEL_GUARDADO[guardado.tipo];

  return (
    <div className="ui-codigo">
      <div className="ui-codigo-cabecera">
        <select aria-label="Archivo" value={archivo ?? ''} onChange={(e) => setElegido(e.target.value)}>
          {(lista ?? []).map((a) => (
            <option key={a.file} value={a.file}>
              {a.soloLectura ? `${a.file} (solo lectura)` : a.file}
            </option>
          ))}
        </select>
        <span role="status" aria-label="Guardado del editor" className="ui-guardado" data-estado={guardado.tipo}>
          {textoDelGuardado}
        </span>
      </div>
      {archivo !== undefined && <EditorDeArchivo key={archivo} file={archivo} soloLectura={soloLectura} sitio={sitioDeCodigo?.file === archivo ? sitioDeCodigo : undefined} enDisco={enDisco} alCambiarGuardado={setGuardado} />}
    </div>
  );
}

interface PropsDelEditor {
  file: string;
  soloLectura: boolean;
  /** Linea a la que llevar el cursor (cada objeto nuevo es un salto nuevo). */
  sitio: SitioDeCodigo | undefined;
  /** Hash del archivo en disco segun `dev` y la `version` del listado que lo dio. */
  enDisco: { hash: string; version: number } | undefined;
  alCambiarGuardado(estado: EstadoDelGuardado): void;
}

function EditorDeArchivo({ file, soloLectura, sitio, enDisco, alCambiarGuardado }: PropsDelEditor): ReactElement {
  const estudio = useEstudio();
  const vivo = useRef(estudio);
  vivo.current = estudio;
  const anfitrion = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<{ vista: EditorView; guardador: Guardador }>();
  const [estadoDelGuardado, setEstadoDelGuardado] = useState<EstadoDelGuardado>({ tipo: 'guardado' });
  const [perdidos, setPerdidos] = useState<FragmentoPerdido[]>([]);
  const [marcado, setMarcado] = useState(0);

  useEffect(() => {
    let vigente = true;
    let creado: { vista: EditorView; guardador: Guardador } | undefined;
    const alReconciliar = (fusion: Fusion): void => {
      if (creado === undefined) return;
      creado.vista.dispatch({ changes: fusion.alBuffer, annotations: desdeElDisco.of(true) });
      if (!fusion.alBuffer.empty) setMarcado((n) => n + 1);
      if (fusion.perdidos.length > 0) setPerdidos(fusion.perdidos);
    };
    void estudio.cliente.archivo(file).then((leido) => {
      if (!vigente || leido === undefined || anfitrion.current === null) return;
      const guardador = crearGuardador({
        file,
        base: leido.texto,
        version: leido.version,
        enviar: (peticion) => vivo.current.cliente.editarTexto(peticion),
        leerDisco: async () => {
          const disco = await vivo.current.cliente.archivo(file);
          return disco === undefined ? undefined : { texto: disco.texto, version: disco.version };
        },
        alReconciliar,
        alCambiarEstado: (e) => {
          setEstadoDelGuardado(e);
          alCambiarGuardado(e);
        },
      });
      const vista = new EditorView({ parent: anfitrion.current, state: EditorState.create({ doc: leido.texto, extensions: extensiones(file, soloLectura, guardador, vivo) }) });
      creado = { vista, guardador };
      setEditor(creado);
    });
    return () => {
      vigente = false;
      if (creado === undefined) return;
      creado.guardador.cerrar();
      void creado.guardador.guardar();
      creado.vista.destroy();
    };
    // El editor se crea una vez por archivo (la pestana usa `key={file}`).
  }, [file]);

  useEffect(() => {
    if (editor === undefined) return;
    alCambiarGuardado(editor.guardador.estado());
    return vivo.current.registrarGuardado(() => editor.guardador.guardar());
  }, [editor, alCambiarGuardado]);

  useEffect(() => {
    if (editor !== undefined && enDisco !== undefined && !soloLectura) void editor.guardador.sincronizar(enDisco);
  }, [editor, enDisco, soloLectura]);

  useCaducidad(editor === undefined || marcado === 0 ? undefined : DURACION_DE_LAS_MARCAS_MS, () => editor?.vista.dispatch({ effects: limpiarMarcasDelDisco.of(null) }), `${marcado}`);
  useCaducidad(perdidos.length === 0 ? undefined : DURACION_DEL_AVISO_MS, () => setPerdidos([]), perdidos);

  // Issues en linea: solo con el buffer igual al disco, para que las posiciones coincidan.
  const issues = estudio.estado?.issues;
  useEffect(() => {
    if (editor === undefined || issues === undefined || editor.guardador.sucio()) return;
    const { vista } = editor;
    vista.dispatch(setDiagnostics(vista.state, diagnosticosDe(vista.state.doc, file, issues, (fix, issue) => aplicarFix(vista, file, fix, issue, vivo.current))));
  }, [editor, issues, estadoDelGuardado, file]);

  useEffect(() => {
    if (editor === undefined || sitio === undefined) return;
    const { vista } = editor;
    const linea = vista.state.doc.line(Math.min(Math.max(sitio.line, 1), vista.state.doc.lines));
    vista.dispatch({ selection: { anchor: linea.from }, effects: EditorView.scrollIntoView(linea.from, { y: 'center' }) });
    vista.focus();
  }, [editor, sitio]);

  const recuperar = (): void => {
    if (editor !== undefined) recuperarPerdidos(editor.vista, perdidos);
    setPerdidos([]);
  };

  return (
    <>
      {perdidos.length > 0 && (
        <div role="alert" aria-label="Escritura externa" className="ui-aviso-del-disco">
          <span>{`El archivo cambio en disco y gano el disco en ${perdidos.length === 1 ? 'un lugar' : `${perdidos.length} lugares`} (${perdidos.map((p) => `linea ${p.linea}`).join(', ')}).`}</span>
          <button type="button" onClick={recuperar}>
            Recuperar lo mio
          </button>
          <button type="button" onClick={() => setPerdidos([])}>
            Descartar
          </button>
        </div>
      )}
      <div ref={anfitrion} className="ui-editor" />
    </>
  );
}

/** Reinserta cada fragmento perdido antes de su linea, como una edicion del usuario (se guarda y se deshace con Mod+Z). */
function recuperarPerdidos(vista: EditorView, perdidos: readonly FragmentoPerdido[]): void {
  const doc = vista.state.doc;
  const cambios = perdidos.map((p) => ({ from: doc.line(Math.min(Math.max(p.linea, 1), doc.lines)).from, insert: `${p.texto}\n` }));
  vista.dispatch({ changes: cambios, userEvent: 'input' });
  vista.focus();
}

/**
 * Un `fix` del mismo archivo entra al buffer (y se guarda con el resto); uno de otro archivo va directo a `dev` con la
 * misma logica que el boton del panel Issues (`aplicarFixes`: version vista, 409 con reintento, aviso con motivo).
 */
function aplicarFix(vista: EditorView, file: string, fix: FixDeIssue, issue: IssueDeDev, estudio: ContextoDelEstudio): void {
  if (fix.file === file && !vista.state.readOnly) {
    const doc = vista.state.doc;
    const offset = ({ line, column }: { line: number; column: number }): number => doc.line(line).from + column - 1;
    vista.dispatch({ changes: { from: offset(fix.range.start), to: offset(fix.range.end), insert: fix.replacement }, userEvent: 'input' });
    return;
  }
  void aplicarFixes(estudio, fixDelIssue(issue));
}

/** Id bajo el cursor (con `.` y `-`, como los ids del DSL). */
function idBajoElCursor(state: EditorState): string | undefined {
  const pos = state.selection.main.head;
  const linea = state.doc.lineAt(pos);
  const columna = pos - linea.from;
  for (const m of linea.text.matchAll(/[A-Za-z_][\w.-]*/g)) {
    if (m.index <= columna && columna <= m.index + m[0].length) return m[0];
  }
  return undefined;
}

/** Busca el id como Nodo, Vista o Interaccion (la consulta `archivo:linea` de `inspect`) y abre ese sitio. */
async function irADefinicion(id: string, cliente: ClienteDeDev, estudio: ContextoDelEstudio): Promise<void> {
  for (const comando of ['nodo', 'vista', 'interaccion'] as const) {
    const r = await cliente.inspeccionar(comando, id);
    if (!r.ok) continue;
    const sitio = sitioDeSalida(r.salida);
    if (sitio !== undefined) {
      estudio.abrirCodigo(sitio);
      return;
    }
  }
  estudio.avisar(`Sin definicion para '${id}'`);
}

function extensiones(file: string, soloLectura: boolean, guardador: Guardador, estudio: { current: ContextoDelEstudio }) {
  const propias = keymap.of([
    {
      key: 'F12',
      run: (vista) => {
        const id = idBajoElCursor(vista.state);
        if (id !== undefined) void irADefinicion(id, estudio.current.cliente, estudio.current);
        return id !== undefined;
      },
    },
    {
      // Ultima capa de Esc: lo efimero (completado, busqueda, seleccion multiple) ya lo cerro CodeMirror.
      key: 'Escape',
      run: () => {
        void comandoPorId('salir-del-editor')?.ejecutar(estudio.current);
        return true;
      },
    },
  ]);
  return [
    lineNumbers(),
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    lenguajeDelDsl(),
    marcasDelDisco(),
    autocompletion({ override: [completarDsl(() => estudio.current.fuente)] }),
    keymap.of([...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap, ...lintKeymap, ...defaultKeymap, indentWithTab]),
    propias,
    EditorState.readOnly.of(soloLectura),
    EditorView.editable.of(!soloLectura),
    EditorView.contentAttributes.of({ 'aria-label': `Codigo de ${file}${soloLectura ? ' (solo lectura)' : ''}` }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && !u.transactions.some((t) => t.annotation(desdeElDisco) === true)) guardador.cambiar(u.changes);
    }),
    EditorView.domEventHandlers({
      blur: () => {
        void guardador.guardar();
        return false;
      },
    }),
  ];
}
