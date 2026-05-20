export const formatNumber = (n: number): string =>
  new Intl.NumberFormat("en-US").format(Math.round(n));

export const formatCurrency = (n: number, currency = "USD"): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);

/** UZS amounts are large integers; render with thousand-separators + "som". */
export const formatUZS = (n: number): string =>
  `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)} so'm`;

/** Compact: 12.4K / 1.2M — useful for chart axes and KPI cards. */
export const formatCompact = (n: number): string =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const formatPercent = (n: number, fractionDigits = 1): string =>
  `${(n * 100).toFixed(fractionDigits)}%`;
