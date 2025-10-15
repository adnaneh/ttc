/**
 * Find a selection marker like: SELECT: QOPT-2 (case-insensitive)
 */
export function findSelectedOptionId(text: string): string | null {
  const m = text.match(/select\s*:\s*(qopt-\d+)/i);
  return m ? m[1].toUpperCase() : null;
}

