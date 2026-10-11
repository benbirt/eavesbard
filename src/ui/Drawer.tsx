import { signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

export type DrawerName = "setup" | "log" | "about";

/** The panels, in tab order: Setup first (More… opens it), then the log, then About. */
const TITLES: Record<DrawerName, string> = { setup: "Setup", log: "Session log", about: "About" };

/** Which side panel is open, if any. */
export const openDrawer = signal<DrawerName | undefined>(undefined);

export function toggleDrawer(name: DrawerName): void {
  openDrawer.value = openDrawer.value === name ? undefined : name;
}

addEventListener("keydown", (e) => {
  if (e.key === "Escape") openDrawer.value = undefined;
});

/**
 * Covers the page while a panel is open, so a click anywhere outside the
 * panel closes it (and does nothing else, so it can't stop the session).
 */
export function Scrim() {
  return openDrawer.value ? <div class="scrim" aria-hidden="true" onClick={() => (openDrawer.value = undefined)} /> : null;
}

/**
 * The side panel: it slides over from the right, and its tabs switch what it
 * shows without closing it. Every tab's content stays mounted (hidden when
 * not chosen), so its state and scroll position survive a switch.
 */
export function SidePanel({ panels }: { panels: Record<DrawerName, ComponentChildren> }) {
  const chosen = openDrawer.value;
  // While the panel slides shut, keep showing the tab it closed on.
  const [shown, setShown] = useState<DrawerName>("setup");
  if (chosen && chosen !== shown) setShown(chosen);
  const open = chosen !== undefined;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open]);
  return (
    <aside class={`drawer${open ? " open" : ""}`} aria-label={TITLES[shown]} aria-hidden={!open} inert={!open}>
      <header>
        <h2 tabIndex={-1} ref={heading} class="sr-only">
          {TITLES[shown]}
        </h2>
        <nav class="tabs" aria-label="Panels">
          {(Object.keys(TITLES) as DrawerName[]).map((n) => (
            <button type="button" key={n} class="tab" aria-current={n === shown ? "page" : undefined} onClick={() => (openDrawer.value = n)}>
              {TITLES[n]}
            </button>
          ))}
        </nav>
        <button type="button" class="close" aria-label="Close the panel" onClick={() => (openDrawer.value = undefined)}>
          ×
        </button>
      </header>
      {(Object.keys(TITLES) as DrawerName[]).map((n) => (
        <div class="body" key={n} hidden={n !== shown}>
          {panels[n]}
        </div>
      ))}
    </aside>
  );
}
