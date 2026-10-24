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
 * los del padre; `slots` reemplaza la disposicion heredada. El bloque `group` se hereda y
 * se parchea igual que `node` (misma ruta de compilacion), mas `padding` y `state collapsed`,
 * el parche del Grupo cerrado. Un Tema sin base
 * (sin `extends`, o cuyo padre no tiene Capas) define su pila en orden.
 * Un Tema sin `extends` parte de las fuentes, tokens y Slots del neutro, con la
 * paleta vacia, para que cumpla siempre el contrato de dibujo.
 */
import { CODIGOS } from 'canonico';
import type { Issue, TextRange } from 'canonico';
import type { AstNode as Ast } from 'langium';
import { ESTADOS, TEMA_ALTO_CONTRASTE, TEMA_NEUTRO, aplicarOps, opTocaMetricas, parsearEstado } from 'tema';
import type { CapaDeTema, ElementoDeTema, ErrorDeCatalogo, OpDeCapa, TemaResuelto } from 'tema';

import type { GroupItem, GroupPadding, NodeItem, Theme, ThemeLayer, ThemeSlots, ThemeState, ThemeUse } from './generated/ast';
import { ARCHIVO_INCORPORADOS, NOMBRES_INCORPORADOS } from './incorporados';
import { aRango, issueConSugerencia } from './posiciones';
import { compilarArista } from './temas-arista';
import { compilarSlots } from './temas-slots';
import { compilarAnimacionDeNodo } from './temas-animacion';
import { compilarBloque } from './temas-capas';
import { compilarPagina } from './temas-pagina';
import type { ContextoDeBloque, ParteDeclarada, Sitio } from './temas-capas';

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

/** Donde se fijo cada Capa de un Tema, por nivel de la cascada; lo usa `inspect tema`. */
export interface OrigenDeTema {
  /** Donde se declara el Tema. */
  sitio: Sitio;
  /** Ancestros por `extends`, del padre hacia la raiz. */
  extends: string[];
  /** Partes (`part`) que usan el Tema y sus ancestros. */
  partes: string[];
  /** Ultimo parche que fijo cada Capa en la pila base, en la de cada Tipo y en la de cada estado. */
  base: Record<string, Sitio>;
  tipos: Record<string, Record<string, Sitio>>;
  estados: Record<string, Record<string, Sitio>>;
  /** Lo mismo para el bloque `group`; `colapsado` es el de `state collapsed`. */
  grupo: { base: Record<string, Sitio>; tipos: Record<string, Record<string, Sitio>>; estados: Record<string, Record<string, Sitio>>; colapsado: Record<string, Sitio> };
  /** Ultimo parche que fijo cada Capa del fondo de pagina. */
  pagina: Record<string, Sitio>;
}

/** Resultado de compilar los Temas y herramienta para compilar el override de una Vista. */
export interface TemasCompilados {
  temas: TemaResuelto[];
  issues: Issue[];
  /** Origen de las Capas de cada Tema escrito en DSL, incorporados incluidos (archivo `<incorporados>`); `alto-contraste` no figura. */
  origenes: Record<string, OrigenDeTema>;
  /** Parches de Capa de una Vista (`theme t { layer ... }`) validados contra el Tema `tema`. */
  parchesDeVista(tema: string, items: ReadonlyArray<ThemeLayer | ThemeUse>, archivo: string): { ops: OpDeCapa[]; issues: Issue[] };
}

interface Compilado {
  tema: TemaResuelto;
  /** Sitio de cada Capa de la pila base del Nodo, para `related`. */
  origenes: Map<string, Sitio>;
  origen: OrigenDeTema;
}

type Registro = Record<string, Map<string, Sitio>>;

interface Entorno {
  partes: ReadonlyMap<string, ParteDeclarada>;
  tipos: readonly string[];
  issues: Issue[];
  /** Origen de las Capas fijadas por parches de Tipo y de estado. */
  porTipo: Registro;
  porEstado: Registro;
  /** Origen de las Capas del parche `collapsed` del Grupo (bajo la clave `collapsed`). */
  porColapso: Registro;
}

