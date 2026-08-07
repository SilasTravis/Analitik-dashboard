/** `order_source_type` is free-form DB text (e.g. "ios", "web_desktop") — make
 * it presentable without hard-coding a translation table. */
export function formatSourceLabel(raw: string): string {
  return raw
    .split("/")
    .map((segment) =>
      segment
        .split(/[_\-\s]+/)
        .filter(Boolean)
        .map((word) =>
          word.length <= 3 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1).toLowerCase(),
        )
        .join(" "),
    )
    .join("/");
}
