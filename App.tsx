
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  VowelType, 
  VocalMode, 
  VocalPreset, 
  VocalParams, 
  GlobalParams,
  SequencerNote,
  SequencerTrack,
  AudioPresetDefinition,
  PluginDefinition,
  PluginParameter,
  ExportConfig,
  SamplerConfig,
  VocalLanguage,
  ScaleType,
  SnapGrid,
  MusicalKeyConfig,
  PlaylistTrack,
  PlaylistClip
} from './types';
import { 
  renderVocals, 
  renderProject,
  applyReverb,
  bufferToWav,
  bufferToMp3,
  NOTE_FREQUENCIES,
  VOCAL_PRESETS_DATA,
  decodeAudioData,
  detectSlices
} from './services/audioEngine';
import { parseMidiFile } from './services/midiLoader';
import { ControlSlider } from './components/Knob';
import { PianoRoll } from './components/PianoRoll';
import { Visualizer } from './components/Visualizer';
import { PlaylistGrid } from './components/PlaylistGrid';
import { 
  Play, Download, Mic, Activity, Settings, Music, Piano, Upload, 
  Save, FileJson, Type, X, Check, TrendingUp, Waves, Plus, Volume2, 
  VolumeX, Layers, Sliders, AudioWaveform, SquareActivity, Pause,
  Database, Copy, Calculator, FileCode, ArrowRight, Code, Terminal, Plug2,
  Repeat, Gamepad2, Zap, FileAudio, Gauge, Scissors, Music2, Grid, Languages, Link2,
  Magnet, Lock, AlignJustify, ListMusic, Speaker, Trash2, TestTube2, Dna
} from 'lucide-react';

type Tab = 'COMPOSE' | 'PLAYLIST' | 'RACK' | 'VOICE' | 'MATH' | 'DATA' | 'CALC' | 'SAMPLER';

const EXAMPLE_PLUGIN_JSON: PluginDefinition = {
  "plugin_meta": {
    "id": "test.voice.sine",
    "name": "Vocal Sine Simple",
    "author": "Moita",
    "type": "voice_engine",
    "version": "1.0.0",
    "description": "Plugin de teste que gera uma voz simples a partir de sine wave para validar a lógica de integração"
  },

  "parameters": {
    "detune": {"type":"float","min":-12,"max":12,"default":0, "unit":"semitones"},
    "volume": {"type":"float","min":0.0,"max":1.0,"default":0.5},
    "vibrato_depth": {"type":"float","min":0.0,"max":0.05,"default":0.01},
    "vibrato_rate": {"type":"float","min":1.0,"max":10.0,"default":5.0}
  },

  "nodes": [
    {
      "name": "oscillator",
      "function": "sine_wave",
      "inputs": ["midi_note"],
      "params": {
        "freq": "midi_to_freq(midi_note + detune)",
        "amplitude": "volume",
        "vibrato_depth": "vibrato_depth",
        "vibrato_rate": "vibrato_rate"
      }
    },
    {
      "name": "output",
      "function": "output_node",
      "inputs": ["oscillator"],
      "params": {}
    }
  ],

  "presets": [
    {
      "name": "Test Voice",
      "params": {"detune":0,"volume":0.5,"vibrato_depth":0.01,"vibrato_rate":5.0}
    }
  ]
};

declare global {
  interface Window {
    chrome?: {
      webview?: {
        postMessage: (message: string) => void;
        addEventListener: (type: string, listener: (event: any) => void) => void;
        removeEventListener: (type: string, listener: (event: any) => void) => void;
      }
    };
    sendToVstHost?: (message: any) => void;
  }
}

