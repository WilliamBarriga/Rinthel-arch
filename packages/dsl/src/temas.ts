/**
 * Resolucion de Temas: aplana `extends` en objetos planos (ADR 0002) y valida
 * nombres duplicados, padres desconocidos y ciclos. El Tema neutro del nucleo
 * siempre existe y puede extenderse.
 */
import { CODIGOS, TEMA_NEUTRO } from 'canonico';
import type { Issue, Tema, TextRange } from 'canonico';

import type { Theme } from './generated/ast';

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
 * desconocido no se resuelven. Funcion pura: no toca el CST, recibe los rangos.
 */
export function resolverTemas(declarados: readonly TemaDeclarado[]): { temas: Tema[]; issues: Issue[] } {
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

  const resueltos = new Map<string, Tema>([[TEMA_NEUTRO.name, TEMA_NEUTRO]]);
  const enCurso = new Set<string>();
  const fallidos = new Set<string>();
  const resolver = (declarado: TemaDeclarado): Tema | undefined => {
    const { name, parent } = declarado.ast;
    const hecho = resueltos.get(name);
    if (hecho !== undefined) return hecho;
    if (enCurso.has(name) || fallidos.has(name)) return undefined;
    enCurso.add(name);

    let base: Tema | undefined;
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

    const tema: Tema = {
      name,
      palette: { ...base?.palette },
      fonts: { ...base?.fonts },
      tokens: { ...base?.tokens },
    };
    for (const parte of declarado.ast.parts) {
      const destino = parte.$type === 'ThemePalette' ? tema.palette : parte.$type === 'ThemeFonts' ? tema.fonts : tema.tokens;
      for (const { key, value } of parte.entries) destino[key] = value;
    }
    enCurso.delete(name);
    resueltos.set(name, tema);
    return tema;
  };
  for (const declarado of porNombre.values()) resolver(declarado);

  return { temas: [...resueltos.values()], issues };
}
