"use client";

import { encode } from "uqr";
import styles from "../../account.module.css";

/**
 * QR code drawn locally as SVG (Phase 6b). The otpauth:// address contains the authenticator
 * secret, so it is never sent to an outside QR service or put in an image URL. One <rect> per
 * dark module on a card-coloured background with a quiet zone; the setup key next to it is the
 * text alternative.
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { data, size } = encode(value, { ecc: "M", border: 2 });
  const rects: string[] = [];
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) rects.push(`M${x} ${y}h1v1h-1z`);
    }),
  );
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} className={styles.qr} shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <path d={rects.join("")} className={styles.qrModules} />
    </svg>
  );
}
