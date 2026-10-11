import { effect, signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { pickArt, SCENE_ART, type SceneArt } from "../art/scene-art.js";
import { scene } from "../director.js";
import { INTENSITIES, type Intensity } from "../library/scenes.js";

/** The image for the current intensity, shared by the frame and the ambient background. */
export const currentArt = signal<SceneArt>(pickArt("calm"));
/** Whether the current image was chosen by hand (until the intensity next changes). */
export const artChosen = signal(false);
/** Whether the picture gallery is open. */
const galleryOpen = signal(false);

// A new image only when the intensity changes (calm when there's no session),
// which also ends a hand-picked one: a calm picture shouldn't last through a fight.
let lastIntensity: Intensity = "calm";
effect(() => {
  const intensity = scene.value?.intensity ?? "calm";
  if (intensity === lastIntensity) return;
  lastIntensity = intensity;
  currentArt.value = pickArt(intensity, currentArt.peek());
  artChosen.value = false;
});

/** Shows a picture chosen by hand, until the intensity next changes. */
export function chooseArt(art: SceneArt): void {
  currentArt.value = art;
  artChosen.value = true;
  galleryOpen.value = false;
}

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
        {galleryOpen.value && <Gallery />}
      </div>
      <figcaption class="credit">
        {credit(art)}
        {artChosen.value && " · your pick"} ·{" "}
        <button type="button" class="text-button" onClick={() => (galleryOpen.value = !galleryOpen.value)}>
          {galleryOpen.value ? "Close the pictures" : "Choose picture"}
        </button>
      </figcaption>
    </figure>
  );
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/**
 * Every picture, by intensity, to choose one by hand. Opened from the
 * caption, over the art; each thumbnail shows its picture whole.
 */
function Gallery() {
  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && (galleryOpen.value = false);
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, []);
  return (
    <div class="gallery" role="dialog" aria-label="Choose a picture">
      <header>
        <span>Choose a picture</span>
        <button type="button" class="close" aria-label="Close the pictures" onClick={() => (galleryOpen.value = false)}>
          ×
        </button>
      </header>
      {INTENSITIES.map((intensity) => (
        <section key={intensity}>
          <h4>{cap(intensity)}</h4>
          <div class="thumbs">
            {SCENE_ART.filter((a) => a.intensity === intensity).map((a) => (
              <button type="button" key={a.file} class="thumb" aria-pressed={a === currentArt.value} title={a.title} onClick={() => chooseArt(a)}>
                <img src={`art/${a.file}`} alt={a.title} loading="lazy" />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function credit(a: SceneArt): string {
  return `${a.title} · ${a.book}${a.artist ? ` · art by ${a.artist}` : ""} · © Wizards of the Coast`;
}

/** Every image's credit (the footer's "credits"). */
export function ArtCredits() {
  return (
    <ul class="credits">
      {SCENE_ART.map((a) => (
        <li key={a.file}>{credit(a)}</li>
      ))}
    </ul>
  );
}
