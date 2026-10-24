import { describe, expect, it } from 'vitest';

import { abrirSesion } from 'sesion';

const modeloTipos = `specification { node servicio { color rojo }  node tabla { color azul } }
model {
  servicio api
  tabla db
  api -> db
}
`;
const paleta = `palette { rojo "#dc2626"  azul "#2563eb"  papel "#fefce8"  tinta "#1f2937" }`;
const BASE = `    layer forma rect { radius 8 }
    layer relleno solid { color papel }
    layer borde border { color tinta width 1 }
    slots { title attrs }`;
const temaT = (nodo: string, extra = '') => `theme t {
  ${paleta}
  ${extra}
  node {
${BASE}
${nodo}
  }
}
`;
const vista = (tema = '  theme t\n') => `view v {
  type architecture
  include **
${tema}}
`;
const trabajoT = (dsl: string, vistaDsl = vista()) => ({ 'main.dg': modeloTipos + dsl + vistaDsl });
const capasDe = (sesion: ReturnType<typeof abrirSesion>, tipo?: string, estado?: string): string[] => {
  const nodo = sesion.estilo('v')!.pintura.nodo;
  const pila = tipo === undefined ? nodo : nodo.tipos[tipo]!;
  return (estado === undefined ? pila.capas : pila.estados[estado as 'hover']!).map((c) => `${c.nombre}:${JSON.stringify(c.props)}`);
};
const codigos = async (archivos: Record<string, string>) => (await abrirSesion(archivos).diagnosticar()).map((i) => i.code).sort();

