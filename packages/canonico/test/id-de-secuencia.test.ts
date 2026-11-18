import { describe, expect, it } from 'vitest';
import { idDeElementoDeSecuencia, leerIdDeElementoDeSecuencia } from '../src';

describe('id de elementos de secuencia', () => {
  it('arma el id de un Mensaje anidado, una Nota y un Fragmento con el formato `<interaccion>:<ruta>`', () => {
    expect(idDeElementoDeSecuencia('login', '1.0.2')).toBe('login:1.0.2');
    expect(idDeElementoDeSecuencia('login', '3')).toBe('login:3');
  });

  it('arma el id del operando de un Fragmento con `:k`', () => {
    expect(idDeElementoDeSecuencia('login', '1', 0)).toBe('login:1:0');
  });

  it('lee de vuelta lo que arma (Mensaje anidado, Nota, Fragmento y su operando)', () => {
    expect(leerIdDeElementoDeSecuencia('login:1.0.2')).toEqual({ interaccion: 'login', ruta: '1.0.2' });
    expect(leerIdDeElementoDeSecuencia(idDeElementoDeSecuencia('a', '4'))).toEqual({ interaccion: 'a', ruta: '4' });
    expect(leerIdDeElementoDeSecuencia(idDeElementoDeSecuencia('a', '1.0', 2))).toEqual({ interaccion: 'a', ruta: '1.0', operando: 2 });
  });

  it('no lee ids que no son de secuencia', () => {
    expect(leerIdDeElementoDeSecuencia('api')).toBeUndefined();
    expect(leerIdDeElementoDeSecuencia('a -> b')).toBeUndefined();
    expect(leerIdDeElementoDeSecuencia('login:')).toBeUndefined();
    expect(leerIdDeElementoDeSecuencia(':1')).toBeUndefined();
    expect(leerIdDeElementoDeSecuencia('login:x')).toBeUndefined();
  });
});
