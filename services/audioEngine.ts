
import { 
  VocalPreset, VocalMode, VocalParams, SequencerNote, SequencerTrack, AudioPresetDefinition, PluginDefinition, SamplerConfig, VocalLanguage, ScaleType, PlaylistTrack
} from '../types';
import * as lamejs from 'lamejs';

// Constants
export const NOTE_FREQUENCIES: Record<string, number> = {
  'C': 16.35, 'C#': 17.32, 'D': 18.35, 'D#': 19.45, 'E': 20.60, 'F': 21.83,
  'F#': 23.12, 'G': 24.50, 'G#': 25.96, 'A': 27.50, 'A#': 29.14, 'B': 30.87
};

export const SCALE_INTERVALS: Record<ScaleType, number[]> = {
  [ScaleType.CHROMATIC]: [0,1,2,3,4,5,6,7,8,9,10,11],
  [ScaleType.MAJOR]: [0, 2, 4, 5, 7, 9, 11],
  [ScaleType.MINOR]: [0, 2, 3, 5, 7, 8, 10],
  [ScaleType.PENTATONIC_MAJ]: [0, 2, 4, 7, 9],
  [ScaleType.PENTATONIC_MIN]: [0, 3, 5, 7, 10],
  [ScaleType.BLUES]: [0, 3, 5, 6, 7, 10],
  [ScaleType.DORIAN]: [0, 2, 3, 5, 7, 9, 10],
  [ScaleType.PHRYGIAN]: [0, 1, 3, 5, 7, 8, 10],
  [ScaleType.LYDIAN]: [0, 2, 4, 6, 7, 9, 11],
  [ScaleType.MIXOLYDIAN]: [0, 2, 4, 5, 7, 9, 10],
  [ScaleType.LOCRIAN]: [0, 1, 3, 5, 6, 8, 10]
};

// --- PHONEME DATA ---

const VOWEL_LIB: Record<string, { f: number[], bw: number[], g: number, nasal?: boolean }> = {
  // Oral Vowels
  'a': { f: [800, 1200, 2500, 3500], bw: [80, 70, 160, 250], g: 1.0 }, 
  'e': { f: [500, 1800, 2500, 3500], bw: [80, 90, 100, 200], g: 0.9 }, 
  'i': { f: [300, 2200, 3000, 3500], bw: [60, 90, 100, 200], g: 0.8 }, 
  'o': { f: [500, 900, 2500, 3500], bw: [70, 80, 100, 200], g: 1.0 },  
  'u': { f: [300, 800, 2200, 3200], bw: [70, 100, 100, 200], g: 0.8 }, 
  
  // Open Variations
  'eh': { f: [600, 1800, 2500, 3500], bw: [90, 100, 100, 200], g: 0.95 },
  'oh': { f: [600, 900, 2600, 3300], bw: [80, 90, 100, 200], g: 1.0 },

  // Nasal Vowels
  'an': { f: [600, 1200, 2500, 3200], bw: [150, 150, 200, 300], g: 0.9, nasal: true }, 
  'en': { f: [450, 1600, 2400, 3200], bw: [150, 150, 200, 300], g: 0.8, nasal: true }, 
  'in': { f: [300, 2000, 2800, 3300], bw: [150, 150, 200, 300], g: 0.7, nasal: true }, 
  'on': { f: [450, 800, 2400, 3200], bw: [150, 150, 200, 300], g: 0.9, nasal: true },  
  'un': { f: [300, 700, 2100, 3000], bw: [150, 150, 200, 300], g: 0.7, nasal: true },  

  // Fallback
  ' ': { f: [500, 1500, 2500, 3500], bw: [200, 200, 200, 200], g: 0.0 }
};

interface ConsonantDef {
    type: 'fricative' | 'plosive' | 'nasal' | 'liquid';
    dur: number; 
    noise: number; 
    oscMix: number; 
    filterHighPass?: number; 
    formantMod?: number[]; 
}

