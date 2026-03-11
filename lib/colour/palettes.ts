export interface Palette {
  name: string;
  colours: string[];
}

export const warmSunset: Palette = {
  name: "Warm Sunset",
  colours: ["#FF6B35", "#F7C59F", "#EFEFD0", "#004E89", "#1A659E"],
};

export const coolOcean: Palette = {
  name: "Cool Ocean",
  colours: ["#0B132B", "#1C2541", "#3A506B", "#5BC0BE", "#6FFFE9"],
};

export const neon: Palette = {
  name: "Neon",
  colours: ["#FF00FF", "#00FFFF", "#FF006E", "#8338EC", "#FFBE0B"],
};

export const monochrome: Palette = {
  name: "Monochrome",
  colours: ["#FFFFFF", "#C0C0C0", "#808080", "#404040", "#000000"],
};

export const earthTones: Palette = {
  name: "Earth Tones",
  colours: ["#5F0F40", "#9A031E", "#CB793A", "#FCDC4D", "#3D5A3E"],
};

export const retrowave: Palette = {
  name: "Retrowave",
  colours: ["#2B2D42", "#8D99AE", "#EDF2F4", "#EF233C", "#D90429"],
};

export const forest: Palette = {
  name: "Forest",
  colours: ["#1B4332", "#2D6A4F", "#40916C", "#52B788", "#95D5B2"],
};

export const palettes: Palette[] = [
  warmSunset,
  coolOcean,
  neon,
  monochrome,
  earthTones,
  retrowave,
  forest,
];

/** Pick a random colour from a palette. */
export function randomColour(palette: Palette): string {
  return palette.colours[Math.floor(Math.random() * palette.colours.length)];
}

/** Get a colour from a palette by index (wraps around). */
export function colourAt(palette: Palette, index: number): string {
  return palette.colours[((index % palette.colours.length) + palette.colours.length) % palette.colours.length];
}
