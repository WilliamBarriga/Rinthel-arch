import { describe, expect, it } from 'vitest';

import { abrirSesion } from 'sesion';

const modelo = `specification { node servicio { color rojo }  node tabla { color azul } }
model {
  servicio api
  tabla db
  api -> db
}
`;
const paleta = `palette { rojo "#dc2626"  azul "#2563eb"  papel "#fefce8"  tinta "#1f2937"  verde "#16a34a" }`;
const BASE = `    layer forma rect { radius 8 }
    layer relleno solid { color papel }
    layer borde border { color tinta width 1 }
    slots { title attrs }`;
const vistas = `view arq { type architecture  include **  theme t }
view flujo { type flow  include **  theme t }
`;
const trabajo = (nodo: string, vistaDsl = vistas) => ({ 'main.dg': `${modelo}theme t {\n  ${paleta}\n  node {\n${BASE}\n${nodo}\n  }\n}\n${vistaDsl}` });
const relleno = (sesion: ReturnType<typeof abrirSesion>, vista: string, tipo?: string, estado?: string): string => {
  const nodo = sesion.estilo(vista)!.pintura.nodo;
  const pila = tipo === undefined ? nodo : nodo.tipos[tipo]!;
  return (estado === undefined ? pila.capas : pila.estados[estado as 'hover']!).find((c) => c.nombre === 'relleno')!.props['color'] as string;
};

describe('seam sesion: cascada por Tipo de diagrama', () => {
  it('un parche diagram flow cambia las Metricas solo en las Vistas de flujo', () => {
    const sesion = abrirSesion(trabajo('    diagram flow { slots row pad 40 { title attrs } }'));

    const flujo = sesion.estilo('flujo')!.tabla.base;
    const arquitectura = sesion.estilo('arq')!.tabla.base;
    expect(flujo.disposicion.pad).toBe(40);
    expect(arquitectura.disposicion.pad).not.toBe(40);
    expect(flujo.disposicion).not.toEqual(arquitectura.disposicion);
  });

  it('un parche diagram pinta solo en su Tipo de diagrama', () => {
    const sesion = abrirSesion(trabajo('    diagram flow { layer relleno { color verde } }'));

    expect(relleno(sesion, 'flujo')).toBe('#16a34a');
    expect(relleno(sesion, 'arq')).toBe('#fefce8');
  });

  it('el parche diagram queda por debajo del Tipo de nodo y del estado', () => {
    const sesion = abrirSesion(
      trabajo(`    diagram flow { layer relleno { color verde } }
    type servicio { layer relleno { color rojo } }
    state hover { layer relleno { color azul } }`),
    );

    expect(relleno(sesion, 'flujo', 'tabla')).toBe('#16a34a');
    expect(relleno(sesion, 'flujo', 'servicio')).toBe('#dc2626');
    expect(relleno(sesion, 'flujo', 'servicio', 'hover')).toBe('#2563eb');
  });

  it('acepta los cuatro tipos aunque sequence y er aun no tengan Vistas', async () => {
    const sesion = abrirSesion(trabajo('    diagram sequence { layer relleno { color verde } }\n    diagram er { layer relleno { color rojo } }'));

    expect((await sesion.diagnosticar()).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('un tipo desconocido es un issue de Tema con fix por typo', async () => {
    const dsl = trabajo('    diagram sequense { layer relleno { color verde } }');
    const issues = await abrirSesion(dsl).diagnosticar();

    const issue = issues.find((i) => i.code === 'E_THEME_UNKNOWN_DIAGRAM_TYPE');
    expect(issue?.fix?.replacement).toBe('sequence');
  });

  it('un valor invalido dentro de diagram es un issue de Tema', async () => {
    const issues = await abrirSesion(trabajo('    diagram flow { layer relleno { color noexiste } }')).diagnosticar();

    expect(issues.map((i) => i.code)).toEqual(['E_UNKNOWN_PALETTE_COLOR']);
  });

  it('en group y edge tambien: el Grupo cambia su padding y la Arista su marcador', () => {
    const dsl = {
      'main.dg': `${modelo}theme t {
  ${paleta}
  node {
${BASE}
  }
  group { diagram flow { padding 40 } }
  edge { end arrow { size 8 }  diagram flow { end arrow { size 20 } } }
}
${vistas}`,
    };
    const sesion = abrirSesion(dsl);

    expect(sesion.estilo('flujo')!.tabla.grupoAbierto.paddingGrupo.left).toBe(40);
    expect(sesion.estilo('arq')!.tabla.grupoAbierto.paddingGrupo.left).not.toBe(40);
    expect(sesion.estilo('flujo')!.pintura.arista.fin?.props['size']).toBe(20);
    expect(sesion.estilo('arq')!.pintura.arista.fin?.props['size']).toBe(8);
  });
});
