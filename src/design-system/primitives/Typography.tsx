import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./typography.module.css";

export type HeadingStyle = "display-xl" | "display-l" | "h1" | "h2" | "h3";
export type TextStyle = "body-l" | "body" | "small" | "caption" | "eyebrow";
export type TextTone = "primary" | "secondary" | "strong-secondary" | "on-gradient";

const headingClass: Record<HeadingStyle, string | undefined> = {
  "display-xl": styles.displayXl,
  "display-l": styles.displayL,
  h1: styles.h1,
  h2: styles.h2,
  h3: styles.h3,
};
const textClass: Record<TextStyle, string | undefined> = {
  "body-l": styles.bodyL,
  body: styles.body,
  small: styles.small,
  caption: styles.caption,
  eyebrow: styles.eyebrow,
};
const toneClass: Record<TextTone, string | undefined> = {
  primary: styles.primary,
  secondary: styles.secondary,
  "strong-secondary": styles.strongSecondary,
  "on-gradient": styles.onGradient,
};

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Semantic level. Choose by document outline, never by size. */
  level: 1 | 2 | 3 | 4;
  /** Visual style. Defaults to the style matching the level. */
  styleAs?: HeadingStyle;
  tone?: TextTone;
  children: ReactNode;
}

const defaultStyle: Record<HeadingProps["level"], HeadingStyle> = { 1: "h1", 2: "h2", 3: "h3", 4: "h3" };

/** Heading with the approved bilingual scale. Tamil styling applies automatically via `lang`. */
export function Heading({ level, styleAs, tone, className, children, ...rest }: HeadingProps) {
  const Tag = `h${level}` as ElementType;
  return (
    <Tag className={cx(headingClass[styleAs ?? defaultStyle[level]], tone && toneClass[tone], className)} {...rest}>
      {children}
    </Tag>
  );
}

export interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: "p" | "span" | "div" | "small" | "strong";
  variant?: TextStyle;
  tone?: TextTone;
  medium?: boolean;
  /** Limits line length to 64ch (English) / 60ch (Tamil). */
  measure?: boolean;
  children: ReactNode;
}

export function Text({ as = "p", variant = "body", tone, medium, measure, className, children, ...rest }: TextProps) {
  const Tag = as as ElementType;
  return (
    <Tag
      className={cx(textClass[variant], tone && toneClass[tone], medium && styles.medium, measure && styles.measure, className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function VisuallyHidden({ as = "span", children, ...rest }: { as?: "span" | "h1" | "h2" | "h3" | "p"; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  const Tag = as as ElementType;
  return (
    <Tag className="ds-visually-hidden" {...rest}>
      {children}
    </Tag>
  );
}
