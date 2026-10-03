import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail
} from "@/components/ui/sidebar";
import type { WorkspaceNav } from "@/types/app";
import { padIndex } from "@/util/format";

type NavItem = {
  id: WorkspaceNav;
  label: string;
  index: number;
};

const WORKSPACE_ITEMS: NavItem[] = [
  { id: "templates", label: "Themes", index: 1 },
  { id: "studio", label: "Design studio", index: 2 },
  { id: "jobs", label: "Recent designs", index: 3 }
];

const LIBRARY_ITEMS: NavItem[] = [
  { id: "components", label: "Components", index: 4 },
  { id: "newTemplate", label: "New template", index: 5 }
];

type Props = {
  active: string;
  onNavigate: (view: WorkspaceNav) => void;
  connected: boolean;
  model: string;
};

/**
 * Always-on numbered workspace sidebar matching the palette.pdf chrome.
 *
 * @param props.active - Current nav id
 * @param props.onNavigate - Opens a workspace view
 * @param props.connected - Whether the API is reachable
 * @param props.model - Engine model label
 */
const AppSidebar = ({ active, onNavigate, connected, model }: Props) => (
  <Sidebar
    collapsible="icon"
    className="app-sidebar !absolute !inset-y-0 !h-full"
  >
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" className="pointer-events-none logo-btn" tooltip="palette">
            <span className="logo-mark">p</span>
            <span className="logo-word">palette</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <NavGroup
        label="Workspace"
        items={WORKSPACE_ITEMS}
        active={active}
        onNavigate={onNavigate}
      />
      <NavGroup
        label="Library"
        items={LIBRARY_ITEMS}
        active={active}
        onNavigate={onNavigate}
      />
    </SidebarContent>
    <SidebarFooter>
      <div className="nav-foot-card">
        <div className="space-avatar" aria-hidden>PS</div>
        <div className="space-meta">
          <b>Personal space</b>
          <small>{connected ? (model || "Connected") : "Demo mode"}</small>
        </div>
      </div>
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
);

type GroupProps = {
  label: string;
  items: NavItem[];
  active: string;
  onNavigate: (view: WorkspaceNav) => void;
};

/**
 * Labeled cluster of numbered sidebar rows.
 *
 * @param props.label - Section title
 * @param props.items - Menu entries
 * @param props.active - Highlighted nav id
 * @param props.onNavigate - Selection handler
 */
const NavGroup = ({ label, items, active, onNavigate }: GroupProps) => (
  <SidebarGroup>
    <SidebarGroupLabel>{label}</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton
              type="button"
              isActive={active === item.id}
              tooltip={item.label}
              className="nav-numbered"
              onClick={() => onNavigate(item.id)}
            >
              <span className="nav-num">{padIndex(item.index)}</span>
              <span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
);

export { AppSidebar };
