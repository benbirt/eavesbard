export const AUDIO_HOST = "https://sounds.tabletopaudio.com";

export function audioUrl(file: string): string {
  return `${AUDIO_HOST}/${encodeURIComponent(file)}.mp3`;
}

