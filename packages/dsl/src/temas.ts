/**
 * Compilador de Temas: aplana `extends` en objetos planos (ADR 0002) y compila
 * el bloque `node` (Capas, Slots, parches por Tipo y por estado, ADR 0008)
 * validandolo contra el catalogo de `tema`. Valida nombres duplicados (de
 * `theme` y de `part`) en todo el Workspace, padres desconocidos y ciclos. El
 * Tema neutro del nucleo siempre existe y puede extenderse.
 *
 * Herencia: paleta, fuentes y tokens se fusionan por clave (el hijo gana). El
 * bloque `node` del hijo es un parche sobre la pila heredada: una Capa con el
 * nombre de una heredada la cambia, una nueva exige `before`/`after`, y
 * `layer x none` la quita; los parches por Tipo y por estado se acumulan tras
 * los del padre; `slots` reemplaza la lista heredada. Un Tema sin base
 * (sin `extends`, o cuyo padre no tiene Capas) define su pila en orden.
 * Un Tema sin `extends` parte de las fuentes, tokens y Slots del neutro, con la
 * paleta vacia, para que cumpla siempre el contrato de dibujo.
 */
import { CODIGOS } from 'canonico';
import type { Issue, TextRange } from 'canonico';
import { ESTADOS, TEMA_ALTO_CONTRASTE, TEMA_NEUTRO, aplicarOps, construirSlots, opTocaMetricas } from 'tema';
import type { CapaDeTema, ErrorDeCatalogo, OpDeCapa, TemaResuelto } from 'tema';

import type { NodeItem, Theme, ThemeLayer, ThemeSlots, ThemeUse } from './generated/ast';
import { ARCHIVO_INCORPORADOS, NOMBRES_INCORPORADOS } from './incorporados';
import { aRango, issueConSugerencia, rangoDeIndice } from './posiciones';
import { compilarArista, compilarTextoDeSlots } from './temas-arista';
import { compilarAnimacionDeNodo } from './temas-animacion';
import { compilarBloque } from './temas-capas';
import type { ParteDeclarada, Sitio } from './temas-capas';

/** Un `theme` del DSL con el sitio donde se declaro. */
export interface TemaDeclarado {
  archivo: string;
  ast: Theme;
  /** Rangos de `name` y `parent`, para situar los issues. */
  nombre: TextRange;
  padre: TextRange;
}

/** Un `part` del DSL con el sitio donde se declaro. */
export type DeclaracionDeParte = ParteDeclarada;

/** Resultado de compilar los Temas y herramienta para compilar el override de una Vista. */
export interface TemasCompilados {
  temas: TemaResuelto[];
  issues: Issue[];
  /** Parches de Capa de una Vista (`theme t { layer ... }`) validados contra el Tema `tema`. */
  parchesDeVista(tema: string, items: ReadonlyArray<ThemeLayer | ThemeUse>, archivo: string): { ops: OpDeCapa[]; issues: Issue[] };
}

interface Compilado {
  tema: TemaResuelto;
  /** Sitio de cada Capa de la pila base, para `related`. */
  origenes: Map<string, Sitio>;
}

interface Entorno {
  partes: ReadonlyMap<string, ParteDeclarada>;
  tipos: readonly string[];
  issues: Issue[];
}

const copiarCapa = <C extends { primitiva: { props: Record<string, string | number> } }>(c: C): C => ({ ...c, primitiva: { ...c.primitiva, props: { ...c.primitiva.props } } });

/**
 * Temas resueltos (el neutro primero) e issues. Los Temas con ciclo o padre
 * desconocido no se resuelven. No toca el texto: lee posiciones del CST ya construido.
 * `tipos` son los Tipos de nodo declarados en `specification`.
 */
