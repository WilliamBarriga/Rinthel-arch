/**
 * PROTOTIPO DESECHABLE (ticket "Tour Empieza aqui en la UI", #224), ronda 2. No va a main.
 *
 * Decidido en la ronda 1: coachmarks (A), contenido fijo de la UI, la primera vez solo aparece un boton para invocarlo
 * y despues solo a pedido (Buscador "Ver tour" o ayuda). Esta ronda compara:
 *
 *   A1  A pura: textos genericos, iguales para cualquier Workspace.
 *   A2  A con datos del Workspace: mismas paradas y mismo guion fijo, pero cada parada usa lo que el Workspace tiene
 *       (cuantas Vistas por Tipo, una Arista de Drill-down real, una Vista con Pasos y el titulo de su primer Paso, el
 *       Tema de la Vista, el bloque `.dg` de la Vista). No hay bloque `tour` en el DSL: la UI elige.
 *
 * `?tour=A1|A2`; `&demo=1` simula la demo estatica; `&abre=directo` hace que en la demo el tour abra solo (si no,
 * tambien ahi aparece el boton). Sin `?tour` no se monta nada.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';

import type { FuenteCanonica, Vista } from 'canonico';

import { useEstudio } from '../marco/contexto';
import type { ContextoDelEstudio } from '../marco/contexto';

type Clave = 'A1' | 'A2';
const VARIANTES: readonly { clave: Clave; nombre: string }[] = [
  { clave: 'A1', nombre: 'A pura, textos genericos' },
  { clave: 'A2', nombre: 'A con datos del Workspace' },
];

const parametros = (): URLSearchParams => new URLSearchParams(window.location.search);
const LLAVE_VISTO = 'prototipo-tour:boton-visto';

function cambiarParametro(clave: string, valor: string | null): void {
  const p = parametros();
  if (valor === null) p.delete(clave);
  else p.set(clave, valor);
  window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}${window.location.hash}`);
  window.dispatchEvent(new Event('prototipo-tour'));
}

function useParametros(): { variante: Clave | undefined; demo: boolean; abreDirecto: boolean } {
  const [, forzar] = useState(0);
  useEffect(() => {
    const f = (): void => forzar((n) => n + 1);
    window.addEventListener('prototipo-tour', f);
    return () => window.removeEventListener('prototipo-tour', f);
  }, []);
  const v = parametros().get('tour');
  return {
    variante: v === 'A1' || v === 'A2' ? v : v === 'A' ? 'A1' : undefined,
    demo: parametros().get('demo') === '1',
    abreDirecto: parametros().get('abre') === 'directo',
  };
}

/** Lo invoca el comando "Ver tour" del registro (Buscador y ayuda). */
export const abrirTourDelPrototipo = (): void => void window.dispatchEvent(new Event('prototipo-tour-abrir'));

export function PrototipoTour(): ReactElement | null {
  const { variante, demo, abreDirecto } = useParametros();
  if (variante === undefined) return null;
  return (
    <>
      <style>{CSS}</style>
      {demo && <MarcaDeDemo />}
      <Tour key={`${variante}-${demo}-${abreDirecto}`} conDatos={variante === 'A2'} demo={demo} abreDirecto={demo && abreDirecto} />
      <Selector actual={variante} demo={demo} abreDirecto={abreDirecto} />
    </>
  );
}

/* ------------------------------------------------------------------ selector flotante (no es parte del diseno) */

