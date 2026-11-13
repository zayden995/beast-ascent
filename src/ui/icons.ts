// Ability icons drawn as inline SVG (no external art assets). Keys match AbilityDef.icon.

const STROKE = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';

const PATHS: Record<string, string> = {
  claw: `<path ${STROKE} d="M6 4l3 16M11.5 3l2.5 18M17 4l2 15"/>`,
  leap: `<path ${STROKE} d="M3 19c2-13 13-14 17-5M20 14l-5.5-.5M20 14l.5-5.5"/>`,
  howl: `<path fill="currentColor" d="M15.5 3.5a8.5 8.5 0 1 0 5 14.6A7.2 7.2 0 0 1 15.5 3.5z"/>`,
  bite: `<path ${STROKE} d="M3 7l3 4.5L9 7l3 4.5L15 7l3 4.5L21 7M3 17l3-4 3 4 3-4 3 4 3-4 3 4"/>`,
  fang: `<path fill="currentColor" d="M7.5 4h9l-2 8.5L12 21l-2.5-8.5z"/>`,
  roar: `<path ${STROKE} d="M5 8.5a5 5 0 0 1 0 7M10 5.5a9.5 9.5 0 0 1 0 13M15 2.8a13.5 13.5 0 0 1 0 18.4"/>`,
  shield: `<path ${STROKE} d="M12 3l8 3v6c0 5-3.4 8-8 9.2C7.4 20 4 17 4 12V6z"/>`,
  paw: `<g fill="currentColor"><circle cx="6.5" cy="10" r="2"/><circle cx="10.5" cy="6.2" r="2"/><circle cx="15" cy="6.6" r="2"/><circle cx="18.2" cy="11" r="2"/><path d="M12 11.5c3 0 5.5 3 5.5 5.6 0 2-2 2.6-5.5 2.6s-5.5-.6-5.5-2.6c0-2.6 2.5-5.6 5.5-5.6z"/></g>`,
  slam: `<path ${STROKE} d="M12 2.5v5M12 21.5v-5M2.5 12h5M21.5 12h-5M5.3 5.3l3.5 3.5M18.7 5.3l-3.5 3.5M5.3 18.7l3.5-3.5M18.7 18.7l-3.5-3.5"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>`,
  wave: `<path ${STROKE} d="M2 9c3-4.5 5-4.5 8 0s5 4.5 8 0 3-2.2 4-2.5M2 16.5c3-4.5 5-4.5 8 0s5 4.5 8 0 3-2.2 4-2.5"/>`,
  dodge: `<path ${STROKE} d="M4 12a8 8 0 1 0 3-6.2M4 4v4.5h4.5"/>`,
};

export function iconSvg(id: string): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${PATHS[id] ?? PATHS.claw}</svg>`;
}