/** Nombres de las `part` que usa un bloque, incluidas las que usan esas partes. */
function partesUsadas(items: ReadonlyArray<{ $type: string }>, partes: ReadonlyMap<string, ParteDeclarada>, vistas = new Set<string>()): string[] {
  for (const item of items) {
    if (item.$type === 'ThemeUse') {
      const { name } = item as ThemeUse;
      if (vistas.has(name)) continue;
      vistas.add(name);
      const parte = partes.get(name);
      if (parte !== undefined) partesUsadas(parte.ast.items, partes, vistas);
    } else if ('items' in item && Array.isArray(item.items)) partesUsadas(item.items as ReadonlyArray<{ $type: string }>, partes, vistas);
  }
  return [...vistas];
}

const sitioDeCopia = (mapa: ReadonlyMap<string, Sitio>): Record<string, Sitio> => Object.fromEntries(mapa);
const copiarRegistro = (registro: Record<string, Record<string, Sitio>>): Registro =>
  Object.fromEntries(Object.entries(registro).map(([clave, sitios]) => [clave, new Map(Object.entries(sitios))]));

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

  const incorporado: OrigenDeTema = { sitio: { file: '(incorporado)', line: 1, column: 1 }, extends: [], partes: [], base: {}, tipos: {}, estados: {}, grupo: { base: {}, tipos: {}, estados: {}, colapsado: {} }, pagina: {} };
  const resueltos = new Map<string, Compilado>();
  const altoContraste: Compilado = { tema: TEMA_ALTO_CONTRASTE, origenes: new Map(), origen: incorporado };
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
        issues.push(
          padre !== undefined
            ? { code: CODIGOS.E_EXTENDS_CYCLE, severity: 'error', file: declarado.archivo, ...declarado.padre.start, message: `Ciclo de extends: '${name}' extiende a '${parent}', que depende de el` }
            : issueConSugerencia({ code: CODIGOS.E_UNKNOWN_THEME, message: `Tema '${parent}' no declarado` }, declarado.archivo, declarado.ast, 'parent', [...porNombre.keys(), TEMA_ALTO_CONTRASTE.name]),
        );
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
        slots: structuredClone(origen.nodo.slots),
        textos: { ...origen.nodo.textos },
        tipos: Object.fromEntries(Object.entries(origen.nodo.tipos).map(([tipo, ops]) => [tipo, [...ops]])),
        estados: Object.fromEntries(Object.entries(origen.nodo.estados).map(([estado, ops]) => [estado, [...ops]])),
        ...(origen.nodo.animacion !== undefined && { animacion: structuredClone(origen.nodo.animacion) }),
      },
      grupo: {
        capas: origen.grupo.capas.map(copiarCapa),
        slots: structuredClone(origen.grupo.slots),
        textos: { ...origen.grupo.textos },
        padding: { ...origen.grupo.padding },
        tipos: Object.fromEntries(Object.entries(origen.grupo.tipos).map(([tipo, ops]) => [tipo, [...ops]])),
        estados: Object.fromEntries(Object.entries(origen.grupo.estados).map(([estado, ops]) => [estado, [...ops]])),
        colapsado: structuredClone(origen.grupo.colapsado),
        ...(origen.grupo.animacion !== undefined && { animacion: structuredClone(origen.grupo.animacion) }),
      },
      arista: {
        capas: origen.arista.capas.map(copiarCapa),
        ...(origen.arista.origen !== undefined && { origen: { ...origen.arista.origen, props: { ...origen.arista.origen.props } } }),
        ...(origen.arista.fin !== undefined && { fin: { ...origen.arista.fin, props: { ...origen.arista.fin.props } } }),
        ...(origen.arista.etiqueta !== undefined && { etiqueta: { ...origen.arista.etiqueta, props: { ...origen.arista.etiqueta.props } } }),
      },
      pagina: { capas: origen.pagina.capas.map(copiarCapa), fijo: origen.pagina.fijo },
    };
    const origenes = new Map(base?.origenes);
    const porTipo = copiarRegistro(base?.origen.tipos ?? {});
    const porEstado = copiarRegistro(base?.origen.estados ?? {});
    const origenesDeGrupo = new Map(Object.entries(base?.origen.grupo.base ?? {}));
    const grupoPorTipo = copiarRegistro(base?.origen.grupo.tipos ?? {});
    const grupoPorEstado = copiarRegistro(base?.origen.grupo.estados ?? {});
    const grupoPorColapso = copiarRegistro({ collapsed: base?.origen.grupo.colapsado ?? {} });
    for (const parte of declarado.ast.parts) {
      if (parte.$type === 'ThemeNode' || parte.$type === 'ThemeGroup' || parte.$type === 'ThemeEdge' || parte.$type === 'ThemePage') continue;
      const destino = parte.$type === 'ThemePalette' ? tema.palette : parte.$type === 'ThemeFonts' ? tema.fonts : tema.tokens;
      for (const { key, value } of parte.entries) destino[key] = value;
    }
    // El bloque `node` se compila al final: sus colores y tokens se validan contra la Paleta y los tokens ya completos.
    const items = declarado.ast.parts.flatMap((parte) => (parte.$type === 'ThemeNode' ? parte.items : []));
    compilarElemento('nodo', declarado.archivo, items, tema, origenes, { partes, tipos, issues, porTipo, porEstado, porColapso: {} });
    const delGrupo = declarado.ast.parts.flatMap((parte) => (parte.$type === 'ThemeGroup' ? parte.items : []));
    compilarElemento('grupo', declarado.archivo, delGrupo, tema, origenesDeGrupo, { partes, tipos, issues, porTipo: grupoPorTipo, porEstado: grupoPorEstado, porColapso: grupoPorColapso });
    const delBordeDeArista = declarado.ast.parts.flatMap((parte) => (parte.$type === 'ThemeEdge' ? parte.items : []));
    compilarArista(delBordeDeArista, tema, { archivo: declarado.archivo, partes, paleta: tema.palette, tokens: tema.tokens, issues });
    const delaPagina = declarado.ast.parts.flatMap((parte) => (parte.$type === 'ThemePage' ? parte.items : []));
    const origenesDePagina = new Map(Object.entries(base?.origen.pagina ?? {}));
    compilarPagina(delaPagina, tema, { archivo: declarado.archivo, partes, paleta: tema.palette, tokens: tema.tokens, issues, origenes: origenesDePagina });
    enCurso.delete(name);
    const delPadre = base === undefined ? [] : [parent as string, ...base.origen.extends];
    const compilado: Compilado = {
      tema,
      origenes,
      origen: {
        sitio: { file: declarado.archivo, ...declarado.nombre.start },
        extends: delPadre,
        partes: [...new Set([...(base?.origen.partes ?? []), ...partesUsadas([...items, ...delGrupo, ...delBordeDeArista, ...delaPagina], partes)])],
        base: sitioDeCopia(origenes),
        tipos: Object.fromEntries(Object.entries(porTipo).map(([clave, mapa]) => [clave, sitioDeCopia(mapa)])),
        estados: Object.fromEntries(Object.entries(porEstado).map(([clave, mapa]) => [clave, sitioDeCopia(mapa)])),
        grupo: {
          base: sitioDeCopia(origenesDeGrupo),
          tipos: Object.fromEntries(Object.entries(grupoPorTipo).map(([clave, mapa]) => [clave, sitioDeCopia(mapa)])),
          estados: Object.fromEntries(Object.entries(grupoPorEstado).map(([clave, mapa]) => [clave, sitioDeCopia(mapa)])),
          colapsado: sitioDeCopia(grupoPorColapso['collapsed'] ?? new Map()),
        },
        pagina: sitioDeCopia(origenesDePagina),
      },
    };
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
    // Tambien los incorporados: su sitio es una linea de `<incorporados>` y `inspect tema` muestra su cadena `extends`.
    origenes: Object.fromEntries([...resueltos].map(([nombre, { origen }]) => [nombre, origen])),
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

