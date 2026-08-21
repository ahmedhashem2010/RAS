export function warningAtRiskThreshold(limit: number): number {
  return Math.max(1, limit - 1);
}
