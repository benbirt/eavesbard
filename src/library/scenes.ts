/** Where the party is (section 6). `unknown` means "keep doing what you're doing". */
export const SETTINGS = ["tavern", "town", "interior", "wilderness", "dungeon", "travel"] as const;
export type Setting = (typeof SETTINGS)[number];

/** What's happening (section 6). */
export const INTENSITIES = ["calm", "tense", "combat"] as const;
export type Intensity = (typeof INTENSITIES)[number];