const CONSONANT_LIB: Record<string, ConsonantDef> = {
    's': { type: 'fricative', dur: 0.12, noise: 0.9, oscMix: 0.1, filterHighPass: 4000 },
    'z': { type: 'fricative', dur: 0.10, noise: 0.5, oscMix: 0.5, filterHighPass: 3000 },
    'f': { type: 'fricative', dur: 0.10, noise: 0.8, oscMix: 0.2, filterHighPass: 1500 },
    'v': { type: 'fricative', dur: 0.08, noise: 0.4, oscMix: 0.6, filterHighPass: 1000 },
    'x': { type: 'fricative', dur: 0.12, noise: 0.9, oscMix: 0.1, filterHighPass: 2500 }, 
    'j': { type: 'fricative', dur: 0.10, noise: 0.5, oscMix: 0.5, filterHighPass: 2000 }, 
    'h': { type: 'fricative', dur: 0.08, noise: 0.7, oscMix: 0.2, filterHighPass: 1000 }, 
    'p': { type: 'plosive', dur: 0.05, noise: 1.0, oscMix: 0.0, filterHighPass: 500 },
    't': { type: 'plosive', dur: 0.04, noise: 1.0, oscMix: 0.0, filterHighPass: 2000 },
    'k': { type: 'plosive', dur: 0.05, noise: 1.0, oscMix: 0.0, filterHighPass: 1500 },
    'b': { type: 'plosive', dur: 0.05, noise: 0.2, oscMix: 0.8, filterHighPass: 200 },
    'd': { type: 'plosive', dur: 0.05, noise: 0.2, oscMix: 0.8, filterHighPass: 400 },
    'g': { type: 'plosive', dur: 0.05, noise: 0.2, oscMix: 0.8, filterHighPass: 300 },
    'm': { type: 'nasal', dur: 0.08, noise: 0.0, oscMix: 1.0, formantMod: [250, 1000, 2000] },
    'n': { type: 'nasal', dur: 0.08, noise: 0.0, oscMix: 1.0, formantMod: [300, 1500, 2500] },
    'ñ': { type: 'nasal', dur: 0.10, noise: 0.0, oscMix: 1.0, formantMod: [300, 2000, 3000] }, 
    'l': { type: 'liquid', dur: 0.08, noise: 0.0, oscMix: 1.0, formantMod: [400, 1100, 2800] },
    'r': { type: 'liquid', dur: 0.06, noise: 0.1, oscMix: 0.9, formantMod: [400, 1300, 1700] }, 
    'λ': { type: 'liquid', dur: 0.10, noise: 0.0, oscMix: 1.0, formantMod: [350, 1800, 2600] }, 
};

// --- DICTIONARY ---

interface PhonemeStep {
    type: 'consonant' | 'vowel';
    id: string; 
    duration?: number;
}

const parsePortuguese = (text: string): PhonemeStep[] => {
    let t = text.toLowerCase().trim();
    const steps: PhonemeStep[] = [];
    
    // Substitutions
    t = t.replace(/nh/g, 'ñ');
    t = t.replace(/lh/g, 'λ');
    t = t.replace(/rr/g, 'h');
    t = t.replace(/ch/g, 'x'); 
    t = t.replace(/ss/g, 's');
    t = t.replace(/qu(?=[eiéí])/g, 'k');
    t = t.replace(/gu(?=[eiéí])/g, 'g');
    t = t.replace(/qu/g, 'k');
    t = t.replace(/c(?=[eiéí])/g, 's');
    t = t.replace(/c(?=[aouáóú])/g, 'k');
    t = t.replace(/g(?=[eiéí])/g, 'j');
    t = t.replace(/([aeiouáéíóúãõ])s([aeiouáéíóúãõ])/g, '$1z$2');
    if (t.startsWith('r')) t = 'h' + t.substring(1);
    t = t.replace(/ç/g, 's');

    let i = 0;
    while (i < t.length) {
        let char = t[i];
        const isVowel = ['a','e','i','o','u'].includes(char);
        if (isVowel) {
            let next = t[i+1];
            let isNasalMarker = (next === 'n' || next === 'm');
            if (isNasalMarker && i+2 < t.length && ['a','e','i','o','u','á','é','í','ó','ú','ã','õ'].includes(t[i+2])) {
                isNasalMarker = false; 
            }
            if (isNasalMarker) {
                steps.push({ type: 'vowel', id: char + 'n' });
                i += 2; 
                continue;
            }
        }

        if (['á','à','â'].includes(char)) steps.push({ type: 'vowel', id: 'a' });
        else if (['é','ê'].includes(char)) steps.push({ type: 'vowel', id: 'e' });
        else if (['í'].includes(char)) steps.push({ type: 'vowel', id: 'i' });
        else if (['ó','ô'].includes(char)) steps.push({ type: 'vowel', id: 'o' });
        else if (['ú','ü'].includes(char)) steps.push({ type: 'vowel', id: 'u' });
        else if (['ã'].includes(char)) steps.push({ type: 'vowel', id: 'an' });
        else if (['õ'].includes(char)) steps.push({ type: 'vowel', id: 'on' });
        else if (VOWEL_LIB[char]) {
            steps.push({ type: 'vowel', id: char });
            i++;
        }
        else if (CONSONANT_LIB[char]) {
            steps.push({ type: 'consonant', id: char, duration: CONSONANT_LIB[char].dur });
            i++;
        }
        else { i++; }
    }
    if (steps.length === 0) steps.push({ type: 'vowel', id: 'a' });
    return steps;
};

const parseGeneric = (text: string): PhonemeStep[] => {
    let t = text.toLowerCase().trim();
    if (!t) return [{ type: 'vowel', id: 'a' }];
    const steps: PhonemeStep[] = [];
    for(let i=0; i<t.length; i++) {
        const char = t[i];
        if (CONSONANT_LIB[char]) {
            steps.push({ type: 'consonant', id: char, duration: CONSONANT_LIB[char].dur });
        } else if (VOWEL_LIB[char]) {
            steps.push({ type: 'vowel', id: char });
        }
    }
    if (steps.length === 0) steps.push({ type: 'vowel', id: 'a' });
    return steps;
}

