import { describe, expect, it } from 'vitest';

import { abrirSesion } from 'sesion';
import { colocarNodo, contenidoDeNodo, pilaDeFila, piezasDeAtributo } from 'tema';

const ER = `specification { node tabla }
model {
  tabla orders "Pedidos" {
    id: uuid pk
    customer_id: uuid pk fk
    email: text? uk
  }
  tabla customers "Clientes" {
    id: uuid pk
    name: text
  }
  orders#customer_id "1..*" -> "1" customers#id "pertenece" identifying
}
view tablas { type er  include ** }
view arq { type architecture  include ** }
`;
const PALETA = `palette { papel "#fefce8"  tinta "#1f2937"  azul "#2563eb"  verde "#16a34a"  rojo "#dc2626" }`;
const NODO = `  node {
    layer forma rect { radius 6 }
    layer relleno solid { color papel }
    layer borde border { color tinta width 1 }
    slots { title attrs }
    NODO_EXTRA
  }`;
const tema = (nodoExtra = '', resto = '') => ({ 'main.dg': `${ER}theme t {\n  ${PALETA}\n${NODO.replace('NODO_EXTRA', nodoExtra)}\n${resto}\n}\n`.replace('view tablas { type er  include ** }', 'view tablas { type er  include **  theme t }').replace('view arq { type architecture  include ** }', 'view arq { type architecture  include **  theme t }') });

describe('seam sesion: Tema ER, zone', () => {
  it('una Capa con zone header llega al Estilo resuelto de la tabla', async () => {
    const sesion = abrirSesion(tema('layer cab solid { color azul  zone header }'));

    expect((await sesion.diagnosticar()).filter((i) => i.severity === 'error')).toEqual([]);
    const cab = sesion.estilo('tablas')!.pintura.nodo.capas.find((c) => c.nombre === 'cab')!;
    expect(cab.props['zone']).toBe('header');
    expect(cab.props['color']).toBe('#2563eb');
  });

  it('zone admite all, header y body; otro valor es un issue de Tema', async () => {
    const issues = await abrirSesion(tema('layer cab solid { color azul  zone pie }')).diagnosticar();

    expect(issues.map((i) => i.code)).toEqual(['E_THEME_INVALID_VALUE']);
  });
});

const FILA = (cuerpo: string): ReturnType<typeof tema> => tema('', `  row {\n${cuerpo}\n  }`);
const colores = (sesion: ReturnType<typeof abrirSesion>, vista: string, fila: Parameters<typeof pilaDeFila>[1]): string[] => {
  const pintura = sesion.estilo(vista)!.pintura.fila;
  return pintura === undefined ? [] : pilaDeFila(pintura, fila).map((c) => String(c.props['color']));
};
const sola = { impar: false, keys: [], opcional: false } as const;

