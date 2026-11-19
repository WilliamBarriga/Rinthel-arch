import { describe, expect, it } from 'vitest';

import { estadoDeDevSchema } from '../src/protocolo';
import type { EstadoDeDev, IssueDeDev } from '../src/protocolo';

describe('estadoDeDevSchema (evento estado de dev)', () => {
  it('valida un estado sin Fuente (Workspace con errores desde el inicio)', () => {
    const issue: IssueDeDev = { file: 'main.dg', line: 1, column: 1, severity: 'error', code: 'E_X', message: 'm', href: 'vscode://file/x' };
    const estado: EstadoDeDev = { version: 1, iconos: {}, vistas: [], cambio: 'estructura', issues: [issue] };
    expect(estadoDeDevSchema.parse(estado)).toMatchObject({ version: 1, cambio: 'estructura' });
  });

  it('rechaza un estado sin version o con un cambio desconocido', () => {
    expect(estadoDeDevSchema.safeParse({ iconos: {}, vistas: [], issues: [] }).success).toBe(false);
    expect(estadoDeDevSchema.safeParse({ version: 1, cambio: 'otro', iconos: {}, vistas: [], issues: [] }).success).toBe(false);
  });

  it('rechaza un issue sin enlace al editor', () => {
    const sinHref = { file: 'main.dg', line: 1, column: 1, severity: 'error', code: 'E_X', message: 'm' };
    expect(estadoDeDevSchema.safeParse({ version: 1, iconos: {}, vistas: [], issues: [sinHref] }).success).toBe(false);
  });
});