const getPhonemes = (text: string, lang: VocalLanguage): PhonemeStep[] => {
    switch (lang) {
        case VocalLanguage.PT_BR: return parsePortuguese(text);
        default: return parseGeneric(text);
    }
}

// --- PRESET DEFINITIONS ---
// Refactored for better DSP results with the current engine

export const VOCAL_PRESETS_DATA: Record<VocalPreset, AudioPresetDefinition> = {
  // SPECIAL
  [VocalPreset.SAMPLER]: { 
      baseFreq: 440, formantScale: 1.0, type: 'custom', 
      sampler: { rootNote: 60, detune: 0, mode: 'SEQUENCE', slices: [{start:0, end:1}], activeSliceIndex: 0, sensitivity: 0.5, vowelMap: {a:0,e:0,i:0,o:0,u:0} } 
  },
  [VocalPreset.PLUGIN]: { baseFreq: 440, formantScale: 1.0, type: 'custom' },
  [VocalPreset.CUSTOM]: { baseFreq: 130, formantScale: 1.0, type: 'sawtooth' },

  // REALISTIC / HUMANOID
  [VocalPreset.MALE_BR]: { 
      baseFreq: 120, formantScale: 1.0, type: 'sawtooth', 
      breath: 0.05, vibrato: { depth: 0.015, rate: 5.5 }, 
      oscGain: 0.9, jitter: 0.01 
  },
  [VocalPreset.FEMALE_BR]: { 
      baseFreq: 220, formantScale: 1.18, type: 'sawtooth', 
      breath: 0.08, vibrato: { depth: 0.02, rate: 6.0 }, 
      oscGain: 0.85, jitter: 0.015 
  },
  [VocalPreset.CHILD]: { 
      baseFreq: 280, formantScale: 1.4, type: 'triangle', 
      breath: 0.02, vibrato: { depth: 0.01, rate: 6.5 }, 
      oscGain: 1.0 
  },
  [VocalPreset.BASS]: { 
      baseFreq: 75, formantScale: 0.85, type: 'sawtooth', 
      breath: 0.1, vibrato: { depth: 0.02, rate: 4.5 }, 
      oscGain: 1.0 
  },
  [VocalPreset.POP]: { 
      baseFreq: 180, formantScale: 1.05, type: 'sawtooth', 
      breath: 0.05, vibrato: { depth: 0.03, rate: 5.0 }, 
      comp: true, oscGain: 0.9 
  },
  [VocalPreset.OPERA]: { 
      baseFreq: 200, formantScale: 1.1, type: 'sine', 
      breath: 0.0, vibrato: { depth: 0.25, rate: 6.0 }, 
      longReverb: true, oscGain: 1.0 
  },
  
  // CHARACTER / EMOTIONAL
  [VocalPreset.BREATHY]: { 
      baseFreq: 150, formantScale: 1.0, type: 'sine', 
      breath: 0.5, vibrato: { depth: 0.05, rate: 5 }, 
      oscGain: 0.4 
  }, 
  [VocalPreset.WHISPER]: { 
      baseFreq: 130, formantScale: 1.0, type: 'custom', 
      breath: 0.95, oscGain: 0.05, 
      filterHighPass: 1000 // Custom logic needed in renderVocals or just rely on breath
  },
  [VocalPreset.NASAL]: { 
      baseFreq: 140, formantScale: 1.0, type: 'sawtooth', 
      nasal: 0.8, vibrato: { depth: 0.05, rate: 5 }, 
      bandpass: [800, 3000]
  },
  [VocalPreset.HOARSE]: { 
      baseFreq: 110, formantScale: 1.0, type: 'sawtooth', 
      roughness: 0.5, breath: 0.4, jitter: 0.1 
  },
  [VocalPreset.ANXIOUS]: { 
      baseFreq: 160, formantScale: 1.0, type: 'sawtooth', 
      jitter: 0.25, vibrato: { depth: 0.15, rate: 8.0 }, 
      breath: 0.2 
  },
  [VocalPreset.SAD]: { 
      baseFreq: 140, formantScale: 0.95, type: 'sine', 
      pitchDrop: true, vibrato: { depth: 0.03, rate: 4.0 }, 
      breath: 0.1 
  },
  [VocalPreset.HAPPY]: { 
      baseFreq: 180, formantScale: 1.15, type: 'triangle', 
      pitchRise: true, vibrato: { depth: 0.1, rate: 6.5 }, 
      breath: 0.0 
  },
  [VocalPreset.ANGRY]: { 
      baseFreq: 120, formantScale: 1.0, type: 'sawtooth', 
      distortion: 0.5, roughness: 0.3, breath: 0.1, 
      comp: true 
  },

  // ROBOTIC / SYNTH
  [VocalPreset.TALKBOX]: { 
      baseFreq: 130, formantScale: 1.0, type: 'sawtooth', 
      distortion: 2.5, breath: 0.0, vibrato: { depth: 0.0, rate: 0 }, 
      jitter: 0.0, oscGain: 1.0 
  },
  [VocalPreset.ROBOT]: { 
      baseFreq: 110, formantScale: 1.0, type: 'square', 
      steps: true, vibrato: { depth: 0, rate: 0 }, 
      glide: 0, breath: 0.0 
  },
  [VocalPreset.VOCALOID_JP]: { 
      baseFreq: 260, formantScale: 1.25, type: 'pulse', 
      jitter: 0.04, vibrato: { depth: 0.02, rate: 6.0 }, 
      breath: 0.01 
  },
  [VocalPreset.VOCALOID_BR]: { 
      baseFreq: 240, formantScale: 1.1, type: 'sawtooth', 
      jitter: 0.06, vibrato: { depth: 0.03, rate: 5.5 }, 
      breath: 0.02 
  },
  [VocalPreset.METALLIC]: { 
      baseFreq: 130, formantScale: 1.0, type: 'pulse', 
      fm: { depth: 50, rate: 200 }, vibrato: { depth: 0.0, rate: 0 } 
  },
  [VocalPreset.MONOTONE]: { 
      baseFreq: 130, formantScale: 1.0, type: 'square', 
      steps: true, vibrato: { depth: 0, rate: 0 }, glide: 0 
  },
  [VocalPreset.DISTORTED]: { 
      baseFreq: 130, formantScale: 1.0, type: 'sawtooth', 
      distortion: 1.5, clip: 0.8, breath: 0.2 
  },
  [VocalPreset.TELEPHONE]: { 
      baseFreq: 130, formantScale: 1.0, type: 'square', 
      bandpass: [400, 2000], distortion: 0.3 
  },
  [VocalPreset.VHS]: { 
      baseFreq: 130, formantScale: 1.0, type: 'triangle', 
      flutter: 0.3, breath: 0.2, bandpass: [100, 6000] 
  },
  [VocalPreset.ALIEN]: { 
      baseFreq: 130, formantScale: 1.0, type: 'pulse', 
      fm: { depth: 100, rate: 50 }, jitter: 0.1 
  },
  [VocalPreset.DEMON]: { 
      baseFreq: 60, formantScale: 0.7, type: 'sawtooth', 
      subHarmonics: true, distortion: 0.8, breath: 0.3 
  },
  
  // FX / TEXTURES
  [VocalPreset.CHORUS]: { baseFreq: 130, formantScale: 1.0, type: 'sawtooth', chorus: true },
  [VocalPreset.ETHEREAL]: { baseFreq: 200, formantScale: 1.0, type: 'sine', longReverb: true, breath: 0.2 },
  [VocalPreset.CARTOON]: { baseFreq: 300, formantScale: 1.6, type: 'pulse', jitter: 0.2, vibrato: { depth: 0.1, rate: 8} },
  [VocalPreset.REALISTIC]: { baseFreq: 130, formantScale: 1.0, type: 'sawtooth', jitter: 0.015, humanize: 0.5 },
  [VocalPreset.SYNTH_BELL]: { baseFreq: 130, formantScale: 1.0, type: 'sine', fm: { depth: 2, rate: 300 } },
  [VocalPreset.E_PIANO]: { baseFreq: 130, formantScale: 1.0, type: 'sine', amRate: 100, amDepth: 0.5 },
  [VocalPreset.FALSETTO]: { baseFreq: 350, formantScale: 1.0, type: 'sine', breath: 0.3 },
  [VocalPreset.ANDROGYNOUS]: { baseFreq: 170, formantScale: 1.05, type: 'triangle', vibrato: { depth: 0.02, rate: 5 } }
};