/** Pila base, la de cada Tipo con parches y la de cada estado sobre ellas: contra cual puede valer un parche (de la Vista, que es del Nodo). */
function todasLasPilas(tema: TemaResuelto): CapaDeTema[][] {
  const base = tema.nodo.capas as CapaDeTema[];
  const sobreTipos = pilasSobreTipos(tema, base, 'nodo');
  const porEstado = Object.values(tema.nodo.estados).flatMap((ops) => sobreTipos.map((pila) => aplicarOps(pila, ops, tema.palette, 'parchear').pila));
  return [...sobreTipos, ...porEstado];
}

/** La pila base y la de cada Tipo con parches, aplicados sobre ella. */
function pilasSobreTipos(tema: TemaResuelto, base: CapaDeTema[], elemento: ElementoDeTema): CapaDeTema[][] {
  return [base, ...Object.values(tema[elemento].tipos).map((ops) => aplicarOps(base, ops, tema.palette, 'parchear').pila)];
}

/** `padding` del Grupo: 1 valor (todos los lados), 2 (vertical, horizontal) o 4 (arriba, derecha, abajo, izquierda), como en CSS. */
function compilarPadding(item: GroupPadding, tema: TemaResuelto, archivo: string, issues: Issue[]): void {
  const v = item.values.map(Number);
  const [a, b, c, d] = v as [number, number, number, number];
  const lados = v.length === 1 ? { top: a, right: a, bottom: a, left: a } : v.length === 2 ? { top: a, right: b, bottom: a, left: b } : v.length === 4 ? { top: a, right: b, bottom: c, left: d } : undefined;
  const fuera = v.find((n) => n < 0 || n > 128);
  if (lados === undefined || fuera !== undefined) {
    issues.push({
      code: CODIGOS.E_THEME_INVALID_VALUE,
      severity: 'error',
      file: archivo,
      ...aRango(item.$cstNode?.range).start,
      message: lados === undefined ? `'padding' lleva 1, 2 o 4 valores (arriba, derecha, abajo, izquierda), no ${v.length}` : `'padding' ${fuera} fuera de rango; usa de 0 a 128`,
    });
    return;
  }
  tema.grupo.padding = { top: lados.top, left: lados.left, bottom: lados.bottom, right: lados.right };
}

