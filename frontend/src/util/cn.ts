/**
 * Joins class names, dropping falsy values.
 *
 * @param parts - Class tokens
 * @returns Space-separated class string
 */
const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

export { cn };
