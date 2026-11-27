import { describe, expect, it } from 'vitest';

import { openSession } from 'session';

const model = `specification { node servicio { color rojo } }
model {
  servicio api { attrs { id: int } }
  servicio db
  api -> db
}
`;

const view = `view v {
  type architecture
  include **
  theme t
}
`;

const LAYERS = `    layer forma rect { radius 8 }
    layer relleno solid { color papel }
    slots { title attrs }`;

const theme = (extra: string) => `theme t {
  palette { rojo "#dc2626"  papel "#fefce8" }
  node {
${LAYERS}
${extra}
  }
}
`;

const WITH_CODE = '    layer aura code over { component Aurora  hue 3 }';
const workspace = (extra: string) => ({ 'main.dg': model + theme(extra) + view });

describe('session seam: code Layer', () => {
  it('a code Layer compiles and reaches the Resolved style with the component and its parameters', async () => {
    const session = openSession(workspace(WITH_CODE));

    expect((await session.diagnose()).filter((x) => x.severity === 'error')).toEqual([]);
    const layer = session.style('v')!.pintura.nodo.capas.find((c) => c.nombre === 'aura');
    expect(layer).toEqual({ nombre: 'aura', tipo: 'code', props: { component: 'Aurora', hue: 3 }, encima: true });
  });

  it('a code Layer changes neither the box size nor the Metrics', async () => {
    const without = openSession(workspace(''));
    const withCode = openSession(workspace(WITH_CODE));

    expect(withCode.style('v')!.metricas).toEqual(without.style('v')!.metricas);
    const [a, b] = await Promise.all([without.geometry('v'), withCode.geometry('v')]);
    expect(b!.geometry.nodes).toEqual(a!.geometry.nodes);
    expect(b!.layoutKey).toBe(a!.layoutKey);
  });

  it('a Theme with code emits a warning and one without code does not', async () => {
    const withCode = await openSession(workspace(WITH_CODE)).diagnose();
    const without = await openSession(workspace('')).diagnose();

    expect(withCode.filter((i) => i.code === 'theme-with-code')).toEqual([
      expect.objectContaining({ severity: 'warning', file: 'main.dg', message: expect.stringContaining('Aurora') }),
    ]);
    expect(without.filter((i) => i.code === 'theme-with-code')).toEqual([]);
  });

  it('with the component registry, a missing one is an error', async () => {
    const session = openSession(workspace(WITH_CODE), { components: {} });

    const issues = await session.diagnose();
    expect(issues.filter((i) => i.code === 'theme-component-missing')).toEqual([
      expect.objectContaining({ severity: 'error', message: expect.stringContaining('Aurora') }),
    ]);
  });

  it('with the registry, a parameter the component does not declare or of another type is an error', async () => {
    const unknown = await openSession(workspace(WITH_CODE), { components: { Aurora: { params: { brillo: 'numero' } } } }).diagnose();
    const wrongType = await openSession(workspace(WITH_CODE), { components: { Aurora: { params: { hue: 'texto' } } } }).diagnose();
    const valid = await openSession(workspace(WITH_CODE), { components: { Aurora: { params: { hue: 'numero' } } } }).diagnose();

    expect(unknown.filter((i) => i.code === 'theme-component-params')).toHaveLength(1);
    expect(wrongType.filter((i) => i.code === 'theme-component-params')).toHaveLength(1);
    expect(valid.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('a registry entry without declared parameters accepts any parameter', async () => {
    const issues = await openSession(workspace(WITH_CODE), { components: { Aurora: {} } }).diagnose();
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('a state patch can change the parameters of the code Layer', async () => {
    const extra = `${WITH_CODE}
    state hover { layer aura { hue 9 } }`;
    const session = openSession(workspace(extra));

    expect((await session.diagnose()).filter((i) => i.severity === 'error')).toEqual([]);
    const hover = session.style('v')!.pintura.nodo.estados.hover!.find((c) => c.nombre === 'aura');
    expect(hover!.props).toEqual({ component: 'Aurora', hue: 9 });
  });
});
