import { describe, expect, it } from 'vitest';

import type { ActivityEvent, CanonicalForm } from 'canonical';
import { openSession } from 'session';

import { activityEvent } from '../src/contract';
import { targetOfGoal, eventMark, eventSummary } from '../browser/agent/activity';

const DSL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  servicio cache "Cache"
  api -> db
}

view mapa {
  type architecture
  include api, db
}

view datos {
  type architecture
  include db, cache
}

view solo-cache {
  type architecture
  include cache
}
`;

const source = openSession({ 'main.dg': DSL }).source as CanonicalForm;

const event = (extra: Partial<ActivityEvent> = {}): ActivityEvent => activityEvent(7, { args: [], ...extra });

describe('follow the agent: target of a goal', () => {
  it('target.view goes to that View; if it also names a Node it contains, it selects it', () => {
    expect(targetOfGoal({ view: 'datos' }, source, 'mapa')).toEqual({ view: 'datos' });
    expect(targetOfGoal({ view: 'datos', node: 'cache' }, source, 'mapa')).toEqual({ view: 'datos', selection: 'cache' });
    expect(targetOfGoal({ view: 'nada' }, source, 'mapa')).toBeUndefined();
  });

  it('target.node stays on the active View if it contains it; otherwise it goes to the first View that does', () => {
    expect(targetOfGoal({ node: 'db' }, source, 'datos')).toEqual({ view: 'datos', selection: 'db' });
    expect(targetOfGoal({ node: 'cache' }, source, 'mapa')).toEqual({ view: 'datos', selection: 'cache' });
    expect(targetOfGoal({ node: 'nada' }, source, 'mapa')).toBeUndefined();
  });

  it('files (or an empty target) do not move', () => {
    expect(targetOfGoal({ files: ['main.dg'] }, source, 'mapa')).toBeUndefined();
    expect(targetOfGoal(undefined, source, 'mapa')).toBeUndefined();
  });
});

describe('feed line', () => {
  it('marks ok, errors, warnings or usage failure', () => {
    expect(eventMark(event())).toEqual({ kind: 'ok', text: 'ok' });
    expect(eventMark(event({ command: 'validate', exitCode: 1, summary: { errors: 3, warnings: 1 } }))).toEqual({ kind: 'errores', text: '3 errors' });
    expect(eventMark(event({ exitCode: 1 }))).toEqual({ kind: 'errores', text: 'error' });
    expect(eventMark(event({ command: 'build', summary: { errors: 0, warnings: 1 } }))).toEqual({ kind: 'avisos', text: '1 warning' });
    expect(eventMark(event({ exitCode: 2 }))).toEqual({ kind: 'fallo', text: 'usage failure' });
  });

  it('summarizes who, command and target in one line', () => {
    expect(eventSummary(event({ agent: 'claude', target: { view: 'mapa', node: 'api' } }))).toBe('claude edit mapa api');
    expect(eventSummary(event({ command: 'validate' }))).toBe('pid 7 validate');
    expect(eventSummary(event({ target: { files: ['a.dg', 'b.dg'] } }))).toBe('pid 7 edit a.dg, b.dg');
  });
});
