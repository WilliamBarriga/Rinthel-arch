import { describe, expect, it } from 'vitest';

import { abrirSesion } from 'sesion';

const MODELO = `specification { node servicio }
model {
  servicio cliente
  servicio api
  servicio db
  servicio cola
  interaction compra "Compra" {
    cliente -> api "pedido"
    api -> db "consulta"
    async api -> cliente "evento"
    reply db -> api "ok"
    create api -> cola "nueva"
    api -> api "validar"
    destroy api -> cola
  }
}
`;
const PALETA = `palette { papel "#fefce8"  tinta "#1f2937"  azul "#2563eb"  rojo "#dc2626" }`;
const BASE = `  ${PALETA}
  node { layer forma rect  layer relleno solid { color papel }  layer borde border { color tinta }  slots { title } }
  edge { layer linea line { color tinta  width 1 }  end arrow { size 8 } }`;
const abrir = (bloques = '') =>
  abrirSesion({ 'main.dg': `${MODELO}theme t {\n${BASE}\n${bloques}\n}\nview v { type sequence  interaction compra  theme t }\n` });
const errores = async (sesion: ReturnType<typeof abrir>) => (await sesion.diagnosticar()).filter((i) => i.severity === 'error');
const trazo = (sesion: ReturnType<typeof abrir>, kind: string) => {
  const mensaje = sesion.estilo('v')!.pintura.secuencia!.mensaje!.base;
  return mensaje.variantes[kind]?.capas ?? mensaje.capas;
};
async function geometria(sesion: ReturnType<typeof abrir>) {
  const g = (await sesion.geometria('v'))?.geometry;
  if (g?.kind !== 'secuencia') throw new Error('se esperaba secuencia');
  return g;
}

describe('seam sesion: Tema de secuencia explicito', () => {
  it('message { kind async { ... } } cambia solo el trazo de async', async () => {
    const sesion = abrir('  message {\n    layer linea line { color tinta  width 1 }\n    end arrow { size 8 }\n    kind async { layer linea { color azul  width 3 } }\n  }');

    expect(await errores(sesion)).toEqual([]);
    expect(trazo(sesion, 'async').map((c) => [c.props['color'], c.props['width']])).toEqual([['#2563eb', 3]]);
    expect(trazo(sesion, 'sync').map((c) => [c.props['color'], c.props['width']])).toEqual([['#1f2937', 1]]);
    expect(trazo(sesion, 'reply').map((c) => c.props['color'])).toEqual(['#1f2937']);
  });

  it('un gap de lifeline del Tema cambia la Geometria', async () => {
    const base = await geometria(abrir());
    const ancho = await geometria(abrir('  lifeline { gap 300 }'));

    const distancia = (g: typeof base) => g.lifelines['api']!.x - g.lifelines['cliente']!.x;
    expect(distancia(base)).toBeLessThan(300);
    expect(distancia(ancho)).toBeGreaterThanOrEqual(300);
  });

  it('el gap entre Mensajes, el padding de Fragmento y el ancho de activacion tambien ajustan la Geometria', async () => {
    const base = await geometria(abrir());
    const ajustado = await geometria(abrir('  message { gap 80  loop-width 80 }\n  activation { width 20 }'));

    const separacion = (g: typeof base) => g.messages['1']!.points[0]!.y - g.messages['0']!.points[0]!.y;
    expect(separacion(ajustado)).toBeGreaterThan(separacion(base));
    expect(ajustado.activations[0]!.width).toBe(20);
    const lazo = (g: typeof base) => Math.max(...g.messages['5']!.points.map((p) => p.x)) - g.lifelines['api']!.x;
    expect(lazo(ajustado)).toBeGreaterThan(lazo(base));
  });

  it('un valor fuera de rango o un tipo de Mensaje desconocido son issues de Tema', async () => {
    const fuera = await abrir('  lifeline { gap 5 }').diagnosticar();
    const typo = await abrir('  message { kind asynk { layer linea { width 2 } } }').diagnosticar();

    expect(fuera.map((i) => i.code)).toEqual(['E_THEME_INVALID_VALUE']);
    expect(typo.map((i) => i.code)).toEqual(['E_THEME_INVALID_VALUE']);
    expect(typo[0]!.fix).toBeDefined();
  });
});

