import { describe, expect, it } from 'vitest';

import { CATALOGO, TEMA_NEUTRO, colocarEnCaja, colocarNodo, construirPrimitiva, estiloResuelto, metricasDe, resolverTema, temaResueltoSchema } from 'tema';

describe('contrato del Tema', () => {
  it('acepta el Tema neutro y uno con tokens adicionales', () => {
    expect(temaResueltoSchema.safeParse(TEMA_NEUTRO).success).toBe(true);
    expect(temaResueltoSchema.safeParse({ ...TEMA_NEUTRO, tokens: { ...TEMA_NEUTRO.tokens, fontSize: '16px', surface: '#eee' } }).success).toBe(true);
  });

  it('un Tema sin un token o fuente requeridos falla senalando la ruta', () => {
    const { border: _borde, ...tokens } = TEMA_NEUTRO.tokens;
    const sinBorde = temaResueltoSchema.safeParse({ ...TEMA_NEUTRO, tokens });
    const sinMono = temaResueltoSchema.safeParse({ ...TEMA_NEUTRO, fonts: { body: 'serif' } });

    expect(sinBorde.error?.issues.map((i) => i.path.join('.'))).toEqual(['tokens.border']);
    expect(sinMono.error?.issues.map((i) => i.path.join('.'))).toEqual(['fonts.mono']);
  });

  it('un fontSize que no es px falla', () => {
    const malo = temaResueltoSchema.safeParse({ ...TEMA_NEUTRO, tokens: { ...TEMA_NEUTRO.tokens, fontSize: 'grande' } });

    expect(malo.error?.issues.map((i) => i.path.join('.'))).toEqual(['tokens.fontSize']);
  });

  it('los Temas viejos (nodeStyles, edgeStyles) ya no se aceptan', () => {
    expect(temaResueltoSchema.safeParse({ ...TEMA_NEUTRO, nodeStyles: { servicio: { fill: '#fff' } } }).success).toBe(false);
    expect(temaResueltoSchema.safeParse({ ...TEMA_NEUTRO, edgeStyles: { default: { stroke: 'red' } } }).success).toBe(false);
    expect(() => resolverTema({ ...TEMA_NEUTRO, nodeStyles: {} })).toThrow(/nodeStyles/);
  });

  it('una Capa con una Primitiva o propiedad invalida falla con la ruta de la Capa', () => {
    const capa = (primitiva: unknown) => ({ ...TEMA_NEUTRO, nodo: { capas: [{ nombre: 'c', primitiva }], slots: ['title'] } });

    expect(temaResueltoSchema.safeParse(capa({ tipo: 'rect', props: { radius: 999 } })).success).toBe(false);
    expect(temaResueltoSchema.safeParse(capa({ tipo: 'solid', props: { color: 'inexistente' } })).success).toBe(false);
    expect(temaResueltoSchema.safeParse(capa({ tipo: 'nada', props: {} })).success).toBe(false);
    expect(temaResueltoSchema.safeParse(capa({ tipo: 'solid', props: { color: 'blue' } })).success).toBe(true);
  });
});

describe('catalogo', () => {
  it('rellena los defectos y rechaza sin recortar', () => {
    expect(construirPrimitiva('rect', [], {}).primitiva).toEqual({ tipo: 'rect', props: { radius: 0 } });
    expect(construirPrimitiva('border', [{ clave: 'color', valor: 'a' }], { a: '#000' }).primitiva).toEqual({ tipo: 'border', props: { color: 'a', width: 1 } });
    expect(construirPrimitiva('rect', [{ clave: 'radius', valor: '101' }], {}).errores.map((e) => e.codigo)).toEqual(['E_THEME_INVALID_VALUE']);
    expect(construirPrimitiva('rect', [{ clave: 'radius', valor: 'x' }], {}).primitiva).toBeUndefined();
  });

  it('sugiere el candidato cercano en una Primitiva mal escrita', () => {
    const [error] = construirPrimitiva('sollid', [], {}).errores;

    expect(error).toMatchObject({ codigo: 'E_THEME_UNKNOWN_PRIMITIVE', hint: "quisiste decir 'solid'" });
  });

  it('ninguna Primitiva de esta rebanada afecta a las Metricas', () => {
    expect(Object.values(CATALOGO).map((p) => p.afectaMetricas)).toEqual([false, false, false]);
  });
});

describe('Metricas y colocacion de Slots', () => {
  const metricas = metricasDe(TEMA_NEUTRO);

  it('un Nodo sin Atributos mide la cabecera; con Atributos suma una fila por cada uno', () => {
    const solo = colocarNodo('API', [], metricas);
    const con = colocarNodo('API', [{ name: 'id', type: 'int', notes: '' }, { name: 'nombre', type: 'texto', notes: '' }], metricas);

    expect(solo).toMatchObject({ width: 120, height: metricas.cabecera, filas: [] });
    expect(con.height).toBe(metricas.cabecera + 2 * metricas.fila);
    expect(con.filas).toEqual([
      { x: 0, y: metricas.cabecera, width: con.width, height: metricas.fila },
      { x: 0, y: metricas.cabecera + metricas.fila, width: con.width, height: metricas.fila },
    ]);
  });

  it('el ancho sale del texto mas largo entre los Slots mostrados', () => {
    const largo = 'un titulo bastante largo para forzar el ancho';
    const sinTitulo = { ...metricas, slots: ['attrs'] as const };

    expect(colocarNodo(largo, [], metricas).width).toBeGreaterThan(120);
    expect(colocarNodo(largo, [], sinTitulo).width).toBe(120);
  });

  it('las Metricas no cambian con la pintura del Tema', () => {
    const otro = { ...TEMA_NEUTRO, nodo: { ...TEMA_NEUTRO.nodo, capas: [{ nombre: 'f', primitiva: { tipo: 'solid', props: { color: 'blue' } } }] } };

    expect(estiloResuelto(otro).metricas).toEqual(estiloResuelto(TEMA_NEUTRO).metricas);
    expect(estiloResuelto(otro).pintura).not.toEqual(estiloResuelto(TEMA_NEUTRO).pintura);
    expect(colocarEnCaja(metricas, 1, 200).slots.title).toEqual({ x: 0, y: 0, width: 200, height: metricas.cabecera });
  });
});
