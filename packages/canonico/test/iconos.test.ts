import { describe, expect, it } from 'vitest';

import { combineIconProviders, genericIcons, resolveNodeTypeIcon, workspaceIcons } from 'canonico';

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