export function resolverTemas(declarados: readonly TemaDeclarado[], partesDeclaradas: readonly DeclaracionDeParte[], tipos: readonly string[]): TemasCompilados {
  const issues: Issue[] = [];
  const porNombre = new Map<string, TemaDeclarado>();
  for (const declarado of declarados) {
    const { name } = declarado.ast;
    const original = porNombre.get(name);
    if (original !== undefined || name === TEMA_ALTO_CONTRASTE.name) {
      issues.push({
        code: CODIGOS.E_DUPLICATE_THEME,
        severity: 'error',
        file: declarado.archivo,
        ...declarado.nombre.start,
        message: `Tema duplicado '${name}'`,
        ...(original !== undefined && original.archivo !== ARCHIVO_INCORPORADOS && {
          related: [{ file: original.archivo, ...original.nombre.start, message: `Primera declaracion de '${name}'` }],
        }),
      });
      continue;
    }
    porNombre.set(name, declarado);
  }

  const partes = new Map<string, ParteDeclarada>();
  for (const parte of partesDeclaradas) {
    const original = partes.get(parte.ast.name);
    if (original === undefined) {
      partes.set(parte.ast.name, parte);
      continue;
    }
    issues.push({
      code: CODIGOS.E_DUPLICATE_PART,
      severity: 'error',
      file: parte.archivo,
      ...parte.nombre.start,
      message: `Parte duplicada '${parte.ast.name}'`,
      related: [{ file: original.archivo, ...original.nombre.start, message: `Primera declaracion de '${parte.ast.name}'` }],
    });
  }

  const resueltos = new Map<string, Compilado>();
  const altoContraste: Compilado = { tema: TEMA_ALTO_CONTRASTE, origenes: new Map() };
  const enCurso = new Set<string>();
  const fallidos = new Set<string>();
  const resolver = (declarado: TemaDeclarado): Compilado | undefined => {
    const { name, parent } = declarado.ast;
    const hecho = resueltos.get(name);
    if (hecho !== undefined) return hecho;
    if (enCurso.has(name) || fallidos.has(name)) return undefined;
    enCurso.add(name);

    let base: Compilado | undefined;
    if (parent !== undefined) {
      const padre = porNombre.get(parent);
      base = parent === TEMA_ALTO_CONTRASTE.name ? altoContraste : padre && resolver(padre);
      if (base === undefined) {
        const enCiclo = padre !== undefined;
        issues.push({
          code: enCiclo ? CODIGOS.E_EXTENDS_CYCLE : CODIGOS.E_UNKNOWN_THEME,
          severity: 'error',
          file: declarado.archivo,
          ...declarado.padre.start,
          message: enCiclo
            ? `Ciclo de extends: '${name}' extiende a '${parent}', que depende de el`
            : `Tema '${parent}' no declarado`,
        });
        enCurso.delete(name);
        fallidos.add(name);
        return undefined;
      }
    }

    const origen = base?.tema ?? TEMA_NEUTRO;
    const tema: TemaResuelto = {
      name,
      palette: { ...(base?.tema.palette ?? {}) },
      fonts: { ...origen.fonts },
      tokens: { ...origen.tokens },
      nodo: {
        capas: origen.nodo.capas.map(copiarCapa),
        slots: [...origen.nodo.slots],
        textos: { ...origen.nodo.textos },
        tipos: Object.fromEntries(Object.entries(origen.nodo.tipos).map(([tipo, ops]) => [tipo, [...ops]])),
        estados: Object.fromEntries(Object.entries(origen.nodo.estados).map(([estado, ops]) => [estado, [...ops]])),
        ...(origen.nodo.animacion !== undefined && { animacion: structuredClone(origen.nodo.animacion) }),
      },
      arista: {
        capas: origen.arista.capas.map(copiarCapa),
        ...(origen.arista.origen !== undefined && { origen: { ...origen.arista.origen, props: { ...origen.arista.origen.props } } }),
        ...(origen.arista.fin !== undefined && { fin: { ...origen.arista.fin, props: { ...origen.arista.fin.props } } }),
        ...(origen.arista.etiqueta !== undefined && { etiqueta: { ...origen.arista.etiqueta, props: { ...origen.arista.etiqueta.props } } }),
      },
    };
    const origenes = new Map(base?.origenes);
    for (const parte of declarado.ast.parts) {
      if (parte.$type === 'ThemeNode' || parte.$type === 'ThemeEdge') continue;
      const destino = parte.$type === 'ThemePalette' ? tema.palette : parte.$type === 'ThemeFonts' ? tema.fonts : tema.tokens;
      for (const { key, value } of parte.entries) destino[key] = value;
    }
    // El bloque `node` se compila al final: sus colores y tokens se validan contra la Paleta y los tokens ya completos.
    const items = declarado.ast.parts.flatMap((parte) => (parte.$type === 'ThemeNode' ? parte.items : []));
    compilarNodo(declarado.archivo, items, tema, origenes, { partes, tipos, issues });
    const delBordeDeArista = declarado.ast.parts.flatMap((parte) => (parte.$type === 'ThemeEdge' ? parte.items : []));
    compilarArista(delBordeDeArista, tema, { archivo: declarado.archivo, partes, paleta: tema.palette, tokens: tema.tokens, issues });
    enCurso.delete(name);
    const compilado = { tema, origenes };
    resueltos.set(name, compilado);
    return compilado;
  };
  for (const declarado of porNombre.values()) resolver(declarado);

  return {
    // Los incorporados primero y en su orden; `alto-contraste` lo define `tema`.
    temas: [...resueltos.values(), altoContraste]
      .map(({ tema }) => tema)
      .sort((a, b) => (NOMBRES_INCORPORADOS.indexOf(a.name as never) + 1 || 99) - (NOMBRES_INCORPORADOS.indexOf(b.name as never) + 1 || 99)),
    issues,
    parchesDeVista: (nombreDeTema, items, archivo) => {
      const delTema = resueltos.get(nombreDeTema);
      const delVista: Issue[] = [];
      if (delTema === undefined) return { ops: [], issues: delVista };
      const ops = compilarBloque(items, {
        archivo,
        partes,
        paleta: delTema.tema.palette,
        tokens: delTema.tema.tokens,
        modo: 'parchear',
        candidatas: todasLasPilas(delTema.tema),
        origenes: new Map(delTema.origenes),
        issues: delVista,
      });
      return { ops, issues: delVista };
    },
  };
}

