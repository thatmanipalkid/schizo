export function formatRupee(amount: number) {
  const n = Number.isFinite(amount) ? amount : 0;
  const rounded = Math.round(n);
  return `₹${rounded.toLocaleString("en-IN")}`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function parseNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

