import { useEffect, useState } from "preact/hooks";
import { FAN_CONTENT_NOTICE, FAN_CONTENT_POLICY_URL, pickArt, SCENE_ART, type SceneArt } from "../art/scene-art.js";
import { scene } from "../director.js";
import type { Intensity } from "../library/scenes.js";

/**
 * The scene's art: an image for the current intensity, kept until the
 * intensity changes. Shown whole (never cropped, so signatures and copyright
 * lines stay visible) over a blurred copy that fills the frame.
 */
export function SceneArtBanner({ intensity }: { intensity?: Intensity }) {
  const current = intensity ?? scene.value?.intensity ?? "calm";
  const [art, setArt] = useState(() => pickArt(current));
  useEffect(() => {
    if (art.intensity !== current) setArt((previous) => pickArt(current, previous));
  }, [current]);
  return (
    <figure class="scene-art">
      <div class="scene-art-frame">
        <img class="scene-art-fill" src={`art/${art.file}`} alt="" aria-hidden="true" />
        <img class="scene-art-image" src={`art/${art.file}`} alt={art.title} />
      </div>
      <figcaption class="muted">{credit(art)}</figcaption>
    </figure>
  );
}

function credit(a: SceneArt): string {
  return `${a.title}. ${a.book}${a.artist ? `, art by ${a.artist}` : ""}. © Wizards of the Coast.`;
}

/** The credits for every image, and the Fan Content Policy notice, for the footer. */
export function ArtCredits() {
  return (
    <>
      <p>{FAN_CONTENT_NOTICE} <a href={FAN_CONTENT_POLICY_URL}>Fan Content Policy</a>.</p>
      <details>
        <summary>Art credits</summary>
        <ul>
          {SCENE_ART.map((a) => (
            <li key={a.file}>{credit(a)}</li>
          ))}
        </ul>
      </details>
    </>
  );
}
