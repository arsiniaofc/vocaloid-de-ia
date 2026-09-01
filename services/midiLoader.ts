
import { SequencerNote, SequencerTrack, VocalPreset, VocalMode, VowelType, VocalLanguage } from '../types';

const TRACK_COLORS = [
    '#38bdf8', // Cyan
    '#f472b6', // Pink
    '#a78bfa', // Purple
    '#34d399', // Green
    '#fbbf24', // Amber
    '#f87171', // Red
    '#c084fc', // Violet
    '#22d3ee', // Light Blue
    '#a3e635', // Lime
    '#fb923c'  // Orange
];

/**
 * Parses RTTTL (Ring Tone Text Transfer Language) / RTX string
 */
function parseRtttl(text: string): { tracks: SequencerTrack[], bpm: number } {
  const parts = text.trim().split(':');
  if (parts.length < 3) throw new Error("Invalid RTTTL/RTX format");
  
  // Parse Defaults (e.g., d=4,o=5,b=63)
  const defaults = parts[1].toLowerCase().split(',').reduce((acc, curr) => {
     const [k, v] = curr.split('=');
     if (k && v) acc[k.trim()] = parseInt(v.trim());
     return acc;
  }, { d: 4, o: 5, b: 63 } as any);
  
  const notesStr = parts[2];
  const tokens = notesStr.split(',');
  
  const notes: SequencerNote[] = [];
  let currentTime = 0; // In Beats
  
  tokens.forEach(token => {
      let t = token.trim().toLowerCase();
      if (!t) return;
      
      // Parse Duration
      let durStr = '';
      while (t.length > 0 && /\d/.test(t[0])) {
          durStr += t[0];
          t = t.slice(1);
      }
      let durationVal = durStr ? parseInt(durStr) : defaults.d;
      
      // Calculate beats: 4 / durationVal (e.g. 4/4 = 1 beat, 4/8 = 0.5 beat)
      let beats = 4.0 / durationVal;
      
      // Parse Note
      let noteChar = t[0];
      t = t.slice(1);
      
      let sharp = false;
      if (t.length > 0 && t[0] === '#') {
          sharp = true;
          t = t.slice(1);
      }
      
      let dot = false;
      if (t.includes('.')) {
          dot = true;
          t = t.replace('.', '');
      }
      
      // Parse Octave
      let octave = defaults.o;
      if (t.length > 0 && /\d/.test(t)) {
          octave = parseInt(t);
      }
      
      if (dot) beats *= 1.5;
      
      if (noteChar === 'p') {
          // Rest
          currentTime += beats;
      } else {
          // Note Conversion
          const baseMap: any = { c:0, d:2, e:4, f:5, g:7, a:9, b:11 };
          let midi = (octave + 1) * 12 + baseMap[noteChar];
          if (sharp) midi++;
          
          notes.push({
              id: Math.random().toString(36).substr(2, 9),
              midi: midi,
              startTime: currentTime,
              duration: beats,
              lyric: 'la'
          });
          
          currentTime += beats;
      }
  });
  
  const track: SequencerTrack = {
      id: 'track-1',
      name: parts[0] || 'RTTTL Melody',
      color: TRACK_COLORS[0],
      notes: notes,
      volume: 0.8,
      muted: false,
      solo: false,
      vocalParams: {
        text: "la",
        preset: VocalPreset.MALE_BR,
        language: VocalLanguage.PT_BR,
        mode: VocalMode.SINGING,
        vowel: VowelType.A,
        jitter: 0.1,
        humanize: 0.1,
        breathiness: 0.2,
        formantShift: 1.0,
        speed: 1.0,
        pitch: 1.0,
        octaveShift: 0,
        glide: 0.1,
        wordGap: 0.05
      }
  };

  return { tracks: [track], bpm: defaults.b || 120 };
}

/**
 * Universal Parser (MIDI & RTTTL)
 */