export const getNoteFromMidi = (midi: number) => {
    const notes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    return notes[midi % 12];
};

export const isNoteInScale = (midi: number, root: string, scale: ScaleType): boolean => {
    const rootBase = NOTE_FREQUENCIES[root];
    if (!rootBase) return true;
    const notes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const rootIndex = notes.indexOf(root);
    const noteIndex = midi % 12;
    const interval = (noteIndex - rootIndex + 12) % 12;
    return SCALE_INTERVALS[scale].includes(interval);
};

export const midiToFreq = (midi: number): number => {
  return 440 * Math.pow(2, (midi - 69) / 12);
};

// --- AUDIO UTILS ---

export const decodeAudioData = async (ctx: AudioContext | OfflineAudioContext, base64: string): Promise<AudioBuffer> => {
    const binaryString = window.atob(base64.split(',')[1]);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return await ctx.decodeAudioData(bytes.buffer);
};

export const detectSlices = (buffer: AudioBuffer, sensitivity: number): {start: number, end: number}[] => {
    const data = buffer.getChannelData(0);
    const step = Math.floor(buffer.sampleRate / 100); 
    const slices = [];
    const threshold = 0.01 + ((1 - sensitivity) * 0.1);
    
    let isSilent = true;
    let startSample = 0;
    
    for(let i=0; i<data.length; i+=step) {
        let sum = 0;
        for(let j=0; j<step && i+j<data.length; j++) {
            sum += data[i+j] * data[i+j];
        }
        const rms = Math.sqrt(sum / step);
        
        if (isSilent && rms > threshold) {
            isSilent = false;
            startSample = i;
        } else if (!isSilent && rms < threshold) {
            isSilent = true;
            if (i - startSample > step * 5) { 
                slices.push({
                    start: startSample / data.length,
                    end: i / data.length
                });
            }
        }
    }
    if (!isSilent) {
        slices.push({
            start: startSample / data.length,
            end: 1.0
        });
    }
    if (slices.length === 0) return [{start: 0, end: 1}];
    return slices;
};