/**
 * Compila el bloque de un elemento (`node` o `group`) sobre la pila heredada: base, luego Tipos, luego estados.
 * Una sola ruta para los dos; el Grupo anade `padding` y `state collapsed`, el parche del Grupo cerrado (puede
 * cambiar Slots y caja), y no admite parches de Tipo que toquen las Metricas.
 */
function compilarElemento(elemento: ElementoDeTema, archivo: string, items: ReadonlyArray<GroupItem>, tema: TemaResuelto, origenes: Map<string, Sitio>, entorno: Entorno): void {
  const { partes, tipos, issues } = entorno;
  const contexto = { archivo, partes, paleta: tema.palette, tokens: tema.tokens, origenes, issues };
  const bloque = tema[elemento];
  const delNodo = items.filter((item): item is NodeItem => item.$type !== 'GroupPadding');

  // 1) Pila base: Capas y `use` del propio bloque; despues los `slots` (la cabecera, en el Grupo) y el padding.
  const delBase = items.filter((item): item is ThemeLayer | ThemeUse => item.$type === 'ThemeLayer' || item.$type === 'ThemeUse');
  const modo = bloque.capas.length === 0 ? 'definir' : 'parchear';
  const opsBase = compilarBloque(delBase, { ...contexto, modo, candidatas: [bloque.capas as CapaDeTema[]] });
  bloque.capas = aplicarOps(bloque.capas as CapaDeTema[], opsBase, tema.palette, modo).pila;
  for (const item of items) {
    if (item.$type === 'ThemeSlots') compilarSlots(item, bloque, { archivo, partes, paleta: tema.palette, tokens: tema.tokens, issues }, elemento);
    else if (item.$type === 'GroupPadding' && elemento === 'grupo') compilarPadding(item, tema, archivo, issues);
  }

  // Animacion del elemento: `transition`, `enter`, `exit` y `stagger` (solo pintura, nunca Metricas).
  const animacion = compilarAnimacionDeNodo(delNodo, bloque.animacion, archivo, issues);
  if (animacion !== undefined) bloque.animacion = animacion;

  // 2) Parches por Tipo de nodo, sobre la pila base.
  const base = bloque.capas as CapaDeTema[];
  for (const item of delNodo) {
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
    const propios = new Map(origenes);
    const ops = compilarBloque(item.items, { ...contexto, origenes: propios, modo: 'parchear', candidatas: [base] });
    if (elemento === 'grupo') avisarSiTocaMetricas(ops, [base], item, `Un parche de Tipo del Grupo no puede tocar las Metricas`, `'${item.name}' no tiene entrada propia en la tabla; usa el bloque base o 'state collapsed'`, archivo, issues);
    bloque.tipos[item.name] = [...(bloque.tipos[item.name] ?? []), ...ops];
    anotarOrigenes(entorno.porTipo, item.name, propios, origenes);
  }

  // 3) Parches por estado, sobre la pila base o la de cualquier Tipo (y, en el Grupo, tambien cerrado).
  const sobreTipos = pilasSobreTipos(tema, base, elemento);
  const conColapso = elemento === 'grupo' ? [...sobreTipos, ...sobreTipos.map((pila) => aplicarOps(pila, tema.grupo.colapsado.ops, tema.palette, 'parchear').pila)] : sobreTipos;
  for (const item of delNodo) {
    if (item.$type !== 'ThemeState') continue;
    if (elemento === 'grupo' && item.name === 'collapsed') {
      compilarColapsado(item, tema, { ...contexto, entorno, sobreTipos });
      continue;
    }
    const parseado = parsearEstado(item.name);
    if ('error' in parseado) {
      issues.push(issueConSugerencia({ code: parseado.error.code, message: parseado.error.message }, archivo, item, 'name', elemento === 'grupo' ? [...ESTADOS, 'collapsed'] : ESTADOS));
      continue;
    }
    const { estado } = parseado;
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
    const propios = new Map([...origenes, ...[...Object.values(entorno.porTipo)].flatMap((mapa) => [...mapa]), ...[...Object.values(entorno.porColapso)].flatMap((mapa) => [...mapa])]);
    const inicial = new Map(propios);
    const ops = compilarBloque(capas, { ...contexto, origenes: propios, modo: 'parchear', candidatas: conColapso });
    anotarOrigenes(entorno.porEstado, estado, propios, inicial);
    avisarSiTocaMetricas(ops, conColapso, item, `Un parche de estado no puede tocar las Metricas`, `'${estado}' nunca relayouta, cambiala en el bloque base`, archivo, issues);
    bloque.estados[estado] = [...(bloque.estados[estado] ?? []), ...ops];
  }
}

