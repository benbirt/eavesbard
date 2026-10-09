import { useState } from "preact/hooks";
import { indexGenerated, library } from "../library-data.js";
import { INTENSITIES, SETTINGS, type Intensity, type Setting } from "../library/scenes.js";
import { bucket } from "../library/tag-map.js";
import { play } from "../player.js";

const capitalise = (s: string) => s[0]!.toUpperCase() + s.slice(1);

const generated = indexGenerated.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

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
    <>
      <p class="muted">
        Index generated {generated}: {library.tracks.length} tracks in use, {library.unmapped.length} unmapped,{" "}
        {library.outOfScope.length} out of scope (e.g. sci-fi).
      </p>
      <div class="row">
        <label>
          Setting{" "}
          <select value={setting} onChange={(e) => setSetting(e.currentTarget.value as Setting)}>
            {SETTINGS.map((s) => (
              <option key={s} value={s}>
                {capitalise(s)} ({library.tracks.filter((t) => t.settings.includes(s)).length})
              </option>
            ))}
          </select>
        </label>
        <label>
          Intensity{" "}
          <select value={intensity} onChange={(e) => setIntensity(e.currentTarget.value as Intensity)}>
            {INTENSITIES.map((i) => (
              <option key={i} value={i}>
                {capitalise(i)} ({bucket(library, setting, i).length})
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Track{" "}
        <select value={selected?.track.id} onChange={(e) => setTrackId(Number(e.currentTarget.value))}>
          {tracks.map((t) => (
            <option key={t.track.id} value={t.track.id}>
              {t.track.title}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <p class="muted">
          {selected.track.description || "No description."} Settings: {selected.settings.join(", ")}. Intensities:{" "}
          {selected.intensities.join(", ")}.
        </p>
      )}
      <p>
        <button onClick={() => play(selected)}>Play (crossfade)</button>{" "}
        <button onClick={playRandom}>Play a random track from this bucket</button>
      </p>
    </>
  );
}
