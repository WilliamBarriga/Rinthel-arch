import { describe, expect, it } from 'vitest';

import { resolveView } from 'canonical';
import type { SequenceView } from 'canonical';
import { openSession } from 'session';

const model = `specification { node servicio }
model {
  servicio cliente
  servicio api
  servicio db
  interaction checkout "Compra" {
    pedido: cliente -> api "POST"
    api -> db "consulta"
    reply db -> api "filas"
    final: reply api -> cliente "201"
  }
}
`;
const view = (body: string, extra = '') => `${model}view v { type sequence\n interaction checkout\n${extra}\n${body}\n}\n`;
const codes = async (text: string) => (await openSession({ 'main.dg': text }).diagnose()).map((i) => i.code);

describe('session seam: sequence Steps', () => {
  it('a well-formed, increasing upto compiles without issues', async () => {
    const text = view('steps { step "a" { upto pedido }\n step "b" { upto final } }');
    expect(await codes(text)).toEqual([]);
  });

  it('unknown-step with a typo fix in upto', async () => {
    const res = await openSession({ 'main.dg': view('steps { step "a" { upto pedidoo } }') }).diagnose();
    expect(res.map((i) => i.code)).toEqual(['unknown-step']);
    expect(res[0]!.fix?.replacement).toBe('pedido');
  });

  it('step-not-projected with a hint if an exclude removes the Message', async () => {
    const res = await openSession({ 'main.dg': view('steps { step "a" { upto pedido } }', ' exclude cliente') }).diagnose();
    expect(res.map((i) => i.code)).toEqual(['step-not-projected']);
    expect(res[0]!.hint).toBeTruthy();
  });

  it('step-not-advancing with related pointing at the previous Step', async () => {
    const res = await openSession({ 'main.dg': view('steps { step "a" { upto final }\n step "b" { upto pedido } }') }).diagnose();
    expect(res.map((i) => i.code)).toEqual(['step-not-advancing']);
    expect(res[0]!.related).toHaveLength(1);
    expect(res[0]!.related![0]!.line).toBeLessThan(res[0]!.line);
  });

  it('step-not-advancing if it repeats the same Message', async () => {
    expect(await codes(view('steps { step "a" { upto pedido }\n step "b" { upto pedido } }'))).toEqual(['step-not-advancing']);
  });

  it('steps-each-with-step', async () => {
    expect(await codes(view('steps each\n steps { step "a" { upto pedido } }'))).toEqual(['steps-each-with-step']);
  });

  it('steps each alone compiles without issues', async () => {
    expect(await codes(view('steps each'))).toEqual([]);
  });

  it('show and hide in sequence: view-property-for-type with a hint to step { upto }', async () => {
    const res = await openSession({ 'main.dg': view('steps { step "a" { show cliente\n hide api } }') }).diagnose();
    expect(res.map((i) => i.code)).toEqual(['view-property-for-type', 'view-property-for-type']);
    expect(res[0]!.hint).toContain('upto');
  });

  it('upto and steps each outside sequence: view-property-for-type', async () => {
    const architecture = `specification { node servicio }\nmodel { servicio a }\n`;
    expect(await codes(`${architecture}view v { type architecture\n include **\n steps { step "a" { upto x } } }\n`)).toEqual(['view-property-for-type']);
    expect(await codes(`${architecture}view v { type architecture\n include **\n steps each }\n`)).toEqual(['view-property-for-type']);
  });

  it('steps each with exclude gives one Step per projected Message, titled with the label or from -> to', async () => {
    const text = `${model.replace('    api -> db "consulta"', '    api -> db')}view v { type sequence\n interaction checkout\n exclude cliente\n steps each\n}\n`;
    const session = openSession({ 'main.dg': text });
    expect(await session.diagnose()).toEqual([]);
    const resolved = resolveView(session.source!, 'v') as SequenceView;
    expect(resolved.steps.map((p) => p.title)).toEqual(['api -> db', 'filas']);
    expect(resolved.steps.map((p) => p.cut)).toEqual(resolved.interaction.messages.map((m) => m.path));
  });
});
