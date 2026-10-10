import { effect, signal } from "@preact/signals";
import { FAN_CONTENT_NOTICE, FAN_CONTENT_POLICY_URL, pickArt, SCENE_ART, type SceneArt } from "../art/scene-art.js";
import { scene } from "../director.js";

/** The image for the current intensity, shared by the frame and the ambient background. */
export const currentArt = signal<SceneArt>(pickArt("calm"));

// A new image only when the intensity changes (calm when there's no session).
effect(() => {
  const intensity = scene.value?.intensity ?? "calm";
  if (currentArt.peek().intensity !== intensity) currentArt.value = pickArt(intensity, currentArt.peek());
});

/** A blurred copy of the art behind the whole page. */
export function Ambient() {
  return (
    <div class="ambient" aria-hidden="true">
      <img src={`art/${currentArt.value.file}`} alt="" />
    </div>
  );
}

/**
 * The art itself: whole, never cropped or covered, so signatures and
 * copyright lines stay visible (the Fan Content Policy forbids removing
 * notices). A blurred copy fills any letterbox.
 */
export function ArtFrame() {
  const art = currentArt.value;
  return (
    <figure class="frame">
      <div class="art">
        <img class="fill" src={`art/${art.file}`} alt="" aria-hidden="true" />
        <img class="img" src={`art/${art.file}`} alt={art.title} />
      </div>
      <figcaption class="credit">{credit(art)}</figcaption>
    </figure>
  );
}

function credit(a: SceneArt): string {
  return `${a.title} · ${a.book}${a.artist ? ` · art by ${a.artist}` : ""} · © Wizards of the Coast`;
}

/** The Fan Content Policy notice and every image's credit, for About. */
export function ArtCredits() {
  return (
    <>
      <p>
        {FAN_CONTENT_NOTICE} <a href={FAN_CONTENT_POLICY_URL}>Fan Content Policy</a>.
      </p>
      <details>
        <summary>Art credits</summary>
        <ul class="credits">
          {SCENE_ART.map((a) => (
            <li key={a.file}>{credit(a)}</li>
          ))}
        </ul>
      </details>
    </>
  );
}
