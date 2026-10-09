import { castStatus, connectCast, output, seekNearEnd, setOutput, setVolume, stop } from "../player.js";

export function OutputChooser() {
  const cast = castStatus.value;
  const status =
    cast.available === undefined
      ? "Loading Cast support…"
      : cast.available
        ? `Cast SDK loaded: ${cast.state}.`
        : "Casting isn't available in this browser (the Cast SDK reported it unavailable).";
  return (
    <>
      <label>
        <input type="radio" name="output" checked={output.value === "local"} onChange={() => setOutput("local")} />{" "}
        This computer
      </label>
      <label>
        <input
          type="radio"
          name="output"
          checked={output.value === "cast"}
          disabled={!cast.available}
          onChange={() => setOutput("cast")}
        />{" "}
        Cast <google-cast-launcher />{" "}
        <button type="button" disabled={!cast.available} onClick={connectCast}>
          Connect…
        </button>{" "}
        <span class="muted">{status}</span>
      </label>
      {cast.hint && <p class="warning">{cast.hint}</p>}
    </>
  );
}

export function Transport() {
  return (
    <>
      <p>
        <button onClick={stop}>Stop</button> <button onClick={seekNearEnd}>Skip to 20 s before end</button>
      </p>
      <label>
        Volume{" "}
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          defaultValue="1"
          onInput={(e) => setVolume(Number(e.currentTarget.value))}
        />
      </label>
    </>
  );
}
