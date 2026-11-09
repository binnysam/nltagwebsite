import { Notice } from "@/design-system/components";
import { t, type Locale } from "@/content/ui-strings";
import { churchLocation } from "@/content/church";
import styles from "../public.module.css";

/**
 * Map slot on Contact (owner requirement: a map only after the church's location is verified;
 * never invented coordinates or an address). `churchLocation` is null until the owner supplies and
 * approves them (src/content/church.ts), so this shows the placeholder; nothing loads from any map
 * service.
 */
export function MapPlaceholder({ locale }: { locale: Locale }) {
  if (churchLocation === null) {
    return (
      <div className={styles.note} data-map="placeholder">
        <Notice tone="info" title={t("map.placeholder", locale)} />
      </div>
    );
  }
  return null;
}
