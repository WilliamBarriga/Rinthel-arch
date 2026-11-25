import { describe, expect, it } from 'vitest';

import type { FuenteCanonica } from 'canonico';
import { abrirSesion } from 'sesion';

import { aHashDeEstudio, deHashDeEstudio, hashDeEstudio } from '../navegador/lienzo/hash-de-estudio';
import { indiceDeVistas } from '../navegador/vistas/indice';
import { crearLectorSse } from '../src/sse';

const DSL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  api -> db
  interaction login "Login" {
    api -> db "consulta"
  }
}

view mapa {
  type architecture
  include **
  link api -> detalle
}

view detalle {
  type flow
  include api
}

view flujo {
  type sequence
  interaction login
}

view otra {
  type architecture
  include db
  link db -> mapa
}
`;

const fuente = (): FuenteCanonica => {
  const sesion = abrirSesion({ 'main.dg': DSL });
  if (sesion.fuente === undefined) throw new Error('la Fuente de prueba no compila');
  return sesion.fuente;
};

describe('indice de Vistas', () => {
  it('agrupa por Tipo de diagrama en orden fijo y conserva el orden de declaracion dentro de cada grupo', () => {
    const indice = indiceDeVistas(fuente());

    expect(indice.map((g) => [g.tipo, g.vistas.map((v) => v.id)])).toEqual([
      ['architecture', ['mapa', 'otra']],
      ['flow', ['detalle']],
      ['sequence', ['flujo']],
    ]);
  });

  it('cada Vista lleva sus Enlaces salientes y entrantes', () => {
    const porId = Object.fromEntries(indiceDeVistas(fuente()).flatMap((g) => g.vistas).map((v) => [v.id, v]));

    expect(porId['mapa']).toMatchObject({ enlaces: ['detalle'], entrantes: ['otra'] });
    expect(porId['detalle']).toMatchObject({ enlaces: [], entrantes: ['mapa'] });
    expect(porId['flujo']).toMatchObject({ enlaces: [], entrantes: [] });
  });
});

describe('hash de la UI (#view=<id>)', () => {
  it('traduce la ruta del shell (p) a view y de vuelta, sin tocar el resto', () => {
    expect(aHashDeEstudio('p=a&p=b&s=api')).toBe('view=a&view=b&s=api');
    expect(deHashDeEstudio('#view=a&s=api')).toBe('p=a&s=api');
    expect(deHashDeEstudio('')).toBe('');
  });

  it('envuelve un adaptador: lee y escribe con view=', () => {
    let texto = '#view=detalle';
    const escritos: string[] = [];
    const adaptador = hashDeEstudio({
      leer: () => texto,
      escribir: (h) => {
        escritos.push(h);
        texto = `#${h}`;
      },
      suscribir: () => () => undefined,
    });

    expect(adaptador.leer()).toBe('p=detalle');
    adaptador.escribir('p=flujo&t=1', { reemplazar: false });
    expect(escritos).toEqual(['view=flujo&t=1']);
  });
});

describe('lector de eventos SSE', () => {
  it('separa eventos con nombre, junta lineas data y guarda el trozo incompleto', () => {
    const recibidos: Array<[string, string]> = [];
    const leer = crearLectorSse((nombre, datos) => recibidos.push([nombre, datos]));

    leer('event: estado\ndata: {"a":1}\n\n: comentario\n\nevent: actividad\r\ndata: uno\r\ndata: dos\r\n\r\nevent: histo');
    expect(recibidos).toEqual([
      ['estado', '{"a":1}'],
      ['actividad', 'uno\ndos'],
    ]);
    leer('rial\ndata: []\n\ndata: sin nombre\n\n');
    expect(recibidos.slice(2)).toEqual([
      ['historial', '[]'],
      ['message', 'sin nombre'],
    ]);
  });
});
