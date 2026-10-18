// Starter continuity library for DDC Dream Disect Create.
// Seeded on first launch; everything is user-editable and deletable afterwards.

export const DEFAULT_PALETTES = [
  {
    id: 'pal-1',
    name: 'Neon Cyber Amber & Slate',
    hexes: ['#0f172a', '#f59e0b', '#06b6d4', '#475569'],
    mood: 'Gritty, high-contrast, moody reflections',
  },
  {
    id: 'pal-2',
    name: 'Tokyo Rain Synthwave',
    hexes: ['#1e1b4b', '#d946ef', '#06b6d4', '#10b981'],
    mood: 'Wet asphalt, magenta rim lights, electric cyan',
  },
  {
    id: 'pal-3',
    name: 'Warm 35mm Kodak Gold',
    hexes: ['#451a03', '#d97706', '#fbbf24', '#78350f'],
    mood: 'Nostalgic golden hour, organic film grain, warm skin tones',
  },
];

export const DEFAULT_STYLES = [
  {
    id: 'sty-1',
    name: 'Hyper-Realistic 35mm Cinema',
    descriptor:
      'Shot on Arri Alexa LF, Panavision Anamorphic lenses, natural lens flare, 8k resolution, cinematic color grade',
  },
  {
    id: 'sty-2',
    name: 'Neo-Tokyo Anime Realism',
    descriptor:
      'Makoto Shinkai aesthetic blended with cinematic photorealism, detailed volumetric rain and neon glow',
  },
  {
    id: 'sty-3',
    name: 'Vintage 16mm Indie Grain',
    descriptor:
      'Heavy film grain, nostalgic bloom, slight motion blur, raw documentary music video feel',
  },
];

export const DEFAULT_CHARACTERS = [
  {
    id: 'char-1',
    name: 'Kaelen (Protagonist)',
    face: '24-year-old androgynous artist with sharp cheekbones, piercing hazel eyes, slight brow scar',
    hair: 'Textured jet-black wavy fringe undercut',
    outfit:
      'Oversized distressed charcoal bomber jacket with neon orange lining, raw silver rings',
    imageUrl:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'char-2',
    name: 'Sora (Co-Star)',
    face: 'Mid-20s, ethereal presence, calm expression, sharp jawline',
    hair: 'Platinum blonde braided locs',
    outfit: 'Translucent tech-wear raincoat over black mock-neck sweater',
    imageUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80',
  },
];

export const DEFAULT_THEMES = [
  {
    id: 'thm-1',
    name: 'Subterranean Neon Club & Rain Alley',
    notes:
      'Bioluminescent low-ceiling concrete corridors, rain-drenched neon alleys with reflections',
  },
  {
    id: 'thm-2',
    name: 'Abandoned Retro Observatorium',
    notes:
      'Decaying mid-century celestial dome, golden light shafts, drifting dust motes',
  },
];

export const INTERVAL_PRESETS = [5, 10, 15, 20, 30, 40];
export const SHOT_TYPES = ['Keyframe', 'Motion clip', 'B-roll', 'Lip sync'];
export const CAMERA_ANGLES = [
  'Close-up',
  'Medium shot',
  'Wide shot',
  'Low angle',
  'High angle',
  'Over-the-shoulder',
  'Drone/aerial',
  'Macro',
];
export const CAMERA_MOVES = [
  'Static',
  'Pan',
  'Tilt',
  'Dolly in',
  'Dolly out',
  'Tracking shot',
  'Orbit',
  'Handheld',
];

// Per-scene generation status model (persisted)
export const SCENE_STATUS = {
  EMPTY: 'empty',
  PROMPT_READY: 'prompt-ready',
  GENERATING: 'generating',
  RENDERED: 'rendered',
  FAILED: 'failed',
};

export const SCENE_STATUS_LABEL = {
  empty: 'Planning',
  'prompt-ready': 'Prompt Ready',
  generating: 'Rendering…',
  rendered: 'Rendered',
  failed: 'Failed',
};
