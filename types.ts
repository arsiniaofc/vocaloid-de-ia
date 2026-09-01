
export enum VowelType {
  A = 'A',
  E = 'E',
  I = 'I',
  O = 'O',
  U = 'U'
}

export enum VocalMode {
  SINGING = 'SINGING',
  SPEECH = 'SPEECH (TTS)'
}

export enum VocalLanguage {
  PT_BR = 'PT-BR (NATIVE)',
  EN_US = 'ENGLISH (US)',
  JP = 'JAPANESE (ROMAJI)',
  RU = 'RUSSIAN (CYRILLIC)'
}

export enum VocalPreset {
  SAMPLER = '🎤 WEIRD VOICE / SAMPLER',
  PLUGIN = '🔌 CUSTOM PLUGIN ENGINE',
  CUSTOM = 'CUSTOM / USER',
  TALKBOX = 'TALKBOX CLASSIC',
  MALE_BR = 'MALE BR',
  FEMALE_BR = 'FEMALE BR',
  CHILD = 'CHILD',
  BASS = 'BASS',
  BREATHY = 'BREATHY',
  NASAL = 'NASAL BR',
  METALLIC = 'METALLIC',
  ROBOT = 'ROBOT CLASSIC',
  VOCALOID_JP = 'VOCALOID JP',
  VOCALOID_BR = 'VOCALOID BR',
  POP = 'POP SINGER',
  OPERA = 'OPERA',
  HOARSE = 'HOARSE',
  DISTORTED = 'DISTORTED/SCREAM',
  WHISPER = 'WHISPER',
  MONOTONE = 'MONOTONE AI',
  ANXIOUS = 'ANXIOUS',
  SAD = 'SAD',
  HAPPY = 'HAPPY',
  ANGRY = 'ANGRY',
  FALSETTO = 'FALSETTO',
  ANDROGYNOUS = 'ANDROGYNOUS',
  DEMON = 'DEMON',
  ALIEN = 'ALIEN',
  CHORUS = 'CHORUS',
  TELEPHONE = 'TELEPHONE',
  VHS = 'VHS/RETRO',
  ETHEREAL = 'ETHEREAL',
  CARTOON = 'CARTOON',
  REALISTIC = 'REALISTIC OPTIMIZED',
  SYNTH_BELL = 'SYNTH BELL (FM)',
  E_PIANO = 'E-PIANO (FM)'
}

// --- PLUGIN SYSTEM TYPES ---

export interface PluginParameter {
  type: 'float' | 'int';
  min: number;
  max: number;
  default: number;
  label?: string;
  unit?: string;
}

export interface PluginNodeDefinition {
  name: string;
  function: string; // e.g. 'sine_wave', 'output_node', 'filter', 'gain'
  inputs: string[]; // Names of other nodes
  params: Record<string, string | number>; // Values or math expressions
}

export interface PluginPreset {
  name: string;
  params: Record<string, number>;
}

export interface PluginDefinition {
  plugin_meta: {
    id: string;
    name: string;
    author?: string;
    type?: string;
    version: string;
    description?: string;
  };
  parameters: Record<string, PluginParameter>;
  nodes: PluginNodeDefinition[];
  presets?: PluginPreset[];
}

// --- SAMPLER TYPES ---
export interface SamplerSlice {
  start: number; // 0 to 1 (normalized position)
  end: number;   // 0 to 1
}

export interface SamplerConfig {
  sourceBase64?: string; // The raw audio data
  rootNote: number; // MIDI note of original sample (default 60 C4)
  detune: number; // Fine tune in cents (-100 to 100)
  mode: 'FNF_LOOP' | 'SEQUENCE' | 'FNF_VOWEL'; // FNF_VOWEL = Map U O A E I to slices
  slices: SamplerSlice[]; 
  activeSliceIndex: number; // Used in FNF_LOOP or editor cursor
  sensitivity: number; // Slicing threshold
  vowelMap?: Record<string, number>; // 'a': 0, 'e': 1, etc.
}

// The Mathematical structure of a sound definition (Legacy/Simple)
export interface AudioPresetDefinition {
  baseFreq: number;
  formantScale: number;
  breath?: number; // Noise floor
  nasal?: number;
  vibrato?: { depth: number; rate: number };
  type: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'custom' | 'pulse';
  // Advanced Math Params
  fm?: { depth: number; rate: number }; // Frequency Modulation
  amRate?: number; // Amplitude Modulation Rate
  amDepth?: number; // Amplitude Modulation Depth
  glide?: number; // Portamento
  steps?: boolean; // Quantize pitch
  roughness?: number; // Random amplitude modulation
  clip?: number; // Hard clipping threshold
  distortion?: number; // Tanh distortion factor
  subHarmonics?: boolean; // Add octave down
  chorus?: boolean; // Detuned copy
  flutter?: number; // Tape flutter
  bandpass?: [number, number]; // [LowCut, HighCut]
  longReverb?: boolean;
  oscGain?: number; // Override oscillator mix
  // New props
  comp?: boolean;
  jitter?: number;
  humanize?: number;
  pitchDrop?: boolean;
  pitchRise?: boolean;
  filterHighPass?: number;
  
