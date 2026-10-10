// Scene art: official D&D illustrations, grouped by intensity (DESIGN.md
// 7.10, experiments/E12.md). Used under Wizards of the Coast's Fan Content
// Policy, which requires the notice below, no Wizards logos, and no removal
// of notices already in the art: images are always shown whole, never
// cropped, so signatures and copyright lines stay visible.

import type { Intensity } from "../library/scenes.js";

export interface SceneArt {
  /** Under art/ on the site. */
  file: string;
  intensity: Intensity;
  title: string;
  /** The Wizards of the Coast book it was published in. */
  book: string;
  artist?: string;
}

export const FAN_CONTENT_NOTICE =
  "Eavesbard is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. " +
  "Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.";

export const FAN_CONTENT_POLICY_URL = "https://company.wizards.com/en/legal/fancontentpolicy";

export const SCENE_ART: readonly SceneArt[] = [
  { file: "calm-waterdeep.webp", intensity: "calm", title: "Waterdeep, seen from the water", book: "City of Splendors: Waterdeep (2005)" },
  { file: "calm-candlekeep-sage.webp", intensity: "calm", title: "A sage at work in Candlekeep", book: "Candlekeep Mysteries (2021)", artist: "Kim Sokol" },
  { file: "calm-heartlands.webp", intensity: "calm", title: "The Heartlands", book: "Forgotten Realms: Heroes of Faerûn (2025)", artist: "Pedro H. Cardoso" },
  { file: "calm-modrons.webp", intensity: "calm", title: "Modrons on the march", book: "Planescape: Adventures in the Multiverse (2023)" },
  { file: "calm-ten-towns-boats.webp", intensity: "calm", title: "Fishing boats of Ten-Towns", book: "Legacy of the Crystal Shard (2013)" },
  { file: "tense-trollskull-manor.webp", intensity: "tense", title: "Trollskull Manor, abandoned and haunted", book: "Waterdeep: Dragon Heist (2018)" },
  { file: "tense-owlbear-trail.webp", intensity: "tense", title: "An owlbear on the trail", book: "Phandelver and Below: The Shattered Obelisk (2023)", artist: "Klaus Pillon" },
  { file: "tense-stormwreck-voyage.webp", intensity: "tense", title: "The voyage to Stormwreck Isle", book: "Dungeons & Dragons Starter Set: Dragons of Stormwreck Isle (2022)", artist: "Linda Lithén" },
  { file: "combat-redbrands-brawl.webp", intensity: "combat", title: "Redbrands brawling", book: "Phandelver and Below: The Shattered Obelisk (2023)", artist: "Zoltan Boros" },
  { file: "combat-trollskull-fireball.webp", intensity: "combat", title: "A fireball in Trollskull Alley", book: "Waterdeep: Dragon Heist (2018)" },
  { file: "combat-bronze-dragon.webp", intensity: "combat", title: "The bronze dragon Runara", book: "Dungeons & Dragons Starter Set: Dragons of Stormwreck Isle (2022)", artist: "David Auden Nash" },
  { file: "combat-green-dragon.webp", intensity: "combat", title: "The green dragon Chuth", book: "The Rise of Tiamat (2014)", artist: "Guido Kuip" },
  { file: "combat-skeletons.webp", intensity: "combat", title: "Skeletons of Tresendar Manor", book: "Phandelver and Below: The Shattered Obelisk (2023)", artist: "Zoltan Boros" },
  { file: "combat-roc.webp", intensity: "combat", title: "A vengeful roc", book: "Monster Manual (2025)", artist: "Alejandro Pacheco" },
  { file: "combat-wagon-ambush.webp", intensity: "combat", title: "An ambush on the road to Phandalin", book: "Phandelver and Below: The Shattered Obelisk (2023)" },
];

/** A random image for `intensity`, other than `previous` when there's a choice. */
export function pickArt(intensity: Intensity, previous?: SceneArt, random = Math.random): SceneArt {
  const pool = SCENE_ART.filter((a) => a.intensity === intensity);
  const fresh = pool.length > 1 ? pool.filter((a) => a !== previous) : pool;
  return fresh[Math.floor(random() * fresh.length)]!;
}
