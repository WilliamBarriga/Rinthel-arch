/** Window size (`resize`): the islands use it for their limits and the canvas for its area. */
import { useEffect, useState } from 'react';

export function useSize(): { width: number; height: number } {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const onChange = (): void => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onChange);
    return () => window.removeEventListener('resize', onChange);
  }, []);
  return size;
}
