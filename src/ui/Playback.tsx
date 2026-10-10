import { castStatus, connectCast, output, seekNearEnd, setOutput, stop } from "../player.js";

/** Where the music plays: this computer or a Cast device. */
export function OutputSwitch() {
  const cast = castStatus.value;
  const castTitle =
    cast.available === undefined
      ? "Loading Cast support…"
      : cast.available
        ? `Cast: ${cast.state}`
        : "Casting isn't available in this browser";
  return (
    <>
      <div class="output" role="group" aria-label="Play on">
        <button type="button" class="seg" aria-pressed={output.value === "local"} onClick={() => void setOutput("local")}>
          This computer
        </button>
        <button
          type="button"
          class="seg"
          aria-pressed={output.value === "cast"}
          disabled={!cast.available}
          title={castTitle}
          onClick={() => {
            void setOutput("cast");
            void connectCast();
          }}
        >
          Cast…
        </button>
      </div>
      {cast.hint && (
        <details class="cast-hint small">
          <summary>No Cast devices found</summary>
          {cast.hint}
        </details>
      )}
    </>
  );
}

/** Testing controls for the manual track picker. */
export function Transport() {
  return (
    <p>
      <button type="button" class="btn" onClick={stop}>
        Stop the music
      </button>{" "}
      <button type="button" class="btn" onClick={seekNearEnd}>
        Skip to 20 s before the end
      </button>
    </p>
  );
}
