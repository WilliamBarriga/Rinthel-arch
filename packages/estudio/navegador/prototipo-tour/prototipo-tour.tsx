/**
 * PROTOTIPO DESECHABLE (ticket "Tour Empieza aqui en la UI", #224). No va a main.
 *
 * Pregunta: que recorre el tour de bienvenida, cuando aparece, si sale del Workspace o es fijo de la UI, y como se ve
 * en la demo estatica. Tres variantes sobre la UI real de `dev`, elegidas con `?tour=A|B|C`; `&demo=1` simula la demo
 * estatica (export de solo lectura: sin editor, sin Agente, sin escrituras). Sin `?tour` no se monta nada.
 *
 *   A  Coachmarks fijos de la UI: foco sobre cada zona real, modal, en la primera visita.
 *   B  Recorrido narrado que declara el Workspace (bloque `tour` hipotetico del DSL): Vistas y Pasos del propio repo.
 *   C  Checklist "Empieza aqui" no modal: tareas que el usuario hace solo y se tachan al detectarlas.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { useEstudio } from '../marco/contexto';
import type { ContextoDelEstudio } from '../marco/contexto';

type Clave = 'A' | 'B' | 'C';
const VARIANTES: readonly { clave: Clave; nombre: string; cuando: string }[] = [
  { clave: 'A', nombre: 'Coachmarks fijos de la UI', cuando: 'Aparece solo en la primera visita (localStorage); "?" -> "Ver tour" lo repite.' },
  { clave: 'B', nombre: 'Recorrido del Workspace', cuando: 'Aparece si el Workspace declara `tour`; en la demo abre directo; si no, pildora "Recorrido".' },
  { clave: 'C', nombre: 'Checklist Empieza aqui', cuando: 'Visible hasta completar o cerrar; despues queda en el Buscador.' },
];

const parametros = (): URLSearchParams => new URLSearchParams(window.location.search);
const LLAVE_VISTO = 'prototipo-tour:visto';

function cambiarParametro(clave: string, valor: string | null): void {
  const p = parametros();
  if (valor === null) p.delete(clave);
  else p.set(clave, valor);
  window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}${window.location.hash}`);
  window.dispatchEvent(new Event('prototipo-tour'));
}

function useParametros(): { variante: Clave | undefined; demo: boolean } {
  const [, forzar] = useState(0);
  useEffect(() => {
    const f = (): void => forzar((n) => n + 1);
    window.addEventListener('prototipo-tour', f);
    return () => window.removeEventListener('prototipo-tour', f);
  }, []);
  const v = parametros().get('tour');
  return { variante: v === 'A' || v === 'B' || v === 'C' ? v : undefined, demo: parametros().get('demo') === '1' };
}

/** Vistas del ejemplo con Pasos y de detalle; si el Workspace no las tiene, cae a la primera Vista. */
function vistaConPasos(estudio: ContextoDelEstudio): string | undefined {
  const vistas = estudio.fuente?.views ?? [];
  const conPasos = vistas.filter((v) => (v.steps?.length ?? 0) > 0);
  return (conPasos.find((v) => v.id === 'flujo-edicion') ?? conPasos[0] ?? vistas[0])?.id;
}

function irConPaso(vista: string, paso: number, seleccion?: string): void {
  const p = new URLSearchParams();
  p.set('vista', vista);
  if (paso > 0) p.set('t', String(paso));
  if (seleccion !== undefined) p.set('s', seleccion);
  window.location.hash = p.toString();
}

export function PrototipoTour(): ReactElement | null {
  const { variante, demo } = useParametros();
  if (variante === undefined) return null;
  return (
    <>
      <style>{CSS}</style>
      {demo && <MarcaDeDemo />}
      {variante === 'A' && <VarianteA demo={demo} />}
      {variante === 'B' && <VarianteB demo={demo} />}
      {variante === 'C' && <VarianteC demo={demo} />}
      <Selector actual={variante} demo={demo} />
    </>
  );
}

/* ------------------------------------------------------------------ selector flotante */

