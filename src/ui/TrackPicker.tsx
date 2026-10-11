import { useState } from "preact/hooks";
import { indexGenerated, library } from "../library-data.js";
import { INTENSITIES, SETTINGS, type Intensity, type Setting } from "../library/scenes.js";
import { bucket } from "../library/tag-map.js";
import { play } from "../player.js";

const capitalise = (s: string) => s[0]!.toUpperCase() + s.slice(1);

const generated = indexGenerated.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Choosing music by hand, on the main view when automatic music is off. */
export function TrackPicker() {
  const [setting, setSetting] = useState<Setting>(SETTINGS[0]);
  const [intensity, setIntensity] = useState<Intensity>(INTENSITIES[0]);
  const [trackId, setTrackId] = useState<number | undefined>();

  const tracks = bucket(library, setting, intensity);
  // Keep the chosen track if it's in the new bucket; otherwise take the first.
  const selected = tracks.find((t) => t.track.id === trackId) ?? tracks[0];

  const playRandom = () => {
    const entry = tracks[Math.floor(Math.random() * tracks.length)];
    if (entry) setTrackId(entry.track.id);
    return play(entry);
  };

  return (
    <section class="card picker">
      <p class="eyebrow">Pick a track</p>
      <div class="row">
        <select class="field" aria-label="Setting" value={setting} onChange={(e) => setSetting(e.currentTarget.value as Setting)}>
          {SETTINGS.map((s) => (
            <option key={s} value={s}>
              {capitalise(s)} ({library.tracks.filter((t) => t.settings.includes(s)).length})
            </option>
          ))}
        </select>
        <select class="field" aria-label="Intensity" value={intensity} onChange={(e) => setIntensity(e.currentTarget.value as Intensity)}>
          {INTENSITIES.map((i) => (
            <option key={i} value={i}>
              {capitalise(i)} ({bucket(library, setting, i).length})
            </option>
          ))}
        </select>
      </div>
      <select class="field" aria-label="Track" value={selected?.track.id} onChange={(e) => setTrackId(Number(e.currentTarget.value))}>
        {tracks.map((t) => (
          <option key={t.track.id} value={t.track.id}>
            {t.track.title}
          </option>
        ))}
      </select>
      {selected && <p class="small">{selected.track.description || "No description."}</p>}
      <p>
        <button type="button" class="btn" disabled={!selected} onClick={() => void play(selected)}>
          Play
        </button>{" "}
        <button type="button" class="btn" disabled={!selected} onClick={() => void playRandom()}>
          Any {intensity} {setting} track
        </button>
      </p>
      <p class="small">
        {library.tracks.length} tracks, from Tabletop Audio's list of {generated}.
      </p>
    </section>
  );
}
