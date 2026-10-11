import { signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

export type DrawerName = "log" | "setup" | "about";

const TITLES: Record<DrawerName, string> = { log: "Session log", setup: "Setup", about: "About" };

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

/** A panel that slides over from the right. */
export function Drawer({ name, title, children }: { name: DrawerName; title: string; children: ComponentChildren }) {
  const open = openDrawer.value === name;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open]);
  return (
    <aside class={`drawer${open ? " open" : ""}`} aria-label={title} aria-hidden={!open} inert={!open}>
      <header>
        <h2 tabIndex={-1} ref={heading} class="sr-only">
          {title}
        </h2>
        {/* Tabs, so one panel can switch to the other: the open panel covers the top bar's buttons. */}
        <nav class="tabs" aria-label="Panels">
          {(Object.keys(TITLES) as DrawerName[]).map((n) => (
            <button type="button" key={n} class="tab" aria-current={n === name ? "page" : undefined} onClick={() => (openDrawer.value = n)}>
              {TITLES[n]}
            </button>
          ))}
        </nav>
        <button type="button" class="close" aria-label={`Close ${title.toLowerCase()}`} onClick={() => (openDrawer.value = undefined)}>
          ×
        </button>
      </header>
      <div class="body">{children}</div>
    </aside>
  );
}
