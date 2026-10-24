/**
 * Via de escape en codigo (ADR 0008): las Capas `code <Componente>` del Tema.
 *
 * `render` nunca importa codigo del Workspace: recibe un registro nombre ->
 * componente (`ComponentesDeTema`) como entrada y dibuja cada Capa `code` en un
 * contenedor absoluto de exactamente el tamano de la caja del elemento. Un
 * componente recibe solo `PropsDeCodigo` (solo lectura y serializable) y no puede
 * cambiar el tamano del elemento ni las Metricas: el contenedor tiene tamano
 * fijo y `contain: layout style`. Los adaptadores que llenan el registro viven
 * fuera (`dev` compila el `.tsx`; las pruebas usan un registro en memoria).
 */
import type { ComponentType } from 'react';
import type { CapaPintada, PinturaDeNodo } from 'tema';
import type { NodoResuelto } from 'canonico';

import { limpiarValorCss, num } from './elemento';
import type { Elemento } from './elemento';
import type { Estilo } from './estilo';

/** Lo unico que ve un componente de Tema: caja ya calculada, estado, colores resueltos, id, parametros y datos acotados. */
export interface PropsDeCodigo {
  /** Id del elemento (semilla determinista para lo aleatorio). */
  readonly id: string;
  /** Caja del elemento en px; el componente no puede cambiarla. */
  readonly caja: { readonly ancho: number; readonly alto: number };
  /** Estados visuales vigentes (`hover`, `seleccionado`...); vacio en reposo. */
  readonly estado: readonly string[];
  /** Colores ya resueltos de la Paleta: el trazo del Tipo, el texto y el fondo del Tema. */
  readonly colores: { readonly trazo: string; readonly texto: string; readonly fondo: string };
  /** Parametros declarados en la Capa `code`, con los parches de estado aplicados. */
  readonly parametros: Readonly<Record<string, number | string>>;
  /** Datos acotados del Nodo; nunca el Modelo completo. */
  readonly datos: { readonly tipo: string; readonly titulo: string; readonly tieneContenido: boolean };
}

export type ComponenteDeTema = ComponentType<PropsDeCodigo>;

/** Registro nombre -> componente: el puerto por el que entra el codigo del Workspace. */
export type ComponentesDeTema = Readonly<Record<string, ComponenteDeTema>>;

const congelar = <T extends object>(valor: T): Readonly<T> => Object.freeze(valor);

/**
 * Capas `code` de un Nodo o Grupo, bajo el contenido (`encima` falso) o sobre el.
 * Un parche de estado vigente cambia los parametros de la Capa del mismo nombre.
 */
export function pintarCodigo(
  estilo: Estilo,
  pila: Pick<PinturaDeNodo, 'capas' | 'estados'>,
  datos: { nodo: NodoResuelto; ancho: number; alto: number; trazo: string; estados: readonly string[]; tieneContenido: boolean; componentes: ComponentesDeTema | undefined },
  encima: boolean,
): Elemento[] {
  const { nodo, ancho, alto, trazo, estados, tieneContenido, componentes } = datos;
  const { capas, estados: porEstado } = pila;
  return capas
    .filter((capa) => capa.tipo === 'code' && (capa.encima === true) === encima)
    .map((base): Elemento => {
      const vigente = vigenteEnEstado(base, estados, porEstado);
      const { component, ...parametros } = vigente.props;
      const nombre = String(component);
      const tipo = componentes === undefined || !Object.hasOwn(componentes, nombre) ? undefined : componentes[nombre];
      const props: PropsDeCodigo = congelar({
        id: nodo.id,
        caja: congelar({ ancho, alto }),
        estado: congelar([...estados]),
        colores: congelar({ trazo, texto: estilo.texto, fondo: estilo.fondo }),
        parametros: congelar(parametros),
        datos: congelar({ tipo: nodo.type, titulo: nodo.title, tieneContenido }),
      });
      return {
        tag: 'div',
        attrs: { class: 'rd-codigo', 'data-codigo': nombre, 'data-capa-nombre': base.nombre, style: `width:${num(ancho)}px;height:${num(alto)}px;--trazo:${limpiarValorCss(trazo)};` },
        ...(tipo !== undefined && { componente: { tipo, props } }),
      };
    });
}

/** La Capa tal como queda con el primer estado vigente que la parchea (misma regla que la cascada: el parche manda). */
function vigenteEnEstado(base: CapaPintada, estados: readonly string[], porEstado: Partial<Record<string, CapaPintada[]>>): CapaPintada {
  for (const estado of estados) {
    const parcheada = porEstado[estado]?.find((capa) => capa.nombre === base.nombre && capa.tipo === 'code');
    if (parcheada !== undefined) return parcheada;
  }
  return base;
}