function Selector({ actual, demo, abreDirecto }: { actual: Clave; demo: boolean; abreDirecto: boolean }): ReactElement {
  const i = VARIANTES.findIndex((v) => v.clave === actual);
  const ir = useCallback((d: number) => cambiarParametro('tour', VARIANTES[(i + d + VARIANTES.length) % VARIANTES.length]!.clave), [i]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      const foco = document.activeElement;
      if (foco instanceof HTMLElement && foco.closest('input, textarea, [contenteditable], .ui-isla, [role=dialog]') !== null) return;
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
      <strong className="pt-selector-texto">
        {v.clave}: {v.nombre}
      </strong>
      <button type="button" onClick={() => ir(1)} aria-label="Variante siguiente">
        &gt;
      </button>
      <label className="pt-opcion">
        <input type="checkbox" checked={demo} onChange={(e) => cambiarParametro('demo', e.target.checked ? '1' : null)} /> demo estatica
      </label>
      {demo && (
        <label className="pt-opcion">
          <input type="checkbox" checked={abreDirecto} onChange={(e) => cambiarParametro('abre', e.target.checked ? 'directo' : null)} /> abre solo
        </label>
      )}
      <button
        type="button"
        onClick={() => {
          localStorage.removeItem(LLAVE_VISTO);
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

/* ------------------------------------------------------------------ datos del Workspace (solo A2) */

interface Datos {
  porTipo: string;
  vistaActiva?: Vista;
  drill?: { vista: string; nodo: string; titulo: string; destino: string };
  pasos?: { vista: string; total: number; primero: string };
  tema?: string;
}

function tituloDe(fuente: FuenteCanonica, id: string): string {
  const buscar = (nodos: FuenteCanonica['model']['nodes'], ruta: string): string | undefined => {
    for (const n of nodos) {
      const completo = ruta === '' ? n.id : `${ruta}.${n.id}`;
      if (completo === id || n.id === id) return n.title;
      const h = buscar(n.children, completo);
      if (h !== undefined) return h;
    }
    return undefined;
  };
  return buscar(fuente.model.nodes, '') ?? id;
}

function datosDe(e: ContextoDelEstudio): Datos | undefined {
  const f = e.fuente;
  if (f === undefined) return undefined;
  const cuenta = new Map<string, number>();
  for (const v of f.views) cuenta.set(v.type, (cuenta.get(v.type) ?? 0) + 1);
  const porTipo = [...cuenta].map(([t, n]) => `${n} ${t}`).join(', ');
  const conLink = f.views.find((v) => v.type === 'architecture' && v.links.length > 0) ?? f.views.find((v) => v.links.length > 0);
  const link = conLink?.links[0];
  const conPasos = f.views.filter((v) => v.steps.length > 0);
  const vp = conPasos.find((v) => v.type === 'flow') ?? conPasos[0];
  const vistaActiva = f.views.find((v) => v.id === e.vista);
  return {
    porTipo,
    ...(vistaActiva !== undefined && { vistaActiva }),
    ...(conLink !== undefined && link !== undefined && { drill: { vista: conLink.id, nodo: link.node, titulo: tituloDe(f, link.node), destino: link.view } }),
    ...(vp !== undefined && { pasos: { vista: vp.id, total: vp.steps.length, primero: vp.steps[0]!.title } }),
    ...(vistaActiva?.theme !== undefined && { tema: vistaActiva.theme }),
  };
}

function irConPaso(vista: string, paso: number, seleccion?: string): void {
  const p = new URLSearchParams();
  p.set('vista', vista);
  if (paso > 0) p.set('t', String(paso));
  if (seleccion !== undefined) p.set('s', seleccion);
  window.location.hash = p.toString();
}

/* ------------------------------------------------------------------ guion fijo */

interface Parada {
  titulo: string;
  texto: ReactElement | string;
  /** Zona real que se ilumina; sin ella, la tarjeta va al centro. */
  zona?: string;
  preparar?(e: ContextoDelEstudio): void;
}

const C = ({ children }: { children: string }): ReactElement => <code className="pt-dato">{children}</code>;

function paradas(demo: boolean, d: Datos | undefined): Parada[] {
  const lista: Parada[] = [];
  lista.push({
    titulo: 'Esto es tu repo como diagrama',
    texto:
      d?.vistaActiva !== undefined ? (
        <>
          Estas en la Vista <C>{d.vistaActiva.id}</C> ({d.vistaActiva.type}). Cada caja es una parte del sistema; arrastra el fondo para moverte y usa la rueda para el
          zoom.
        </>
      ) : (
        'Cada caja es una parte del sistema; arrastra el fondo para moverte y usa la rueda para el zoom.'
      ),
    zona: '.ui-lienzo',
  });
  lista.push({
    titulo: 'Vistas',
    texto:
      d !== undefined ? (
        <>
          Un mismo Modelo, varios cortes. Este Workspace tiene {d.porTipo}. Elige una aqui o con las flechas; las migas de arriba te devuelven.
        </>
      ) : (
        'Un mismo Modelo, varios cortes: arquitectura, flujos, secuencias, tablas. Elige una aqui o con las flechas; las migas de arriba te devuelven.'
      ),
    zona: '#ui-isla-izquierda',
    preparar: (e) => e.abrirPestana('izquierda', 'vistas'),
  });
  if (d?.drill !== undefined) {
    const dr = d.drill;
    lista.push({
      titulo: 'Entrar en una caja',
      texto: (
        <>
          <C>{dr.titulo}</C> tiene su propia Vista. Doble clic en ella abre <C>{dr.destino}</C>; el Detalle de la derecha dice donde esta en el codigo.
        </>
      ),
      zona: '#ui-isla-derecha',
      preparar: (e) => {
        irConPaso(dr.vista, 0, dr.nodo);
        e.abrirPestana('derecha', 'detalle');
      },
    });
  } else if (d === undefined) {
    lista.push({
      titulo: 'Entrar en una caja',
      texto: 'Doble clic en una caja con hijos abre su Vista de detalle; al seleccionarla, el Detalle de la derecha dice donde esta en el codigo.',
      zona: '#ui-isla-derecha',
      preparar: (e) => e.abrirPestana('derecha', 'detalle'),
    });
  }
  lista.push({
    titulo: 'Pasos',
    texto:
      d?.pasos !== undefined ? (
        <>
          <C>{d.pasos.vista}</C> se cuenta en {d.pasos.total} Pasos, empezando por "{d.pasos.primero}". Avanza con &gt; para revelar uno a la vez; sirve tal cual para una
          charla.
        </>
      ) : (
        'Algunas Vistas se cuentan en Pasos: avanza con > para revelar uno a la vez. Sirve tal cual para una charla.'
      ),
    zona: '.rd-pasos',
    preparar: () => {
      if (d?.pasos !== undefined) irConPaso(d.pasos.vista, 1);
    },
  });
  lista.push({
    titulo: 'Temas',
    texto: (
      <>
        {d?.tema !== undefined && (
          <>
            Esta Vista se dibuja con <C>{d.tema}</C>.{' '}
          </>
        )}
        {demo ? 'Prueba otra estetica: la previsualizacion no cambia nada.' : 'Previsualiza otra estetica sin escribir nada; "Fijar" la guarda en la Vista.'}
      </>
    ),
    zona: '#ui-isla-derecha',
    preparar: (e) => e.abrirPestana('derecha', 'temas'),
  });
  if (demo) {
    lista.push({
      titulo: 'En tu repo',
      texto: (
        <>
          Aqui solo se mira. En tu repo, tu agente escanea el codigo, escribe el <C>.dg</C> y lo ves cambiar en vivo: <C>npx rinthel-arch scan</C> y luego{' '}
          <C>npx rinthel-arch dev</C>.
        </>
      ),
    });
    return lista;
  }
  lista.push({
    titulo: 'Codigo',
    texto:
      d?.vistaActiva !== undefined ? (
        <>
          El diagrama es texto. Este es el bloque de <C>{d.vistaActiva.id}</C>: cambialo y el lienzo se redibuja solo. La tecla E lo abre donde estes.
        </>
      ) : (
        'El diagrama es texto (.dg). La tecla E abre el editor en lo que miras; guarda solo y el lienzo se redibuja.'
      ),
    zona: '#ui-isla-izquierda',
    preparar: (e) => {
      if (d?.vistaActiva !== undefined) {
        void e.cliente.inspeccionar('vista', d.vistaActiva.id).then((r) => {
          if (r.ok && r.salida.comando === 'vista') e.abrirCodigo({ file: r.salida.vista.file, line: r.salida.vista.line });
        });
      }
      e.abrirCodigo();
    },
  });
  lista.push({
    titulo: 'Tu agente, en vivo',
    texto: 'Cuando tu agente corre validate o edit, aparece aqui y lo que cambia se resalta en el lienzo. "Seguir" salta a lo que toca.',
    zona: '#ui-isla-derecha',
    preparar: (e) => e.abrirPestana('derecha', 'agente'),
  });
  return lista;
}

/* ------------------------------------------------------------------ el tour */

type Modo = 'boton' | 'abierto' | 'a-pedido';

function Tour({ conDatos, demo, abreDirecto }: { conDatos: boolean; demo: boolean; abreDirecto: boolean }): ReactElement | null {
  const estudio = useEstudio();
  const [modo, setModo] = useState<Modo>(() => (abreDirecto ? 'abierto' : localStorage.getItem(LLAVE_VISTO) === null ? 'boton' : 'a-pedido'));
  const [indice, setIndice] = useState(0);
  // Los datos se congelan al abrir: si no, cambiar de Vista en una parada reescribe las siguientes.
  const [datos, setDatos] = useState<Datos | undefined>();
  const lista = useMemo(() => paradas(demo, conDatos ? datos : undefined), [demo, conDatos, datos]);
  const abrir = useCallback(() => {
    localStorage.setItem(LLAVE_VISTO, '1');
    setDatos(datosDe(estudio));
    setIndice(0);
    setModo('abierto');
  }, [estudio]);
  useEffect(() => {
    if (modo === 'abierto' && datos === undefined) setDatos(datosDe(estudio));
  }, [modo, datos, estudio]);
  useEffect(() => {
    const reinicio = (): void => setModo('boton');
    window.addEventListener('prototipo-tour-abrir', abrir);
    window.addEventListener('prototipo-tour-reinicio', reinicio);
    return () => {
      window.removeEventListener('prototipo-tour-abrir', abrir);
      window.removeEventListener('prototipo-tour-reinicio', reinicio);
    };
  }, [abrir]);

  const parada = modo === 'abierto' ? lista[indice] : undefined;
  useEffect(() => {
    parada?.preparar?.(estudio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parada]);
  const [caja, setCaja] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (parada?.zona === undefined) return setCaja(null);
    const medir = (): void => setCaja(document.querySelector(parada.zona!)?.getBoundingClientRect() ?? null);
    medir();
    const t = window.setInterval(medir, 250);
    return () => window.clearInterval(t);
  }, [parada]);

  if (modo === 'boton')
    return (
      <div className="pt-invitacion">
        <button type="button" className="pt-invitacion-boton" onClick={abrir}>
          Tour de 1 minuto
        </button>
        <button
          type="button"
          aria-label="Descartar"
          className="pt-invitacion-x"
          onClick={() => {
            localStorage.setItem(LLAVE_VISTO, '1');
            setModo('a-pedido');
          }}
        >
          x
        </button>
      </div>
    );
  if (modo === 'a-pedido' || parada === undefined)
    return <div className="pt-pista">a pedido: Ctrl/Cmd+K, "Ver tour" (o en la ayuda, ?)</div>;

  const cerrar = (): void => setModo('a-pedido');
  const m = 8;
  const hueco = caja === null ? null : { left: caja.left - m, top: caja.top - m, width: caja.width + 2 * m, height: caja.height + 2 * m };
  return (
    <div className="pt-capa">
      {hueco === null ? <div className="pt-velo" /> : <div className="pt-hueco" style={hueco} />}
      <div className="pt-tarjeta" style={posicionDeTarjeta(hueco)} role="dialog" aria-label="Tour">
        <small>
          {indice + 1} de {lista.length}
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
          <button type="button" className="pt-primario" onClick={() => (indice + 1 < lista.length ? setIndice(indice + 1) : cerrar())}>
            {indice + 1 < lista.length ? 'Siguiente' : 'Listo'}
          </button>
        </div>
      </div>
    </div>
  );
}

function posicionDeTarjeta(h: { left: number; top: number; width: number; height: number } | null): CSSProperties {
  if (h === null) return { left: '50%', top: '40%', transform: 'translate(-50%, -50%)' };
  const W = window.innerWidth;
  const ancho = 340;
  if (h.width > W * 0.6) return { left: '50%', bottom: 90, transform: 'translateX(-50%)' };
  if (h.top > window.innerHeight / 2) return { left: Math.min(W - ancho - 16, Math.max(16, h.left)), bottom: window.innerHeight - h.top + 12 };
  if (h.left + h.width + ancho + 24 < W) return { left: h.left + h.width + 16, top: Math.max(16, h.top) };
  return { left: Math.max(16, h.left - ancho - 16), top: Math.max(16, h.top) };
}

/* ------------------------------------------------------------------ estilos */

const CSS = `
.pt-selector { position: fixed; z-index: 9999; left: 16px; bottom: 14px; display: flex; gap: 10px; align-items: center;
  background: #fff; color: #111; border-radius: 999px; padding: 6px 12px; box-shadow: 0 6px 24px #0008; font: 12px system-ui; }
.pt-selector button { border: 1px solid #ccc; background: #f4f4f4; border-radius: 999px; padding: 3px 10px; cursor: pointer; color: #111; }
.pt-opcion { display: flex; gap: 4px; align-items: center; }
.pt-marca-demo { position: fixed; z-index: 50; top: 64px; left: 50%; transform: translateX(-50%); background: var(--ui-superficie); color: var(--ui-texto);
  border: 1px solid var(--ui-acento); border-radius: 99px; padding: 6px 14px; font: 12px var(--ui-fuente); }
.pt-marca-demo code { font-family: var(--ui-mono); color: var(--ui-agente-texto); }

.pt-invitacion { position: fixed; z-index: 45; top: 12px; right: 16px; display: flex; align-items: center; gap: 2px; font: var(--ui-tam) var(--ui-fuente);
  background: var(--ui-superficie); border: 1px solid var(--ui-acento); border-radius: 99px; padding: 4px; box-shadow: 0 0 0 0 var(--ui-acento); animation: pt-pulso 2.4s infinite; }
.pt-invitacion button { font: inherit; border: 0; cursor: pointer; border-radius: 99px; }
.pt-invitacion-boton { background: var(--ui-acento); color: var(--ui-acento-sobre); font-weight: 600 !important; padding: 7px 14px; }
.pt-invitacion-x { background: transparent; color: var(--ui-tenue); padding: 7px 10px; }
@keyframes pt-pulso { 0% { box-shadow: 0 0 0 0 #a855f799; } 70% { box-shadow: 0 0 0 12px #a855f700; } 100% { box-shadow: 0 0 0 0 #a855f700; } }
@media (prefers-reduced-motion: reduce) { .pt-invitacion { animation: none; } }
.pt-pista { position: fixed; z-index: 45; top: 20px; right: 20px; font: 11px var(--ui-fuente); color: var(--ui-tenue); background: #fff1; padding: 4px 8px; border-radius: 6px; border: 1px dashed var(--ui-sutil-2); }

.pt-tarjeta { font: var(--ui-tam) var(--ui-fuente); color: var(--ui-texto); background: var(--ui-superficie-solida);
  border: 1px solid var(--ui-sutil-2); border-radius: var(--ui-radio); box-shadow: 0 12px 40px #000a; }
.pt-tarjeta h3 { margin: 4px 0; color: var(--ui-texto-fuerte); font-size: 15px; }
.pt-tarjeta p { margin: 0 0 10px; line-height: 1.55; }
.pt-tarjeta small { color: var(--ui-tenue); }
.pt-dato { font-family: var(--ui-mono); font-size: 12px; color: var(--ui-agente-texto); background: var(--ui-agente-suave); padding: 1px 5px; border-radius: 5px; }
.pt-fila { display: flex; gap: 8px; align-items: center; }
.pt-fila > span { flex: 1; }
.pt-tarjeta button { font: inherit; color: var(--ui-texto); background: var(--ui-hover); border: 1px solid var(--ui-borde); border-radius: var(--ui-radio-s); padding: 5px 10px; cursor: pointer; }
.pt-tarjeta .pt-primario { background: var(--ui-acento); color: var(--ui-acento-sobre); border-color: transparent; font-weight: 600; }

.pt-capa { position: fixed; inset: 0; z-index: 60; }
.pt-velo { position: absolute; inset: 0; background: #0009; }
.pt-hueco { position: absolute; border-radius: 16px; box-shadow: 0 0 0 9999px #0009, 0 0 0 2px var(--ui-acento); transition: all var(--ui-dur) var(--ui-curva); pointer-events: none; }
.pt-tarjeta { position: absolute; width: 340px; padding: 14px 16px; transition: all var(--ui-dur) var(--ui-curva); }

/* Demo estatica: lo que el export de solo lectura no tendria. */
.ui-chrome:has(.pt-marca-demo) #ui-isla-izquierda [role=tab]:nth-child(2),
.ui-chrome:has(.pt-marca-demo) #ui-isla-derecha [role=tab]:is(:nth-child(2), :nth-child(4), :nth-child(5)),
.ui-chrome:has(.pt-marca-demo) .ui-barra > .ui-pildora:nth-last-child(-n+2) { display: none; }
`;
