"use client";

import { useState } from "react";
import { Button } from "@/design-system/components";
import { youTubeEmbedUrl } from "@/lib/youtube";
import styles from "./video-embed.module.css";

/**
 * Click-to-load YouTube player (roadmap B4). Before the visitor presses "Play video" the page makes
 * no request to YouTube or Google at all (no thumbnail, no script, no iframe); then the
 * privacy-enhanced youtube-nocookie.com player loads in a 16:9 frame. Static: no animation.
 * The page's own "Watch the sermon" link stays as the fallback (and the only option without JS).
 */
export function VideoEmbed({ id, title, playLabel, notice }: { id: string; title: string; playLabel: string; notice: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className={styles.frame} data-video-facade={playing ? "playing" : "idle"}>
      {playing ? (
        <iframe
          className={styles.player}
          src={youTubeEmbedUrl(id)}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <div className={styles.facade}>
          <Button onClick={() => setPlaying(true)}>{playLabel}</Button>
          <p className={styles.notice}>{notice}</p>
        </div>
      )}
    </div>
  );
}
