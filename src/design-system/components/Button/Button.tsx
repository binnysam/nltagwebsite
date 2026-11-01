import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";
import Link from "next/link";
import { cx } from "@/lib/cx";
import { Spinner } from "@/design-system/primitives";
import styles from "./button.module.css";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "glass";

interface CommonProps {
  variant?: ButtonVariant;
  /** Narrower padding (16px). Height stays 44px. */
  compact?: boolean;
  fullWidth?: boolean;
  /** Icon placed before the label. Decorative; the label names the action. */
  icon?: ReactNode;
  children: ReactNode;
}

export interface ButtonProps extends CommonProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /**
   * Shows a static loading ring, sets aria-busy and ignores presses (onClick is detached) while keeping focus.
   * Forms must also guard against double submission on the server.
   */
  loading?: boolean;
  /** Text read by screen readers while loading, e.g. "Please wait". Appended to the label. */
  loadingLabel?: string;
}

function classes({ variant = "primary", compact, fullWidth }: CommonProps, className?: string) {
  return cx(styles.button, styles[variant], compact && styles.compact, fullWidth && styles.fullWidth, className);
}

/** Action button. Use ButtonLink when the control navigates. */
export function Button({
  variant, compact, fullWidth, icon, loading, loadingLabel, disabled, className, children, type = "button", onClick, ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classes({ variant, compact, fullWidth, children }, className)}
      disabled={disabled}
      aria-busy={loading || undefined}
      onClick={loading ? undefined : onClick}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      <span>{children}</span>
      {loading && loadingLabel ? (
        <>
          {" "}
          <span className="ds-visually-hidden">{loadingLabel}</span>
        </>
      ) : null}
    </button>
  );
}

export interface ButtonLinkProps extends CommonProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href"> {
  href: string;
}

/** Navigation styled as a button (e.g. "Join us this Friday"). Internal hrefs use next/link. */
export function ButtonLink({ variant, compact, fullWidth, icon, href, className, children, ...rest }: ButtonLinkProps) {
  const cls = classes({ variant, compact, fullWidth, children }, className);
  const content = (
    <>
      {icon}
      <span>{children}</span>
    </>
  );
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={cls} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <a href={href} className={cls} {...rest}>
      {content}
    </a>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Accessible name. Required: icon buttons have no visible label. */
  label: string;
  icon: ReactNode;
  variant?: Exclude<ButtonVariant, "tertiary">;
  ref?: Ref<HTMLButtonElement>;
}

/** 44×44 pill icon button. */
export function IconButton({ label, icon, variant = "secondary", className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button type={type} aria-label={label} className={cx(styles.button, styles[variant], styles.icon, className)} {...rest}>
      {icon}
    </button>
  );
}
