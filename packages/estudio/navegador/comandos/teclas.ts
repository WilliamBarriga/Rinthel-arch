/**
 * Resolucion pura de atajos: `(tecla, ambito del foco, plataforma) -> comando | nada`, sin React ni DOM.
 * Las teclas se declaran como `Mod+Shift+Z`, `E` o `?` (`Mod` es Cmd en mac y Ctrl en el resto); una tecla de una
 * sola plataforma va como `{ combinacion, soloEn }` (Ctrl+Y rehace solo fuera de mac).
 * Ambitos, de mayor a menor prioridad: editor, texto, lienzo, global. Reglas:
 * - Gana el comando del ambito del foco; despues, el global.
 * - Un global con modificador actua desde cualquier ambito, salvo los marcados `enTexto: false` (deshacer y rehacer:
 *   en el editor y en un campo de texto manda su propio historial).
 * - Las teclas sin modificador solo actuan con el foco fuera del texto (lienzo o global).
 * - Con el foco en el lienzo, Tab, flechas, Enter y Espacio son de `VistaInteractiva`: nunca resuelven.
 * - La autorepeticion no dispara nada.
 */

export type Ambito = 'editor' | 'texto' | 'lienzo' | 'global';
export type Plataforma = 'mac' | 'otras';
export type Tecla = string | { combinacion: string; soloEn: Plataforma };

export interface DeclaracionDeTeclas {
  id: string;
  teclas: readonly Tecla[];
  ambito: Ambito;
  /** Solo para globales con modificador: `false` si cede la tecla al editor y a los campos de texto. */
  enTexto?: boolean;
}

export interface TeclaPulsada {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  repeat: boolean;
}

interface Combinacion {
  mod: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  /** En minusculas; `space` para el Espacio. */
  tecla: string;
}

const esLetra = (tecla: string): boolean => /^[a-z]$/.test(tecla);
/** Simbolos (`?`, `/`): la tecla ya refleja Mayus, asi que no se compara. */
const esSimbolo = (tecla: string): boolean => tecla.length === 1 && !esLetra(tecla) && !/^[0-9]$/.test(tecla);
const TECLAS_DEL_LIENZO = new Set(['tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'enter', 'space']);

function leer(combinacion: string): Combinacion {
  const partes = combinacion.split('+');
  // `Mod++` no se usa; el ultimo trozo es la tecla.
  const tecla = (partes.pop() ?? '').toLowerCase();
  const mods = new Set(partes.map((p) => p.toLowerCase()));
  return { mod: mods.has('mod'), ctrl: mods.has('ctrl'), shift: mods.has('shift'), alt: mods.has('alt'), tecla };
}

/** Traduce lo pulsado a una Combinacion en terminos de `Mod`; `undefined` si usa un modificador ajeno (Meta fuera de mac). */
function pulsada(t: TeclaPulsada, plataforma: Plataforma): Combinacion | undefined {
  const tecla = t.key === ' ' ? 'space' : t.key.toLowerCase();
  if (plataforma === 'mac') return { mod: t.metaKey, ctrl: t.ctrlKey, shift: t.shiftKey, alt: t.altKey, tecla };
  if (t.metaKey) return undefined;
  return { mod: t.ctrlKey, ctrl: false, shift: t.shiftKey, alt: t.altKey, tecla };
}

/** Fuera de mac, `Ctrl` y `Mod` son la misma tecla. */
function normalizar(c: Combinacion, plataforma: Plataforma): Combinacion {
  return plataforma === 'mac' || !c.ctrl ? c : { ...c, mod: true, ctrl: false };
}

function coincide(declarada: Combinacion, real: Combinacion): boolean {
  return declarada.tecla === real.tecla && declarada.mod === real.mod && declarada.ctrl === real.ctrl && declarada.alt === real.alt && (esSimbolo(real.tecla) || declarada.shift === real.shift);
}

function combinaciones(d: DeclaracionDeTeclas, plataforma: Plataforma): string[] {
  return d.teclas.flatMap((t) => (typeof t === 'string' ? [t] : t.soloEn === plataforma ? [t.combinacion] : []));
}

const conModificador = (c: Combinacion): boolean => c.mod || c.ctrl || c.alt;

export function resolverTecla<C extends DeclaracionDeTeclas>(comandos: readonly C[], tecla: TeclaPulsada, ambito: Ambito, plataforma: Plataforma): C | undefined {
  if (tecla.repeat) return undefined;
  const real = pulsada(tecla, plataforma);
  if (real === undefined) return undefined;
  const enTexto = ambito === 'editor' || ambito === 'texto';
  if (enTexto && !conModificador(real)) return undefined;
  if (ambito === 'lienzo' && !conModificador(real) && TECLAS_DEL_LIENZO.has(real.tecla)) return undefined;
  const responde = (c: C): boolean => combinaciones(c, plataforma).some((t) => coincide(normalizar(leer(t), plataforma), real));
  const propio = comandos.find((c) => c.ambito === ambito && responde(c));
  if (propio !== undefined || ambito === 'global') return propio;
  return comandos.find((c) => c.ambito === 'global' && responde(c) && !(enTexto && c.enTexto === false));
}

/** Teclas de un comando tal como se escriben en la plataforma (`Ctrl+Shift+Z`, `Cmd+/`, `?`). */
export function etiquetasDeTeclas(d: DeclaracionDeTeclas, plataforma: Plataforma): string[] {
  const mod = plataforma === 'mac' ? 'Cmd' : 'Ctrl';
  return combinaciones(d, plataforma).map((t) =>
    t
      .split('+')
      .map((p) => (p === 'Mod' ? mod : p))
      .join('+'),
  );
}

/** `mac` si el navegador corre en macOS o iOS. */
export function plataformaDe(nav: { platform?: string; userAgent?: string } | undefined): Plataforma {
  const texto = `${nav?.platform ?? ''} ${nav?.userAgent ?? ''}`;
  return /Mac|iPhone|iPad|iPod/.test(texto) ? 'mac' : 'otras';
}

/** Valor de `aria-keyshortcuts` (`Control+Shift+Z Control+Y`); vacio si el comando no tiene teclas en la plataforma. */
export function atajoAria(d: DeclaracionDeTeclas, plataforma: Plataforma): string {
  const nombre: Record<string, string> = { mod: plataforma === 'mac' ? 'Meta' : 'Control', ctrl: 'Control', shift: 'Shift', alt: 'Alt' };
  return combinaciones(d, plataforma)
    .map((t) =>
      t
        .split('+')
        .map((p) => nombre[p.toLowerCase()] ?? p.toUpperCase())
        .join('+'),
    )
    .join(' ');
}
