import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

type Option = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  size?: "sm" | "default";
  footer?: Option[];
};

/**
 * Styled shadcn select used in place of native dropdowns.
 *
 * @param props.value - Selected option value
 * @param props.onChange - Called with the chosen value
 * @param props.options - Menu items
 * @param props.placeholder - Label when nothing is selected
 * @param props.ariaLabel - Accessible name for the trigger
 * @param props.className - Extra trigger classes
 * @param props.size - Trigger size
 * @param props.footer - Items rendered after a separator
 */
const AppSelect = ({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  className,
  size = "default",
  footer = []
}: Props) => {
  const items = [...options, ...footer];
  return (
    <Select
      value={value || null}
      onValueChange={(next) => { if (next != null) onChange(String(next)); }}
      items={items}
      modal={false}
    >
      <SelectTrigger className={cn("w-full", className)} size={size} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent align="start">
        {options.map((item) => (
          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
        ))}
        {footer.length ? <SelectSeparator /> : null}
        {footer.map((item) => (
          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export { AppSelect };
export type { Option as AppSelectOption };
