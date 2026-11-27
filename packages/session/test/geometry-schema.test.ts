import { describe, expect, it } from 'vitest';

import { cachedGeometrySchema } from 'canonical';
import { openSession } from 'session';

const text = `specification { node servicio }
model {
  servicio cliente
  servicio api
  servicio db
  interaction checkout "Compra" {
    cliente -> api "POST"
    opt "hay stock" {
      api -> db "consulta"
      reply db -> api "filas"
    }
    note over api "nota"
    reply api -> cliente "201"
  }
}
view seq { type sequence
 interaction checkout }
view arq { type architecture
 include * }
`;

describe('session seam: the cached Geometry satisfies the canonical schema', () => {
  for (const view of ['seq', 'arq']) {
    it(`the Geometry of View ${view} validates and loses no fields when read back from JSON`, async () => {
      const session = openSession({ 'main.dg': text });
      const cached = await session.geometry(view);
      const written = JSON.parse(JSON.stringify(cached));
      const read = cachedGeometrySchema.safeParse(written);

      expect(read.success).toBe(true);
      expect(read.data).toEqual(written);
    });
  }
});
