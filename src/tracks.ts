export const AUDIO_HOST = "https://sounds.tabletopaudio.com";

export interface Track {
  title: string;
  /** File stem on the audio host, exactly as Tabletop Audio publishes it. */
  file: string;
}

export function audioUrl(file: string): string {
  return `${AUDIO_HOST}/${encodeURIComponent(file)}.mp3`;
}

/** A few known tracks for experiment E1, until the generated index exists. */
export const E1_TRACKS: readonly Track[] = [
  { title: "The Gaping Maw", file: "318_The_Gaping_Maw" },
  { title: "Shaman's Hollow", file: "319_Shamans_Hollow" },
  { title: "Solemn Vow", file: "4_Solemn_Vow-a" },
];
