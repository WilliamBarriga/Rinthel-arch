/**
 * Compilador de Temas: aplana `extends` en objetos planos (ADR 0002) y compila
 * el bloque `node` (Capas y Slots, ADR 0008) validandolo contra el catalogo de
 * `tema`. Valida nombres duplicados, padres desconocidos y ciclos. El Tema
 * neutro del nucleo siempre existe y puede extenderse.
 *
 * Herencia: paleta, fuentes y tokens se fusionan por clave (el hijo gana). Una
 * Capa del bloque `node` con el nombre de una heredada la reemplaza en su sitio;
 * una nueva se anade arriba de la pila; `slots` reemplaza la lista heredada. Un
 * Tema sin `extends` parte de las fuentes, tokens y Slots del neutro, con la
 * paleta vacia, para que cumpla siempre el contrato de dibujo.
 */
import { CODIGOS } from 'canonico';
import type { Issue, TextRange } from 'canonico';
import { TEMA_NEUTRO, construirPrimitiva, construirSlots } from 'tema';
import type { ErrorDeCatalogo, TemaResuelto } from 'tema';

import type { Theme, ThemeLayer, ThemeSlots } from './generated/ast';
import { rangoDe, rangoDeIndice } from './posiciones';

/** Un `theme` del DSL con el sitio donde se declaro. */
export interface TemaDeclarado {
  archivo: string;
  ast: Theme;
  /** Rangos de `name` y `parent`, para situar los issues. */
  nombre: TextRange;
  padre: TextRange;
}

/**
 * Temas resueltos (el neutro primero) e issues. Los Temas con ciclo o padre
 * desconocido no se resuelven. No toca el texto: lee posiciones del CST ya construido.
 */
export function resolverTemas(declarados: readonly TemaDeclarado[]): { temas: TemaResuelto[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const porNombre = new Map<string, TemaDeclarado>();
  for (const declarado of declarados) {
    const { name } = declarado.ast;
    const original = porNombre.get(name);
    if (name === TEMA_NEUTRO.name || original !== undefined) {
      issues.push({
        code: CODIGOS.E_DUPLICATE_THEME,
        severity: 'error',
        file: declarado.archivo,
        ...declarado.nombre.start,
        message: `Tema duplicado '${name}'`,
        ...(original !== undefined && {
          related: [{ file: original.archivo, ...original.nombre.start, message: `Primera declaracion de '${name}'` }],
        }),
      });
      continue;
    }
    porNombre.set(name, declarado);
  }

  const resueltos = new Map<string, TemaResuelto>([[TEMA_NEUTRO.name, TEMA_NEUTRO]]);
  const enCurso = new Set<string>();
  const fallidos = new Set<string>();
  const resolver = (declarado: TemaDeclarado): TemaResuelto | undefined => {
    const { name, parent } = declarado.ast;
    const hecho = resueltos.get(name);
    if (hecho !== undefined) return hecho;
    if (enCurso.has(name) || fallidos.has(name)) return undefined;
    enCurso.add(name);

    let base: TemaResuelto | undefined;
    if (parent !== undefined) {
      const padre = porNombre.get(parent);
      base = parent === TEMA_NEUTRO.name ? TEMA_NEUTRO : padre && resolver(padre);
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

    const tema: TemaResuelto = {
      name,
      palette: { ...(base?.palette ?? {}) },
      fonts: { ...(base ?? TEMA_NEUTRO).fonts },
      tokens: { ...(base ?? TEMA_NEUTRO).tokens },
      nodo: { capas: (base ?? TEMA_NEUTRO).nodo.capas.map((c) => ({ ...c, primitiva: { ...c.primitiva, props: { ...c.primitiva.props } } })), slots: [...(base ?? TEMA_NEUTRO).nodo.slots] },
    };
    for (const parte of declarado.ast.parts) {
      if (parte.$type === 'ThemeNode') continue;
      const destino = parte.$type === 'ThemePalette' ? tema.palette : parte.$type === 'ThemeFonts' ? tema.fonts : tema.tokens;
      for (const { key, value } of parte.entries) destino[key] = value;
    }
    // El bloque `node` se compila al final: sus colores se validan contra la Paleta ya completa.
    for (const parte of declarado.ast.parts) {
      if (parte.$type === 'ThemeNode') compilarNodo(declarado.archivo, parte.items, tema, issues);
    }
    enCurso.delete(name);
    resueltos.set(name, tema);
    return tema;
  };
  for (const declarado of porNombre.values()) resolver(declarado);

  return { temas: [...resueltos.values()], issues };
}

function compilarNodo(archivo: string, items: ReadonlyArray<ThemeLayer | ThemeSlots>, tema: TemaResuelto, issues: Issue[]): void {
  const declaradas = new Set<string>();
  for (const item of items) {
    if (item.$type === 'ThemeSlots') {
      const { slots, errores } = construirSlots(item.names);
      for (const error of errores) issues.push(aIssue(archivo, error, rangoDeIndice(item, 'names', error.indice)));
      if (errores.length === 0) tema.nodo.slots = slots;
      continue;
    }
    if (declaradas.has(item.name)) {
      issues.push({
        code: CODIGOS.E_THEME_DUPLICATE_LAYER,
        severity: 'error',
        file: archivo,
        ...rangoDe(item, 'name').start,
        message: `Capa '${item.name}' repetida en el mismo bloque`,
      });
      continue;
    }
    declaradas.add(item.name);
    const { primitiva, errores } = construirPrimitiva(
      item.primitive,
      item.props.map(({ key, value }) => ({ clave: key, valor: value })),
      tema.palette,
    );
    for (const error of errores) {
      const prop = error.clave === undefined ? undefined : item.props.find(({ key }) => key === error.clave);
      const rango = prop !== undefined ? rangoDe(prop, error.codigo === CODIGOS.E_THEME_UNKNOWN_PROPERTY ? 'key' : 'value') : rangoDe(item, error.clave === undefined ? 'primitive' : 'name');
      issues.push(aIssue(archivo, error, rango));
    }
    if (primitiva === undefined) continue;
    const existente = tema.nodo.capas.findIndex((capa) => capa.nombre === item.name);
    const capa = { nombre: item.name, primitiva };
    if (existente >= 0) tema.nodo.capas[existente] = capa;
    else tema.nodo.capas.push(capa);
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
