import { fireEvent } from '@testing-library/react';

import { canvasHelpers } from '../../../tests/helpers/canvas';

/** Pointer helpers over the canvas; the single copy lives in `tests/helpers/canvas.ts`. */
export const { cameraOf, drawingOf, doubleClickNode, nodeOpacity, positionOf, pressAt, pressNode } = canvasHelpers(fireEvent);