// --- ENCODING UTILS ---

export const bufferToMp3 = (buffer: AudioBuffer, bitrate: number): Blob => {
    if (typeof lamejs === 'undefined') throw new Error("LameJS not found.");
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const mp3enc = new lamejs.Mp3Encoder(channels, sampleRate, bitrate);
    const left = buffer.getChannelData(0);
    const right = channels > 1 ? buffer.getChannelData(1) : left;
    const sampleBlockSize = 1152;
    const mp3Data = [];
    const l16 = new Int16Array(left.length);
    const r16 = new Int16Array(right.length);
    for(let i=0; i<left.length; i++) {
        l16[i] = Math.max(-1, Math.min(1, left[i])) * 32767;
        r16[i] = Math.max(-1, Math.min(1, right[i])) * 32767;
    }
    for (let i = 0; i < l16.length; i += sampleBlockSize) {
        const leftChunk = l16.subarray(i, i + sampleBlockSize);
        const rightChunk = r16.subarray(i, i + sampleBlockSize);
        let mp3buf = channels === 1 ? mp3enc.encodeBuffer(leftChunk) : mp3enc.encodeBuffer(leftChunk, rightChunk);
        if (mp3buf.length > 0) mp3Data.push(mp3buf);
    }
    const endBuf = mp3enc.flush();
    if (endBuf.length > 0) mp3Data.push(endBuf);
    return new Blob(mp3Data, { type: 'audio/mp3' });
};

export const bufferToWav = (buffer: AudioBuffer, bitDepth: 8 | 16 | 32 = 16): Blob => {
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = bitDepth === 32 ? 3 : 1; 
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numOfChan * bytesPerSample;
  const length = buffer.length * blockAlign + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels = [];
  let pos = 0;

  const setUint16 = (data: number) => { view.setUint16(pos, data, true); pos += 2; };
  const setUint32 = (data: number) => { view.setUint32(pos, data, true); pos += 4; };

  setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157); 
  setUint32(0x20746d66); setUint32(16); setUint16(format); setUint16(numOfChan);
  setUint32(sampleRate); setUint32(sampleRate * blockAlign); setUint16(blockAlign); setUint16(bitDepth);
  setUint32(0x61746164); setUint32(length - pos - 4); 

  for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

  let offset = 0;
  while (pos < length) {
    if (offset >= buffer.length) break;
    for (let i = 0; i < numOfChan; i++) {
       let sample = Math.max(-1, Math.min(1, channels[i][offset]));
       if (bitDepth === 8) { view.setUint8(pos, ((sample * 0.5 + 0.5) * 255)); pos += 1; } 
       else if (bitDepth === 16) { view.setInt16(pos, (sample < 0 ? sample * 32768 : sample * 32767) | 0, true); pos += 2; } 
       else if (bitDepth === 32) { view.setFloat32(pos, sample, true); pos += 4; }
    }
    offset++;
  }
  return new Blob([bufferArr], { type: 'audio/wav' });
};

export const applyReverb = async (ctx: OfflineAudioContext, inputBuffer: AudioBuffer, mix: number, decayTime: number): Promise<AudioBuffer> => {
  if (mix <= 0) return inputBuffer;
  const sampleRate = ctx.sampleRate;
  const length = inputBuffer.length;
  const irLength = sampleRate * decayTime;
  const irBuffer = ctx.createBuffer(1, irLength, sampleRate);
  const irData = irBuffer.getChannelData(0);
  for (let i = 0; i < irLength; i++) irData[i] = (Math.random() * 2 - 1) * Math.pow(1 - (i / irLength), 4);
  
  const convCtx = new OfflineAudioContext(1, length, sampleRate);
  const source = convCtx.createBufferSource();
  source.buffer = inputBuffer;
  const convolver = convCtx.createConvolver();
  convolver.buffer = irBuffer;
  convolver.normalize = true;
  const dryGain = convCtx.createGain();
  const wetGain = convCtx.createGain();
  dryGain.gain.value = 1 - (mix * 0.5);
  wetGain.gain.value = mix;
  source.connect(dryGain);
  dryGain.connect(convCtx.destination);
  source.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(convCtx.destination);
  source.start();
  return await convCtx.startRendering();
};