  // Sampler Injection
  sampler?: SamplerConfig;
}

export interface VocalParams {
  text: string; // Text to synthesize
  preset: VocalPreset;
  language: VocalLanguage; // NEW: Dictionary Mode
  customData?: AudioPresetDefinition; // If preset is CUSTOM or SAMPLER
  pluginId?: string; // If preset is PLUGIN
  pluginState?: Record<string, number>; // Dynamic parameter values for the plugin
  
  mode: VocalMode; // SINGING or SPEECH
  speed: number; // Syllable speed
  pitch: number; // Base Pitch Multiplier (relative to Note)
  octaveShift: number; // Global Octave Shift
  glide: number; // Portamento/Slide amount (0 to 1)
  jitter: number; // Fast random frequency fluctuation (Timbre)
  humanize: number; // Slow drift / error (Intonation instability)
  breathiness: number; // Noise mix
  formantShift: number; // Timbre shift
  wordGap: number; // Pause duration logic (0 to 1)
  vowel?: VowelType; // Fallback vowel (optional)
  pitchPoints?: { t: number; v: number }[]; // Per-note pitch bend (t=0..1, v=semitones)
}

export interface GlobalParams {
  bpm: number; // Beats Per Minute
  duration: number; // Manual override or calculated
  reverbMix: number; // 0 to 1 (Convolution)
  reverbDecay: number; // Seconds
}

export interface ExportConfig {
  format: 'wav' | 'mp3';
  sampleRate: number; // 22050, 44100, 48000
  bitDepth: 8 | 16 | 32; // WAV: 8 (PCM), 16 (PCM), 32 (FLOAT)
  mp3Bitrate: 128 | 192 | 320; // kbps
}

export interface SequencerNote {
  id: string;
  midi: number; // MIDI Note Number (e.g. 60 for C4)
  startTime: number; // In BEATS (Quarter notes), not seconds
  duration: number; // In BEATS
  lyric: string; // The syllable to sing
  selected?: boolean;
  pitchPoints?: { t: number; v: number }[]; // Pitch bend curve
  glide?: boolean; // Slide from previous note
  connected?: boolean; // Connect visually/audibly to next note (no gap)
}

export interface SequencerTrack {
  id: string;
  name: string;
  color: string;
  notes: SequencerNote[];
  vocalParams: VocalParams;
  volume: number; // 0 to 1
  muted: boolean;
  solo: boolean;
}

// --- NEW TYPES FOR PLAYLIST & SCALE ---

export enum ScaleType {
  CHROMATIC = 'Chromatic (Off)',
  MAJOR = 'Major',
  MINOR = 'Minor',
  PENTATONIC_MAJ = 'Major Pentatonic',
  PENTATONIC_MIN = 'Minor Pentatonic',
  BLUES = 'Blues',
  DORIAN = 'Dorian',
  PHRYGIAN = 'Phrygian',
  LYDIAN = 'Lydian',
  MIXOLYDIAN = 'Mixolydian',
  LOCRIAN = 'Locrian'
}

export enum SnapGrid {
  OFF = 0,
  BAR = 4.0,
  HALF = 2.0,
  BEAT = 1.0,
  EIGHTH = 0.5,
  SIXTEENTH = 0.25,
  THIRTYSECOND = 0.125
}

export interface MusicalKeyConfig {
  root: string; // 'C', 'C#', etc.
  scale: ScaleType;
  enabled: boolean; // Magnet active?
}

// --- PLAYLIST DAW TYPES ---

export interface PlaylistClip {
  id: string;
  name: string;
  buffer: AudioBuffer | null;
  startTime: number; // seconds
  offset: number; // seconds (start point in file)
  duration: number; // seconds (playback duration)
  color?: string;
  type: 'AUDIO' | 'VOCAL_RENDER';
}

export interface PlaylistTrack {
  id: string;
  name: string;
  clips: PlaylistClip[];
  muted: boolean;
  solo: boolean;
  volume: number;
}

export interface PlaylistConfig {
  tracks: PlaylistTrack[];
  loopStart: number; // seconds
  loopEnd: number; // seconds
}
