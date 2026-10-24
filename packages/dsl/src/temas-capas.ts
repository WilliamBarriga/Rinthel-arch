/**
 * Compilacion de un bloque de parches de Capa (ADR 0008): las Capas del bloque
 * `node` de un Tema, de un `type`, de un `state`, de una `part` o del override
 * de una Vista. Expande `use`, resuelve `$token`, valida contra el catalogo y
 * la pila vigente (todos los errores a la vez) y entrega los parches ya
 * validados. La semantica de aplicar parches vive en `tema`; aqui solo se
 * traduce el AST y se situan los errores en el texto.
 */
import { CODIGOS } from 'canonico';
import type { Issue, TextRange } from 'canonico';
import { validarOps } from 'tema';
import type { CapaDeTema, ErrorDeCatalogo, OpDeCapa, UbicacionDePrimitiva } from 'tema';

import type { ThemeLayer, ThemeUse } from './generated/ast';
import { aRango, issueConSugerencia, rangoDe } from './posiciones';
import { compilarAnimacionDeCapa } from './temas-animacion';
import type { AnimacionDeCapa } from './temas-animacion';
import { inicioDePropiedad, propiedadDeClave, propiedadesResueltas } from './temas-comun';
import type { Contexto } from './temas-comun';

/** Donde se definio por ultima vez una Capa de la pila base; sirve de `related`. */
export interface Sitio {
  file: string;
  line: number;
  column: number;
}

export interface ContextoDeBloque extends Contexto {
  /** `definir` solo en el primer bloque de un Tema sin Capas heredadas. */
  modo: 'definir' | 'parchear';
  /** Donde se usan las Capas del bloque; `capa-nodo` si falta. */
  ubicacion?: UbicacionDePrimitiva;
  /** Pilas sobre las que el bloque puede aplicar; basta que valga para una. */
  candidatas: ReadonlyArray<readonly CapaDeTema[]>;
  /** Sitio de cada Capa de la pila base; el bloque lo actualiza con lo que define. */
  origenes: Map<string, Sitio>;
}

interface Elemento {
  item: ThemeLayer;
  archivo: string;
  /** Escrita en el propio bloque (no venida de una `part`): solo estas cuentan para duplicados. */
  directa: boolean;
}

function expandir(items: ReadonlyArray<ThemeLayer | ThemeUse>, archivo: string, ctx: ContextoDeBloque, usadas: ReadonlySet<string>, directa: boolean): Elemento[] {
  return items.flatMap((item): Elemento[] => {
    if (item.$type === 'ThemeLayer') return [{ item, archivo, directa }];
    const parte = ctx.partes.get(item.name);
    if (parte === undefined) {
      ctx.issues.push(
        issueConSugerencia(
          { code: CODIGOS.E_THEME_UNKNOWN_PART, message: `Parte '${item.name}' no declarada; usa 'part ${item.name} { ... }'` },
          archivo, item, 'name', ctx.partes.keys(),
        ),
      );
      return [];
    }
    if (usadas.has(item.name)) return [];
    return expandir(parte.ast.items, parte.archivo, ctx, new Set([...usadas, item.name]), false);
  });
}

const sitioDe = (archivo: string, rango: TextRange): Sitio => ({ file: archivo, ...rango.start });

function aOp(elemento: Elemento, ctx: ContextoDeBloque): { op: OpDeCapa; errores: ErrorDeCatalogo[] } {
  const { item } = elemento;
  const { props, errores } = propiedadesResueltas(item.props, ctx.tokens);
  const op: OpDeCapa = {
    nombre: item.name,
    props: Object.fromEntries(props.map(({ clave, valor }) => [clave, valor])),
    ...(item.remove === true && { quitar: true as const }),
    ...(item.primitive !== undefined && { primitiva: item.primitive }),
    ...(item.placement === 'before' && { antes: item.target }),
    ...(item.placement === 'after' && { despues: item.target }),
    ...(item.over === true && { encima: true as const }),
  };
  return { op, errores };
}

/** El fondo de pagina no se anima (ADR 0008: la animacion es de los Nodos y Grupos): `motion` y `keyframes` en `page` son error, no se descartan en silencio. */
function rechazarAnimacionDePagina(item: ThemeLayer, archivo: string, issues: Issue[]): AnimacionDeCapa {
  const [anim] = item.animations;
  if (anim === undefined) return { fallo: false };
  issues.push({
    code: CODIGOS.E_THEME_INVALID_VALUE,
    severity: 'error',
    file: archivo,
    ...aRango(anim.$cstNode?.range).start,
    message: `La Capa '${item.name}' de 'page' no admite '${anim.$type === 'ThemeMotion' ? 'motion' : 'keyframes'}': el fondo de pagina no se anima`,
    hint: "Anima las Capas de 'node' o 'group'; 'page' es solo pintura estatica",
  });
  return { fallo: true };
}