/**
 * CORE DSP ENGINE
 * Updated for Optimization and Crash Fix
 */
export const renderVocals = async (ctx: OfflineAudioContext, params: VocalParams, duration: number, baseFreq: number, startFreq?: number, isOptimized: boolean = false): Promise<AudioBuffer> => {
    const sampleRate = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    
    // Config
    let preset = params.customData || VOCAL_PRESETS_DATA[params.preset] || VOCAL_PRESETS_DATA[VocalPreset.MALE_BR];
    
    // --- DICTIONARY PARSING ---
    const phonemes = getPhonemes(params.text || 'a', params.language);
    
    // Timing Calculation
    let totalConsonantTime = 0;
    let vowelCount = 0;
    
    phonemes.forEach(p => {
        if (p.type === 'consonant') totalConsonantTime += (p.duration || 0.05);
        else vowelCount++;
    });
    
    let timeScale = 1.0;
    if (totalConsonantTime > duration * 0.9) {
        timeScale = (duration * 0.9) / totalConsonantTime;
        totalConsonantTime = duration * 0.9;
    }
    
    const remainingTime = duration - totalConsonantTime;
    const vowelDuration = Math.max(0.01, remainingTime / (vowelCount || 1));
    
    const timeline: { start: number, end: number, type: string, def: any }[] = [];
    let currentTime = 0;
    
    phonemes.forEach(p => {
        let dur = 0;
        let def: any = null;
        if (p.type === 'consonant') {
            dur = (p.duration || 0.05) * timeScale;
            def = CONSONANT_LIB[p.id];
        } else {
            dur = vowelDuration;
            def = VOWEL_LIB[p.id] || VOWEL_LIB['a'];
        }
        timeline.push({ start: currentTime, end: currentTime + dur, type: p.type, def: def });
        currentTime += dur;
    });

    // CRITICAL FIX: Ensure timeline has fallback if empty
    if (timeline.length === 0) {
        timeline.push({ start: 0, end: duration, type: 'vowel', def: VOWEL_LIB['a'] });
    }

    // Synth Params
    const breathBase = preset.breath || 0;
    const breathMod = params.breathiness || 0;
    const noiseLevelVowel = Math.min(0.9, breathBase + breathMod); 
    const oscLevelVowel = preset.oscGain ?? 1.0; 
    
    // Filter State
    const CHUNK_SIZE = 64;
    let filters: any[] = [];
    
    let phase = 0;
    const glideTime = params.glide !== undefined ? params.glide : 0.1; // Use user param for glide time (e.g. 0.01 for Autotune)
    const vibratoRate = preset.vibrato?.rate || 5;
    const vibratoDepth = preset.vibrato?.depth || 0;
    const jitterAmount = (preset.jitter || 0) + (params.jitter || 0);

    let currentFreq = startFreq || baseFreq;
    const targetFreq = baseFreq;
    
    let nasalFilterState = 0;

    // PERFORMANCE OPTIMIZATION: Track segment index manually to avoid O(N) search per sample
    let segmentIndex = 0;
    
    for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        
        // --- 1. Timeline Logic (O(1) with manual index) ---
        // Advance segment if needed
        if (segmentIndex < timeline.length - 1 && t >= timeline[segmentIndex].end) {
            segmentIndex++;
        }
        
        const segment = timeline[segmentIndex];
        
        // CRITICAL FIX: Safety Check for Invalid Segment
        if (!segment) {
            data[i] = 0;
            continue;
        }

        const nextSegment = timeline[segmentIndex + 1];
        
        const segmentDuration = segment.end - segment.start;
        // Clamp localT 0..1 to avoid math errors if t drifts slightly
        let localT = (t - segment.start) / segmentDuration;
        if (localT < 0) localT = 0; if (localT > 1) localT = 1;
        
        let currentFormants: number[] = [500,1500,2500,3500];
        let currentBandwidths: number[] = [100,100,100,100];
        let currentNoise = noiseLevelVowel;
        let currentOsc = oscLevelVowel;
        let hpCutoff = 0;
        let isNasal = false;

        if (segment.type === 'consonant') {
            const cons = segment.def as ConsonantDef;
            const p = localT; 
            
            if (cons.type === 'plosive') {
                if (p < 0.5) { currentOsc = 0; currentNoise = 0; }
                else { currentOsc = cons.oscMix; currentNoise = cons.noise; hpCutoff = cons.filterHighPass || 0; }
            } else if (cons.type === 'fricative') {
                currentOsc = cons.oscMix * p; 
                currentNoise = cons.noise * (1 - p*0.3);
                hpCutoff = cons.filterHighPass || 0;
            } else {
                currentOsc = 1.0;
                currentNoise = 0.05;
                if (cons.formantMod) currentFormants = cons.formantMod;
            }
            
            if (!cons.formantMod) {
                const nextVowel = timeline.slice(segmentIndex).find(s => s.type === 'vowel');
                if (nextVowel) {
                    currentFormants = nextVowel.def.f;
                    currentBandwidths = nextVowel.def.bw;
                }
            }

        } else {
            const vow = segment.def;
            isNasal = vow.nasal || false;
            
            if (nextSegment && nextSegment.type === 'vowel') {
                const mix = (1 - Math.cos(localT * Math.PI)) / 2; 
                const fA = vow.f;
                const fB = nextSegment.def.f;
                currentFormants = fA.map((f: number, k: number) => f + (fB[k] - f) * mix);
                const bwA = vow.bw;
                const bwB = nextSegment.def.bw;
                currentBandwidths = bwA.map((b: number, k: number) => b + (bwB[k] - b) * mix);
            } else {
                currentFormants = vow.f;
                currentBandwidths = vow.bw;
            }
        }

        // --- 2. Update Filter Coeffs (Chunked) ---
        if (i % CHUNK_SIZE === 0) {
            const formantScale = (preset.formantScale || 1.0) * (params.formantShift || 1.0);
            
            // OPTIMIZATION: Use fewer formants in optimized mode
            const numFilters = isOptimized ? Math.min(3, currentFormants.length) : currentFormants.length;
            
            const formants = currentFormants.slice(0, numFilters).map(f => f * formantScale);
            const bandwidths = currentBandwidths.slice(0, numFilters);
            
            // Only recompute if array size changed or filters empty
            if (filters.length !== numFilters) filters = new Array(numFilters);

            for(let k=0; k<numFilters; k++) {
                const freq = formants[k];
                const bw = bandwidths[k] || 100;
                const r = Math.exp(-Math.PI * bw / sampleRate);
                const theta = 2 * Math.PI * freq / sampleRate;
                
                // Reuse existing object if possible to reduce GC
                if (!filters[k]) filters[k] = { y1: 0, y2: 0 };
                
                filters[k].c1 = 2 * r * Math.cos(theta);
                filters[k].c2 = -r * r;
                filters[k].gain = (1 - r) * Math.sqrt(1 - 2*r*Math.cos(2*theta) + r*r);
            }
        }

        // --- 3. Source Generation ---
        if (startFreq && t < glideTime) {
            const p = t / glideTime;
            currentFreq = startFreq + (targetFreq - startFreq) * (p * (2 - p)); 
        } else {
            currentFreq = targetFreq;
        }
        
        const vib = Math.sin(t * vibratoRate * 2 * Math.PI) * vibratoDepth * currentFreq;
        const jit = (Math.random() - 0.5) * jitterAmount * currentFreq;
        const f = Math.max(20, currentFreq + vib + jit);
        phase += f / sampleRate;
        if (phase >= 1.0) phase -= 1.0;

        let source = 0;
        // Optimized: Simplified oscillators logic
        switch(preset.type) {
            case 'sawtooth': 
                source = 1.0 - 2.0 * phase; 
                if (!isOptimized) source -= 0.5 * (source*source*source); 
                break;
            case 'square': source = phase < 0.5 ? 1 : -1; break;
            case 'pulse': source = phase < 0.1 ? 1 : -1; break;
            case 'triangle': source = 2 * Math.abs(2 * (phase - Math.floor(phase + 0.5))) - 1; break;
            case 'sine': source = Math.sin(phase * 2 * Math.PI); break;
            default: source = 1.0 - 2.0 * phase;
        }

        let noise = (Math.random() * 2 - 1);
        if (hpCutoff > 0) {
            if (Math.random() > 0.5) noise *= 0.5; 
        }
        noise *= currentNoise;

        const input = (source * currentOsc) + noise;

        // --- 4. Formant Filtering (Bottleneck) ---
        let out = 0;
        if (params.preset !== VocalPreset.SYNTH_BELL && params.preset !== VocalPreset.E_PIANO) {
            for (let k = 0; k < filters.length; k++) {
                const filt = filters[k];
                const y = filt.gain * input + filt.c1 * filt.y1 + filt.c2 * filt.y2;
                filt.y2 = filt.y1;
                filt.y1 = y;
                out += y;
            }
            out *= 0.35; 
        } else {
            out = input * 0.5;
        }

        // --- 5. Post-Processing ---
        if ((isNasal || (preset.nasal && preset.nasal > 0)) && !isOptimized) {
             const alpha = 0.05;
             nasalFilterState += alpha * (out - nasalFilterState);
             out = (out * 0.4) + (nasalFilterState * 0.8); 
        }

        // --- 6. Saturation ---
        const drive = 1.2 + (preset.distortion || 0);
        
        if (isOptimized) {
            // Soft Clipper (Fast)
            out = (out * drive) / (1 + Math.abs(out * drive));
        } else {
            // Tanh (Heavy)
            out = Math.tanh(out * drive);
        }
        
        if (preset.steps) { const step = 0.2; out = Math.round(out / step) * step; }
        if (preset.clip) { if (out > preset.clip) out = preset.clip; if (out < -preset.clip) out = -preset.clip; }

        data[i] = out;
    }
    
    // ADSR
    const attack = Math.min(0.05, duration * 0.1) * sampleRate;
    const release = Math.min(0.05, duration * 0.2) * sampleRate;
    const len = data.length;
    for(let i=0; i<attack && i<len; i++) data[i] *= (i / attack);
    for(let i=0; i<release && len-1-i >= 0; i++) data[len-1-i] *= (i / release);

    return buffer;
};

