// PostHog, in its own bundle (analytics-posthog.js) that src/analytics.ts loads
// only when the visit may be counted, so nobody else downloads it.

import posthog from "posthog-js";
import type { AnalyticsEvent } from "./analytics-events.js";

/** The project's public key: it can only send events. */
const PROJECT_TOKEN = "phc_CsD5BihrYmNJRWUcFcugc5npamyPnW8666Y4bVGeYYDw";

export function start(): void {
  posthog.init(PROJECT_TOKEN, {
    api_host: "https://eu.i.posthog.com",
    // Nothing stored in the browser; PostHog counts daily visitors from a
    // hash of IP address and browser, made and discarded on its servers. The
    // project has "Cookieless server hash mode" on, which this needs.
    cookieless_mode: "always",
    person_profiles: "never",
    // Only the events src/analytics.ts sends: nothing automatic.
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    rageclick: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_performance: false,
    capture_exceptions: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    advanced_disable_flags: true,
    // No scripts from PostHog's servers.
    disable_external_dependency_loading: true,
    mask_personal_data_properties: true,
  });
}

/** Sends an event; `closing` sends it at once by beacon, for when the page is going away. */
export function capture(event: AnalyticsEvent, closing = false): void {
  const { name, ...properties } = event;
  posthog.capture(name, properties, closing ? { transport: "sendBeacon", send_instantly: true } : undefined);
}