/** Pila base, la de cada Tipo con parches y la de cada estado sobre ellas: contra cual puede valer un parche. */
function todasLasPilas(tema: TemaResuelto): CapaDeTema[][] {
  const base = tema.nodo.capas as CapaDeTema[];
  const sobreTipos = [base, ...Object.values(tema.nodo.tipos).map((ops) => aplicarOps(base, ops, tema.palette, 'parchear').pila)];
  const porEstado = Object.values(tema.nodo.estados).flatMap((ops) => sobreTipos.map((pila) => aplicarOps(pila, ops, tema.palette, 'parchear').pila));
  return [...sobreTipos, ...porEstado];
}

/** Compila el contenido de los `node { ... }` de un Tema sobre la pila heredada: base, luego Tipos, luego estados. */
function compilarNodo(archivo: string, items: ReadonlyArray<NodeItem>, tema: TemaResuelto, origenes: Map<string, Sitio>, entorno: Entorno): void {
  const { partes, tipos, issues } = entorno;
  const contexto = { archivo, partes, paleta: tema.palette, tokens: tema.tokens, origenes, issues };

  // 1) Pila base: Capas y `use` del propio bloque; despues los `slots`.
  const delBase = items.filter((item): item is ThemeLayer | ThemeUse => item.$type === 'ThemeLayer' || item.$type === 'ThemeUse');
  const modo = tema.nodo.capas.length === 0 ? 'definir' : 'parchear';
  const opsBase = compilarBloque(delBase, { ...contexto, modo, candidatas: [tema.nodo.capas as CapaDeTema[]] });
  tema.nodo.capas = aplicarOps(tema.nodo.capas as CapaDeTema[], opsBase, tema.palette, modo).pila;
  for (const item of items) {
    if (item.$type !== 'ThemeSlots') continue;
    const { slots, errores } = construirSlots(item.entries.map((e) => e.name));
    for (const error of errores) issues.push(aIssue(archivo, error, rangoDeIndice(item, 'entries', error.indice)));
    if (errores.length === 0) {
      tema.nodo.slots = slots;
      tema.nodo.textos = Object.fromEntries(Object.entries(tema.nodo.textos).filter(([slot]) => slots.some((s) => s === slot)));
      compilarTextoDeSlots(item.entries, tema, { archivo, partes, paleta: tema.palette, tokens: tema.tokens, issues });
    }
  }

  // Animacion del Nodo: `transition`, `enter`, `exit` y `stagger` (solo pintura, nunca Metricas).
  const animacion = compilarAnimacionDeNodo(items, tema.nodo.animacion, archivo, issues);
  if (animacion !== undefined) tema.nodo.animacion = animacion;

  // 2) Parches por Tipo de nodo, sobre la pila base.
  const base = tema.nodo.capas as CapaDeTema[];
  for (const item of items) {
    if (item.$type !== 'ThemeType') continue;
    if (!tipos.includes(item.name)) {
      issues.push(
        issueConSugerencia(
          { code: CODIGOS.E_UNKNOWN_NODE_TYPE, message: `Tipo de nodo '${item.name}' no declarado en 'specification'` },
          archivo, item, 'name', tipos,
        ),
      );
      continue;
    }
    const ops = compilarBloque(item.items, { ...contexto, modo: 'parchear', candidatas: [base] });
    tema.nodo.tipos[item.name] = [...(tema.nodo.tipos[item.name] ?? []), ...ops];
  }

  // 3) Parches por estado, sobre la pila base o la de cualquier Tipo.
  const sobreTipos = [base, ...Object.values(tema.nodo.tipos).map((ops) => aplicarOps(base, ops, tema.palette, 'parchear').pila)];
  for (const item of items) {
    if (item.$type !== 'ThemeState') continue;
    const estado = ESTADOS.find((e) => e === item.name);
    if (estado === undefined) {
      issues.push(
        issueConSugerencia(
          { code: CODIGOS.E_THEME_UNKNOWN_STATE, message: `Estado '${item.name}' desconocido; disponibles: ${ESTADOS.join(', ')}` },
          archivo, item, 'name', ESTADOS,
        ),
      );
      continue;
    }
    for (const slots of item.items.filter((i): i is ThemeSlots => i.$type === 'ThemeSlots')) {
      issues.push({
        code: CODIGOS.E_THEME_STATE_TOUCHES_METRICS,
        severity: 'error',
        file: archivo,
        ...aRango(slots.$cstNode?.range).start,
        message: `Un parche de estado no puede tocar los Slots: '${estado}' nunca relayouta; cambialos en el bloque base`,
      });
    }
    const capas = item.items.filter((i): i is ThemeLayer | ThemeUse => i.$type === 'ThemeLayer' || i.$type === 'ThemeUse');
    const ops = compilarBloque(capas, { ...contexto, modo: 'parchear', candidatas: sobreTipos });
    for (const op of ops) {
      const razon = opTocaMetricas(op, sobreTipos);
      if (razon === undefined) continue;
      issues.push({
        code: CODIGOS.E_THEME_STATE_TOUCHES_METRICS,
        severity: 'error',
        file: archivo,
        ...aRango(item.$cstNode?.range).start,
        message: `Un parche de estado no puede tocar las Metricas: ${razon}; '${estado}' nunca relayouta, cambiala en el bloque base`,
      });
    }
    tema.nodo.estados[estado] = [...(tema.nodo.estados[estado] ?? []), ...ops];
  }
}

function aIssue(archivo: string, error: ErrorDeCatalogo, rango: TextRange): Issue {
  return {
    code: error.codigo,
    severity: 'error',
    file: archivo,
    ...rango.start,
    message: error.mensaje,
    ...(error.hint !== undefined && { hint: error.hint }),
  };
}