describe('seam sesion: parches por nombre de Capa y cascada', () => {
  it('un parche por Tipo cambia solo esa Capa de ese Tipo; el resto usa la entrada base', () => {
    const sesion = abrirSesion(trabajoT(temaT('    type servicio { layer relleno { color rojo } }')));

    expect(capasDe(sesion, 'servicio')).toContain('relleno:{"color":"#dc2626"}');
    expect(capasDe(sesion, 'tabla')).toContain('relleno:{"color":"#fefce8"}');
    expect(capasDe(sesion)).toContain('relleno:{"color":"#fefce8"}');
  });

  it('anade con before/after, quita con none y marca over', () => {
    const sesion = abrirSesion(
      trabajoT(
        temaT(`    type servicio {
      layer barra rect after relleno { radius 2 }
      layer brillo solid before forma over { color rojo }
      layer borde none
    }`),
      ),
    );

    const capas = sesion.estilo('v')!.pintura.nodo.tipos['servicio']!.capas;
    expect(capas.map((c) => c.nombre)).toEqual(['brillo', 'forma', 'relleno', 'barra']);
    expect(capas[0]).toMatchObject({ encima: true });
    expect(capas[1]).not.toHaveProperty('encima');
  });

  it('la cascada es Tema base, Tipo, estado y override de la Vista: el ultimo gana', () => {
    const dsl = temaT(
      `    type servicio { layer relleno { color rojo } }
    state hover { layer relleno { color azul } }
    state seleccionado { layer borde { width 4 } }`,
    );
    const sesion = abrirSesion(trabajoT(dsl));
    const conVista = abrirSesion(trabajoT(dsl, vista('  theme t { layer relleno { color tinta } }\n')));

    expect(capasDe(sesion, 'servicio', 'hover')).toContain('relleno:{"color":"#2563eb"}');
    expect(capasDe(sesion, 'tabla', 'hover')).toContain('relleno:{"color":"#2563eb"}');
    expect(capasDe(sesion, 'servicio', 'seleccionado')).toContain('relleno:{"color":"#dc2626"}');
    expect(capasDe(sesion, 'servicio', 'seleccionado')).toContain('borde:{"color":"#1f2937","width":4}');
    // La Vista pisa a todos los niveles, incluidos los de estado.
    expect(capasDe(conVista, 'servicio')).toContain('relleno:{"color":"#1f2937"}');
    expect(capasDe(conVista, 'servicio', 'hover')).toContain('relleno:{"color":"#1f2937"}');
  });

  it('el Estilo resuelto es determinista por cascada y los parches de pintura no tocan las Metricas', () => {
    const dsl = temaT('    type servicio { layer relleno { color rojo } }\n    state hover { layer borde { width 3 } }');
    const a = abrirSesion(trabajoT(dsl)).estilo('v')!;
    const b = abrirSesion(trabajoT(dsl)).estilo('v')!;
    const sinParches = abrirSesion(trabajoT(temaT(''))).estilo('v')!;

    expect(b).toEqual(a);
    expect(a.metricas).toEqual(sinParches.metricas);
  });

  it('part/use incluye un parche reutilizable en un Tipo, un estado o el bloque base', () => {
    const dsl = `part resalte { layer relleno { color rojo } }\n` + temaT('    type servicio { use resalte }\n    state hover { use resalte }');
    const sesion = abrirSesion(trabajoT(dsl));

    expect(capasDe(sesion, 'servicio')).toContain('relleno:{"color":"#dc2626"}');
    expect(capasDe(sesion, 'tabla', 'hover')).toContain('relleno:{"color":"#dc2626"}');
    expect(capasDe(sesion)).toContain('relleno:{"color":"#fefce8"}');
  });

  it('extends hereda los parches por Tipo y estado del padre y los suma a los propios', () => {
    const padre = temaT('    type servicio { layer relleno { color rojo } }');
    const hijo = `theme hijo extends t {
  node { type servicio { layer borde { width 5 } }  state hover { layer borde { width 2 } } }
}\n`;
    const sesion = abrirSesion(trabajoT(padre + hijo, vista('  theme hijo\n')));

    expect(capasDe(sesion, 'servicio')).toEqual(expect.arrayContaining(['relleno:{"color":"#dc2626"}', 'borde:{"color":"#1f2937","width":5}']));
    expect(capasDe(sesion, 'servicio', 'hover')).toContain('borde:{"color":"#1f2937","width":2}');
  });

  it('los tokens $nombre dan numeros y los colores admiten alfa y mix', () => {
    const sesion = abrirSesion(
      trabajoT(
        temaT(
          `    type servicio {
      layer vidrio solid after relleno { color rojo/0.5 }
      layer mezcla solid after vidrio { color mix(rojo, papel, 0.5) }
      layer forma { radius $radio }
    }`,
          'tokens { radio 12 }',
        ),
      ),
    );

    const capas = sesion.estilo('v')!.pintura.nodo.tipos['servicio']!.capas;
    const prop = (nombre: string, clave: string) => capas.find((c) => c.nombre === nombre)!.props[clave];
    expect(prop('vidrio', 'color')).toBe('rgba(220, 38, 38, 0.5)');
    expect(prop('mezcla', 'color')).toBe('#ed9187');
    expect(prop('forma', 'radius')).toBe(12);
    expect(sesion.estilo('v')!.pintura.nodo.tipos['tabla']!.capas.find((c) => c.nombre === 'forma')!.props['radius']).toBe(8);
  });

  it('COLOR toma el color de cada Tipo en el mismo parche del Tema base', () => {
    const sesion = abrirSesion(trabajoT(temaT('    layer marca solid after relleno { color COLOR }')));

    const marca = (tipo: string) => sesion.estilo('v')!.pintura.nodo.tipos[tipo]!.capas.find((c) => c.nombre === 'marca')!.props['color'];
    expect(marca('servicio')).toBe('#dc2626');
    expect(marca('tabla')).toBe('#2563eb');
  });

  it('mix acepta COLOR en cualquier lado: el color de cada Tipo mezclado con uno de Paleta', () => {
    const sesion = abrirSesion(trabajoT(temaT('    layer marca solid after relleno { color mix(COLOR, papel, 0.5) }\n    layer velo solid after marca { color mix(tinta, COLOR, 0.25) }')));

    const prop = (tipo: string, nombre: string) => sesion.estilo('v')!.pintura.nodo.tipos[tipo]!.capas.find((c) => c.nombre === nombre)!.props['color'];
    expect(prop('servicio', 'marca')).toBe('#ed9187');
    expect(prop('tabla', 'marca')).toBe('#92b0ea');
    // tinta #1f2937 hacia azul #2563eb un 25%: (33, 56, 100).
    expect(prop('tabla', 'velo')).toBe('#213864');
  });
});

