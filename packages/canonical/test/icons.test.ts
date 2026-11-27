import { describe, expect, it } from 'vitest';

import { combineIconProviders, genericIcons, hydrateIcons, resolveNodeTypeIcon, sanitizeIcon, serializeIcons, workspaceIcons } from 'canonical';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>';

describe('IconProvider: generic core icons', () => {
  it('resolves a generic key to inline SVG', () => {
    const icon = genericIcons().resolve('database');

    expect(icon).toMatch(/^<svg\b/);
    expect(icon).toMatch(/<\/svg>$/);
  });

  it('an unknown key does not resolve', () => {
    expect(genericIcons().resolve('aws-lambda')).toBeUndefined();
  });

  it('lists its keys, for suggestions', () => {
    expect(genericIcons().keys()).toEqual(expect.arrayContaining(['database', 'server', 'user']));
  });
});

describe('IconProvider: Workspace SVGs', () => {
  it('takes the key from the .svg file name, without folder or extension', () => {
    const icons = workspaceIcons({ 'iconos/mi-logo.svg': svg, 'main.dg': 'model { }' });

    expect(icons.resolve('mi-logo')).toBe(svg);
    expect(icons.keys()).toEqual(['mi-logo']);
  });

  it('ignores files that are not .svg', () => {
    expect(workspaceIcons({ 'main.dg': svg }).resolve('main')).toBeUndefined();
  });
});

describe('IconProvider: composition', () => {
  it('the first provider that knows the key wins and the rest act as fallback', () => {
    const own = workspaceIcons({ 'database.svg': svg });
    const combined = combineIconProviders(own, genericIcons());

    expect(combined.resolve('database')).toBe(svg);
    expect(combined.resolve('server')).toMatch(/^<svg\b/);
    expect(combined.resolve('nada')).toBeUndefined();
    expect(combined.keys()).toEqual(expect.arrayContaining(['database', 'server']));
  });
});

describe('resolveNodeTypeIcon', () => {
  const icons = combineIconProviders(workspaceIcons({ 'logo.svg': svg }), genericIcons());

  it('resolves the icon of a Node kind through the port', () => {
    expect(resolveNodeTypeIcon({ name: 'servicio', description: '', icon: 'logo' }, icons)).toBe(svg);
  });

  it('a Node kind without an icon, or with an unknown key, has no SVG', () => {
    expect(resolveNodeTypeIcon({ name: 'a', description: '' }, icons)).toBeUndefined();
    expect(resolveNodeTypeIcon({ name: 'a', description: '', icon: 'x' }, icons)).toBeUndefined();
  });
});

describe('serialize / hydrate icons', () => {
  it('round trip: the hydrated provider resolves the same as the original', () => {
    const original = combineIconProviders(workspaceIcons({ 'iconos/logo.svg': svg }), genericIcons());

    const hydrated = hydrateIcons(JSON.parse(JSON.stringify(serializeIcons(original))));

    expect(hydrated.keys().sort()).toEqual(original.keys().sort());
    expect(hydrated.resolve('logo')).toBe(svg);
    expect(hydrated.resolve('database')).toBe(original.resolve('database'));
    expect(hydrated.resolve('nada')).toBeUndefined();
  });

  it('serialization is deterministic: sorted keys', () => {
    const a = serializeIcons(workspaceIcons({ 'b.svg': svg, 'a.svg': svg }));

    expect(Object.keys(a)).toEqual(['a', 'b']);
  });
});

describe('sanitizeIcon', () => {
  it('leaves a shapes-only SVG as is', () => {
    expect(sanitizeIcon(svg)).toBe(svg);
  });

  it('strips the XML prolog and comments', () => {
    expect(sanitizeIcon(`<?xml version="1.0"?>\n<!-- logo -->\n${svg}`)).toBe(svg);
  });

  it.each([
    ['script', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ['external image', '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://x.test/a.png"/></svg>'],
    ['event without space', '<svg xmlns="http://www.w3.org/2000/svg"/onload="alert(1)"><circle r="1"/></svg>'],
    ['event after quote', '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"onclick="x()"/></svg>'],
    ['iframe', '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="https://x.test"/></svg>'],
    ['unquoted href', '<svg xmlns="http://www.w3.org/2000/svg"><use href=https://x.test/a.svg#i /></svg>'],
    ['style', '<svg xmlns="http://www.w3.org/2000/svg"><style>@import "https://x.test/a.css";</style></svg>'],
    ['url() in attribute', '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1" fill="url(https://x.test/g)"/></svg>'],
    ['loose text', '<svg xmlns="http://www.w3.org/2000/svg">hola<circle r="1"/></svg>'],
    ['not an svg', '<circle r="1"/>'],
  ])('rejects %s', (_, dangerous) => {
    expect(sanitizeIcon(dangerous)).toBeUndefined();
  });
});
