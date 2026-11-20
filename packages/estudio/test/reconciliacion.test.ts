import { Text } from '@codemirror/state';
import type { ChangeSet } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { diferenciaMinima, fusionarTresVias } from '../navegador/editor/reconciliacion';

const aplicar = (cambios: ChangeSet, texto: string): string => cambios.apply(Text.of(texto.split('\n'))).toString();
const tramos = (cambios: ChangeSet): { desde: number; hasta: number; inserta: string }[] => {
  const salida: { desde: number; hasta: number; inserta: string }[] = [];
  cambios.iterChanges((desde, hasta, _b, _hb, inserta) => salida.push({ desde, hasta, inserta: inserta.toString() }));
  return salida;
};

const BASE = ['model {', '  servicio api "API"', '  servicio db "Base"', '  servicio cola "Cola"', '  api -> db', '}', ''].join('\n');

describe('diferencia minima', () => {
  it('sin cambios no hay tramos', () => {
    expect(diferenciaMinima(BASE, BASE).empty).toBe(true);
  });

  it('un cambio dentro de una linea toca solo los caracteres distintos', () => {
    const despues = BASE.replace('"Base"', '"Base de datos"');
    const cambios = diferenciaMinima(BASE, despues);
    const desde = BASE.indexOf('"Base"') + '"Base'.length;
    expect(tramos(cambios)).toEqual([{ desde, hasta: desde, inserta: ' de datos' }]);
    expect(aplicar(cambios, BASE)).toBe(despues);
  });

  it('dos cambios lejanos son dos tramos y lo de en medio no se toca', () => {
    const despues = BASE.replace('model {', 'model  {').replace('api -> db', 'api -> cola');
    expect(tramos(diferenciaMinima(BASE, despues))).toHaveLength(2);
    expect(aplicar(diferenciaMinima(BASE, despues), BASE)).toBe(despues);
  });

  it('reproduce el destino con lineas agregadas, borradas y sin salto final', () => {
    const casos: [string, string][] = [
      ['x', 'x\ny'],
      ['x\ny', 'x'],
      ['', 'hola\n'],
      ['a\nb\nc\n', 'c\nb\na\n'],
      [BASE, BASE.replace('  servicio cola "Cola"\n', '').replace('}', '  db -> api\n}')],
    ];
    for (const [antes, despues] of casos) expect(aplicar(diferenciaMinima(antes, despues), antes)).toBe(despues);
  });

  it('reproduce el destino en textos de lineas al azar (semilla fija)', () => {
    let semilla = 7;
    const azar = (n: number): number => {
      semilla = (semilla * 1103515245 + 12345) % 2147483648;
      return semilla % n;
    };
    const texto = (): string => Array.from({ length: azar(12) }, () => 'abc'[azar(3)] as string).join('\n');
    for (let i = 0; i < 300; i++) {
      const antes = texto();
      const despues = texto();
      expect(aplicar(diferenciaMinima(antes, despues), antes)).toBe(despues);
    }
  });
});

describe('merge de 3 vias (base, disco, buffer)', () => {
  it('sin solape une los dos lados: el buffer recibe solo lo del disco y las teclas pendientes se rebasan sobre el disco', () => {
    const disco = BASE.replace('"API"', '"API publica"');
    const buffer = BASE.replace('api -> db', 'api -> db "lee"');
    const unido = BASE.replace('"API"', '"API publica"').replace('api -> db', 'api -> db "lee"');
    const f = fusionarTresVias(BASE, disco, buffer);
    expect(f.texto).toBe(unido);
    expect(aplicar(f.alBuffer, buffer)).toBe(unido);
    expect(tramos(f.alBuffer)).toEqual([{ desde: buffer.indexOf('"API') + 4, hasta: buffer.indexOf('"API') + 4, inserta: ' publica' }]);
    expect(aplicar(f.pendiente, disco)).toBe(unido);
    expect(tramos(f.pendiente)).toEqual([{ desde: disco.indexOf('api -> db') + 9, hasta: disco.indexOf('api -> db') + 9, inserta: ' "lee"' }]);
    expect(f.perdidos).toEqual([]);
  });

  it('si solapan gana el disco y el fragmento del buffer queda para recuperarlo, con su linea en el resultado', () => {
    const disco = BASE.replace('"Base"', '"Postgres"');
    const buffer = BASE.replace('"Base"', '"MySQL"').replace('model {', 'model  {');
    const f = fusionarTresVias(BASE, disco, buffer);
    expect(f.texto).toBe(disco.replace('model {', 'model  {'));
    expect(aplicar(f.alBuffer, buffer)).toBe(f.texto);
    expect(aplicar(f.pendiente, disco)).toBe(f.texto);
    expect(f.perdidos).toEqual([{ texto: '  servicio db "MySQL"', linea: 3, reemplaza: 1 }]);
  });

  it('dos cambios en la misma linea solapan aunque no pisen los mismos caracteres', () => {
    const disco = BASE.replace('"Base"', '"Bases"');
    const buffer = BASE.replace('servicio db', 'servicio datos');
    const f = fusionarTresVias(BASE, disco, buffer);
    expect(f.texto).toBe(disco);
    expect(f.perdidos).toEqual([{ texto: '  servicio datos "Base"', linea: 3, reemplaza: 1 }]);
  });

  it('dos inserciones en el mismo punto solapan', () => {
    const disco = BASE.replace('}\n', '  db -> cola\n}\n');
    const buffer = BASE.replace('}\n', '  cola -> api\n}\n');
    const f = fusionarTresVias(BASE, disco, buffer);
    expect(f.texto).toBe(disco);
    expect(f.pendiente.empty).toBe(true);
    expect(f.perdidos).toEqual([{ texto: '  cola -> api', linea: 6, reemplaza: 0 }]);
  });

  it('con el disco igual a la base el buffer queda intacto y todo sigue pendiente', () => {
    const buffer = BASE.replace('api -> db', 'api -> cola');
    const f = fusionarTresVias(BASE, BASE, buffer);
    expect(f.texto).toBe(buffer);
    expect(f.alBuffer.empty).toBe(true);
    expect(aplicar(f.pendiente, BASE)).toBe(buffer);
  });

  it('con el buffer limpio el resultado es el disco y no queda nada pendiente', () => {
    const disco = BASE.replace('api -> db', 'db -> api');
    const f = fusionarTresVias(BASE, disco, BASE);
    expect(f.texto).toBe(disco);
    expect(f.pendiente.empty).toBe(true);
    expect(aplicar(f.alBuffer, BASE)).toBe(disco);
  });
});