describe('seam sesion: validacion estricta de la cascada', () => {
  it('un before/after hacia una Capa inexistente es un error con sugerencia', async () => {
    const issues = await abrirSesion(trabajoT(temaT('    type servicio { layer barra rect after rellno }'))).diagnosticar();

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'E_THEME_UNKNOWN_LAYER', severity: 'error', file: 'main.dg', fix: expect.objectContaining({ replacement: 'relleno' }) });
    expect(issues[0]!.message).toContain("'rellno'");
  });

  it('un parche a una Capa inexistente sin ubicacion es un error; quitar una inexistente tambien', async () => {
    const dsl = temaT('    type servicio { layer barra rect { radius 1 } }\n    type tabla { layer nada none }');

    expect(await codigos(trabajoT(dsl))).toEqual(['E_THEME_PATCH_WITHOUT_PLACEMENT', 'E_THEME_UNKNOWN_LAYER']);
  });

  it('anadir una Capa nueva en un Tema que extiende exige before/after', async () => {
    const hijo = `theme hijo extends t { node { layer extra rect } }\n`;

    expect(await codigos(trabajoT(temaT('') + hijo))).toEqual(['E_THEME_PATCH_WITHOUT_PLACEMENT']);
  });

  it('un token no declarado es un error con sugerencia; un token no numerico tambien', async () => {
    const issues = await abrirSesion(trabajoT(temaT('    type servicio { layer forma { radius $radia } }', 'tokens { radio 12 }'))).diagnosticar();
    const noNumerico = await codigos(trabajoT(temaT('    type servicio { layer forma { radius $nombre } }', 'tokens { nombre "x" }')));

    expect(issues.map((i) => i.code)).toEqual(['E_THEME_UNKNOWN_TOKEN']);
    expect(issues[0]!.hint).toContain("'radio'");
    expect(noNumerico).toEqual(['E_THEME_INVALID_VALUE']);
  });

  it('colores: fuera de Paleta, alfa o mix fuera de rango y ORIGEN en un Nodo (tambien dentro de mix) son errores', async () => {
    const dsl = temaT(`    layer a solid after forma { color verde }
    layer b solid after forma { color rojo/1.5 }
    layer c solid after forma { color mix(rojo, papel, 2) }
    layer d solid after forma { color ORIGEN }
    layer e solid after forma { color mix(ORIGEN, rojo, 0.5) }`);

    expect(await codigos(trabajoT(dsl))).toEqual(['E_THEME_INVALID_VALUE', 'E_THEME_INVALID_VALUE', 'E_THEME_INVALID_VALUE', 'E_THEME_INVALID_VALUE', 'E_UNKNOWN_PALETTE_COLOR']);
  });

  it('los issues de un parche traen related a la Capa base', async () => {
    const dsl = temaT('    type servicio { layer relleno { colour rojo } }');
    const [issue] = await abrirSesion(trabajoT(dsl)).diagnosticar();
    const lineaBase = (modeloTipos + dsl).split('\n').findIndex((l) => l.includes('layer relleno solid')) + 1;

    expect(issue).toMatchObject({ code: 'E_THEME_UNKNOWN_PROPERTY', related: [{ file: 'main.dg', line: lineaBase }] });
  });

  it('un parche de estado que toca los Slots es un error: hover nunca relayouta', async () => {
    expect(await codigos(trabajoT(temaT('    state hover { slots { title } }')))).toEqual(['E_THEME_STATE_TOUCHES_METRICS']);
  });

  it('un parche de estado que cambia la forma por una que define la caja es un error; uno de pintura no', async () => {
    expect(await codigos(trabajoT(temaT('    state hover { layer forma circle }')))).toEqual(['E_THEME_STATE_TOUCHES_METRICS']);
    expect(await codigos(trabajoT(temaT('    state hover { layer forma { radius 8 } }')))).toEqual([]);
  });

  it('estado, parte y Tipo desconocidos se informan con sugerencia', async () => {
    const dsl = temaT('    state hovr { layer borde { width 2 } }\n    type servicio { use resalte }\n    type servico { layer borde { width 2 } }');
    const issues = await abrirSesion(trabajoT(dsl)).diagnosticar();

    expect(issues.map((i) => i.code).sort()).toEqual(['E_THEME_UNKNOWN_PART', 'E_THEME_UNKNOWN_STATE', 'E_UNKNOWN_NODE_TYPE']);
    expect(issues.find((i) => i.code === 'E_THEME_UNKNOWN_STATE')!.fix?.replacement).toBe('hover');
  });

  it('un valor fuera de rango en un parche no se recorta', async () => {
    expect(await codigos(trabajoT(temaT('    type servicio { layer borde { width 99 } }')))).toEqual(['E_THEME_INVALID_VALUE']);
  });

  it('un theme o part repetido en el Workspace es un error de duplicado con related, nunca una fusion', async () => {
    const archivos = {
      'a.dg': modeloTipos + temaT('') + 'part p { layer borde { width 2 } }\n' + vista(),
      'b.dg': temaT('') + 'part p { layer borde { width 3 } }\n',
    };
    const issues = await abrirSesion(archivos).diagnosticar();

    expect(issues.map((i) => i.code).sort()).toEqual(['E_DUPLICATE_PART', 'E_DUPLICATE_THEME']);
    for (const issue of issues) expect(issue).toMatchObject({ file: 'b.dg', related: [{ file: 'a.dg' }] });
  });

  it('informa todos los errores de la cascada a la vez', async () => {
    const dsl = temaT(`    type servicio { layer barra rect after nada  layer relleno { colour rojo } }
    state hover { slots { title }  layer borde { width 99 } }
    type tabla { layer forma { radius $x } }`);

    expect(await codigos(trabajoT(dsl))).toEqual([
      'E_THEME_INVALID_VALUE',
      'E_THEME_STATE_TOUCHES_METRICS',
      'E_THEME_UNKNOWN_LAYER',
      'E_THEME_UNKNOWN_PROPERTY',
      'E_THEME_UNKNOWN_TOKEN',
    ]);
  });

  it('un parche de Vista con errores se informa igual', async () => {
    expect(await codigos(trabajoT(temaT(''), vista('  theme t { layer barra rect after nada }\n')))).toEqual(['E_THEME_UNKNOWN_LAYER']);
  });
});