const AMBOS = `specification { node servicio  node tabla }
model {
  servicio cliente
  servicio api
  tabla orders "Pedidos" { id: uuid pk
    customer_id: uuid fk }
  tabla customers "Clientes" { id: uuid pk }
  orders#customer_id "0..*" -> "1" customers#id identifying
  interaction i {
    cliente -> api "pedir"
    alt "ok" { async api -> cliente "200" } else "falla" { async api -> cliente "500" }
    reply api -> cliente "fin"
    note over cliente, api "fin"
  }
}
`;
const conTema = (tema: string) => abrirSesion({ 'main.dg': `${AMBOS}view s { type sequence  interaction i  theme ${tema} }\nview e { type er  include orders, customers  theme ${tema} }\n` });

describe('seam sesion: Temas incorporados y secuencia/ER', () => {
  it.each(['neutral', 'neutral-dark', 'alto-contraste'])('%s dibuja secuencia y ER sin warnings ni errores', async (tema) => {
    expect(await conTema(tema).diagnosticar()).toEqual([]);
  });

  it.each(['neutral', 'alto-contraste'])('%s declara de forma explicita todos los Elementos nuevos', (tema) => {
    const sesion = conTema(tema);
    const secuencia = sesion.estilo('s')!.pintura.secuencia!;
    expect(Object.keys(secuencia).sort()).toEqual(['activacion', 'fragmento', 'lifeline', 'mensaje', 'nota']);
    expect(Object.keys(secuencia.mensaje!.base.variantes).sort()).toEqual(['async', 'create', 'destroy', 'reply']);
    expect(sesion.estilo('e')!.pintura.fila).toBeDefined();
  });

  it('neutral-dark hereda los Elementos de neutral y solo cambia la Paleta', () => {
    const oscuro = conTema('neutral-dark').estilo('s')!.pintura.secuencia!;
    const claro = conTema('neutral').estilo('s')!.pintura.secuencia!;
    expect(Object.keys(oscuro)).toEqual(Object.keys(claro));
    expect(oscuro.mensaje!.base.capas.map((c) => c.nombre)).toEqual(claro.mensaje!.base.capas.map((c) => c.nombre));
    expect(oscuro.mensaje!.base.capas[0]!.props['color']).not.toBe(claro.mensaje!.base.capas[0]!.props['color']);
  });

  it('alto-contraste usa trazos mas gruesos que neutral', () => {
    const grosor = (tema: string) => Number(conTema(tema).estilo('s')!.pintura.secuencia!.mensaje!.base.capas.at(-1)!.props['width']);
    expect(grosor('alto-contraste')).toBeGreaterThan(grosor('neutral'));
  });
});

describe('seam sesion: solo-color en Mensajes y Aristas identificantes', () => {
  const colorOnly = async (tema: string, vista: string) => {
    const base = tema.includes('  edge {') ? BASE.split('\n').filter((l) => !l.startsWith('  edge {')).join('\n') : BASE;
    const issues = await abrirSesion({ 'main.dg': `${AMBOS}theme t {\n${base}\n${tema}\n}\nview s { type sequence  interaction i  theme t }\nview e { type er  include orders, customers  theme t }\n` }).diagnosticar();
    return issues.filter((i) => i.code === 'W_THEME_COLOR_ONLY' && i.message.includes(`'${vista}'`));
  };

  it('avisa si reply solo cambia de color respecto de sync', async () => {
    const avisos = await colorOnly('  message {\n    layer linea line { color tinta  style solid }\n    end arrow { size 8 }\n    kind reply { layer linea { color rojo } }\n  }', 's');

    expect(avisos.map((i) => i.message)).toEqual([
      "En la Vista 's', los Mensajes 'sync' y 'reply' se distinguen solo por color",
      "En la Vista 's', los Mensajes 'async' y 'reply' se distinguen solo por color",
    ]);
  });

  it('no avisa con la derivacion de edge ni si reply cambia el trazo', async () => {
    expect(await colorOnly('', 's')).toEqual([]);
    expect(await colorOnly('  message {\n    layer linea line { color tinta  style solid }\n    end arrow { size 8 }\n    kind reply { layer linea { color rojo  style dashed } }\n  }', 's')).toEqual([]);
  });

  it('avisa si la Arista identificante y la no identificante son iguales salvo el color', async () => {
    const avisos = await colorOnly('  edge { layer linea line { color tinta  style dotted }  identifying { layer linea { color azul } } }', 'e');

    expect(avisos.map((i) => i.message)).toEqual(["En la Vista 'e', las Aristas identificantes y las no identificantes se distinguen solo por color"]);
  });

  it('no avisa con identificante continua y no identificante discontinua', async () => {
    expect(await colorOnly('  edge { layer linea line { color tinta  style solid }  identifying { layer linea { color azul } } }', 'e')).toEqual([]);
  });
});
