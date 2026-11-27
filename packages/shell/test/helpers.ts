import { fireEvent } from '@testing-library/react';

import { ayudasDeLienzo } from '../../../tests/ayudas/lienzo';

/** Pointer helpers over the canvas; the single copy lives in `tests/ayudas/lienzo.ts`. */
export const { camaraDe: cameraOf, dibujoDe: drawingOf, dobleClicEnNodo: doubleClickNode, opacidadDeNodo: nodeOpacity, posicionDe: positionOf, pulsarEn: pressAt, pulsarNodo: pressNode } = ayudasDeLienzo(fireEvent);
