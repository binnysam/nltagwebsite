import type { ReactElement, SVGProps } from "react";

/**
 * Interface icons. Simple 20×20 line glyphs drawn for NLTAG, stroked in currentColor.
 * Always decorative (aria-hidden); the control that contains one supplies the accessible name.
 */
export type IconName = "menu" | "close" | "pause" | "play" | "share" | "download" | "arrow-right";

const paths: Record<IconName, ReactElement> = {
  menu: <path d="M3 6h14M3 10h14M3 14h14" />,
  close: <path d="M5 5l10 10M15 5L5 15" />,
  pause: <path d="M7 4.5v11M13 4.5v11" />,
  play: <path d="M6.5 4.5l9 5.5-9 5.5z" />,
  share: <path d="M10 3v9M6.5 6.5L10 3l3.5 3.5M4.5 11v4.5h11V11" />,
  download: <path d="M10 3v9M6.5 8.5L10 12l3.5-3.5M4.5 15.5h11" />,
  "arrow-right": <path d="M4 10h12M11.5 5.5L16 10l-4.5 4.5" />,
};

export function Icon({ name, size = "default", ...rest }: { name: IconName; size?: "default" | "small" } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-size={size}
      className="ds-icon"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
