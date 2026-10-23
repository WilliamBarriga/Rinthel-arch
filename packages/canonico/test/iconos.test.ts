import { describe, expect, it } from 'vitest';

import { combineIconProviders, genericIcons, hidratarIconos, resolveNodeTypeIcon, sanearIcono, serializarIconos, workspaceIcons } from 'canonico';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>';

describe('IconProvider: iconos genericos del nucleo', () => {
  it('resuelve una clave generica a SVG inline', () => {
    const icono = genericIcons().resolve('database');

    expect(icono).toMatch(/^<svg\b/);
    expect(icono).toMatch(/<\/svg>$/);
  });

  it('una clave desconocida no se resuelve', () => {
    expect(genericIcons().resolve('aws-lambda')).toBeUndefined();
  });

  it('lista sus claves, para sugerencias', () => {
    expect(genericIcons().keys()).toEqual(expect.arrayContaining(['database', 'server', 'user']));
  });
});

describe('IconProvider: SVG del Workspace', () => {
  it('toma la clave del nombre del archivo .svg, sin carpeta ni extension', () => {
    const iconos = workspaceIcons({ 'iconos/mi-logo.svg': svg, 'main.dg': 'model { }' });

    expect(iconos.resolve('mi-logo')).toBe(svg);
    expect(iconos.keys()).toEqual(['mi-logo']);
  });

  it('ignora archivos que no son .svg', () => {
    expect(workspaceIcons({ 'main.dg': svg }).resolve('main')).toBeUndefined();
  });
});

describe('IconProvider: composicion', () => {
  it('gana el primer proveedor que conoce la clave y el resto sirve de respaldo', () => {
    const propio = workspaceIcons({ 'database.svg': svg });
    const combinado = combineIconProviders(propio, genericIcons());

    expect(combinado.resolve('database')).toBe(svg);
    expect(combinado.resolve('server')).toMatch(/^<svg\b/);
    expect(combinado.resolve('nada')).toBeUndefined();
    expect(combinado.keys()).toEqual(expect.arrayContaining(['database', 'server']));
  });
});

describe('resolveNodeTypeIcon', () => {
  const iconos = combineIconProviders(workspaceIcons({ 'logo.svg': svg }), genericIcons());

  it('resuelve el icono de un Tipo de nodo por el puerto', () => {
    expect(resolveNodeTypeIcon({ name: 'servicio', description: '', icon: 'logo' }, iconos)).toBe(svg);
  });

  it('un Tipo de nodo sin icono, o con clave desconocida, no tiene SVG', () => {
    expect(resolveNodeTypeIcon({ name: 'a', description: '' }, iconos)).toBeUndefined();
    expect(resolveNodeTypeIcon({ name: 'a', description: '', icon: 'x' }, iconos)).toBeUndefined();
  });
});

describe('serializar / hidratar iconos', () => {
  it('ida y vuelta: el proveedor hidratado resuelve lo mismo que el original', () => {
    const original = combineIconProviders(workspaceIcons({ 'iconos/logo.svg': svg }), genericIcons());

    const hidratado = hidratarIconos(JSON.parse(JSON.stringify(serializarIconos(original))));

    expect(hidratado.keys().sort()).toEqual(original.keys().sort());
    expect(hidratado.resolve('logo')).toBe(svg);
    expect(hidratado.resolve('database')).toBe(original.resolve('database'));
    expect(hidratado.resolve('nada')).toBeUndefined();
  });

  it('la serializacion es determinista: claves ordenadas', () => {
    const a = serializarIconos(workspaceIcons({ 'b.svg': svg, 'a.svg': svg }));

    expect(Object.keys(a)).toEqual(['a', 'b']);
  });
});

describe('sanearIcono', () => {
  it('deja un SVG de formas tal cual', () => {
    expect(sanearIcono(svg)).toBe(svg);
  });

  it('quita prologo XML y comentarios', () => {
    expect(sanearIcono(`<?xml version="1.0"?>\n<!-- logo -->\n${svg}`)).toBe(svg);
  });

  it.each([
    ['script', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ['imagen externa', '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://x.test/a.png"/></svg>'],
    ['evento sin espacio', '<svg xmlns="http://www.w3.org/2000/svg"/onload="alert(1)"><circle r="1"/></svg>'],
    ['evento tras comilla', '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"onclick="x()"/></svg>'],
    ['iframe', '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="https://x.test"/></svg>'],
    ['href sin comillas', '<svg xmlns="http://www.w3.org/2000/svg"><use href=https://x.test/a.svg#i /></svg>'],
    ['style', '<svg xmlns="http://www.w3.org/2000/svg"><style>@import "https://x.test/a.css";</style></svg>'],
    ['url() en atributo', '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1" fill="url(https://x.test/g)"/></svg>'],
    ['texto suelto', '<svg xmlns="http://www.w3.org/2000/svg">hola<circle r="1"/></svg>'],
    ['no es un svg', '<circle r="1"/>'],
  ])('rechaza %s', (_, peligroso) => {
    expect(sanearIcono(peligroso)).toBeUndefined();
  });
});
