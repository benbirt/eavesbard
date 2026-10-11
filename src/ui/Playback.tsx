import { castStatus, output, startCasting, stopCasting } from "../player.js";

/**
 * The Cast button, as in other apps: music plays on this computer unless
 * casting is on. Its tooltip says what Cast discovery has found, or what
 * to check when it finds nothing.
 */
export function CastButton() {
  const cast = castStatus.value;
  const casting = output.value === "cast";
  const title = casting
    ? `Casting (${cast.state}). Click to play on this computer.`
    : cast.available === undefined
      ? "Loading Cast support…"
      : !cast.available
        ? "Casting isn't available in this browser"
        : cast.hint || `Cast to a speaker or TV (${cast.state})`;
  return (
    <button
      type="button"
      class="iconbtn cast"
      aria-pressed={casting}
      aria-label={casting ? "Stop casting" : "Cast"}
      title={title}
      disabled={!cast.available}
      onClick={() => void (casting ? stopCasting() : startCasting())}
    >
      <CastIcon />
    </button>
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
