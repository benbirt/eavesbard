import type { HTMLAttributes } from "preact";

declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      /** The Cast button, defined by the Google Cast SDK once it loads. */
      "google-cast-launcher": HTMLAttributes<HTMLElement>;
    }
  }
}