function Selector({ actual, demo }: { actual: Clave; demo: boolean }): ReactElement {
  const i = VARIANTES.findIndex((v) => v.clave === actual);
  const ir = useCallback((d: number) => cambiarParametro('tour', VARIANTES[(i + d + VARIANTES.length) % VARIANTES.length]!.clave), [i]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      const foco = document.activeElement;
      if (foco instanceof HTMLElement && (foco.closest('input, textarea, [contenteditable], .ui-isla, [role=dialog]') !== null)) return;
      if (e.key === 'ArrowLeft') ir(-1);
      if (e.key === 'ArrowRight') ir(1);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [ir]);
  const v = VARIANTES[i]!;
  return (
    <div className="pt-selector" data-prototipo>
      <button type="button" onClick={() => ir(-1)} aria-label="Variante anterior">
        &lt;
      </button>
      <div className="pt-selector-texto">
        <strong>
          {v.clave} ({v.nombre})
        </strong>
        <small>Cuando: {v.cuando}</small>
      </div>
      <button type="button" onClick={() => ir(1)} aria-label="Variante siguiente">
        &gt;
      </button>
      <label className="pt-demo">
        <input type="checkbox" checked={demo} onChange={(e) => cambiarParametro('demo', e.target.checked ? '1' : null)} /> demo estatica
      </label>
      <button
        type="button"
        onClick={() => {
          localStorage.removeItem(LLAVE_VISTO);
          localStorage.removeItem('prototipo-tour:c-cerrado');
          window.dispatchEvent(new Event('prototipo-tour-reinicio'));
        }}
      >
        primera visita
      </button>
    </div>
  );
}

function MarcaDeDemo(): ReactElement {
  return (
    <div className="pt-marca-demo">
      Demo de solo lectura de <b>rinthel-arch</b> sobre su propio repo. En el tuyo: <code>npx rinthel-arch scan</code> y <code>npx rinthel-arch dev</code>
    </div>
  );
}

function useReinicio(alReiniciar: () => void): void {
  useEffect(() => {
    window.addEventListener('prototipo-tour-reinicio', alReiniciar);
    return () => window.removeEventListener('prototipo-tour-reinicio', alReiniciar);
  }, [alReiniciar]);
}

/* ------------------------------------------------------------------ A: coachmarks fijos */

interface Parada {
  titulo: string;
  texto: string;
  /** Selector CSS de la zona real que se ilumina; sin el, la tarjeta va al centro. */
  zona?: string;
  preparar?(e: ContextoDelEstudio): void;
}

function paradasA(demo: boolean): Parada[] {
  const base: Parada[] = [
    {
      titulo: 'Esto es tu repo como diagrama',
      texto: 'Cada caja es una parte del codigo; el lienzo se arrastra y hace zoom. Doble clic en un Nodo con hijos entra (Drill-down).',
      zona: '.ui-lienzo',
    },
    {
      titulo: 'Vistas',
      texto: 'Un mismo Modelo, varios cortes: arquitectura, flujos, secuencias, tablas. Las flechas cambian de Vista; las migas de arriba te devuelven.',
      zona: '#ui-isla-izquierda',
      preparar: (e) => e.abrirPestana('izquierda', 'vistas'),
    },
    {
      titulo: 'Pasos',
      texto: 'Algunas Vistas cuentan una historia: avanza con > para revelar un paso a la vez. Sirve tal cual para una charla.',
      zona: '.rd-pasos',
      preparar: (e) => {
        const v = vistaConPasos(e);
        if (v !== undefined) irConPaso(v, 1);
      },
    },
    {
      titulo: 'Temas',
      texto: demo ? 'Prueba otra estetica: la previsualizacion no cambia nada.' : 'Previsualiza otra estetica sin escribir; "Fijar" la guarda en la Vista.',
      zona: '#ui-isla-derecha',
      preparar: (e) => e.abrirPestana('derecha', 'temas'),
    },
  ];
  if (demo)
    return [
      ...base,
      {
        titulo: 'En tu repo',
        texto: 'Aqui solo se mira. En tu repo, tu agente escanea el codigo, escribe el .dg y lo ves cambiar en vivo: npx rinthel-arch scan, luego dev.',
      },
    ];
  return [
    ...base,
    {
      titulo: 'Codigo',
      texto: 'El diagrama es texto (.dg). E abre el editor en lo que miras; guarda solo y el lienzo se redibuja.',
      zona: '#ui-isla-izquierda',
      preparar: (e) => e.abrirCodigo(),
    },
    {
      titulo: 'Tu agente, en vivo',
      texto: 'Cuando tu agente corre validate o edit, aparece aqui y lo que cambia se resalta en el lienzo. "Seguir" salta a lo que toca.',
      zona: '#ui-isla-derecha',
      preparar: (e) => e.abrirPestana('derecha', 'agente'),
    },
  ];
}