describe('seam sesion: Tema ER, bloque row', () => {
  it('un parche key pk cambia el Estilo resuelto solo de las filas con esa clave', async () => {
    const sesion = abrirSesion(FILA('    layer fondo solid { color papel }\n    key pk { layer fondo { color verde } }'));

    expect((await sesion.diagnosticar()).filter((i) => i.severity === 'error')).toEqual([]);
    expect(colores(sesion, 'tablas', { ...sola, keys: ['pk'] })).toEqual(['#16a34a']);
    expect(colores(sesion, 'tablas', { ...sola, keys: ['fk'] })).toEqual(['#fefce8']);
    expect(colores(sesion, 'tablas', sola)).toEqual(['#fefce8']);
  });

  it('las claves se apilan en orden pk, fk, uk y optional va despues; alternate pinta las filas impares', () => {
    const sesion = abrirSesion(
      FILA(`    layer fondo solid { color papel }
    alternate { layer fondo { color tinta } }
    key pk { layer fondo { color verde } }
    key fk { layer fondo { color azul } }
    optional { layer fondo { color rojo } }`),
    );

    expect(colores(sesion, 'tablas', { impar: true, keys: [], opcional: false })).toEqual(['#1f2937']);
    expect(colores(sesion, 'tablas', { impar: true, keys: ['fk', 'pk'], opcional: false })).toEqual(['#2563eb']);
    expect(colores(sesion, 'tablas', { impar: false, keys: ['pk'], opcional: true })).toEqual(['#dc2626']);
  });

  it('el size de row name y type cambia el tamano medido y el ancho de la tabla; key cambia el chip', () => {
    const medido = (cuerpo: string) => {
      const m = abrirSesion(FILA(cuerpo)).estilo('tablas')!.metricas;
      const orders = { name: 'email', type: 'text', optional: true, keys: ['uk'] } as never;
      const nodo = { id: 'orders', type: 'tabla', title: 'Pedidos', description: '', children: [], attributes: [orders], source: [] } as never;
      return { m, piezas: piezasDeAtributo(orders, m), ancho: colocarNodo({ ...contenidoDeNodo(nodo, m), atributos: [orders] }, m).width };
    };
    const base = medido('    layer fondo solid { color papel }');
    const grande = medido('    layer fondo solid { color papel }\n    name { size 2 }\n    type { size 1.5 }\n    key { size 1.2 }');

    expect(base.piezas).toHaveLength(1);
    expect(grande.piezas.map((p) => p.tamano)).toEqual([grande.m.fontSize * 2, grande.m.fontSize * grande.m.escalaAtributo, grande.m.fontSize * 1.5]);
    expect(grande.m.fila).toBeGreaterThanOrEqual(Math.ceil(grande.m.fontSize * 2 * 1.4));
    expect(grande.ancho).toBeGreaterThan(base.ancho);
    expect(medido('    height 40\n    name { size 2 }').m.fila).toBe(40);
  });

  it('el bloque row solo vale en una Vista ER', () => {
    const sesion = abrirSesion(FILA('    layer fondo solid { color verde }'));

    expect(sesion.estilo('tablas')!.pintura.fila).toBeDefined();
    expect(sesion.estilo('arq')!.pintura.fila).toBeUndefined();
  });

  it('el estilo de texto name, type y key (chip) llega al Estilo resuelto', () => {
    const sesion = abrirSesion(FILA('    name { color tinta  weight 600 }\n    type { color azul }\n    key { fill azul  color papel  radius 4 }'));

    const { textos } = sesion.estilo('tablas')!.pintura.fila!;
    expect(textos.name?.props).toMatchObject({ color: '#1f2937', weight: 600 });
    expect(textos.type?.props['color']).toBe('#2563eb');
    expect(textos.key).toMatchObject({ tipo: 'chip', props: { fill: '#2563eb', radius: 4 } });
  });

  it('el alto de row cambia la Geometria de las tablas ER y no la de arquitectura', async () => {
    const alto = async (dsl: ReturnType<typeof tema>, vista: string) => {
      const { geometry } = (await abrirSesion(dsl).geometria(vista))!;
      if (geometry.kind !== 'grafo') throw new Error('grafo');
      return geometry.nodes['orders']!.height;
    };
    const sin = tema();
    const con = FILA('    height 40');

    expect(await alto(con, 'tablas')).toBeGreaterThan(await alto(sin, 'tablas'));
    expect(await alto(con, 'arq')).toBe(await alto(sin, 'arq'));
    expect(abrirSesion(con).estilo('tablas')!.metricas.fila).toBe(40);
  });

  it('un valor invalido o una clave desconocida son issues de Tema, con fix por typo', async () => {
    const alto = await abrirSesion(FILA('    height 500')).diagnosticar();
    const clave = await abrirSesion(FILA('    layer fondo solid { color papel }\n    key pq { layer fondo { color verde } }')).diagnosticar();
    const texto = await abrirSesion(FILA('    names { color tinta }')).diagnosticar();

    expect(alto.map((i) => i.code)).toEqual(['E_THEME_INVALID_VALUE']);
    expect(clave.map((i) => i.code)).toEqual(['E_THEME_INVALID_VALUE']);
    expect(clave[0]!.fix?.replacement).toBe('pk');
    expect(texto.map((i) => i.code)).toEqual(['E_THEME_INVALID_VALUE']);
    expect(texto[0]!.fix?.replacement).toBe('name');
  });

  it('un parche de fila no puede cambiar la caja', async () => {
    const issues = await abrirSesion(FILA('    layer fondo solid { color papel }\n    key pk { layer fondo circle }')).diagnosticar();

    expect(issues.map((i) => i.code)).toContain('E_THEME_STATE_TOUCHES_METRICS');
  });
});
