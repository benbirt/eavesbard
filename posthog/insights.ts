// PostHog's "Usage" dashboard (DESIGN.md 7.11): each insight's name,
// description, tile and query. Typed against the app's own events
// (src/analytics-events.ts), so a chart can only use an event the app sends,
// and break down or average by a property that event has. write-insights.ts
// writes this as insights.json for dashboard.tf; check-queries.ts runs each
// query through PostHog's API, which checks it against PostHog's schema.

import { PRODUCTION_HOST, type AnalyticsEvent, type EventName } from "../src/analytics-events.js";

/** An event's own properties (everything but its name). */
type PropertyOf<E extends EventName> = Exclude<keyof Extract<AnalyticsEvent, { name: E }>, "name"> & string;
/** The properties of an event that are numbers, so can be averaged. */
type NumberPropertyOf<E extends EventName> = {
  [P in PropertyOf<E>]: Extract<AnalyticsEvent, { name: E }>[P] extends number ? P : never;
}[PropertyOf<E>];

/** Where a tile sits on PostHog's 12-column dashboard grid. */
interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Insight {
  name: string;
  description: string;
  tile: Tile;
  /** PostHog's query, as its insight API takes it. */
  query: { kind: "InsightVizNode"; source: Record<string, unknown> };
}

const LAST_90_DAYS = { date_from: "-90d" };

// Only events from the site itself. The app sends none from anywhere else, but a test or a
// fork that slipped past that would otherwise show up here.
const FROM_THE_SITE = [{ type: "event", key: "$host", operator: "exact", value: PRODUCTION_HOST }];

/** How many times an event happened, how many visitors it had, or the average of one of its numbers. */
type Measure<E extends EventName> = { math: "total" | "dau" } | { math: "avg"; of: NumberPropertyOf<E> };

/** A chart of an event over the last 90 days, optionally split by one of its properties. */
function trend<E extends EventName>(
  event: E,
  options: Measure<E> & {
    interval: "day" | "week";
    breakdown?: PropertyOf<E>;
    /** Totals as bars, one per breakdown value, instead of lines over time. */
    asBars?: boolean;
  },
): Insight["query"] {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "TrendsQuery",
      dateRange: LAST_90_DAYS,
      properties: FROM_THE_SITE,
      interval: options.interval,
      series: [{ kind: "EventsNode", event, math: options.math, ...("of" in options && { math_property: options.of }) }],
      ...(options.breakdown && { breakdownFilter: { breakdown: options.breakdown, breakdown_type: "event" } }),
      ...(options.asBars && { trendsFilter: { display: "ActionsBarValue" } }),
    },
  };
}

/** The share of visitors who go on through each step, in order, within a day. */
function funnel(steps: [EventName, string][]): Insight["query"] {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "FunnelsQuery",
      dateRange: LAST_90_DAYS,
      properties: FROM_THE_SITE,
      series: steps.map(([event, label]) => ({ kind: "EventsNode", event, custom_name: label })),
      funnelsFilter: { funnelWindowInterval: 1, funnelWindowIntervalUnit: "day", funnelOrderType: "ordered" },
    },
  };
}

/** The dashboard, row by row. The keys name the resources in dashboard.tf, so renaming one replaces its insight. */
export const INSIGHTS: Record<string, Insight> = {
  visitors: {
    name: "Visitors per day",
    description: "Unique visitors each day. Cookieless, so visitors can't be told apart across days: don't add days up.",
    tile: { x: 0, y: 0, w: 6, h: 5 },
    query: trend("$pageview", { math: "dau", interval: "day" }),
  },
  sessions: {
    name: "Sessions per day",
    description: "Sessions begun each day.",
    tile: { x: 6, y: 0, w: 6, h: 5 },
    query: trend("session_started", { math: "total", interval: "day" }),
  },
  funnel: {
    name: "From visit to music",
    description: "Of each day's visitors, how many agreed to downloads, began a session and heard a track, within a day.",
    tile: { x: 0, y: 5, w: 12, h: 6 },
    query: funnel([
      ["$pageview", "Visited"],
      ["downloads_allowed", "Agreed to downloads"],
      ["session_started", "Began a session"],
      ["track_started", "Heard a track"],
    ]),
  },
  tracks_by_host: {
    name: "Tracks played, by host",
    description: "Tracks asked for each week, by the site they're streamed from: the traffic Eavesbard sends each.",
    tile: { x: 0, y: 11, w: 6, h: 5 },
    query: trend("track_started", { math: "total", interval: "week", breakdown: "source" }),
  },
  session_minutes: {
    name: "Session length",
    description: "Average minutes per session, by week (sessions ended by Stop or by closing the page).",
    tile: { x: 6, y: 11, w: 3, h: 5 },
    query: trend("session_ended", { math: "avg", of: "minutes", interval: "week" }),
  },
  tracks_per_session: {
    name: "Tracks per session",
    description: "Average tracks per session, by week.",
    tile: { x: 9, y: 11, w: 3, h: 5 },
    query: trend("session_ended", { math: "avg", of: "tracks", interval: "week" }),
  },
  automatic: {
    name: "Automatic music",
    description: "Sessions with automatic music on (true) or off, last 90 days.",
    tile: { x: 0, y: 16, w: 3, h: 5 },
    query: trend("session_started", { math: "total", interval: "day", breakdown: "automatic", asBars: true }),
  },
  scene_engine: {
    name: "Scene engine",
    description: "Sessions by scene engine (local models or Claude), last 90 days.",
    tile: { x: 3, y: 16, w: 3, h: 5 },
    query: trend("session_started", { math: "total", interval: "day", breakdown: "scene_engine", asBars: true }),
  },
  speech_model: {
    name: "Speech model",
    description: "Sessions by speech model (Whisper size, or the browser's own), last 90 days.",
    tile: { x: 6, y: 16, w: 3, h: 5 },
    query: trend("session_started", { math: "total", interval: "day", breakdown: "speech_model", asBars: true }),
  },
  ended_by: {
    name: "How sessions end",
    description: "Sessions ended by Stop, or by the page closing, last 90 days.",
    tile: { x: 9, y: 16, w: 3, h: 5 },
    query: trend("session_ended", { math: "total", interval: "day", breakdown: "ended_by", asBars: true }),
  },
  model_downloads: {
    name: "First model downloads",
    description: "Models downloaded for the first time in a browser, by model, by week.",
    tile: { x: 0, y: 21, w: 12, h: 5 },
    query: trend("model_downloaded", { math: "total", interval: "week", breakdown: "model" }),
  },
};
