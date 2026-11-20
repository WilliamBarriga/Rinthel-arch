/**
 * Pestana Codigo: editor CodeMirror 6 del DSL sobre un archivo del Workspace (o de `--theme-path`, en solo lectura).
 * Guarda solo (`guardado.ts`), pinta los issues del estado en linea (`diagnosticos.ts`), completa palabras clave e ids
 * (`completado.ts`) y salta a la definicion con F12 (consulta `inspect` de `dev`). Responde a `sitioDeCodigo`
 * (E, el Buscador, F12, un issue) abriendo el archivo y llevando el cursor a la linea.
 * Teclas: Mod+S, deshacer y rehacer de `dev` viven en el registro de comandos; Mod+Z, Mod+F y las capas de Esc
 * (completado, busqueda, seleccion multiple) son de CodeMirror; el ultimo Esc vuelve a Vistas con el foco en el lienzo.
 */
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { lintKeymap, setDiagnostics } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Annotation, EditorState } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import type { ArchivosDeDev, IssueDeDev } from '../../src/protocolo';
import type { ClienteDeDev } from '../cliente';
import { comandoPorId } from '../comandos/registro';
import { aplicarFixes, fixDelIssue } from '../issues/aplicar-fix';
import { useEstudio } from '../marco/contexto';
import type { ContextoDelEstudio, SitioDeCodigo } from '../marco/contexto';
import { completarDsl } from './completado';
import { diagnosticosDe } from './diagnosticos';
import type { FixDeIssue } from './diagnosticos';
import { crearGuardador } from './guardado';
import type { EstadoDelGuardado, Guardador } from './guardado';
import { lenguajeDelDsl } from './lenguaje';

/**
 * Marca las transacciones que traen texto del disco (la reconciliacion con escrituras externas, #191): no se guardan.
 * Seam: `vista.dispatch({ changes, annotations: desdeElDisco.of(true) })`.
 */
export const desdeElDisco = Annotation.define<boolean>();

const TEXTO_DEL_GUARDADO: Record<EstadoDelGuardado['tipo'], string> = { guardado: 'Guardado', 'sin-guardar': 'Sin guardar', guardando: 'Guardando...', error: 'No se guardo' };

export function PanelDeCodigo(): ReactElement {
  const estudio = useEstudio();
  const { cliente, sitioDeCodigo, estado } = estudio;
  const [lista, setLista] = useState<ArchivosDeDev['archivos']>();
  const [elegido, setElegido] = useState<string>();
  const [guardado, setGuardado] = useState<EstadoDelGuardado>({ tipo: 'guardado' });

  const version = estado?.version;
  useEffect(() => {
    let vigente = true;
    void cliente.archivos().then((leidos) => {
      if (vigente && leidos !== undefined) setLista(leidos.archivos);
    });
    return () => {
      vigente = false;
    };
  }, [cliente, version]);
  useEffect(() => {
    if (sitioDeCodigo !== undefined) setElegido(sitioDeCodigo.file);
  }, [sitioDeCodigo]);

  const archivo = elegido ?? lista?.find((a) => !a.soloLectura)?.file ?? lista?.[0]?.file;
  const soloLectura = lista?.find((a) => a.file === archivo)?.soloLectura ?? false;
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
      {archivo !== undefined && <EditorDeArchivo key={archivo} file={archivo} soloLectura={soloLectura} sitio={sitioDeCodigo?.file === archivo ? sitioDeCodigo : undefined} alCambiarGuardado={setGuardado} />}
    </div>
  );
}

interface PropsDelEditor {
  file: string;
  soloLectura: boolean;
  /** Linea a la que llevar el cursor (cada objeto nuevo es un salto nuevo). */
  sitio: SitioDeCodigo | undefined;
  alCambiarGuardado(estado: EstadoDelGuardado): void;
}

function EditorDeArchivo({ file, soloLectura, sitio, alCambiarGuardado }: PropsDelEditor): ReactElement {
  const estudio = useEstudio();
  const vivo = useRef(estudio);
  vivo.current = estudio;
  const anfitrion = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<{ vista: EditorView; guardador: Guardador }>();
  const [estadoDelGuardado, setEstadoDelGuardado] = useState<EstadoDelGuardado>({ tipo: 'guardado' });

  useEffect(() => {
    let vigente = true;
    let creado: { vista: EditorView; guardador: Guardador } | undefined;
    void estudio.cliente.archivo(file).then((leido) => {
      if (!vigente || leido === undefined || anfitrion.current === null) return;
      const guardador = crearGuardador({
        file,
        base: leido.texto,
        version: leido.version,
        enviar: (peticion) => vivo.current.cliente.editarTexto(peticion),
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

  return <div ref={anfitrion} className="ui-editor" />;
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
    const s = r.salida;
    const sitio = s.comando === 'nodo' ? s.nodo : s.comando === 'vista' ? s.vista : s.comando === 'interaccion' ? s.interaccion : undefined;
    if (sitio !== undefined) {
      estudio.abrirCodigo({ file: sitio.file, line: sitio.line });
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