export const parseMidiFile = (arrayBuffer: ArrayBuffer): { tracks: SequencerTrack[], bpm: number } => {
  const data = new DataView(arrayBuffer);
  
  // 1. Check for MIDI Header
  let isMidi = false;
  try {
      if (getText(data, 0, 4) === 'MThd') isMidi = true;
  } catch (e) {}

  // 2. Fallback to RTTTL if not MIDI
  if (!isMidi) {
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(arrayBuffer);
      if (text.includes(':')) {
          return parseRtttl(text);
      }
      throw new Error("Unknown file format (Not MIDI or RTX/RTTTL)");
  }

  // 3. Parse MIDI
  let offset = 0;

  // Header Chunk
  const headerChunkType = getText(data, offset, 4);
  offset += 4;
  
  const headerLength = data.getUint32(offset);
  offset += 4;
  
  const format = data.getUint16(offset);
  offset += 2;
  const numTracks = data.getUint16(offset);
  offset += 2;
  const timeDivision = data.getUint16(offset); // Ticks per Quarter Note (PPQ)
  offset += 2;

  const tracks: SequencerTrack[] = [];
  let detectedBpm = 120;
  
  for (let t = 0; t < numTracks; t++) {
    if (offset >= data.byteLength) break;
    const trackChunkType = getText(data, offset, 4);
    offset += 4;
    
    if (trackChunkType !== 'MTrk') break;
    
    const trackLength = data.getUint32(offset);
    offset += 4;
    
    const trackEnd = offset + trackLength;
    let currentTimeTicks = 0;
    let runningStatus = 0;
    
    const activeNotes: Record<number, number> = {};
    const trackNotes: SequencerNote[] = [];
    let trackName = `Track ${t + 1}`;

    while (offset < trackEnd) {
      // Read Delta Time
      let deltaTime = 0;
      let byte = data.getUint8(offset++);
      deltaTime = byte & 0x7F;
      while (byte & 0x80) {
        byte = data.getUint8(offset++);
        deltaTime = (deltaTime << 7) | (byte & 0x7F);
      }
      
      currentTimeTicks += deltaTime;

      // Read Event Status
      let nextByte = data.getUint8(offset);
      let eventType = 0;

      if (nextByte & 0x80) {
        eventType = nextByte;
        offset++;
        if (eventType < 0xF0) runningStatus = eventType;
      } else {
        eventType = runningStatus;
      }

      // Process Event
      if (eventType === 0xFF) { 
        // Meta Event (FF <type> <len> <data>)
        const metaType = data.getUint8(offset++);
        const len = readVarLength();
        
        if (metaType === 0x51 && len === 3) {
            // Tempo Event: Microseconds per quarter note
            const microSeconds = (data.getUint8(offset) << 16) | (data.getUint8(offset + 1) << 8) | data.getUint8(offset + 2);
            detectedBpm = Math.round(60000000 / microSeconds);
        }
        else if (metaType === 0x03) {
            // Track Name
            trackName = getText(data, offset, len);
        }

        offset += len;
      } 
      else if (eventType === 0xF0 || eventType === 0xF7) {
        const len = readVarLength();
        offset += len;
      }
      else {
        // Voice Message
        const type = eventType & 0xF0;
        
        if (type === 0x80 || type === 0x90) { // Note Off / On
           const note = data.getUint8(offset++);
           const velocity = data.getUint8(offset++);
           
           if (type === 0x90 && velocity > 0) {
               // Note On
               activeNotes[note] = currentTimeTicks;
           } else {
               // Note Off
               if (activeNotes[note] !== undefined) {
                   const startTick = activeNotes[note];
                   const durationTicks = currentTimeTicks - startTick;
                   trackNotes.push({
                      id: Math.random().toString(36).substr(2, 9),
                      midi: note,
                      startTime: startTick / timeDivision,
                      duration: durationTicks / timeDivision,
                      lyric: "la"
                   });
                   delete activeNotes[note];
               }
           }
        } 
        else if (type === 0xC0 || type === 0xD0) {
           offset += 1; 
        } 
        else if (type === 0xB0 || type === 0xE0 || type === 0xA0) {
           offset += 2; 
        }
      }
    }

    if (trackNotes.length > 0) {
        tracks.push({
            id: `track-${t}-${Date.now()}`,
            name: trackName,
            color: TRACK_COLORS[tracks.length % TRACK_COLORS.length],
            notes: trackNotes.sort((a, b) => a.startTime - b.startTime),
            volume: 0.8,
            muted: false,
            solo: false,
            vocalParams: {
                text: "la",
                preset: VocalPreset.MALE_BR,
                language: VocalLanguage.PT_BR,
                mode: VocalMode.SINGING,
                vowel: VowelType.A,
                jitter: 0.1,
                humanize: 0.1,
                breathiness: 0.2,
                formantShift: 1.0,
                speed: 1.0,
                pitch: 1.0,
                octaveShift: 0,
                glide: 0.1,
                wordGap: 0.05
            }
        });
    }

    function readVarLength() {
        let len = 0;
        let b = data.getUint8(offset++);
        len = b & 0x7F;
        while (b & 0x80) {
            b = data.getUint8(offset++);
            len = (len << 7) | (b & 0x7F);
        }
        return len;
    }
  }

  return { tracks, bpm: detectedBpm };
};

function getText(data: DataView, offset: number, length: number) {
  let str = '';
  for (let i = 0; i < length; i++) {
    str += String.fromCharCode(data.getUint8(offset + i));
  }
  return str;
}
