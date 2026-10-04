import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema } from 'canonico';

/** Modelo valido minimo: catalogo de Tipos de nodo y jerarquia de Nodos. */
const modeloValido = {
  specification: {
    nodeTypes: [
      {
        name: 'service',
        description: 'Unidad de despliegue',
        icon: 'generic-service',
        style: 'rounded',
        color: 'blue',
      },
      { name: 'group', color: 'muted' },
    ],
  },
  model: {
    nodes: [
      {
        id: 'api',
        type: 'service',
        title: 'API',
        description: 'Puerta de entrada',
        children: [
          { id: 'api.auth', type: 'service', title: 'Auth', description: '', children: [] },
          { id: 'api.db', type: 'service', title: 'DB', description: '', children: [] },
        ],
      },
    ],
  },
};

/** Fuente canonica con un unico Nodo, para probar un campo aislado. */
function fuenteConNodo(id: string) {
  return {
    specification: { nodeTypes: [{ name: 'service' }] },
    model: {
      nodes: [{ id, type: 'service', title: 'Titulo', description: '', children: [] }],
    },
  };
}

describe('fuente canonica: esquema', () => {
  it('acepta un Modelo valido con catalogo y jerarquia de Nodos', () => {
    const resultado = fuenteCanonicaSchema.safeParse(modeloValido);

    expect(resultado.success).toBe(true);
    if (!resultado.success) return;

    expect(resultado.data.specification.nodeTypes.map((t) => t.name)).toEqual([
      'service',
      'group',
    ]);
    expect(resultado.data.specification.nodeTypes[1]).toEqual({
      name: 'group',
      description: '',
      color: 'muted',
    });
    expect(resultado.data.model.nodes).toHaveLength(1);

    const api = resultado.data.model.nodes[0]!;
    expect(api.id).toBe('api');
    expect(api.title).toBe('API');
    expect(api.children.map((hijo) => hijo.id)).toEqual(['api.auth', 'api.db']);
    expect(api.children[0]!.type).toBe('service');
  });

  it('rechaza ids mal formados y apunta al campo id', () => {
    const idsMalFormados = ['', 'my node.child', 'a..b', 'api.', '.api', 'api..'];

    for (const id of idsMalFormados) {
      const resultado = fuenteCanonicaSchema.safeParse(fuenteConNodo(id));

      expect(resultado.success, `id invalido: ${JSON.stringify(id)}`).toBe(false);
      if (resultado.success) continue;
      expect(resultado.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'model.nodes.0.id',
      );
    }
  });

  it('rechaza un hijo cuyo padre no existe en el Modelo', () => {
    const tipos = { specification: { nodeTypes: [{ name: 'service' }] } };

    const sinPadreEnLaRaiz = {
      ...tipos,
      model: {
        nodes: [{ id: 'x.y', type: 'service', title: 'Y', description: '', children: [] }],
      },
    };
    const primerResultado = fuenteCanonicaSchema.safeParse(sinPadreEnLaRaiz);
    expect(primerResultado.success).toBe(false);
    if (!primerResultado.success) {
      expect(primerResultado.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'model.nodes.0',
      );
    }

    const hijoSinPadre = {
      ...tipos,
      model: {
        nodes: [
          {
            id: 'api',
            type: 'service',
            title: 'API',
            description: '',
            children: [{ id: 'db.pool', type: 'service', title: 'Pool', children: [] }],
          },
        ],
      },
    };
    const segundoResultado = fuenteCanonicaSchema.safeParse(hijoSinPadre);
    expect(segundoResultado.success).toBe(false);
    if (!segundoResultado.success) {
      expect(segundoResultado.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'model.nodes.0.children.0',
      );
    }
  });

  it('rechaza un Nodo anidado bajo un contenedor distinto de su padre jerarquico', () => {
    const resultado = fuenteCanonicaSchema.safeParse({
      specification: { nodeTypes: [{ name: 'service' }] },
      model: {
        nodes: [
          { id: 'x', type: 'service', title: 'X', description: '', children: [] },
          {
            id: 'a',
            type: 'service',
            title: 'A',
            description: '',
            children: [{ id: 'x.y', type: 'service', title: 'Y', children: [] }],
          },
        ],
      },
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'model.nodes.1.children.0',
      );
    }
  });

  it('rechaza un Tipo de nodo que no esta declarado en el catalogo', () => {
    const catalogo = { specification: { nodeTypes: [{ name: 'service' }] } };

    const sinDeclarar = {
      ...catalogo,
      model: {
        nodes: [{ id: 'api', type: 'servce', title: 'API', description: '', children: [] }],
      },
    };
    const primerResultado = fuenteCanonicaSchema.safeParse(sinDeclarar);
    expect(primerResultado.success).toBe(false);
    if (!primerResultado.success) {
      expect(primerResultado.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'model.nodes.0.type',
      );
    }

    const hijoSinDeclarar = {
      ...catalogo,
      model: {
        nodes: [
          {
            id: 'api',
            type: 'service',
            title: 'API',
            description: '',
            children: [
              { id: 'api.auth', type: 'actor', title: 'Auth', description: '', children: [] },
            ],
          },
        ],
      },
    };
    const segundoResultado = fuenteCanonicaSchema.safeParse(hijoSinDeclarar);
    expect(segundoResultado.success).toBe(false);
    if (!segundoResultado.success) {
      expect(segundoResultado.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'model.nodes.0.children.0.type',
      );
    }
  });

  it('acepta un documento plano si los ids definen la jerarquia', () => {
    const resultado = fuenteCanonicaSchema.safeParse({
      specification: { nodeTypes: [{ name: 'service' }] },
      model: {
        nodes: [
          { id: 'x', type: 'service', title: 'X', description: '', children: [] },
          { id: 'x.y', type: 'service', title: 'Y', description: '', children: [] },
        ],
      },
    });

    expect(resultado.success).toBe(true);
  });
});
