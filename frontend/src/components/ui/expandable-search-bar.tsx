import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { cn } from "@/util/cn";

type Props = {
  expandDirection?: "left" | "right";
  width?: number;
  size?: number;
  placeholder?: string;
  onSearch?: (query: string) => void;
  className?: string;
};

/**
 * Search control that collapses to an icon and expands into a field.
 *
 * @param props.expandDirection - Side the field grows toward
 * @param props.width - Expanded width in pixels, unless `className` includes `w-full`
 * @param props.size - Collapsed icon size in pixels
 * @param props.placeholder - Input placeholder
 * @param props.onSearch - Called as the query changes and when the field is submitted
 * @param props.className - Extra classes on the root
 */
const ExpandableSearchBar = ({
  expandDirection = "right",
  width = 250,
  size = 42,
  placeholder = "Search",
  onSearch,
  className
}: Props) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fluid = className?.split(/\s+/).includes("w-full");

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    /**
     * Closes an empty field when the pointer leaves it.
     *
     * @param event - Pointer event
     */
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !query) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, query]);

  /**
   * Submits the current query.
   *
   * @param event - Form submit event
   */
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSearch?.(query);
  };

  /**
   * Clears and collapses the field on Escape.
   *
   * @param event - Key event from the input
   */
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") return;
    setQuery("");
    onSearch?.("");
    setOpen(false);
  };

  return (
    <form
      ref={rootRef}
      onSubmit={submit}
      className={cn("expand-search", expandDirection === "left" && "is-left", open && "is-open", className)}
      style={{
        width: open ? (fluid ? "100%" : width) : size,
        ["--search-size" as string]: `${size}px`
      }}
    >
      <button
        type="button"
        className="expand-search-btn"
        aria-label={open ? "Collapse search" : "Search"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Search size={size > 32 ? 16 : 14} aria-hidden />
      </button>
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder={placeholder}
        aria-label={placeholder}
        tabIndex={open ? 0 : -1}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          onSearch?.(next);
        }}
        onKeyDown={onKeyDown}
      />
    </form>
  );
};

export default ExpandableSearchBar;
