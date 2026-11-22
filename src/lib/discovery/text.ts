// Small helpers for untrusted text. Nothing here executes or follows content.

export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/** The sentence (≤ max chars) around the first regex match, original wording kept. */
export function snippet(text: string, re: RegExp, max = 180): string | null {
  const m = re.exec(text);
  if (!m) return null;
  const start = Math.max(0, text.lastIndexOf("\n", m.index) + 1, m.index - max / 2);
  const endNl = text.indexOf("\n", m.index);
  const end = Math.min(text.length, endNl === -1 ? text.length : endNl, m.index + max / 2);
  return text.slice(start, end).trim();
}

export function httpsOrNull(u: unknown): string | null {
  if (typeof u !== "string") return null;
  const s = u.trim();
  return /^https:\/\/[^\s]+$/i.test(s) && s.length <= 1000 ? s : null;
}

export function clip(s: string | null | undefined, n: number): string | null {
  if (!s) return null;
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
