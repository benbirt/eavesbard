import { castStatus, connectCast, output, setOutput } from "../player.js";

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
          class="seg cast"
          aria-pressed={output.value === "cast"}
          disabled={!cast.available}
          title={castTitle}
          onClick={() => {
            void setOutput("cast");
            void connectCast();
          }}
        >
          <CastIcon />
          <span class="sr-only">Cast</span>
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

/** The standard Cast symbol (Material Icons "cast", Apache License 2.0). */
function CastIcon() {
  return (
    <svg class="cast-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
    </svg>
  );
}
