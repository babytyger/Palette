import { DropdownMenuDemo } from "@/components/AccountMenu";
import { Logo } from "@/components/Logo";
import { ThemeSwitch } from "@/components/unlumen-ui/theme-switch";
import { cn } from "@/util/cn";
import type { WorkspaceNav } from "@/types/app";

type NavItem = {
  id: WorkspaceNav;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { id: "templates", label: "Themes" },
  { id: "studio", label: "Design studio" },
  { id: "jobs", label: "Recent designs" },
  { id: "components", label: "Components" }
];

type Props = {
  active: string;
  onNavigate: (view: WorkspaceNav) => void;
  connected: boolean;
};

/**
 * Editorial top bar: logo, centered links, and account status.
 *
 * @param props.active - Current nav id
 * @param props.onNavigate - Opens a workspace view
 * @param props.connected - Whether the API is reachable
 */
const TopNav = ({ active, onNavigate, connected }: Props) => (
  <header className="top-nav">
    <div className="top-nav-row">
      <div className="top-nav-brand">
        <Logo />
        <span className="logo-word">Palette</span>
      </div>
      <nav className="top-nav-links" aria-label="Workspace">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn("top-nav-link", active === item.id && "active")}
            aria-current={active === item.id ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="top-nav-actions">
        <div className="top-status">
          <span className="status-dot" aria-hidden />
          {connected ? "Connected" : "Demo"}
        </div>
        <ThemeSwitch className="theme-switch" />
        <DropdownMenuDemo />
      </div>
    </div>
  </header>
);

export { TopNav };
