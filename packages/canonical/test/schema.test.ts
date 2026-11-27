import { describe, expect, it } from 'vitest';

import { canonicalFormSchema } from 'canonical';

/** Minimal valid Model: Node kind catalog and Node hierarchy. */
const validModel = {
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

/** Canonical form with a single Node, to test one field in isolation. */
function sourceWithNode(id: string) {
  return {
    specification: { nodeTypes: [{ name: 'service' }] },
    model: {
      nodes: [{ id, type: 'service', title: 'Titulo', description: '', children: [] }],
    },
  };
}

describe('Canonical form: schema', () => {
  it('accepts a valid Model with a catalog and a Node hierarchy', () => {
    const result = canonicalFormSchema.safeParse(validModel);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.specification.nodeTypes.map((t) => t.name)).toEqual([
      'service',
      'group',
    ]);
    expect(result.data.specification.nodeTypes[1]).toEqual({
      name: 'group',
      description: '',
      color: 'muted',
    });
    expect(result.data.model.nodes).toHaveLength(1);

    const api = result.data.model.nodes[0]!;
    expect(api.id).toBe('api');
    expect(api.title).toBe('API');
    expect(api.children.map((child) => child.id)).toEqual(['api.auth', 'api.db']);
    expect(api.children[0]!.type).toBe('service');
  });

  it('rejects malformed ids and points at the id field', () => {
    const malformedIds = ['', 'my node.child', 'a..b', 'api.', '.api', 'api..'];

    for (const id of malformedIds) {
      const result = canonicalFormSchema.safeParse(sourceWithNode(id));

      expect(result.success, `invalid id: ${JSON.stringify(id)}`).toBe(false);
      if (result.success) continue;
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'model.nodes.0.id',
      );
    }
  });

  it('rejects a child whose parent does not exist in the Model', () => {
    const types = { specification: { nodeTypes: [{ name: 'service' }] } };

    const rootOrphans = {
      ...types,
      model: {
        nodes: [{ id: 'x.y', type: 'service', title: 'Y', description: '', children: [] }],
      },
    };
    const firstResult = canonicalFormSchema.safeParse(rootOrphans);
    expect(firstResult.success).toBe(false);
    if (!firstResult.success) {
      expect(firstResult.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'model.nodes.0',
      );
    }

    const orphanChild = {
      ...types,
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
    const secondResult = canonicalFormSchema.safeParse(orphanChild);
    expect(secondResult.success).toBe(false);
    if (!secondResult.success) {
      expect(secondResult.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'model.nodes.0.children.0',
      );
    }
  });

  it('rejects a Node nested under a container other than its hierarchical parent', () => {
    const result = canonicalFormSchema.safeParse({
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

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'model.nodes.1.children.0',
      );
    }
  });

  it('rejects a Node kind that is not declared in the catalog', () => {
    const catalog = { specification: { nodeTypes: [{ name: 'service' }] } };

    const undeclared = {
      ...catalog,
      model: {
        nodes: [{ id: 'api', type: 'servce', title: 'API', description: '', children: [] }],
      },
    };
    const firstResult = canonicalFormSchema.safeParse(undeclared);
    expect(firstResult.success).toBe(false);
    if (!firstResult.success) {
      expect(firstResult.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'model.nodes.0.type',
      );
    }

    const undeclaredChild = {
      ...catalog,
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
    const secondResult = canonicalFormSchema.safeParse(undeclaredChild);
    expect(secondResult.success).toBe(false);
    if (!secondResult.success) {
      expect(secondResult.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'model.nodes.0.children.0.type',
      );
    }
  });

  it('accepts a flat document when the ids define the hierarchy', () => {
    const result = canonicalFormSchema.safeParse({
      specification: { nodeTypes: [{ name: 'service' }] },
      model: {
        nodes: [
          { id: 'x', type: 'service', title: 'X', description: '', children: [] },
          { id: 'x.y', type: 'service', title: 'Y', description: '', children: [] },
        ],
      },
    });

    expect(result.success).toBe(true);
  });
});

describe('Canonical form: Edges and Attributes', () => {
  const base = (model: object) => ({
    specification: { nodeTypes: [{ name: 'tabla' }] },
    model,
  });
  const node = (id: string, attributes: object[] = []) => ({ id, type: 'tabla', title: id, attributes });

  it('accepts Edges with Node and Node#Attribute ends and cardinality', () => {
    const result = canonicalFormSchema.safeParse(
      base({
        nodes: [node('a', [{ name: 'id', type: 'uuid' }]), node('b')],
        edges: [{ from: { node: 'b' }, to: { node: 'a', attribute: 'id' }, toCardinality: '1' }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects an Edge whose end does not exist, pointing at that end', () => {
    const result = canonicalFormSchema.safeParse(
      base({ nodes: [node('a')], edges: [{ from: { node: 'a' }, to: { node: 'nada' } }] }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['model', 'edges', 0, 'to', 'node']);
  });

  it('rejects an Edge to an Attribute the Node does not have', () => {
    const result = canonicalFormSchema.safeParse(
      base({
        nodes: [node('a'), node('b')],
        edges: [{ from: { node: 'a' }, to: { node: 'b', attribute: 'x' } }],
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['model', 'edges', 0, 'to', 'attribute']);
  });
});
