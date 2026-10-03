import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

/**
 * In-page title row used on workspace screens.
 *
 * @param props.title - Page heading
 * @param props.subtitle - Supporting line
 * @param props.actions - Trailing controls
 */
const PageHeader = ({ title, subtitle, actions }: Props) => (
  <div className="page-header">
    <div>
      <h1>{title}</h1>
      {subtitle ? <p className="page-sub">{subtitle}</p> : null}
    </div>
    {actions ? <div className="page-header-actions">{actions}</div> : null}
  </div>
);

export { PageHeader };