function VarianteA({ demo }: { demo: boolean }): ReactElement | null {
  const estudio = useEstudio();
  const paradas = useMemo(() => paradasA(demo), [demo]);
  const [indice, setIndice] = useState<number | null>(() => (localStorage.getItem(LLAVE_VISTO) === null ? 0 : null));
  useReinicio(useCallback(() => setIndice(0), []));
  const parada = indice === null ? undefined : paradas[indice];
  const [caja, setCaja] = useState<DOMRect | null>(null);

  useEffect(() => {
    parada?.preparar?.(estudio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parada]);
  useLayoutEffect(() => {
    if (parada?.zona === undefined) return setCaja(null);
    const medir = (): void => setCaja(document.querySelector(parada.zona!)?.getBoundingClientRect() ?? null);
    medir();
    const t = window.setInterval(medir, 250);
    return () => window.clearInterval(t);
  }, [parada]);

  const cerrar = (): void => {
    localStorage.setItem(LLAVE_VISTO, '1');
    setIndice(null);
  };
  if (indice === null || parada === undefined)
    return (
      <button type="button" className="pt-relanzar" onClick={() => setIndice(0)}>
        Ver tour
      </button>
    );

  const m = 8;
  const hueco = caja === null ? null : { left: caja.left - m, top: caja.top - m, width: caja.width + 2 * m, height: caja.height + 2 * m };
  const tarjeta = posicionDeTarjeta(hueco);
  return (
    <div className="pt-a-capa">
      {hueco === null ? <div className="pt-a-velo" /> : <div className="pt-a-hueco" style={hueco} />}
      <div className="pt-tarjeta" style={tarjeta} role="dialog" aria-label="Tour">
        <small>
          {indice + 1} de {paradas.length}
        </small>
        <h3>{parada.titulo}</h3>
        <p>{parada.texto}</p>
        <div className="pt-fila">
          <button type="button" onClick={cerrar}>
            Saltar
          </button>
          <span />
          {indice > 0 && (
            <button type="button" onClick={() => setIndice(indice - 1)}>
              Atras
            </button>
          )}
          <button type="button" className="pt-primario" onClick={() => (indice + 1 < paradas.length ? setIndice(indice + 1) : cerrar())}>
            {indice + 1 < paradas.length ? 'Siguiente' : 'Listo'}
          </button>
        </div>
      </div>
    </div>
  );
}

function posicionDeTarjeta(h: { left: number; top: number; width: number; height: number } | null): React.CSSProperties {
  if (h === null) return { left: '50%', top: '40%', transform: 'translate(-50%, -50%)' };
  const W = window.innerWidth;
  const ancho = 320;
  // Zona grande (el lienzo): tarjeta al centro abajo. Si no, al lado libre.
  if (h.width > W * 0.6) return { left: '50%', bottom: 90, transform: 'translateX(-50%)' };
  // Zona baja y ancha (los Pasos): tarjeta encima.
  if (h.top > window.innerHeight / 2) return { left: Math.min(W - ancho - 16, Math.max(16, h.left)), bottom: window.innerHeight - h.top + 12 };
  if (h.left + h.width + ancho + 24 < W) return { left: h.left + h.width + 16, top: Math.max(16, h.top) };
  return { left: Math.max(16, h.left - ancho - 16), top: Math.max(16, h.top) };
}

/* ------------------------------------------------------------------ B: recorrido del Workspace */

interface Capitulo {
  titulo: string;
  texto: string;
  vista: string;
  paso?: number;
  seleccion?: string;
}

/** Lo que declararia el Workspace. Aqui, armado a mano sobre examples/rinthel-arch (ids reales). */
const DSL_HIPOTETICO = `tour "Empieza aqui" {
  stop "El sistema entero" {
    view paquetes
    text "Los paquetes del monorepo y quien depende de quien."
  }
  stop "Abrir un paquete" {
    view abierto
    select cli
  }
  stop "Que pasa al arrastrar un Nodo" {
    view flujo-edicion
    step 1
  }
  stop "...hasta el .dg" { view flujo-edicion  step 5 }
  stop "Como lo sigue un agente" { view flujo-agente }
}`;

function capitulos(e: ContextoDelEstudio): Capitulo[] {
  const ids = new Set((e.fuente?.views ?? []).map((v) => v.id));
  const todos: Capitulo[] = [
    { titulo: 'El sistema entero', texto: 'Los paquetes del monorepo y quien depende de quien. Todo lo que sigue es una Vista de este mismo Modelo.', vista: 'paquetes' },
    { titulo: 'Abrir un paquete', texto: 'Las cajas con hijos se abren. Aqui cli por dentro, con sus comandos.', vista: 'abierto', seleccion: 'cli' },
    { titulo: 'Que pasa al arrastrar un Nodo', texto: 'Una Vista de flujo con Pasos: cada Paso revela una parte del camino.', vista: 'flujo-edicion', paso: 1 },
    { titulo: '...hasta el .dg', texto: 'La escritura llega al archivo y vuelve al lienzo por SSE.', vista: 'flujo-edicion', paso: 5 },
    { titulo: 'Como lo sigue un agente', texto: 'El agente valida y edita por CLI; dev lo muestra en vivo.', vista: 'flujo-agente' },
  ];
  return todos.filter((c) => ids.has(c.vista));
}

function VarianteB({ demo }: { demo: boolean }): ReactElement | null {
  const estudio = useEstudio();
  const lista = useMemo(() => capitulos(estudio), [estudio.fuente]); // eslint-disable-line react-hooks/exhaustive-deps
  const [indice, setIndice] = useState<number | null>(demo ? 0 : null);
  const [verDsl, setVerDsl] = useState(false);
  useReinicio(useCallback(() => setIndice(demo ? 0 : null), [demo]));
  useEffect(() => setIndice(demo ? 0 : null), [demo]);
  const c = indice === null ? undefined : lista[indice];
  useEffect(() => {
    if (c !== undefined) irConPaso(c.vista, c.paso ?? 0, c.seleccion);
  }, [c]);

  if (lista.length === 0) return <div className="pt-b-vacio">Este Workspace no declara recorrido.</div>;
  if (indice === null || c === undefined)
    return (
      <button type="button" className="pt-relanzar pt-relanzar-b" onClick={() => setIndice(0)}>
        Recorrido: Empieza aqui ({lista.length})
      </button>
    );
  return (
    <div className="pt-b-barra" role="region" aria-label="Recorrido">
      <ol className="pt-b-capitulos">
        {lista.map((x, i) => (
          <li key={i}>
            <button type="button" data-activo={i === indice ? '' : undefined} onClick={() => setIndice(i)}>
              {i + 1}. {x.titulo}
            </button>
          </li>
        ))}
      </ol>
      <div className="pt-b-cuerpo">
        <div>
          <h3>{c.titulo}</h3>
          <p>{c.texto}</p>
          <small>
            Vista <code>{c.vista}</code>
            {c.paso !== undefined && <> , Paso {c.paso}</>}. Puedes salirte y tocar todo; el recorrido te espera.
          </small>
        </div>
        <div className="pt-fila">
          <button type="button" onClick={() => setVerDsl(!verDsl)}>
            {verDsl ? 'Ocultar' : 'Ver'} fuente
          </button>
          <button type="button" onClick={() => setIndice(null)}>
            Cerrar
          </button>
          <button type="button" disabled={indice === 0} onClick={() => setIndice(indice - 1)}>
            Atras
          </button>
          <button type="button" className="pt-primario" onClick={() => setIndice(indice + 1 < lista.length ? indice + 1 : null)}>
            {indice + 1 < lista.length ? 'Siguiente' : 'Terminar'}
          </button>
        </div>
      </div>
      {verDsl && <pre className="pt-b-dsl">{DSL_HIPOTETICO}</pre>}
    </div>
  );
}

/* ------------------------------------------------------------------ C: checklist */

interface Tarea {
  id: string;
  texto: string;
  pista: string;
  hacer(e: ContextoDelEstudio): void;
}

function tareasC(demo: boolean): Tarea[] {
  const base: Tarea[] = [
    { id: 'vista', texto: 'Cambia de Vista', pista: 'Panel Vistas, o flechas en el indice', hacer: (e) => e.abrirPestana('izquierda', 'vistas') },
    { id: 'drill', texto: 'Entra en un Nodo con hijos', pista: 'Doble clic en una caja', hacer: () => undefined },
    {
      id: 'paso',
      texto: 'Avanza un Paso de una historia',
      pista: 'Boton > sobre el lienzo',
      hacer: (e) => {
        const v = vistaConPasos(e);
        if (v !== undefined) irConPaso(v, 0);
      },
    },
    { id: 'tema', texto: 'Previsualiza otro Tema', pista: 'Panel Temas', hacer: (e) => e.abrirPestana('derecha', 'temas') },
    { id: 'buscar', texto: 'Busca algo', pista: 'Ctrl/Cmd+K', hacer: (e) => e.abrirDialogo('buscador') },
  ];
  if (demo) return base;
  return [
    ...base,
    { id: 'codigo', texto: 'Abre el .dg y cambia un nombre', pista: 'Tecla E', hacer: (e) => e.abrirCodigo() },
    { id: 'agente', texto: 'Pidele a tu agente un cambio y miralo llegar', pista: 'Panel Agente; export DIAGRAMS_AGENTE=claude', hacer: (e) => e.abrirPestana('derecha', 'agente') },
  ];
}

const pestanaActiva = (lado: 'izquierda' | 'derecha'): string | undefined =>
  document.querySelector(`#ui-isla-${lado} [role=tab][aria-selected=true]`)?.textContent?.trim();

function VarianteC({ demo }: { demo: boolean }): ReactElement | null {
  const estudio = useEstudio();
  const tareas = useMemo(() => tareasC(demo), [demo]);
  const [hechas, setHechas] = useState<Set<string>>(new Set());
  const [cerrado, setCerrado] = useState(() => localStorage.getItem('prototipo-tour:c-cerrado') !== null);
  const [plegado, setPlegado] = useState(false);
  useReinicio(
    useCallback(() => {
      setHechas(new Set());
      setCerrado(false);
    }, []),
  );
  const marcar = useCallback((id: string) => setHechas((h) => (h.has(id) ? h : new Set(h).add(id))), []);

  // Deteccion barata para el prototipo: Vista, ruta, Paso y pestanas.
  const [vistaInicial] = useState(estudio.vista);
  useEffect(() => {
    if (estudio.vista !== undefined && estudio.vista !== vistaInicial) marcar('vista');
  }, [estudio.vista, vistaInicial, marcar]);
  useEffect(() => {
    const revisar = (): void => {
      const h = new URLSearchParams(window.location.hash.slice(1));
      if ((h.get('vista') ?? '').includes(',') || document.querySelectorAll('.ui-barra nav li, .ui-migas li').length > 1) marcar('drill');
      if (Number(h.get('t') ?? '0') > 0) marcar('paso');
      if (pestanaActiva('izquierda') === 'Codigo') marcar('codigo');
      if (pestanaActiva('derecha') === 'Agente') marcar('agente');
      if (document.querySelector('[role=dialog] input') !== null) marcar('buscar');
    };
    const clic = (ev: MouseEvent): void => {
      const t = ev.target as HTMLElement;
      if (t.closest('#ui-isla-derecha [role=option]') !== null && pestanaActiva('derecha') === 'Temas') marcar('tema');
      if (t.closest('[aria-label="Paso siguiente"]') !== null) marcar('paso');
      window.setTimeout(revisar, 50);
    };
    const t = window.setInterval(revisar, 400);
    document.addEventListener('click', clic, true);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('click', clic, true);
    };
  }, [marcar]);

  const n = tareas.filter((t) => hechas.has(t.id)).length;
  if (cerrado)
    return (
      <button type="button" className="pt-relanzar" onClick={() => setCerrado(false)}>
        Empieza aqui ({n}/{tareas.length})
      </button>
    );
  return (
    <div className="pt-c" role="region" aria-label="Empieza aqui">
      <header>
        <strong>Empieza aqui</strong>
        <span className="pt-c-progreso">
          <span style={{ width: `${(100 * n) / tareas.length}%` }} />
        </span>
        <small>
          {n}/{tareas.length}
        </small>
        <button type="button" onClick={() => setPlegado(!plegado)} aria-label="Plegar">
          {plegado ? '+' : '-'}
        </button>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={() => {
            localStorage.setItem('prototipo-tour:c-cerrado', '1');
            setCerrado(true);
          }}
        >
          x
        </button>
      </header>
      {!plegado && (
        <ul>
          {tareas.map((t) => (
            <li key={t.id} data-hecha={hechas.has(t.id) ? '' : undefined}>
              <span className="pt-c-check">{hechas.has(t.id) ? 'v' : ''}</span>
              <button type="button" onClick={() => t.hacer(estudio)}>
                {t.texto}
                <small>{t.pista}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!plegado && n === tareas.length && <p className="pt-c-fin">{demo ? 'Listo. En tu repo: npx rinthel-arch scan' : 'Listo. Ya sabes todo lo que hace la UI.'}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ estilos */

const CSS = `
.pt-selector { position: fixed; z-index: 9999; left: 16px; bottom: 14px; display: flex; gap: 10px; align-items: center;
  background: #fff; color: #111; border-radius: 999px; padding: 6px 12px; box-shadow: 0 6px 24px #0008; font: 12px system-ui; }
.pt-selector button { border: 1px solid #ccc; background: #f4f4f4; border-radius: 999px; padding: 3px 10px; cursor: pointer; color: #111; }
.pt-selector-texto { display: flex; flex-direction: column; min-width: 220px; max-width: 300px; }
.pt-selector-texto small { color: #555; }
.pt-demo { display: flex; gap: 4px; align-items: center; }
.pt-marca-demo { position: fixed; z-index: 50; top: 64px; left: 50%; transform: translateX(-50%); background: var(--ui-superficie); color: var(--ui-texto);
  border: 1px solid var(--ui-acento); border-radius: 99px; padding: 6px 14px; font: 12px var(--ui-fuente); }
.pt-marca-demo code { font-family: var(--ui-mono); color: var(--ui-agente-texto); }

.pt-tarjeta, .pt-b-barra, .pt-c { font: var(--ui-tam) var(--ui-fuente); color: var(--ui-texto); background: var(--ui-superficie-solida);
  border: 1px solid var(--ui-sutil-2); border-radius: var(--ui-radio); box-shadow: 0 12px 40px #000a; }
.pt-tarjeta h3, .pt-b-barra h3 { margin: 4px 0; color: var(--ui-texto-fuerte); font-size: 15px; }
.pt-tarjeta p, .pt-b-barra p { margin: 0 0 10px; line-height: 1.5; }
.pt-tarjeta small, .pt-b-barra small { color: var(--ui-tenue); }
.pt-fila { display: flex; gap: 8px; align-items: center; }
.pt-fila > span { flex: 1; }
:is(.pt-tarjeta, .pt-b-barra, .pt-c, .pt-relanzar) button { font: inherit; color: var(--ui-texto); background: var(--ui-hover); border: 1px solid var(--ui-borde);
  border-radius: var(--ui-radio-s); padding: 5px 10px; cursor: pointer; }
:is(.pt-tarjeta, .pt-b-barra) .pt-primario { background: var(--ui-acento); color: var(--ui-acento-sobre); border-color: transparent; font-weight: 600; }

.pt-a-capa { position: fixed; inset: 0; z-index: 60; }
.pt-a-velo { position: absolute; inset: 0; background: #0009; }
.pt-a-hueco { position: absolute; border-radius: 16px; box-shadow: 0 0 0 9999px #0009, 0 0 0 2px var(--ui-acento); transition: all var(--ui-dur) var(--ui-curva); pointer-events: none; }
.pt-tarjeta { position: absolute; width: 320px; padding: 14px 16px; transition: all var(--ui-dur) var(--ui-curva); }

.pt-relanzar { position: fixed; z-index: 40; right: 16px; bottom: 70px; font: var(--ui-tam) var(--ui-fuente); }
.pt-relanzar-b { left: 50%; right: auto; transform: translateX(-50%); }

.pt-b-barra { position: fixed; z-index: 40; left: 50%; bottom: 66px; transform: translateX(-50%); width: min(820px, calc(100vw - 32px)); padding: 10px 14px; }
.pt-b-capitulos { display: flex; gap: 4px; list-style: none; margin: 0 0 8px; padding: 0; overflow-x: auto; }
.pt-b-capitulos button { font-size: 11px !important; white-space: nowrap; color: var(--ui-tenue) !important; }
.pt-b-capitulos button[data-activo] { color: var(--ui-texto-fuerte) !important; border-color: var(--ui-acento) !important; background: var(--ui-sel) !important; }
.pt-b-cuerpo { display: flex; gap: 16px; align-items: flex-end; justify-content: space-between; }
.pt-b-dsl { margin: 10px 0 0; padding: 10px; background: #0006; border-radius: var(--ui-radio-s); font: 12px var(--ui-mono); color: var(--ui-agente-texto); max-height: 240px; overflow: auto; }
.pt-b-vacio { position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%); color: var(--ui-tenue); }

.pt-c { position: fixed; z-index: 40; left: 16px; bottom: 66px; width: 300px; padding: 10px 12px; }
.pt-c header { display: flex; gap: 8px; align-items: center; }
.pt-c header strong { color: var(--ui-texto-fuerte); }
.pt-c header button { padding: 0 7px !important; }
.pt-c-progreso { flex: 1; height: 4px; background: var(--ui-sutil-2); border-radius: 4px; overflow: hidden; }
.pt-c-progreso span { display: block; height: 100%; background: var(--ui-acento); transition: width var(--ui-dur); }
.pt-c ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.pt-c li { display: flex; gap: 8px; align-items: center; }
.pt-c li button { flex: 1; text-align: left; display: flex; flex-direction: column; background: transparent !important; border-color: transparent !important; }
.pt-c li button:hover { background: var(--ui-hover) !important; }
.pt-c li small { color: var(--ui-tenue); font-size: 11px; }
.pt-c li[data-hecha] button { text-decoration: line-through; opacity: 0.55; }
.pt-c-check { width: 16px; height: 16px; border-radius: 50%; border: 1px solid var(--ui-sutil-2); display: grid; place-items: center; font-size: 10px; color: var(--ui-acento-sobre); }
.pt-c li[data-hecha] .pt-c-check { background: var(--ui-acento); border-color: var(--ui-acento); }
.pt-c-fin { margin: 8px 0 0; color: var(--ui-agente-texto); }

/* Demo estatica: lo que el export de solo lectura no tendria. */
.ui-chrome:has(.pt-marca-demo) #ui-isla-izquierda [role=tab]:nth-child(2),
.ui-chrome:has(.pt-marca-demo) #ui-isla-derecha [role=tab]:is(:nth-child(2), :nth-child(4), :nth-child(5)),
.ui-chrome:has(.pt-marca-demo) .ui-barra > .ui-pildora:nth-last-child(-n+2) { display: none; }
`;