export const renderProject = async (
    mainCtx: OfflineAudioContext, 
    sequencerTracks: SequencerTrack[] | null,
    playlistTracks: PlaylistTrack[],
    bpm: number, 
    sampleRate: number,
    startTime: number = 0,
    endTime: number = 0,
    isOptimized: boolean = false,
    onProgress?: (percent: number) => void
): Promise<AudioBuffer> => {
     
     // Calculate total operations for progress
     let totalItems = 0;
     if (sequencerTracks) {
         sequencerTracks.forEach(t => !t.muted ? totalItems += t.notes.length : null);
     }
     playlistTracks.forEach(t => !t.muted ? totalItems += t.clips.length : null);
     
     let processedCount = 0;

     if (sequencerTracks && sequencerTracks.length > 0) {
         for (const track of sequencerTracks) {
             if (track.muted) continue;
             for (const note of track.notes) {
                 // YIELD TO EVENT LOOP to prevent freezing
                 if (processedCount % 5 === 0) await new Promise(r => setTimeout(r, 0));

                 const start = note.startTime * (60 / bpm);
                 const dur = note.duration * (60 / bpm);
                 const end = start + dur;
                 const renderEnd = endTime > 0 ? endTime : Infinity;

                 // Check overlap with render window
                 if (end < startTime || start > renderEnd) {
                     processedCount++;
                     if (onProgress && totalItems > 0) onProgress((processedCount / totalItems) * 100);
                     continue;
                 }

                 const freq = midiToFreq(note.midi);
                 
                 const effectiveParams: VocalParams = {
                     ...track.vocalParams,
                     text: note.lyric || track.vocalParams.text
                 };

                 const noteBuffer = await renderVocals(mainCtx, effectiveParams, dur, freq, undefined, isOptimized);
                 
                 const source = mainCtx.createBufferSource();
                 source.buffer = noteBuffer;
                 const gain = mainCtx.createGain();
                 gain.gain.value = track.volume;
                 source.connect(gain);
                 gain.connect(mainCtx.destination);
                 
                 // Timing Compensation for Render Window
                 // If export starts at 10s and note starts at 12s, relative start is 2s.
                 const relativeStart = start - startTime;
                 if (relativeStart >= 0) {
                     source.start(relativeStart);
                 } else {
                     // Note starts before window, skip offset
                     source.start(0, -relativeStart);
                 }
                 
                 processedCount++;
                 if (onProgress && totalItems > 0) onProgress((processedCount / totalItems) * 100);
             }
         }
     }

     for (const track of playlistTracks) {
         if (track.muted) continue;
         for (const clip of track.clips) {
             if (!clip.buffer) continue;
             
             // YIELD TO EVENT LOOP
             if (processedCount % 5 === 0) await new Promise(r => setTimeout(r, 0));

             const clipStart = clip.startTime;
             const clipEnd = clip.startTime + clip.duration;
             const renderEnd = endTime > 0 ? endTime : Infinity;
             if (clipEnd < startTime || clipStart > renderEnd) {
                 processedCount++;
                 if (onProgress && totalItems > 0) onProgress((processedCount / totalItems) * 100);
                 continue;
             }
             
             const startOffsetInRender = Math.max(0, clipStart - startTime);
             const skipInClip = Math.max(0, startTime - clipStart);
             
             let playDuration = clip.duration - skipInClip;
             if (endTime > 0) {
                 const timeRemains = endTime - (Math.max(startTime, clipStart));
                 playDuration = Math.min(playDuration, timeRemains);
             }
             if (playDuration <= 0) {
                 processedCount++;
                 if (onProgress && totalItems > 0) onProgress((processedCount / totalItems) * 100);
                 continue;
             }

             const source = mainCtx.createBufferSource();
             source.buffer = clip.buffer;
             const gain = mainCtx.createGain();
             gain.gain.value = track.volume;
             source.connect(gain);
             gain.connect(mainCtx.destination);
             source.start(startOffsetInRender, clip.offset + skipInClip, playDuration);
             
             processedCount++;
             if (onProgress && totalItems > 0) onProgress((processedCount / totalItems) * 100);
         }
     }
     
     if (onProgress) onProgress(100);
     return mainCtx.startRendering();
}