/**
 * Compila los elementos de un bloque. Devuelve los parches sin error en orden
 * de aplicacion y deja los issues en `ctx.issues`.
 */
export function compilarBloque(items: ReadonlyArray<ThemeLayer | ThemeUse>, ctx: ContextoDeBloque): OpDeCapa[] {
  const elementos = expandir(items, ctx.archivo, ctx, new Set(), true);
  const base = new Map(ctx.origenes);

  const vistas = new Set<string>();
  const unicos = elementos.filter(({ item, archivo, directa }) => {
    if (!directa || !vistas.has(item.name)) {
      if (directa) vistas.add(item.name);
      return true;
    }
    ctx.issues.push({
      code: CODIGOS.E_THEME_DUPLICATE_LAYER,
      severity: 'error',
      file: archivo,
      ...rangoDe(item, 'name').start,
      message: `Capa '${item.name}' repetida en el mismo bloque`,
    });
    return false;
  });

  const compiladas = unicos.map((elemento) => {
    const delOp = aOp(elemento, ctx);
    const animada = ctx.ubicacion === 'capa-pagina' ? rechazarAnimacionDePagina(elemento.item, elemento.archivo, ctx.issues) : compilarAnimacionDeCapa(elemento.item, elemento.archivo, ctx.issues);
    if (animada.animacion !== undefined) delOp.op.animacion = animada.animacion;
    return { elemento, ...delOp, animacionFalla: animada.fallo };
  });
  const issueDe = (elemento: Elemento, error: ErrorDeCatalogo, donde: 'nombre' | 'ubicacion' | 'propiedad', baseDeError?: string): Issue => {
    const { item, archivo } = elemento;
    const prop = error.clave === undefined ? undefined : propiedadDeClave(item.props, error.clave);
    const rango =
      donde === 'ubicacion'
        ? rangoDe(item, 'target')
        : donde === 'propiedad' && prop !== undefined
          ? rangoDe(prop, error.codigo === CODIGOS.E_THEME_UNKNOWN_PROPERTY ? 'key' : 'value')
          : rangoDe(item, error.codigo === CODIGOS.E_THEME_UNKNOWN_PRIMITIVE ? 'primitive' : 'name');
    const origen = baseDeError === undefined ? undefined : base.get(baseDeError);
    // Con un unico candidato cercano el arreglo es inequivoco: `fix` en vez de `hint` (ADR 0005). Los tokens van con `$` y no se arreglan aqui.
    const arreglable = error.candidato !== undefined && error.codigo !== CODIGOS.E_THEME_UNKNOWN_TOKEN;
    return {
      code: error.codigo,
      severity: 'error',
      file: archivo,
      ...rango.start,
      message: error.mensaje,
      ...(arreglable ? { fix: { file: archivo, range: rango, replacement: error.candidato as string } } : error.hint !== undefined && { hint: error.hint }),
      ...(origen !== undefined && { related: [{ ...origen, message: `Capa base '${baseDeError}' que este parche modifica` }] }),
    };
  };

  for (const { elemento, errores } of compiladas) {
    for (const error of errores) ctx.issues.push(issueDe(elemento, error, 'propiedad'));
  }
  const ops = compiladas.map(({ op }) => op);
  const fallidas = new Set<number>();
  compiladas.forEach(({ animacionFalla }, i) => {
    if (animacionFalla) fallidas.add(i);
  });
  for (const error of validarOps(ctx.candidatas, ops, ctx.paleta, ctx.modo, ctx.ubicacion)) {
    fallidas.add(error.indice);
    ctx.issues.push(issueDe((compiladas[error.indice] as { elemento: Elemento }).elemento, error, error.donde, error.base));
  }

  const validas: OpDeCapa[] = [];
  compiladas.forEach(({ elemento, op }, i) => {
    if (fallidas.has(i)) return;
    validas.push(op);
    if (op.quitar === true) ctx.origenes.delete(op.nombre);
    else ctx.origenes.set(op.nombre, sitioDe(elemento.archivo, rangoDe(elemento.item, 'name')));
  });
  return validas;
}
