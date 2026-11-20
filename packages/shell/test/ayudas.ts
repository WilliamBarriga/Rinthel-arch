import { fireEvent } from '@testing-library/react';

import { ayudasDeLienzo } from '../../../tests/ayudas/lienzo';

/** Ayudas de puntero sobre el lienzo; la unica copia vive en `tests/ayudas/lienzo.ts`. */
export const { camaraDe, dibujoDe, dobleClicEnNodo, opacidadDeNodo, posicionDe, pulsarEn, pulsarNodo } = ayudasDeLienzo(fireEvent);
