// DECIMAL(30,12) pads to twelve places; contracts carry the canonical form.
export function canonicalDecimal(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}