const App: React.FC = () => {
  // --- VST HOST BRIDGE ---
  useEffect(() => {
    // Helper to send messages to VST C++ Host
    window.sendToVstHost = (message: any) => {
      if (window.chrome?.webview) {
        window.chrome.webview.postMessage(JSON.stringify(message));
      }
    };

    const handleHostMessage = (event: any) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SET_BPM') {
           setGlobalParams(prev => ({ ...prev, bpm: msg.value }));
        }
        if (msg.type === 'PLAY_NOTE') {
           // Handle external MIDI
           console.log("MIDI Note from VST:", msg.note, msg.velocity);
        }
      } catch (e) {
        console.error("Failed to parse VST message", e);
      }
    };

    if (window.chrome?.webview) {
      window.chrome.webview.addEventListener('message', handleHostMessage);
      window.sendToVstHost({ type: 'UI_READY' });
    }

    return () => {
      if (window.chrome?.webview) {
        window.chrome.webview.removeEventListener('message', handleHostMessage);
      }
    };
  }, []);

  // --- STATE ---
  const [activeTab, setActiveTab] = useState<Tab>('COMPOSE');
  const [isGenerating, setIsGenerating] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0); // 0-100
  const [generatedBuffer, setGeneratedBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackBeat, setPlaybackBeat] = useState(0);
  const [playbackTime, setPlaybackTime] = useState(0);

  // Audio Context
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  // Sampler Editor State
  const [samplerBuffer, setSamplerBuffer] = useState<AudioBuffer | null>(null);
  const samplerCanvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedVowelForMapping, setSelectedVowelForMapping] = useState<string>('a');

  // Fusion Lab State
  const [fusionA, setFusionA] = useState<VocalPreset>(VocalPreset.MALE_BR);
  const [fusionB, setFusionB] = useState<VocalPreset>(VocalPreset.ROBOT);
  const [fusionMix, setFusionMix] = useState<number>(50); // 0-100

  // Global
  const [globalParams, setGlobalParams] = useState<GlobalParams>({
    bpm: 120, duration: 8.0, reverbMix: 0.1, reverbDecay: 2.0
  });

  // NEW: Scale, Snap, Playlist
  const [musicalKey, setMusicalKey] = useState<MusicalKeyConfig>({ root: 'C', scale: ScaleType.MAJOR, enabled: true });
  const [snapGrid, setSnapGrid] = useState<SnapGrid>(SnapGrid.BEAT);
  
  // Playlist State
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrack[]>([
      { id: 'pt-1', name: 'Vocals', clips: [], muted: false, solo: false, volume: 1.0 },
      { id: 'pt-2', name: 'Backing', clips: [], muted: false, solo: false, volume: 0.8 }
  ]);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(16);
  
  const backingInputRef = useRef<HTMLInputElement>(null);

  // Settings
  const [fastPreview, setFastPreview] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportConfig, setExportConfig] = useState<ExportConfig>({
      format: 'wav',
      sampleRate: 44100,
      bitDepth: 16,
      mp3Bitrate: 192
  });

  // Tracks
  const [tracks, setTracks] = useState<SequencerTrack[]>([
    {
      id: 'track-1',
      name: 'Main Vocal',
      color: '#38bdf8',
      notes: [
         { id: '1', midi: 60, startTime: 0, duration: 1.0, lyric: 'o', pitchPoints: [{t:0,v:0},{t:1,v:0}] },
         { id: '2', midi: 62, startTime: 1.0, duration: 1.0, lyric: 'i', pitchPoints: [{t:0,v:0},{t:1,v:0}] },
         { id: '3', midi: 64, startTime: 2.0, duration: 2.0, lyric: 'e', pitchPoints: [{t:0,v:0},{t:1,v:0}] }
      ],
      volume: 0.8,
      muted: false,
      solo: false,
      vocalParams: {
        text: "OIE",
        preset: VocalPreset.MALE_BR,
        language: VocalLanguage.PT_BR,
        mode: VocalMode.SINGING,
        vowel: VowelType.A,
        jitter: 0.1, humanize: 0.1, breathiness: 0.2, formantShift: 1.0, speed: 1.0, pitch: 1.0, octaveShift: 0, glide: 0.1, wordGap: 0.05 
      }
    }
  ]);

  const [activeTrackId, setActiveTrackId] = useState<string>('track-1');
  
  // Custom Presets (CALC Tab)
  const [calcMode, setCalcMode] = useState<'ALGO' | 'PLUGIN'>('ALGO');
  const [customPresets, setCustomPresets] = useState<Record<string, AudioPresetDefinition>>({});
  const [pluginLibrary, setPluginLibrary] = useState<Record<string, PluginDefinition>>({
      "Vocal Sine Simple": EXAMPLE_PLUGIN_JSON
  });

  const [editorContent, setEditorContent] = useState<string>("");
  const [selectedEditorPreset, setSelectedEditorPreset] = useState<string>("");
  const [editorError, setEditorError] = useState<string | null>(null);

  // History
  const [history, setHistory] = useState<SequencerTrack[][]>([]);
  const [future, setFuture] = useState<SequencerTrack[][]>([]);

  // Modals
  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const [showPitchModal, setShowPitchModal] = useState(false);
  const [lyricsInput, setLyricsInput] = useState("");
  const [isLoopLyrics, setIsLoopLyrics] = useState(false);
  const [isFnfMode, setIsFnfMode] = useState(false);
  
  // Pitch Editor
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [pitchCurve, setPitchCurve] = useState<{t:number, v:number}[]>([]);
  const pitchCanvasRef = useRef<HTMLCanvasElement>(null);

  // Helpers
  const activeTrack = tracks.find(t => t.id === activeTrackId) || tracks[0];
  const ghostTracks = tracks.filter(t => t.id !== activeTrackId);

  // DNA (Secret Params) Helpers
  const getActiveDNA = (): AudioPresetDefinition => {
      if (activeTrack.vocalParams.preset === VocalPreset.CUSTOM && activeTrack.vocalParams.customData) {
          return activeTrack.vocalParams.customData;
      }
      return VOCAL_PRESETS_DATA[activeTrack.vocalParams.preset];
  };

  const updateDNA = (updates: Partial<AudioPresetDefinition>) => {
      const currentDNA = getActiveDNA();
      const newDNA = { ...currentDNA, ...updates };
      
      updateActiveTrackParams({
          preset: VocalPreset.CUSTOM,
          customData: newDNA
      });
  };

  const handleCreateHybrid = () => {
      const defA = VOCAL_PRESETS_DATA[fusionA];
      const defB = VOCAL_PRESETS_DATA[fusionB];
      if (!defA || !defB) return;

      const ratio = fusionMix / 100;
      const invRatio = 1 - ratio;

      // Mathematical Fusion
      const hybrid: AudioPresetDefinition = {
          baseFreq: (defA.baseFreq * invRatio) + (defB.baseFreq * ratio),
          formantScale: (defA.formantScale * invRatio) + (defB.formantScale * ratio),
          type: ratio < 0.5 ? defA.type : defB.type, // Hard switch for enum
          breath: ((defA.breath||0) * invRatio) + ((defB.breath||0) * ratio),
          distortion: ((defA.distortion||0) * invRatio) + ((defB.distortion||0) * ratio),
          jitter: ((defA.jitter||0) * invRatio) + ((defB.jitter||0) * ratio),
          oscGain: ((defA.oscGain||1) * invRatio) + ((defB.oscGain||1) * ratio),
          // Boolean flags based on dominant
          steps: ratio > 0.5 ? defB.steps : defA.steps,
          glide: ratio > 0.5 ? defB.glide : defA.glide
      };

      updateActiveTrackParams({
          preset: VocalPreset.CUSTOM,
          customData: hybrid
      });
      alert("Hybrid voice created!");
  };

  // Sampler Helpers
  const updateSamplerConfig = (updates: Partial<SamplerConfig>) => {
      updateActiveTrackParams(prev => {
          const currentData = prev.customData || { ...VOCAL_PRESETS_DATA[VocalPreset.SAMPLER] };
          const currentSampler = currentData.sampler || {
              rootNote: 60,
              detune: 0,
              mode: 'SEQUENCE',
              slices: [{start:0, end:1}],
              activeSliceIndex: 0,
              sensitivity: 0.5,
              vowelMap: {a:0,e:0,i:0,o:0,u:0}
          };
          
          return {
              customData: {
                  ...currentData,
                  sampler: { ...currentSampler, ...updates }
              }
          };
      });
  };

  const handleSamplerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
          if (ev.target?.result) {
              const base64 = ev.target.result as string;
              
              if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
              const buffer = await decodeAudioData(audioCtxRef.current, base64);
              setSamplerBuffer(buffer);
              
              // Auto Detect Slices initially
              const slices = detectSlices(buffer, 0.5);
              
              updateActiveTrackParams({ 
                  preset: VocalPreset.SAMPLER,
                  customData: {
                      ...VOCAL_PRESETS_DATA[VocalPreset.SAMPLER],
                      sampler: {
                          sourceBase64: base64,
                          rootNote: 60,
                          detune: 0,
                          mode: 'SEQUENCE',
                          slices: slices,
                          activeSliceIndex: 0,
                          sensitivity: 0.5,
                          vowelMap: {a:0,e:0,i:0,o:0,u:0}
                      }
                  }
              });
          }
      };
      reader.readAsDataURL(file);
  };

  const handleAutoSlice = () => {
      if (!samplerBuffer) return;
      const sensitivity = activeTrack.vocalParams.customData?.sampler?.sensitivity || 0.5;
      const slices = detectSlices(samplerBuffer, sensitivity);
      updateSamplerConfig({ slices });
  };

  const mapSliceToVowel = (sliceIndex: number) => {
      const currentMap = activeTrack.vocalParams.customData?.sampler?.vowelMap || {a:0, e:0, i:0, o:0, u:0};
      updateSamplerConfig({
          vowelMap: { ...currentMap, [selectedVowelForMapping]: sliceIndex }
      });
  };

  // Draw Waveform for Sampler
  useEffect(() => {
      if (activeTab === 'SAMPLER' && samplerCanvasRef.current) {
          const canvas = samplerCanvasRef.current;
          const ctx = canvas.getContext('2d');
          const buffer = samplerBuffer; 
          const config = activeTrack.vocalParams.customData?.sampler;
          
          if (!ctx || !buffer) {
              // Try to reload buffer if existing in track data but not state
              if (!buffer && config?.sourceBase64) {
                   if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
                   decodeAudioData(audioCtxRef.current, config.sourceBase64).then(setSamplerBuffer);
              }
              return;
          }

          const width = canvas.width;
          const height = canvas.height;
          const data = buffer.getChannelData(0);
          const step = Math.ceil(data.length / width);
          const amp = height / 2;

          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, width, height);
          
          ctx.beginPath();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1;
          
          for(let i=0; i < width; i++) {
              let min = 1.0;
              let max = -1.0;
              for (let j=0; j<step; j++) {
                  const datum = data[(i*step)+j];
                  if (datum < min) min = datum;
                  if (datum > max) max = datum;
              }
              ctx.moveTo(i, (1+min)*amp);
              ctx.lineTo(i, (1+max)*amp);
          }
          ctx.stroke();

          // Draw Slices
          if (config?.slices) {
              config.slices.forEach((slice, idx) => {
                  const x = slice.start * width;
                  const w = (slice.end - slice.start) * width;
                  
                  // Highlight logic
                  let isHighlighted = false;
                  let highlightColor = 'rgba(244, 114, 182, 0.2)';
                  
                  if (config.mode === 'FNF_VOWEL') {
                      // Check if this slice is the selected vowel's slice
                      const assignedIndex = config.vowelMap?.[selectedVowelForMapping] ?? 0;
                      if (idx === assignedIndex) {
                          isHighlighted = true;
                          highlightColor = 'rgba(52, 211, 153, 0.4)'; // Green for active vowel
                      }
                  } else {
                      // Standard highlight for active slice
                      if (idx === config.activeSliceIndex) {
                          isHighlighted = true;
                      }
                  }

                  ctx.fillStyle = isHighlighted ? highlightColor : `rgba(244, 114, 182, ${idx % 2 === 0 ? 0.05 : 0.1})`;
                  ctx.fillRect(x, 0, w, height);
                  
                  ctx.strokeStyle = isHighlighted ? '#34d399' : '#f472b6';
                  ctx.beginPath();
                  ctx.moveTo(x, 0); ctx.lineTo(x, height);
                  ctx.stroke();
                  
                  ctx.font = '10px monospace';
                  ctx.fillStyle = '#fff';
                  ctx.fillText(idx.toString(), x + 2, 10);
              });
          }
      }
  }, [activeTab, samplerBuffer, activeTrack.vocalParams.customData?.sampler, selectedVowelForMapping]);


  // History logic
  const addToHistory = useCallback(() => {
    setHistory(prev => [...prev, JSON.parse(JSON.stringify(tracks))]);
    setFuture([]); 
  }, [tracks]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setFuture(prev => [tracks, ...prev]);
    setTracks(previous);
    setHistory(prev => prev.slice(0, -1));
  }, [history, tracks]);

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory(prev => [...prev, tracks]);
    setTracks(next);
    setFuture(prev => prev.slice(1));
  }, [future, tracks]);

  const updateActiveTrack = (updates: Partial<SequencerTrack> | ((prev: SequencerTrack) => Partial<SequencerTrack>)) => {
      setTracks(prev => prev.map(t => {
          if (t.id !== activeTrackId) return t;
          const newVals = typeof updates === 'function' ? updates(t) : updates;
          return { ...t, ...newVals };
      }));
  };

  const updateActiveTrackParams = (updates: Partial<VocalParams> | ((prev: VocalParams) => Partial<VocalParams>)) => {
      setTracks(prev => prev.map(t => {
          if (t.id !== activeTrackId) return t;
          const currentParams = t.vocalParams;
          const newParams = typeof updates === 'function' ? updates(currentParams) : updates;
          
          // IMPORTANT: If we are in PLUGIN mode, we must ensure customData holds the plugin definition
          if (t.vocalParams.preset === VocalPreset.PLUGIN && t.vocalParams.pluginId) {
             const def = pluginLibrary[t.vocalParams.pluginId];
             if (def) {
                 newParams.customData = def as unknown as AudioPresetDefinition;
             }
          }

          return { ...t, vocalParams: { ...currentParams, ...newParams } };
      }));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        e.shiftKey ? handleRedo() : handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);


  const fileInputRef = useRef<HTMLInputElement>(null);
  const samplerInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  // --- AUDIO LOGIC ---

  const calculateTotalDuration = () => {
    const secondsPerBeat = 60 / globalParams.bpm;
    let totalBeats = 16; 
    tracks.forEach(t => {
        if (t.notes.length > 0) {
              const last = t.notes.reduce((max, curr) => Math.max(max, curr.startTime + curr.duration), 0);
              if (last + 4 > totalBeats) totalBeats = last + 4;
        }
    });
    // Playlist logic overrides sequencer logic for calculation
    if (playlistTracks.length > 0) {
        let maxTime = totalBeats * secondsPerBeat;
        playlistTracks.forEach(pt => {
            pt.clips.forEach(c => {
                maxTime = Math.max(maxTime, c.startTime + c.duration);
            });
        });
        return Math.max(maxTime, loopEnd);
    }
    return totalBeats * secondsPerBeat;
  };

  const calculateEstimatedSize = () => {
      // Use render region length
      const duration = loopEnd - loopStart;
      const channels = 2; // Stereo
      
      if (exportConfig.format === 'wav') {
          // WAV Size = Duration * SampleRate * Channels * BytesPerSample
          const bytesPerSample = exportConfig.bitDepth / 8;
          const bytes = duration * exportConfig.sampleRate * channels * bytesPerSample;
          return (bytes / 1024 / 1024).toFixed(2); // MB
      } else {
          // MP3 Size = Duration * Bitrate (kbps) / 8
          const bytes = duration * (exportConfig.mp3Bitrate * 1000 / 8);
          return (bytes / 1024 / 1024).toFixed(2); // MB
      }
  };

  // Render to Playlist (Internal bounce)
  const handleRenderToPlaylist = async () => {
      setIsGenerating(true);
      setRenderProgress(0);
      const sampleRate = 44100;
      
      try {
          const totalSeconds = calculateTotalDuration();
          const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * totalSeconds), sampleRate);
          
          // Render only Sequencer Tracks (Vocals) - High Quality
          const buffer = await renderProject(
              ctx, tracks, [], globalParams.bpm, sampleRate, 0, 0, false, 
              (p) => setRenderProgress(p)
          );
          
          // Create Clip
          const newClip: PlaylistClip = {
              id: `clip-${Date.now()}`,
              name: `Vocal Render ${playlistTracks[0].clips.length + 1}`,
              buffer: buffer,
              startTime: 0,
              offset: 0,
              duration: buffer.duration,
              type: 'VOCAL_RENDER'
          };
          
          // Add to first track
          setPlaylistTracks(prev => {
              const newTracks = [...prev];
              if (newTracks.length > 0) {
                  newTracks[0] = { ...newTracks[0], clips: [...newTracks[0].clips, newClip] };
              }
              return newTracks;
          });
          
          setActiveTab('PLAYLIST');
          // No alert, just seamless switch
          
      } catch(e) {
          console.error(e);
      } finally {
          setIsGenerating(false);
          setRenderProgress(0);
      }
  };

  const handleBackingTrackUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
          if (ev.target?.result) {
              const base64 = ev.target.result as string;
              if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
              try {
                  const buffer = await decodeAudioData(audioCtxRef.current, base64);
                  
                  const newClip: PlaylistClip = {
                      id: `clip-audio-${Date.now()}`,
                      name: file.name,
                      buffer: buffer,
                      startTime: 0,
                      offset: 0,
                      duration: buffer.duration,
                      type: 'AUDIO'
                  };
                  
                  // Add to second track or new one
                  setPlaylistTracks(prev => {
                      const newTracks = [...prev];
                      const trackIdx = newTracks.findIndex(t => t.name.includes('Backing') || t.name.includes('Audio'));
                      if (trackIdx !== -1) {
                          newTracks[trackIdx] = { ...newTracks[trackIdx], clips: [...newTracks[trackIdx].clips, newClip] };
                      } else {
                          newTracks.push({
                              id: `pt-${Date.now()}`,
                              name: 'Audio Track',
                              clips: [newClip],
                              muted: false,
                              solo: false,
                              volume: 0.8
                          });
                      }
                      return newTracks;
                  });
              } catch(e) {
                  alert("Could not load audio file.");
              }
          }
      }
      reader.readAsDataURL(file);
  };

  // Preview Logic (Fast)
  const handlePreview = async () => {
    setIsGenerating(true);
    setRenderProgress(0);
    setGeneratedBuffer(null);
    if(isPlaying) handleStop();
    
    // Use lower sample rate for preview if fastPreview is enabled
    const sampleRate = fastPreview ? 22050 : 44100;

    setTimeout(async () => {
      try {
        let buffer: AudioBuffer;
        
        if (activeTab === 'PLAYLIST') {
             const duration = loopEnd - loopStart;
             const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * duration), sampleRate);
             // Pass fastPreview as isOptimized flag
             buffer = await renderProject(
                 ctx, null, playlistTracks, globalParams.bpm, sampleRate, loopStart, loopEnd, fastPreview,
                 (p) => setRenderProgress(p)
             );
        } else {
             // Compose Tab Preview
             const totalSeconds = calculateTotalDuration();
             const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * totalSeconds), sampleRate);
             // Render Sequencer tracks directly (pass null playlist)
             buffer = await renderProject(
                 ctx, tracks, [], globalParams.bpm, sampleRate, 0, 0, fastPreview,
                 (p) => setRenderProgress(p)
             );
        }

        if (globalParams.reverbMix > 0) {
            const reverbCtx = new OfflineAudioContext(1, buffer.length, sampleRate);
            buffer = await applyReverb(reverbCtx, buffer, globalParams.reverbMix, globalParams.reverbDecay);
        }
        setGeneratedBuffer(buffer);
        // Auto-play after preview generation
        requestAnimationFrame(() => handlePlay(buffer));
      } catch (e) { 
          console.error(e); alert("Error generating preview"); 
      } finally { 
          setIsGenerating(false);
          setRenderProgress(0);
      }
    }, 50);
  };

  // High Quality Export Logic
  const handleExport = async () => {
    setShowExportModal(false);
    setIsGenerating(true);
    setRenderProgress(0);
    
    setTimeout(async () => {
      try {
        const sampleRate = exportConfig.sampleRate;
        const duration = loopEnd - loopStart;
        const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * duration), sampleRate);
        
        // Render Playlist within loop range - FORCE HIGH QUALITY (isOptimized = false)
        let buffer = await renderProject(
            ctx, tracks, playlistTracks, globalParams.bpm, sampleRate, loopStart, loopEnd, false,
            (p) => setRenderProgress(p)
        );

        if (globalParams.reverbMix > 0) {
            const reverbCtx = new OfflineAudioContext(1, buffer.length, sampleRate);
            buffer = await applyReverb(reverbCtx, buffer, globalParams.reverbMix, globalParams.reverbDecay);
        }
        
        // Encode and Download
        let blob: Blob;
        let ext: string;
        
        if (exportConfig.format === 'wav') {
            blob = bufferToWav(buffer, exportConfig.bitDepth);
            ext = 'wav';
        } else {
            blob = bufferToMp3(buffer, exportConfig.mp3Bitrate);
            ext = 'mp3';
        }
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `vocalstudio_${exportConfig.format}_${Date.now()}.${ext}`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        
      } catch (e) { 
          console.error(e); alert("Error exporting audio: " + e); 
      } finally { 
          setIsGenerating(false);
          setRenderProgress(0);
      }
    }, 50);
  };

  const handleMidiUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        if (ev.target?.result) {
            try {
                addToHistory(); 
                const { tracks: newTracks, bpm } = parseMidiFile(ev.target.result as ArrayBuffer);
                setTracks(newTracks);
                if (newTracks.length > 0) setActiveTrackId(newTracks[0].id);
                if (bpm) setGlobalParams(p => ({ ...p, bpm: bpm }));
                alert(`Imported ${newTracks.length} tracks at ${bpm || 120} BPM!`);
            } catch (err) { console.error(err); alert("Failed to parse file."); }
        }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleAddTrack = () => {
      addToHistory();
      const newTrack: SequencerTrack = {
          id: `track-${Date.now()}`,
          name: `Track ${tracks.length + 1}`,
          color: '#38bdf8',
          notes: [],
          volume: 0.8,
          muted: false,
          solo: false,
          vocalParams: { ...activeTrack.vocalParams, preset: VocalPreset.FEMALE_BR } 
      };
      setTracks(prev => [...prev, newTrack]);
      setActiveTrackId(newTrack.id);
  };

  const handleDeleteTrack = (id: string) => {
      if (tracks.length <= 1) return;
      addToHistory();
      const newTracks = tracks.filter(t => t.id !== id);
      setTracks(newTracks);
      if (activeTrackId === id) setActiveTrackId(newTracks[0].id);
  };

  // ... (handleApplyLyrics, handleOpenPitchEditor, etc. remain the same) ...
  // Re-pasting for context integrity
  const handleApplyLyrics = () => {
      if (!isFnfMode && !lyricsInput.trim()) { setShowLyricsModal(false); return; }
      addToHistory();

      let tempNotes = [...activeTrack.notes].sort((a, b) => a.startTime - b.startTime);
      
      if (isFnfMode) {
          const fnfVowels = ['u', 'o', 'a', 'e', 'i'];
          const finalNotes = tempNotes.map(note => {
             const relative = note.midi - 60;
             let index = relative % 5;
             if (index < 0) index = 5 + index;
             return { ...note, lyric: fnfVowels[index] };
          });
          updateActiveTrack({ notes: finalNotes });

      } else {
        const syllabify = (text: string) => {
            const regex = /[^aeiouyáéíóúãõâêîôûàèìòùäëïöüçñ]*[aeiouyáéíóúãõâêîôûàèìòùäëïöü]+(?:[^aeiouyáéíóúãõâêîôûàèìòùäëïöüçñ]*$|[^aeiouyáéíóúãõâêîôûàèìòùäëïöüçñ](?=[^aeiouyáéíóúãõâêîôûàèìòùäëïöüçñ]))?/gi;
            return text.match(regex) || [text];
        };
        const rawWords = lyricsInput.replace(/[\n\r]/g, ' ').split(/[\s-]+/).filter(s => s.length > 0);
        let syllables: { text: string, connected: boolean }[] = [];
        
        const inputWords = lyricsInput.replace(/[\n\r]/g, ' ').split(/\s+/).filter(s => s.length > 0);
        
        inputWords.forEach(word => {
            if (word.includes('-')) {
                const parts = word.split('-').filter(p => p.length > 0);
                parts.forEach((part, i) => {
                    syllables.push({ text: part, connected: i < parts.length - 1 });
                });
            } else {
                 if (word.length > 2) {
                     const parts = syllabify(word);
                     parts.forEach((part, i) => {
                         syllables.push({ text: part, connected: i < parts.length - 1 });
                     });
                 } else {
                     syllables.push({ text: word, connected: false });
                 }
            }
        });

        if (syllables.length === 0) return;
        
        const finalNotes = tempNotes.map((note, index) => {
            if (isLoopLyrics) {
                const syl = syllables[index % syllables.length];
                return { ...note, lyric: syl.text, connected: syl.connected };
            } else {
                if (index < syllables.length) {
                    const syl = syllables[index];
                    return { ...note, lyric: syl.text, connected: syl.connected };
                }
                return { ...note, lyric: '' };
            }
        });
        updateActiveTrack({ notes: finalNotes });
      }
      setLyricsInput(""); 
      setShowLyricsModal(false);
  };

  const handleOpenPitchEditor = (noteId: string) => {
      const note = activeTrack.notes.find(n => n.id === noteId); if (!note) return;
      setEditingNoteId(noteId);
      setPitchCurve(note.pitchPoints && note.pitchPoints.length > 0 ? note.pitchPoints : [{t:0,v:0}, {t:1,v:0}]);
      setShowPitchModal(true);
  };

  const handlePitchCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = pitchCanvasRef.current; if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const t = (e.clientX - rect.left) / canvas.width;
      const semitones = 12 - ((e.clientY - rect.top) / canvas.height) * 24;
      const newCurve = [...pitchCurve, { t, v: semitones }].sort((a,b) => a.t - b.t);
      setPitchCurve(newCurve);
  };

  const drawPitchCurve = () => {
      const canvas = pitchCanvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#334155'; ctx.beginPath(); ctx.moveTo(0, canvas.height/2); ctx.lineTo(canvas.width, canvas.height/2); ctx.stroke();
      ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 3; ctx.beginPath();
      if (pitchCurve.length > 0) {
          const getY = (v: number) => canvas.height/2 - (v/12)*(canvas.height/2);
          pitchCurve.forEach((pt, i) => {
              const x = pt.t * canvas.width; const y = getY(pt.v);
              i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
              ctx.fillStyle = '#fff'; ctx.fillRect(x-2, y-2, 4, 4);
          });
      }
      ctx.stroke();
  };
  useEffect(() => { if (showPitchModal) requestAnimationFrame(drawPitchCurve); }, [pitchCurve, showPitchModal]);

  const handleApplyPitch = () => {
      if (!editingNoteId) return;
      addToHistory();
      const updatedNotes = activeTrack.notes.map(n => n.id === editingNoteId ? { ...n, pitchPoints: pitchCurve } : n);
      updateActiveTrack({ notes: updatedNotes });
      setShowPitchModal(false);
  };

  const handlePlay = (specificBuffer?: AudioBuffer) => {
    const buffer = specificBuffer || generatedBuffer;
    if (!buffer) return;
    
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current; if (ctx.state === 'suspended') ctx.resume();
    
    if (sourceRef.current) try { sourceRef.current.stop(); } catch(e) {}
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    setAnalyserNode(analyser); 
    source.connect(analyser);
    analyser.connect(ctx.destination);
    
    source.onended = () => {
        setIsPlaying(false);
        setPlaybackBeat(0);
        setPlaybackTime(0);
    };
    
    sourceRef.current = source;
    startTimeRef.current = ctx.currentTime;
    setIsPlaying(true);
    source.start();
  };

  // Playback Loop
  useEffect(() => {
    let raf: number;
    const loop = () => {
        if (isPlaying && audioCtxRef.current) {
            const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
            const bpm = globalParams.bpm;
            const currentBeat = (elapsed * bpm) / 60;
            setPlaybackBeat(currentBeat);
            setPlaybackTime(elapsed);
            raf = requestAnimationFrame(loop);
        }
    };
    if (isPlaying) loop();
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, globalParams.bpm]);

  const handleStop = () => {
      if (sourceRef.current) { try { sourceRef.current.stop(); } catch(e){} setIsPlaying(false); setPlaybackBeat(0); setPlaybackTime(0); }
  };

  // ... (Import/Export JSON logic remains same) ...
  const handleExportJson = () => {
    const data = { version: 1, timestamp: Date.now(), tracks: tracks, globalParams: globalParams, playlist: playlistTracks, loop: {start: loopStart, end: loopEnd} };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `project_${Date.now()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        if (ev.target?.result) {
            try {
                const data = JSON.parse(ev.target.result as string);
                addToHistory();
                if (data.tracks) { setTracks(data.tracks); setActiveTrackId(data.tracks[0].id); }
                if (data.globalParams) setGlobalParams(data.globalParams);
                if (data.playlist) setPlaylistTracks(data.playlist);
                if (data.loop) { setLoopStart(data.loop.start); setLoopEnd(data.loop.end); }
                alert("Project loaded!");
            } catch (err) { console.error(err); alert("Invalid project file."); }
        }
    };
    reader.readAsText(file);
  };

  const copyToClipboard = (data: any) => {
      const txt = JSON.stringify(data, null, 2);
      navigator.clipboard.writeText(txt);
      alert("Copied to clipboard!");
  };

  // ... (Editor Logic Remains Same) ...
  const handleEditorSelect = (presetName: string, isCustom: boolean) => {
      setSelectedEditorPreset(presetName);
      if (calcMode === 'ALGO') {
          if (isCustom) {
              setEditorContent(JSON.stringify(customPresets[presetName], null, 2));
          } else {
               // @ts-ignore
               setEditorContent(JSON.stringify(VOCAL_PRESETS_DATA[presetName], null, 2));
          }
      } else {
          // PLUGIN MODE
          const def = pluginLibrary[presetName];
          if (def) setEditorContent(JSON.stringify(def, null, 2));
      }
      setEditorError(null);
  };

  const handleSaveCustomPreset = () => {
      try {
          const parsed = JSON.parse(editorContent);
          const name = prompt(calcMode === 'PLUGIN' ? "Name for this Plugin Engine:" : "Name for this Algo:", selectedEditorPreset || "My_Custom_Algo");
          if (!name) return;
          
          if (calcMode === 'PLUGIN') {
               if (!parsed.nodes || !parsed.parameters) throw new Error("Missing nodes or parameters");
               setPluginLibrary(prev => ({ ...prev, [name]: parsed }));
          } else {
               setCustomPresets(prev => ({ ...prev, [name]: parsed }));
          }
          setSelectedEditorPreset(name);
          setEditorError(null);
      } catch (e: any) {
          setEditorError("Invalid JSON: " + e.message);
      }
  };

  const handleNewPlugin = () => {
      if (calcMode === 'PLUGIN') {
          setEditorContent(JSON.stringify(EXAMPLE_PLUGIN_JSON, null, 2));
          setSelectedEditorPreset("");
      } else {
          // New Algo Template
          const template: AudioPresetDefinition = { baseFreq: 130, formantScale: 1.0, type: 'sawtooth' };
          setEditorContent(JSON.stringify(template, null, 2));
          setSelectedEditorPreset("");
      }
  };

  const handleRenamePlugin = () => {
      if (!selectedEditorPreset) return;
      const newName = prompt("Rename to:", selectedEditorPreset);
      if (!newName || newName === selectedEditorPreset) return;

      if (calcMode === 'PLUGIN') {
          const lib = { ...pluginLibrary };
          if (lib[selectedEditorPreset]) {
              lib[newName] = lib[selectedEditorPreset];
              delete lib[selectedEditorPreset];
              setPluginLibrary(lib);
              setSelectedEditorPreset(newName);
          }
      } else {
          const presets = { ...customPresets };
          if (presets[selectedEditorPreset]) {
              presets[newName] = presets[selectedEditorPreset];
              delete presets[selectedEditorPreset];
              setCustomPresets(presets);
              setSelectedEditorPreset(newName);
          }
      }
  };

  const handleApplyCustomToTrack = () => {
       try {
          const parsed = JSON.parse(editorContent);
          addToHistory();
          if (calcMode === 'PLUGIN') {
              const name = selectedEditorPreset || "temp_plugin";
              setPluginLibrary(prev => ({ ...prev, [name]: parsed }));
              updateActiveTrackParams({
                  preset: VocalPreset.PLUGIN,
                  pluginId: name,
                  pluginState: {} // Reset params
              });
          } else {
              updateActiveTrackParams({
                  preset: VocalPreset.CUSTOM,
                  customData: parsed
              });
          }
          alert(`Applied ${calcMode} to active track!`);
       } catch (e) {
           setEditorError("Cannot apply invalid JSON.");
       }
  };


  return (
    <div className="flex flex-col h-screen bg-synth-dark text-slate-200 font-sans overflow-hidden select-none safe-area-top">
      
      {/* HEADER */}
      <header className="px-3 py-2 bg-synth-dark/95 border-b border-synth-grid flex justify-between items-center shrink-0 z-20">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-synth-accent" />
          <div>
            <h1 className="text-sm font-bold tracking-widest bg-gradient-to-r from-synth-accent to-synth-pop bg-clip-text text-transparent">
              VocalStudio
            </h1>
          </div>
        </div>
        
        <div className="flex gap-2 items-center">
             {/* Render to Playlist Button */}
             {activeTab === 'COMPOSE' && (
                 <button 
                    onClick={handleRenderToPlaylist}
                    className="flex items-center gap-1 p-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold hover:bg-emerald-500 hover:text-black transition-colors"
                 >
                     <ArrowRight size={14}/>
                     <span className="hidden sm:inline">TO PLAYLIST</span>
                 </button>
             )}

             <div className="h-4 w-px bg-synth-grid mx-1"/>

             <button onClick={handleExportJson} className="p-1.5 rounded-lg bg-synth-panel border border-synth-grid text-slate-400 hover:text-white transition-colors" title="Save Project"><Save size={16} /></button>
             <button onClick={() => jsonInputRef.current?.click()} className="p-1.5 rounded-lg bg-synth-panel border border-synth-grid text-slate-400 hover:text-white transition-colors" title="Load Project"><FileJson size={16} /></button>
             <input type="file" accept=".json" className="hidden" ref={jsonInputRef} onChange={handleImportJson}/>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative p-2 pb-40 scroll-smooth safe-area-bottom">
        
        {/* RENDER PROGRESS OVERLAY */}
        {isGenerating && (
            <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">
                <div className="w-64 flex flex-col gap-4">
                    <div className="text-center space-y-1">
                        <Activity size={32} className="text-synth-pop animate-spin mx-auto"/>
                        <h3 className="text-white font-bold text-lg tracking-widest">RENDERING...</h3>
                        <p className="text-slate-400 text-xs">CALCULATING DSP FORMANTS</p>
                    </div>
                    
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                        <div 
                            className="bg-gradient-to-r from-synth-accent to-synth-pop h-full transition-all duration-200" 
                            style={{width: `${renderProgress}%`}}
                        />
                    </div>
                    <span className="text-white font-mono text-xs text-center">{Math.round(renderProgress)}% COMPLETE</span>
                </div>
            </div>
        )}

        {/* TAB: COMPOSE (Piano Roll) */}
        {activeTab === 'COMPOSE' && (
            <div className="flex flex-col h-full gap-2 animate-in fade-in zoom-in-95 duration-200">
                 {/* Top Toolbar */}
                 <div className="flex justify-between items-center flex-wrap gap-2 bg-synth-panel/50 p-2 rounded-xl border border-synth-grid/50">
                     <div className="flex items-center gap-2 flex-wrap">
                         
                         {/* SNAP & KEY CONTROLS */}
                         <div className="flex items-center bg-synth-dark rounded-lg border border-synth-grid overflow-hidden">
                             <select 
                                value={snapGrid}
                                onChange={(e) => setSnapGrid(parseFloat(e.target.value) as SnapGrid)}
                                className="bg-transparent text-[10px] text-white p-1.5 outline-none border-r border-synth-grid"
                             >
                                 <option value={SnapGrid.OFF}>OFF</option>
                                 <option value={SnapGrid.BAR}>1/1</option>
                                 <option value={SnapGrid.HALF}>1/2</option>
                                 <option value={SnapGrid.BEAT}>1/4</option>
                                 <option value={SnapGrid.EIGHTH}>1/8</option>
                                 <option value={SnapGrid.SIXTEENTH}>1/16</option>
                             </select>
                             <div className="p-1.5 bg-slate-800"><Grid size={12}/></div>
                         </div>

                         <div className="flex items-center bg-synth-dark rounded-lg border border-synth-grid overflow-hidden">
                             <div 
                                onClick={() => setMusicalKey(p => ({ ...p, enabled: !p.enabled }))}
                                className={`p-1.5 cursor-pointer ${musicalKey.enabled ? 'bg-synth-pop text-white' : 'bg-slate-800 text-slate-500'}`}
                             >
                                 <Magnet size={12}/>
                             </div>
                             <select 
                                value={musicalKey.root}
                                onChange={(e) => setMusicalKey(p => ({ ...p, root: e.target.value }))}
                                className="bg-transparent text-[10px] text-white p-1.5 outline-none border-r border-synth-grid w-10"
                             >
                                 {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map(n => <option key={n} value={n}>{n}</option>)}
                             </select>
                             <select 
                                value={musicalKey.scale}
                                onChange={(e) => setMusicalKey(p => ({ ...p, scale: e.target.value as ScaleType }))}
                                className="bg-transparent text-[10px] text-white p-1.5 outline-none max-w-[80px]"
                             >
                                 {Object.values(ScaleType).map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                         </div>

                         <div className="flex flex-col">
                             <span className="text-[8px] text-synth-accent font-bold uppercase">Oct</span>
                             <div className="flex items-center bg-synth-dark rounded border border-synth-grid">
                                 <input type="number" min="-3" max="3" value={activeTrack.vocalParams.octaveShift} onChange={(e) => updateActiveTrackParams({ octaveShift: parseInt(e.target.value) })} className="w-8 text-center bg-transparent text-xs outline-none py-1"/>
                             </div>
                         </div>
                     </div>

                     <div className="flex gap-2">
                         <button onClick={() => setShowLyricsModal(true)} className="text-[10px] bg-synth-dark border border-synth-grid px-3 py-2 rounded-lg flex items-center gap-1 hover:bg-slate-700 text-white font-bold"><Type size={14} className="text-synth-accent"/> LYRICS</button>
                         <button onClick={() => fileInputRef.current?.click()} className="text-[10px] bg-synth-dark border border-synth-grid px-3 py-2 rounded-lg flex items-center gap-1 hover:bg-slate-700"><Upload size={14} className="text-synth-pop"/> MIDI</button>
                         <input type="file" accept=".mid,.midi,.rtx,.txt" className="hidden" ref={fileInputRef} onChange={handleMidiUpload}/>
                     </div>
                 </div>

                 {/* Piano Roll Component - Flex fill for mobile */}
                 <div className="flex-1 relative min-h-[300px]">
                     <PianoRoll 
                        notes={activeTrack.notes}
                        setNotes={(newNotes) => {
                             if (typeof newNotes === 'function') {
                                 setTracks(prev => prev.map(t => t.id === activeTrackId ? { ...t, notes: newNotes(t.notes) } : t));
                             } else {
                                 updateActiveTrack({ notes: newNotes });
                             }
                        }}
                        ghostTracks={ghostTracks}
                        durationBeats={tracks.reduce((max, t) => Math.max(max, t.notes.reduce((m, n) => Math.max(m, n.startTime + n.duration), 0)), 0) + 4}
                        onUndo={handleUndo} onRedo={handleRedo} addToHistory={addToHistory} canUndo={history.length > 0} canRedo={future.length > 0} onEditPitch={handleOpenPitchEditor}
                        playbackBeat={playbackBeat}
                        snapGrid={snapGrid}
                        scaleRoot={musicalKey.root}
                        scaleType={musicalKey.scale}
                        scaleEnabled={musicalKey.enabled}
                    />
                 </div>
            </div>
        )}

        {/* TAB: PLAYLIST (Advanced DAW) */}
        {activeTab === 'PLAYLIST' && (
             <div className="flex flex-col h-full gap-4 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-end px-2">
                    <div>
                        <h2 className="text-sm font-bold text-emerald-400 flex items-center gap-2"><ListMusic size={16}/> PLAYLIST DAW</h2>
                        <p className="text-[10px] text-slate-500">ARRANGE, MIX & EXPORT</p>
                    </div>
                    <button onClick={() => backingInputRef.current?.click()} className="bg-slate-800 hover:bg-slate-700 text-white text-[10px] px-3 py-1 rounded border border-synth-grid flex items-center gap-2"><Upload size={12}/> IMPORT AUDIO</button>
                    <input type="file" accept="audio/*" className="hidden" ref={backingInputRef} onChange={handleBackingTrackUpload} />
                </div>

                <div className="flex-1 bg-synth-panel rounded-xl border border-synth-grid flex flex-col p-2 relative overflow-hidden">
                    <PlaylistGrid 
                        tracks={playlistTracks}
                        setTracks={setPlaylistTracks}
                        loopStart={loopStart}
                        loopEnd={loopEnd}
                        setLoopStart={setLoopStart}
                        setLoopEnd={setLoopEnd}
                        playbackTime={playbackTime}
                        duration={loopEnd + 20}
                        onCreatePatternClip={handleRenderToPlaylist}
                    />
                </div>
             </div>
        )}

        {/* ... (OTHER TABS) ... */}
        {activeTab === 'SAMPLER' && (
            <div className="h-full flex flex-col gap-4 animate-in zoom-in-95 duration-300">
                <div className="flex justify-between items-end px-2">
                    <div>
                        <h2 className="text-sm font-bold text-synth-pop flex items-center gap-2"><Music2 size={16}/> WEIRD VOICE CREATOR</h2>
                        <p className="text-[10px] text-slate-500">SAMPLER & VOCODER ENGINE</p>
                    </div>
                    <button 
                        onClick={() => updateActiveTrackParams({ preset: VocalPreset.SAMPLER })}
                        className={`text-[10px] px-3 py-1 rounded font-bold transition-colors ${activeTrack.vocalParams.preset === VocalPreset.SAMPLER ? 'bg-synth-pop text-white shadow-lg shadow-pink-500/20' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                    >
                        {activeTrack.vocalParams.preset === VocalPreset.SAMPLER ? 'ACTIVE' : 'ACTIVATE SAMPLER'}
                    </button>
                </div>

                <div className="flex-1 bg-synth-panel rounded-xl border border-synth-grid flex flex-col overflow-hidden relative">
                    {/* Controls */}
                    <div className="bg-synth-dark/50 p-2 border-b border-synth-grid flex flex-wrap gap-4 items-center">
                        <button onClick={() => samplerInputRef.current?.click()} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                            <Upload size={14}/> UPLOAD SAMPLE
                        </button>
                        <input type="file" accept="audio/*" className="hidden" ref={samplerInputRef} onChange={handleSamplerUpload} />
                        
                        <div className="h-6 w-px bg-synth-grid"/>
                        
                        <div className="flex items-center gap-2">
                            <label className="text-[10px] text-slate-400 font-bold uppercase">Root Note</label>
                            <input 
                                type="number" 
                                className="w-12 bg-black border border-synth-grid rounded px-2 py-1 text-xs text-white text-center" 
                                value={activeTrack.vocalParams.customData?.sampler?.rootNote || 60}
                                onChange={(e) => updateSamplerConfig({ rootNote: parseInt(e.target.value) })}
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <label className="text-[10px] text-slate-400 font-bold uppercase">Slice Sens.</label>
                            <input 
                                type="range" 
                                min="0" max="1" step="0.05"
                                className="w-20"
                                value={activeTrack.vocalParams.customData?.sampler?.sensitivity || 0.5}
                                onChange={(e) => updateSamplerConfig({ sensitivity: parseFloat(e.target.value) })}
                                onMouseUp={handleAutoSlice}
                                onTouchEnd={handleAutoSlice}
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <label className="text-[10px] text-slate-400 font-bold uppercase">Fine Tune</label>
                            <input 
                                type="range" 
                                min="-100" max="100" step="1"
                                className="w-20 accent-synth-accent"
                                value={activeTrack.vocalParams.customData?.sampler?.detune || 0}
                                onChange={(e) => updateSamplerConfig({ detune: parseFloat(e.target.value) })}
                                title="Detune (Cents)"
                            />
                        </div>

                        <div className="flex bg-black rounded p-0.5 border border-synth-grid">
                            <button 
                                onClick={() => updateSamplerConfig({ mode: 'FNF_LOOP' })}
                                className={`text-[10px] px-2 py-1 rounded font-bold ${activeTrack.vocalParams.customData?.sampler?.mode === 'FNF_LOOP' ? 'bg-synth-pop text-white' : 'text-slate-500'}`}
                            >FNF LOOP</button>
                            <button 
                                onClick={() => updateSamplerConfig({ mode: 'SEQUENCE' })}
                                className={`text-[10px] px-2 py-1 rounded font-bold ${activeTrack.vocalParams.customData?.sampler?.mode === 'SEQUENCE' ? 'bg-synth-accent text-black' : 'text-slate-500'}`}
                            >SEQUENCE</button>
                            <button 
                                onClick={() => updateSamplerConfig({ mode: 'FNF_VOWEL' })}
                                className={`text-[10px] px-2 py-1 rounded font-bold flex items-center gap-1 ${activeTrack.vocalParams.customData?.sampler?.mode === 'FNF_VOWEL' ? 'bg-emerald-500 text-black' : 'text-slate-500'}`}
                            ><Grid size={10}/> VOWELS</button>
                        </div>
                    </div>

                    {/* FNF Vowel Mapper UI */}
                    {activeTrack.vocalParams.customData?.sampler?.mode === 'FNF_VOWEL' && (
                        <div className="bg-slate-900 border-b border-synth-grid p-2 flex gap-2 justify-center">
                            {['a', 'e', 'i', 'o', 'u'].map(v => {
                                const currentSlice = activeTrack.vocalParams.customData?.sampler?.vowelMap?.[v] ?? 0;
                                return (
                                    <div key={v} className="flex flex-col items-center">
                                        <button 
                                            onClick={() => setSelectedVowelForMapping(v)}
                                            className={`w-10 h-10 rounded-lg font-bold text-lg border-2 uppercase transition-all ${selectedVowelForMapping === v ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500' : 'bg-slate-800 text-slate-500 border-transparent hover:border-slate-600'}`}
                                        >
                                            {v}
                                        </button>
                                        <span className="text-[9px] text-slate-500 mt-1">Slice {currentSlice}</span>
                                    </div>
                                );
                            })}
                            <div className="w-px bg-synth-grid mx-2"/>
                            <div className="flex flex-col justify-center">
                                <span className="text-[8px] text-slate-500 uppercase mb-1">Assigned Slice</span>
                                <div className="flex items-center gap-1">
                                    <input 
                                        type="number" 
                                        className="w-12 bg-black border border-synth-grid rounded text-center text-xs text-emerald-400 py-1"
                                        value={activeTrack.vocalParams.customData?.sampler?.vowelMap?.[selectedVowelForMapping] ?? 0}
                                        onChange={(e) => mapSliceToVowel(parseInt(e.target.value))}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Visualizer / Editor */}
                    <div className="flex-1 relative bg-black/50 group">
                        {!activeTrack.vocalParams.customData?.sampler?.sourceBase64 && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 pointer-events-none">
                                <Waves size={48} className="mb-2 opacity-50"/>
                                <span className="text-xs font-bold">DROP AUDIO OR UPLOAD TO START</span>
                            </div>
                        )}
                        <canvas ref={samplerCanvasRef} width={800} height={300} className="w-full h-full" />
                        
                        {/* Interactive Click to Assign */}
                        {activeTrack.vocalParams.customData?.sampler?.mode === 'FNF_VOWEL' && (
                            <div className="absolute top-2 right-2 bg-black/80 text-emerald-400 text-[10px] px-2 py-1 rounded border border-emerald-500/50 pointer-events-none">
                                MAPPING MODE: CLICK WAVEFORM TO ASSIGN TO '{selectedVowelForMapping.toUpperCase()}'
                            </div>
                        )}
                        
                        <div 
                            className="absolute inset-0 cursor-crosshair"
                            onClick={(e) => {
                                if (!samplerCanvasRef.current || !activeTrack.vocalParams.customData?.sampler?.slices) return;
                                const rect = e.currentTarget.getBoundingClientRect();
                                const x = (e.clientX - rect.left) / rect.width;
                                // Find which slice this x falls into
                                const sliceIdx = activeTrack.vocalParams.customData.sampler.slices.findIndex(s => x >= s.start && x <= s.end);
                                if (sliceIdx !== -1) {
                                    if (activeTrack.vocalParams.customData.sampler.mode === 'FNF_VOWEL') {
                                        mapSliceToVowel(sliceIdx);
                                    } else {
                                        updateSamplerConfig({ activeSliceIndex: sliceIdx });
                                    }
                                }
                            }}
                        />
                    </div>
                    
                    <div className="p-2 text-[10px] text-slate-500 font-mono text-center border-t border-synth-grid bg-synth-dark">
                        {activeTrack.vocalParams.customData?.sampler?.slices?.length || 0} SLICES DETECTED
                    </div>
                </div>
            </div>
        )}

        {/* ... (OTHER TABS RACK/VOICE/MATH/DATA/CALC UNCHANGED) ... */}
        {activeTab === 'RACK' && (
            <div className="max-w-md mx-auto space-y-4 animate-in slide-in-from-right-8 duration-200">
                <div className="flex justify-between items-end mb-2">
                    <h2 className="text-sm font-bold text-synth-accent flex items-center gap-2"><Layers size={16}/> TRACKS</h2>
                    <button onClick={handleAddTrack} className="text-[10px] bg-synth-pop hover:bg-pink-600 text-white px-3 py-1.5 rounded-full font-bold flex items-center gap-1 shadow-lg shadow-pink-900/20"><Plus size={12}/> NEW</button>
                </div>

                <div className="grid gap-2">
                    {tracks.map(track => (
                        <div key={track.id} onClick={() => setActiveTrackId(track.id)} className={`relative p-3 rounded-xl border transition-all cursor-pointer overflow-hidden group ${activeTrackId === track.id ? 'bg-synth-panel border-synth-accent shadow-lg shadow-sky-900/10' : 'bg-synth-panel/40 border-synth-grid hover:border-slate-500'}`}>
                            <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{backgroundColor: track.color}}/>
                            
                            <div className="flex items-center gap-3 pl-2">
                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className={`text-xs font-bold truncate ${activeTrackId === track.id ? 'text-white' : 'text-slate-400'}`}>{track.name}</span>
                                        {activeTrackId === track.id && <span className="text-[8px] px-1 rounded bg-synth-accent/20 text-synth-accent ml-2">ACT</span>}
                                    </div>
                                    <input 
                                        type="range" min="0" max="1" step="0.05" 
                                        value={track.volume}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => {
                                            const v = parseFloat(e.target.value);
                                            setTracks(prev => prev.map(t => t.id === track.id ? { ...t, volume: v } : t));
                                        }}
                                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-synth-accent"
                                    />
                                </div>
                                
                                <div className="flex gap-1">
                                    <button onClick={(e) => { e.stopPropagation(); setTracks(prev => prev.map(t => t.id === track.id ? { ...t, muted: !t.muted } : t)); }} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${track.muted ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-500 hover:text-white'}`}>
                                        {track.muted ? <VolumeX size={14}/> : <Volume2 size={14}/>}
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); setTracks(prev => prev.map(t => t.id === track.id ? { ...t, solo: !t.solo } : t)); }} className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px] transition-colors ${track.solo ? 'bg-yellow-400 text-black' : 'bg-slate-800 text-slate-500 hover:text-white'}`}>S</button>
                                </div>
                            </div>
                            
                            {tracks.length > 1 && (
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteTrack(track.id); }} className="absolute top-2 right-2 text-slate-600 hover:text-red-400 p-1"><X size={12}/></button>
                            )}
                        </div>
                    ))}
                </div>

                <div className="bg-synth-panel/30 p-4 rounded-xl border border-synth-grid mt-6">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3">Global Mix</h3>
                    <div className="flex gap-4">
                        <ControlSlider label="BPM" value={globalParams.bpm} min={60} max={200} step={1} onChange={(v) => setGlobalParams(p => ({...p, bpm: v}))} className="flex-1 bg-transparent border-none p-0" />
                        <ControlSlider label="Reverb" value={globalParams.reverbMix} min={0} max={0.8} onChange={(v) => setGlobalParams(p => ({...p, reverbMix: v}))} className="flex-1 bg-transparent border-none p-0" />
                    </div>
                </div>
            </div>
        )}
        
        {/* TAB: VOICE (Parameters) */}
        {activeTab === 'VOICE' && (
             <div className="max-w-md mx-auto space-y-4 animate-in slide-in-from-right-8 duration-200">
                <div className="flex items-center gap-2 mb-2 bg-synth-panel p-2 rounded-lg border border-synth-grid">
                    <div className="w-2 h-8 rounded-full" style={{backgroundColor: activeTrack.color}} />
                    <div>
                        <h2 className="text-sm font-bold text-white uppercase">{activeTrack.name}</h2>
                        <p className="text-[9px] text-slate-500">VOICE SYNTHESIS PARAMETERS</p>
                    </div>
                </div>

                <div className="bg-synth-panel rounded-xl p-4 border border-synth-grid space-y-4">
                    <div>
                        <label className="text-[10px] font-bold text-synth-accent uppercase mb-1 block">Preset</label>
                        <select value={activeTrack.vocalParams.preset} onChange={(e) => updateActiveTrackParams({ preset: e.target.value as VocalPreset })} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-white outline-none focus:border-synth-pop">
                            {Object.values(VocalPreset).map(preset => (<option key={preset} value={preset}>{preset}</option>))}
                        </select>
                        {activeTrack.vocalParams.preset === VocalPreset.CUSTOM && (
                             <p className="text-[9px] text-emerald-400 mt-1 italic">Using custom DNA configuration.</p>
                        )}
                        {activeTrack.vocalParams.preset === VocalPreset.SAMPLER && (
                             <p className="text-[9px] text-pink-400 mt-1 italic font-bold">SAMPLER MODE ACTIVE! Go to the SAMPLER tab to configure.</p>
                        )}
                         {activeTrack.vocalParams.preset === VocalPreset.PLUGIN && (
                             <div className="mt-2">
                                <label className="text-[9px] font-bold text-orange-400 uppercase mb-1 block">Active Plugin</label>
                                <select 
                                    value={activeTrack.vocalParams.pluginId || ''} 
                                    onChange={(e) => {
                                        updateActiveTrackParams({ pluginId: e.target.value, pluginState: {} });
                                        // Force plugin definition into params state immediately
                                        const def = pluginLibrary[e.target.value];
                                        if (def) updateActiveTrackParams({ customData: def as unknown as AudioPresetDefinition });
                                    }} 
                                    className="w-full bg-slate-900 border border-orange-500/50 rounded p-2 text-xs text-orange-400 outline-none"
                                >
                                    <option value="" disabled>Select Engine...</option>
                                    {Object.keys(pluginLibrary).map(k => <option key={k} value={k}>{k}</option>)}
                                </select>
                             </div>
                        )}
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block flex items-center gap-1"><Languages size={12}/> Language Dictionary</label>
                        <select 
                            value={activeTrack.vocalParams.language || VocalLanguage.PT_BR} 
                            onChange={(e) => updateActiveTrackParams({ language: e.target.value as VocalLanguage })} 
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none focus:border-synth-accent"
                        >
                            {Object.values(VocalLanguage).map(lang => (<option key={lang} value={lang}>{lang}</option>))}
                        </select>
                    </div>

                    <div className="flex bg-slate-800 rounded-lg p-1">
                        {Object.values(VocalMode).map(m => (
                            <button key={m} onClick={() => updateActiveTrackParams({ mode: m as VocalMode })} className={`flex-1 py-2 text-[10px] font-bold rounded uppercase transition-all ${activeTrack.vocalParams.mode === m ? 'bg-synth-pop text-white shadow' : 'text-slate-400 hover:text-white'}`}>{m}</button>
                        ))}
                    </div>
                </div>

                {/* DYNAMIC PARAMETER RENDERING */}
                {activeTrack.vocalParams.preset === VocalPreset.PLUGIN && activeTrack.vocalParams.pluginId && pluginLibrary[activeTrack.vocalParams.pluginId] ? (
                    <div className="space-y-3 animate-in fade-in zoom-in-95 pb-4">
                         <h3 className="text-[10px] font-bold text-orange-400 uppercase px-1 flex items-center gap-1"><Plug2 size={12}/> Engine Parameters</h3>
                         {Object.entries(pluginLibrary[activeTrack.vocalParams.pluginId].parameters).map(([key, param]: [string, PluginParameter]) => (
                             <ControlSlider 
                                key={key}
                                label={param.label || key}
                                value={activeTrack.vocalParams.pluginState?.[key] ?? param.default}
                                min={param.min}
                                max={param.max}
                                step={param.type === 'int' ? 1 : 0.01}
                                unit={param.unit}
                                onChange={(v) => {
                                    const newState = { ...(activeTrack.vocalParams.pluginState || {}) };
                                    newState[key] = v;
                                    updateActiveTrackParams({ pluginState: newState });
                                }}
                                className="border-orange-500/30"
                             />
                         ))}
                    </div>
                ) : (
                    <>
                        {/* STANDARD PARAMS */}
                        <div className="space-y-3">
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase px-1">Timbre & Formants</h3>
                            <ControlSlider label="Formant Shift" value={activeTrack.vocalParams.formantShift} min={0.5} max={2.0} onChange={(v) => updateActiveTrackParams({ formantShift: v })} unit="x" />
                            <ControlSlider label="Breathiness" value={activeTrack.vocalParams.breathiness} min={0} max={1.0} onChange={(v) => updateActiveTrackParams({ breathiness: v })} />
                            <ControlSlider label="Timbre Jitter" value={activeTrack.vocalParams.jitter} min={0} max={0.5} onChange={(v) => updateActiveTrackParams({ jitter: v })} />
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase px-1">Performance</h3>
                            <ControlSlider label="Humanize" value={activeTrack.vocalParams.humanize} min={0} max={1.0} onChange={(v) => updateActiveTrackParams({ humanize: v })} />
                            <ControlSlider label="Pitch Scale" value={activeTrack.vocalParams.pitch} min={0.5} max={2.0} onChange={(v) => updateActiveTrackParams({ pitch: v })} unit="x" />
                        </div>

                        {/* DNA / SECRET PARAMS EDITOR */}
                        <div className="mt-6 bg-black/40 rounded-xl border border-synth-grid overflow-hidden">
                            <div className="bg-synth-dark p-2 border-b border-synth-grid flex justify-between items-center">
                                <h3 className="text-[10px] font-bold text-emerald-400 uppercase flex items-center gap-1"><Dna size={12}/> DNA / Secret Params</h3>
                                {activeTrack.vocalParams.preset !== VocalPreset.CUSTOM && <span className="text-[8px] text-slate-500">READ-ONLY PREVIEW</span>}
                            </div>
                            <div className="p-4 space-y-3">
                                <div className="bg-slate-800 p-2 rounded-lg">
                                    <label className="text-[9px] text-slate-400 uppercase font-bold mb-1 block">Waveform</label>
                                    <select 
                                        className="w-full bg-black text-xs text-white p-1 rounded border border-synth-grid outline-none"
                                        value={getActiveDNA().type}
                                        onChange={(e) => updateDNA({ type: e.target.value as any })}
                                    >
                                        <option value="sawtooth">Sawtooth (Standard)</option>
                                        <option value="sine">Sine (Pure/Flute)</option>
                                        <option value="square">Square (Robot/8-bit)</option>
                                        <option value="pulse">Pulse (Nasal/Bright)</option>
                                        <option value="triangle">Triangle (Soft)</option>
                                    </select>
                                </div>
                                <ControlSlider label="Base Freq" value={getActiveDNA().baseFreq} min={50} max={800} onChange={(v) => updateDNA({ baseFreq: v })} className="bg-transparent border-none p-0" />
                                <ControlSlider label="Distortion" value={getActiveDNA().distortion || 0} min={0} max={5} onChange={(v) => updateDNA({ distortion: v })} className="bg-transparent border-none p-0" />
                                <ControlSlider label="Osc Gain" value={getActiveDNA().oscGain ?? 1} min={0} max={2} onChange={(v) => updateDNA({ oscGain: v })} className="bg-transparent border-none p-0" />
                                <ControlSlider label="Breath Floor" value={getActiveDNA().breath || 0} min={0} max={1} onChange={(v) => updateDNA({ breath: v })} className="bg-transparent border-none p-0" />
                                <ControlSlider label="Vibrato Depth" value={getActiveDNA().vibrato?.depth || 0} min={0} max={0.5} onChange={(v) => updateDNA({ vibrato: { ...getActiveDNA().vibrato, rate: getActiveDNA().vibrato?.rate || 5, depth: v } })} className="bg-transparent border-none p-0" />
                            </div>
                        </div>

                        {/* VOICE FUSION LAB */}
                        <div className="mt-4 bg-gradient-to-br from-violet-900/20 to-fuchsia-900/20 rounded-xl border border-fuchsia-500/30 p-4 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-1 opacity-20 pointer-events-none"><TestTube2 size={64}/></div>
                            <h3 className="text-[10px] font-bold text-fuchsia-400 uppercase mb-3 flex items-center gap-1"><TestTube2 size={12}/> Voice Lab / Fusion</h3>
                            
                            <div className="flex gap-2 mb-2">
                                <div className="flex-1">
                                    <label className="text-[8px] text-fuchsia-300 font-bold block mb-1">VOICE A</label>
                                    <select value={fusionA} onChange={(e) => setFusionA(e.target.value as VocalPreset)} className="w-full text-[10px] bg-black/50 border border-fuchsia-500/30 rounded p-1 text-white outline-none">
                                        {Object.values(VocalPreset).map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="text-[8px] text-fuchsia-300 font-bold block mb-1">VOICE B</label>
                                    <select value={fusionB} onChange={(e) => setFusionB(e.target.value as VocalPreset)} className="w-full text-[10px] bg-black/50 border border-fuchsia-500/30 rounded p-1 text-white outline-none">
                                        {Object.values(VocalPreset).map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="mb-3">
                                <div className="flex justify-between text-[8px] text-fuchsia-300 font-bold mb-1">
                                    <span>A (0%)</span>
                                    <span>MIX ({fusionMix}%)</span>
                                    <span>B (100%)</span>
                                </div>
                                <input type="range" min="0" max="100" value={fusionMix} onChange={(e) => setFusionMix(parseFloat(e.target.value))} className="w-full h-1 bg-black rounded-full appearance-none accent-fuchsia-500"/>
                            </div>

                            <button onClick={handleCreateHybrid} className="w-full py-2 rounded bg-fuchsia-500 hover:bg-fuchsia-400 text-black text-xs font-bold shadow-lg shadow-fuchsia-500/20 active:scale-95 transition-all">
                                CREATE HYBRID VOICE
                            </button>
                        </div>
                    </>
                )}
             </div>
        )}

        {/* MATH, DATA, CALC tabs are unchanged in logic but included for complete file structure */}
        {activeTab === 'MATH' && (
            <div className="h-full flex flex-col gap-4 animate-in zoom-in-95 duration-300">
                <div className="flex justify-between items-end px-2">
                    <div>
                        <h2 className="text-sm font-bold text-synth-pop flex items-center gap-2"><SquareActivity size={16}/> LIVE CALCULATIONS</h2>
                        <p className="text-[10px] text-slate-500">REAL-TIME DSP MONITORING</p>
                    </div>
                    {isPlaying && <div className="flex gap-1"><span className="w-1 h-1 bg-green-500 rounded-full animate-ping"/><span className="text-[9px] text-green-500 font-bold">PROCESSING</span></div>}
                </div>
                
                <div className="flex-1 relative">
                    <Visualizer analyser={analyserNode} isPlaying={isPlaying} />
                </div>
            </div>
        )}

        {activeTab === 'DATA' && (
            <div className="h-full flex flex-col gap-4 animate-in slide-in-from-right-8 duration-200">
                 <div className="flex items-center gap-2 px-2">
                    <Database size={20} className="text-emerald-400" />
                    <div>
                        <h2 className="text-sm font-bold text-emerald-400 uppercase">CALCULATION DATA</h2>
                        <p className="text-[10px] text-slate-500">RAW ENGINE PARAMETERS</p>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-black rounded-xl border border-synth-grid p-4 font-mono text-[10px] space-y-6">
                    <div>
                        <div className="flex justify-between items-center mb-2 border-b border-gray-800 pb-1">
                            <h3 className="text-slate-400 font-bold">ACTIVE CONFIG</h3>
                            <button onClick={() => copyToClipboard(VOCAL_PRESETS_DATA[activeTrack.vocalParams.preset])} className="flex items-center gap-1 text-emerald-500 hover:text-emerald-300"><Copy size={12}/> COPY</button>
                        </div>
                        <pre className="text-emerald-700/80 whitespace-pre-wrap">
                            {JSON.stringify(
                                activeTrack.vocalParams.preset === VocalPreset.PLUGIN && activeTrack.vocalParams.pluginId ? pluginLibrary[activeTrack.vocalParams.pluginId] :
                                activeTrack.vocalParams.preset === VocalPreset.CUSTOM ? activeTrack.vocalParams.customData : 
                                VOCAL_PRESETS_DATA[activeTrack.vocalParams.preset], 
                                null, 2
                            )}
                        </pre>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'CALC' && (
            <div className="h-full flex flex-col gap-2 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-end px-2">
                    <div>
                        <h2 className="text-sm font-bold text-orange-400 flex items-center gap-2"><Calculator size={16}/> ALGO EDITOR</h2>
                        <p className="text-[10px] text-slate-500">DEFINE CUSTOM DSP MATHEMATICS</p>
                    </div>
                    
                    <div className="flex gap-2 bg-synth-panel rounded p-1">
                        <button onClick={() => setCalcMode('ALGO')} className={`text-[10px] px-2 py-1 rounded transition-colors ${calcMode === 'ALGO' ? 'bg-synth-accent text-black font-bold' : 'text-slate-400'}`}>ALGO</button>
                        <button onClick={() => setCalcMode('PLUGIN')} className={`text-[10px] px-2 py-1 rounded transition-colors ${calcMode === 'PLUGIN' ? 'bg-orange-500 text-black font-bold' : 'text-slate-400'}`}>PLUGIN</button>
                    </div>
                </div>

                <div className="flex-1 flex flex-col sm:flex-row gap-2 min-h-0">
                    <div className="sm:w-1/3 h-1/3 sm:h-full bg-synth-panel rounded-xl border border-synth-grid overflow-hidden flex flex-col">
                        <div className="p-2 bg-synth-dark border-b border-synth-grid text-[10px] font-bold text-slate-400 uppercase flex justify-between items-center">
                            <span>Library</span>
                            <div className="flex gap-1">
                                <button onClick={handleNewPlugin} className="text-xs bg-slate-700 px-2 py-0.5 rounded hover:bg-slate-600" title="New">+</button>
                                <button onClick={handleSaveCustomPreset} className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded border border-orange-500/50">Save</button>
                            </div>
                        </div>
                        <div className="overflow-y-auto flex-1 p-2 space-y-1">
                            {calcMode === 'ALGO' && (
                                <>
                                    {Object.keys(customPresets).length > 0 && (
                                        <div className="mb-2">
                                            <div className="text-[9px] text-synth-accent font-bold mb-1">USER</div>
                                            {Object.keys(customPresets).map(name => (
                                                <button 
                                                    key={name}
                                                    onClick={() => handleEditorSelect(name, true)}
                                                    className={`w-full text-left text-[10px] px-2 py-2 rounded truncate ${selectedEditorPreset === name ? 'bg-synth-accent text-black font-bold' : 'text-slate-300 hover:bg-slate-700'}`}
                                                >
                                                    {name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div>
                                        <div className="text-[9px] text-synth-accent font-bold mb-1">FACTORY</div>
                                        {Object.keys(VOCAL_PRESETS_DATA).filter(k => k !== 'CUSTOM / USER' && k !== '🔌 CUSTOM PLUGIN ENGINE' && k !== '🎤 WEIRD VOICE / SAMPLER').map(name => (
                                            <button 
                                                key={name}
                                                onClick={() => handleEditorSelect(name, false)}
                                                className={`w-full text-left text-[10px] px-2 py-2 rounded truncate ${selectedEditorPreset === name ? 'bg-synth-accent text-black font-bold' : 'text-slate-400 hover:bg-slate-700'}`}
                                            >
                                                {name}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                             {calcMode === 'PLUGIN' && (
                                <>
                                    {Object.keys(pluginLibrary).map(name => (
                                        <button 
                                            key={name}
                                            onClick={() => handleEditorSelect(name, true)}
                                            className={`w-full text-left text-[10px] px-2 py-2 rounded truncate ${selectedEditorPreset === name ? 'bg-orange-500 text-black font-bold' : 'text-slate-300 hover:bg-slate-700'}`}
                                        >
                                            {name}
                                        </button>
                                    ))}
                                    {Object.keys(pluginLibrary).length === 0 && <p className="text-[10px] text-slate-500 italic p-2">No plugins loaded.</p>}
                                </>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 flex flex-col gap-2 h-2/3 sm:h-full">
                        <div className="flex-1 relative group">
                            <textarea 
                                value={editorContent}
                                onChange={(e) => { setEditorContent(e.target.value); setEditorError(null); }}
                                className="w-full h-full bg-black rounded-xl border border-synth-grid p-4 font-mono text-[11px] text-emerald-400 resize-none outline-none focus:border-orange-500 leading-relaxed"
                                spellCheck={false}
                                placeholder="Select a preset or plugin to view code..."
                            />
                            {editorError && (
                                <div className="absolute bottom-2 left-2 right-2 bg-red-900/90 text-red-200 text-[10px] p-2 rounded border border-red-500">
                                    SYNTAX ERROR: {editorError}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={handleRenamePlugin}
                                disabled={!selectedEditorPreset}
                                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-4 rounded-xl shadow-lg active:scale-95 transition-transform text-[10px]"
                            >
                                RENAME
                            </button>
                            <button 
                                onClick={handleApplyCustomToTrack}
                                className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-bold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform text-[10px]"
                            >
                                <Code size={16}/> APPLY TO ACTIVE TRACK
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </main>

      {/* FLOATING ACTION DOCK */}
      <div className="fixed bottom-20 left-0 right-0 z-40 flex justify-center pointer-events-none safe-area-bottom">
          <div className="bg-synth-dark/90 backdrop-blur-md border border-synth-grid p-2 rounded-2xl shadow-2xl flex items-center gap-3 pointer-events-auto transform transition-transform hover:scale-105">
              <button 
                onClick={isPlaying ? handleStop : () => handlePlay()}
                disabled={!generatedBuffer && !isPlaying && activeTab !== 'PLAYLIST'}
                className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-all ${
                    !generatedBuffer && activeTab !== 'PLAYLIST' ? 'bg-slate-800 text-slate-600' : 
                    isPlaying ? 'bg-red-500 text-white shadow-red-500/30' : 'bg-synth-accent text-synth-dark shadow-cyan-500/30'
                }`}
              >
                  {isPlaying ? <Pause fill="currentColor" size={24}/> : <Play fill="currentColor" size={24} className="ml-1"/>}
              </button>
              
              <div className="h-8 w-px bg-synth-grid mx-1" />

              <button 
                onClick={handlePreview} 
                disabled={isGenerating || isPlaying} 
                className={`flex flex-col items-center justify-center px-4 py-1 rounded-lg border transition-all ${
                    isGenerating ? 'bg-slate-800 border-slate-700' : 'bg-synth-panel border-synth-grid hover:bg-slate-700 hover:border-slate-500'
                }`}
              >
                  <Activity size={18} className={`text-synth-pop mb-0.5 ${isGenerating ? 'animate-spin' : ''}`}/>
                  <span className="text-[8px] font-bold text-slate-300 uppercase tracking-wider">{isGenerating ? 'WAIT...' : 'PREVIEW'}</span>
              </button>
              
              {/* Toggle Fast Preview */}
              <button 
                  onClick={() => setFastPreview(!fastPreview)}
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded-lg border transition-all ${fastPreview ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-transparent text-slate-600'}`}
                  title="Fast Preview (Lower Quality, Less Lag)"
              >
                  <Zap size={14} className="mb-0.5" fill={fastPreview ? "currentColor" : "none"}/>
                  <span className="text-[7px] font-bold uppercase">FAST</span>
              </button>

              <button onClick={() => setShowExportModal(true)} className="p-2.5 rounded-lg bg-synth-panel border border-synth-grid text-slate-400 hover:text-white hover:bg-slate-700">
                  <Download size={18} />
              </button>
          </div>
      </div>

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 right-0 bg-synth-dark/95 backdrop-blur-lg border-t border-synth-grid h-16 z-50 flex justify-around items-center px-2 pb-safe overflow-x-auto no-scrollbar">
          <button onClick={() => setActiveTab('COMPOSE')} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors min-w-[60px] active:bg-slate-800 ${activeTab === 'COMPOSE' ? 'text-synth-accent' : 'text-slate-500'}`}>
              <Piano size={20} />
              <span className="text-[8px] font-bold">COMPOSE</span>
          </button>
          <button onClick={() => setActiveTab('PLAYLIST')} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors min-w-[60px] active:bg-slate-800 ${activeTab === 'PLAYLIST' ? 'text-emerald-400' : 'text-slate-500'}`}>
              <ListMusic size={20} />
              <span className="text-[8px] font-bold">PLAYLIST</span>
          </button>
           <button onClick={() => setActiveTab('RACK')} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors min-w-[60px] active:bg-slate-800 ${activeTab === 'RACK' ? 'text-synth-accent' : 'text-slate-500'}`}>
              <Layers size={20} />
              <span className="text-[8px] font-bold">RACK</span>
          </button>
           <button onClick={() => setActiveTab('VOICE')} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors min-w-[60px] active:bg-slate-800 ${activeTab === 'VOICE' ? 'text-synth-accent' : 'text-slate-500'}`}>
              <Sliders size={20} />
              <span className="text-[8px] font-bold">VOICE</span>
          </button>
           <button onClick={() => setActiveTab('SAMPLER')} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors min-w-[60px] active:bg-slate-800 ${activeTab === 'SAMPLER' ? 'text-synth-pop' : 'text-slate-500'}`}>
              <Music2 size={20} />
              <span className="text-[8px] font-bold">SAMPLER</span>
          </button>
           <button onClick={() => setActiveTab('MATH')} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors min-w-[60px] active:bg-slate-800 ${activeTab === 'MATH' ? 'text-synth-pop' : 'text-slate-500'}`}>
              <SquareActivity size={20} />
              <span className="text-[8px] font-bold">MATH</span>
          </button>
           <button onClick={() => setActiveTab('CALC')} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors min-w-[60px] active:bg-slate-800 ${activeTab === 'CALC' ? 'text-orange-400' : 'text-slate-500'}`}>
              <Calculator size={20} />
              <span className="text-[8px] font-bold">CALC</span>
          </button>
      </nav>

      {/* MODALS */}
      {showExportModal && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
             <div className="bg-synth-panel border border-synth-grid rounded-2xl w-full max-w-sm p-4 shadow-2xl flex flex-col gap-4">
                 <div className="flex justify-between items-center border-b border-synth-grid pb-2">
                     <h3 className="text-sm font-bold text-white flex items-center gap-2"><FileAudio size={16} className="text-synth-pop" /> EXPORT PROJECT</h3>
                     <button onClick={() => setShowExportModal(false)}><X size={18} className="text-slate-400"/></button>
                 </div>
                 
                 <div className="space-y-4">
                     {/* Format Selection */}
                     <div className="p-3 bg-slate-800 rounded-lg">
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block flex items-center gap-1">Format</label>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setExportConfig({...exportConfig, format: 'wav'})}
                                className={`flex-1 py-2 text-xs font-bold rounded border ${exportConfig.format === 'wav' ? 'bg-synth-accent text-black border-synth-accent' : 'bg-transparent text-slate-400 border-slate-600'}`}
                            >WAV</button>
                            <button 
                                onClick={() => setExportConfig({...exportConfig, format: 'mp3'})}
                                className={`flex-1 py-2 text-xs font-bold rounded border ${exportConfig.format === 'mp3' ? 'bg-synth-accent text-black border-synth-accent' : 'bg-transparent text-slate-400 border-slate-600'}`}
                            >MP3</button>
                        </div>
                     </div>

                     {/* Sample Rate */}
                     <div className="p-3 bg-slate-800 rounded-lg">
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block flex items-center gap-1"><Gauge size={12}/> Sample Rate</label>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setExportConfig({...exportConfig, sampleRate: 22050})}
                                className={`flex-1 py-2 text-xs font-bold rounded border ${exportConfig.sampleRate === 22050 ? 'bg-synth-accent text-black border-synth-accent' : 'bg-transparent text-slate-400 border-slate-600'}`}
                            >22k</button>
                            <button 
                                onClick={() => setExportConfig({...exportConfig, sampleRate: 44100})}
                                className={`flex-1 py-2 text-xs font-bold rounded border ${exportConfig.sampleRate === 44100 ? 'bg-synth-accent text-black border-synth-accent' : 'bg-transparent text-slate-400 border-slate-600'}`}
                            >44.1k</button>
                            <button 
                                onClick={() => setExportConfig({...exportConfig, sampleRate: 48000})}
                                className={`flex-1 py-2 text-xs font-bold rounded border ${exportConfig.sampleRate === 48000 ? 'bg-synth-accent text-black border-synth-accent' : 'bg-transparent text-slate-400 border-slate-600'}`}
                            >48k</button>
                        </div>
                     </div>

                     {/* Quality Settings based on Format */}
                     {exportConfig.format === 'wav' ? (
                        <div className="p-3 bg-slate-800 rounded-lg">
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block flex items-center gap-1">Bit Depth</label>
                            <div className="flex gap-2">
                                <button onClick={() => setExportConfig({...exportConfig, bitDepth: 8})} className={`flex-1 py-2 text-xs font-bold rounded border ${exportConfig.bitDepth === 8 ? 'bg-synth-pop text-white border-synth-pop' : 'bg-transparent text-slate-400 border-slate-600'}`}>8-bit</button>
                                <button onClick={() => setExportConfig({...exportConfig, bitDepth: 16})} className={`flex-1 py-2 text-xs font-bold rounded border ${exportConfig.bitDepth === 16 ? 'bg-synth-pop text-white border-synth-pop' : 'bg-transparent text-slate-400 border-slate-600'}`}>16-bit</button>
                                <button onClick={() => setExportConfig({...exportConfig, bitDepth: 32})} className={`flex-1 py-2 text-xs font-bold rounded border ${exportConfig.bitDepth === 32 ? 'bg-synth-pop text-white border-synth-pop' : 'bg-transparent text-slate-400 border-slate-600'}`}>32-bit</button>
                            </div>
                            <p className="text-[9px] text-slate-500 mt-2 italic text-center">8-bit = Lo-Fi/Retro • 32-bit = Floating Point</p>
                        </div>
                     ) : (
                        <div className="p-3 bg-slate-800 rounded-lg">
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block flex items-center gap-1">Bitrate</label>
                            <div className="flex gap-2">
                                <button onClick={() => setExportConfig({...exportConfig, mp3Bitrate: 128})} className={`flex-1 py-2 text-xs font-bold rounded border ${exportConfig.mp3Bitrate === 128 ? 'bg-synth-pop text-white border-synth-pop' : 'bg-transparent text-slate-400 border-slate-600'}`}>128k</button>
                                <button onClick={() => setExportConfig({...exportConfig, mp3Bitrate: 192})} className={`flex-1 py-2 text-xs font-bold rounded border ${exportConfig.mp3Bitrate === 192 ? 'bg-synth-pop text-white border-synth-pop' : 'bg-transparent text-slate-400 border-slate-600'}`}>192k</button>
                                <button onClick={() => setExportConfig({...exportConfig, mp3Bitrate: 320})} className={`flex-1 py-2 text-xs font-bold rounded border ${exportConfig.mp3Bitrate === 320 ? 'bg-synth-pop text-white border-synth-pop' : 'bg-transparent text-slate-400 border-slate-600'}`}>320k</button>
                            </div>
                        </div>
                     )}
                     
                     {/* Estimated Size */}
                     <div className="p-3 bg-slate-800 rounded-lg border border-synth-grid">
                         <div className="flex justify-between items-center mb-1">
                             <span className="text-[10px] font-bold text-slate-400 uppercase">Est. Size</span>
                             <span className="text-xs font-mono text-white">
                                 {calculateEstimatedSize()} MB
                             </span>
                         </div>
                         <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                             <div className="h-full bg-emerald-500" style={{width: '100%'}}></div>
                         </div>
                     </div>
                 </div>
                 
                 <button 
                    onClick={handleExport}
                    className="w-full py-3 bg-gradient-to-r from-synth-accent to-synth-pop text-white font-bold rounded-xl shadow-lg hover:shadow-cyan-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                 >
                     {isGenerating ? <Activity className="animate-spin" size={16}/> : <Download size={16}/>}
                     RENDER & DOWNLOAD
                 </button>
             </div>
          </div>
      )}

      {/* Other Modals (Lyrics/Pitch) - Unchanged */}
      {showLyricsModal && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-synth-panel border border-synth-grid rounded-2xl w-full max-w-sm p-4 shadow-2xl flex flex-col gap-3">
                <div className="flex justify-between items-center border-b border-synth-grid pb-2"><h3 className="text-sm font-bold text-white flex items-center gap-2"><Type size={16} className="text-synth-accent" /> LYRICS ENGINE</h3><button onClick={() => setShowLyricsModal(false)}><X size={18} className="text-slate-400"/></button></div>
                
                <div className="flex gap-2 mb-2">
                     <button 
                        onClick={() => setIsFnfMode(!isFnfMode)}
                        className={`flex-1 py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-all ${isFnfMode ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-slate-800 border-transparent text-slate-500 hover:border-slate-600'}`}
                     >
                         <Gamepad2 size={14}/> FNF VOCAL MODE
                     </button>
                     <button 
                        onClick={() => setIsLoopLyrics(!isLoopLyrics)}
                        disabled={isFnfMode}
                        className={`flex-1 py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-all ${isLoopLyrics && !isFnfMode ? 'bg-synth-pop/20 border-synth-pop text-synth-pop' : 'bg-slate-800 border-transparent text-slate-500 hover:border-slate-600'} ${isFnfMode ? 'opacity-50' : ''}`}
                     >
                         <Repeat size={14}/> LOOP TEXT
                     </button>
                </div>

                {isFnfMode ? (
                    <div className="h-32 bg-slate-900 rounded-xl border border-dashed border-orange-500/30 flex flex-col items-center justify-center text-center p-4">
                        <p className="text-orange-400 font-bold text-sm mb-1">FNF Pattern Active</p>
                        <p className="text-[10px] text-slate-400">Maps vowels to pitch relative to C4:</p>
                        <div className="flex gap-1 mt-2 font-mono text-xs">
                            <span className="bg-slate-800 px-1 rounded text-white">U</span>
                            <span className="bg-slate-800 px-1 rounded text-white">O</span>
                            <span className="bg-slate-800 px-1 rounded text-white">A</span>
                            <span className="bg-slate-800 px-1 rounded text-white">E</span>
                            <span className="bg-slate-800 px-1 rounded text-white">I</span>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <textarea 
                            className="w-full h-32 bg-synth-dark border border-synth-grid rounded-xl p-3 text-white focus:border-synth-accent outline-none font-mono text-sm" 
                            placeholder="Paste lyrics... Use hyphens (Bra-zil) to connect syllables!" 
                            value={lyricsInput} 
                            onChange={(e) => setLyricsInput(e.target.value)} 
                        />
                         <p className="text-[9px] text-emerald-400 italic flex items-center gap-1"><Link2 size={10}/> Tip: Hyphenated words will auto-connect notes.</p>
                    </div>
                )}

                <button onClick={handleApplyLyrics} className="flex-1 py-3 rounded-xl text-xs font-bold bg-synth-accent text-synth-dark flex items-center justify-center gap-2 hover:bg-white transition-colors"><Check size={14} /> {isFnfMode ? 'GENERATE PATTERN' : 'APPLY TO TRACK'}</button>
            </div>
        </div>
      )}

      {showPitchModal && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-synth-panel border border-synth-grid rounded-2xl w-full max-w-sm p-4 shadow-2xl flex flex-col gap-3">
                <div className="flex justify-between items-center border-b border-synth-grid pb-2"><h3 className="text-sm font-bold text-white flex items-center gap-2"><TrendingUp size={16} className="text-synth-pop" /> PITCH BEND</h3><button onClick={() => setShowPitchModal(false)}><X size={18} className="text-slate-400"/></button></div>
                <div className="relative w-full h-40 bg-synth-dark rounded-lg border border-synth-grid overflow-hidden cursor-crosshair"><canvas ref={pitchCanvasRef} width={340} height={160} onClick={handlePitchCanvasClick} className="w-full h-full"/><div className="absolute top-1/2 left-0 right-0 h-px bg-slate-600/50 pointer-events-none"/></div>
                <div className="flex gap-2 justify-center"><button onClick={() => setPitchCurve([{t:0,v:0},{t:1,v:0}])} className="text-[10px] px-2 py-1 bg-slate-700 rounded text-slate-300">FLAT</button><button onClick={() => setPitchCurve([{t:0,v:0},{t:1,v:5}])} className="text-[10px] px-2 py-1 bg-slate-700 rounded text-slate-300">RISE</button><button onClick={() => setPitchCurve([{t:0,v:0},{t:1,v:-5}])} className="text-[10px] px-2 py-1 bg-slate-700 rounded text-slate-300">FALL</button></div>
                <button onClick={handleApplyPitch} className="flex-1 py-2 rounded-xl text-xs font-bold bg-synth-pop text-white flex items-center justify-center gap-2"><Check size={14} /> APPLY</button>
            </div>
        </div>
      )}

    </div>
  );
};

export default App;
