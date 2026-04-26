/**
 * StayVise — Currency formatting utilities.
 *
 * All monetary values are stored in the database in **paise** (1 INR = 100 paise).
 * These helpers convert paise → rupees for display throughout the frontend.
 */

/**
 * Convert paise to rupees.
 */
export function toRupees(paise: number | undefined | null): number {
  if (paise == null) return 0;
  return paise / 100;
}

/**
 * Format paise as a human-readable INR string (e.g. "1,000").
 * Does NOT include the ₹ symbol — add it in JSX.
 */
export function fmtINR(paise: number | undefined | null): string {
  return toRupees(paise).toLocaleString('en-IN');
}
