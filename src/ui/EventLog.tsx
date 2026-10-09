import { events } from "../player.js";

export function EventLog() {
  return (
    <ol class="event-log" reversed>
      {events.value.map(({ id, time, source, event }) => (
        <li key={id} class={event.type}>
          {time.toLocaleTimeString("en-GB")} [{source}] {event.type}: {event.detail}
        </li>
      ))}
    </ol>
  );
}