/** Error `E_THEME_STATE_TOUCHES_METRICS` por cada parche que cambia la caja (`opTocaMetricas`). */
function avisarSiTocaMetricas(ops: readonly OpDeCapa[], pilas: ReadonlyArray<readonly CapaDeTema[]>, donde: Ast, titulo: string, consejo: string, archivo: string, issues: Issue[]): void {
  for (const op of ops) {
    const razon = opTocaMetricas(op, pilas);
    if (razon === undefined) continue;
    issues.push({ code: CODIGOS.E_THEME_STATE_TOUCHES_METRICS, severity: 'error', file: archivo, ...aRango(donde.$cstNode?.range).start, message: `${titulo}: ${razon}; ${consejo}` });
  }
}

/**
 * `state collapsed` del Grupo: el parche del Grupo cerrado, que se comporta como un Nodo hoja. Sus Capas parchean
 * la pila (y pueden cambiar la caja); su `slots` sustituye a la cabecera como disposicion del Grupo cerrado.
 */
function compilarColapsado(item: ThemeState, tema: TemaResuelto, ctx: Omit<ContextoDeBloque, 'modo' | 'candidatas'> & { entorno: Entorno; sobreTipos: CapaDeTema[][] }): void {
  const { archivo, partes, issues, entorno } = ctx;
  const colapsado = tema.grupo.colapsado;
  for (const slots of item.items.filter((i): i is ThemeSlots => i.$type === 'ThemeSlots')) {
    compilarSlots(slots, colapsado, { archivo, partes, paleta: tema.palette, tokens: tema.tokens, issues }, 'grupo');
  }
  const capas = item.items.filter((i): i is ThemeLayer | ThemeUse => i.$type === 'ThemeLayer' || i.$type === 'ThemeUse');
  const propios = new Map(ctx.origenes);
  const ops = compilarBloque(capas, { ...ctx, origenes: propios, modo: 'parchear', candidatas: ctx.sobreTipos });
  anotarOrigenes(entorno.porColapso, 'collapsed', propios, ctx.origenes);
  colapsado.ops = [...colapsado.ops, ...ops];
}

/** Guarda en `registro[clave]` las Capas que el bloque fijo: las que `propios` tiene distintas de `antes`. */
function anotarOrigenes(registro: Registro, clave: string, propios: ReadonlyMap<string, Sitio>, antes: ReadonlyMap<string, Sitio>): void {
  const destino = registro[clave] ?? new Map<string, Sitio>();
  for (const [nombre, sitio] of propios) if (antes.get(nombre) !== sitio) destino.set(nombre, sitio);
  registro[clave] = destino;
}
