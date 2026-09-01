
import React, { useRef, useState, useEffect } from 'react';
import { PlaylistTrack, PlaylistClip } from '../types';
import { Volume2, VolumeX, Trash2, Plus, GripVertical, Scissors, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Zap } from 'lucide-react';

interface PlaylistGridProps {
  tracks: PlaylistTrack[];
  setTracks: React.Dispatch<React.SetStateAction<PlaylistTrack[]>>;
  loopStart: number;
  loopEnd: number;
  setLoopStart: (v: number) => void;
  setLoopEnd: (v: number) => void;
  playbackTime: number; // For playhead
  duration: number; // View duration in seconds
  onCreatePatternClip?: () => void; // New prop to create media
}

const PIXELS_PER_SECOND = 50;
const TRACK_HEIGHT = 80;
const HEADER_HEIGHT = 30;

export const PlaylistGrid: React.FC<PlaylistGridProps> = ({
  tracks, setTracks, loopStart, loopEnd, setLoopStart, setLoopEnd, playbackTime, duration, onCreatePatternClip
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1.0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    type: 'MOVE_CLIP' | 'RESIZE_CLIP' | 'MOVE_LOOP_START' | 'MOVE_LOOP_END';
    clipId?: string;
    trackId?: string;
    startX: number;
    initialStartTime?: number;
    initialDuration?: number;
    initialValue?: number;
  } | null>(null);

  const pxPerSec = PIXELS_PER_SECOND * zoom;

  // Helpers
  const formatTime = (s: number) => {
      const m = Math.floor(s / 60);
      const sc = Math.floor(s % 60);
      const ms = Math.floor((s % 1) * 100);
      return `${m}:${sc.toString().padStart(2,'0')}.${ms.toString().padStart(2,'0')}`;
  };

  const handlePointerDown = (e: React.PointerEvent, type: any, data: any) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      
      if (type === 'MOVE_CLIP' || type === 'RESIZE_CLIP') {
          setSelectedClipId(data.clipId);
      }

      setDragState({
          type,
          startX: e.clientX,
          ...data
      });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (!dragState) return;
      const deltaX = e.clientX - dragState.startX;
      const deltaSeconds = deltaX / pxPerSec;

      if (dragState.type === 'MOVE_CLIP' && dragState.clipId && dragState.trackId) {
          setTracks(prev => prev.map(t => {
              if (t.id !== dragState.trackId) return t;
              return {
                  ...t,
                  clips: t.clips.map(c => {
                      if (c.id !== dragState.clipId) return c;
                      return { ...c, startTime: Math.max(0, (dragState.initialStartTime || 0) + deltaSeconds) };
                  })
              };
          }));
      }

      if (dragState.type === 'RESIZE_CLIP' && dragState.clipId && dragState.trackId) {
           setTracks(prev => prev.map(t => {
              if (t.id !== dragState.trackId) return t;
              return {
                  ...t,
                  clips: t.clips.map(c => {
                      if (c.id !== dragState.clipId) return c;
                      const newDur = Math.max(0.1, (dragState.initialDuration || 0) + deltaSeconds);
                      return { ...c, duration: newDur };
                  })
              };
          }));
      }

      if (dragState.type === 'MOVE_LOOP_START') {
          const newVal = Math.max(0, Math.min(loopEnd - 0.1, (dragState.initialValue || 0) + deltaSeconds));
          setLoopStart(newVal);
      }

      if (dragState.type === 'MOVE_LOOP_END') {
          const newVal = Math.max(loopStart + 0.1, (dragState.initialValue || 0) + deltaSeconds);
          setLoopEnd(newVal);
      }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      if (dragState) {
          e.currentTarget.releasePointerCapture(e.pointerId);
          setDragState(null);
      }
  };

  const handleAddTrack = () => {
      setTracks(p => [...p, {
          id: `pt-${Date.now()}`,
          name: `Track ${p.length + 1}`,
          clips: [],
          muted: false,
          solo: false,
          volume: 0.8
      }]);
  };

  const handleRemoveTrack = (id: string) => {
      setTracks(p => p.filter(t => t.id !== id));
  };

  const handleDeleteClip = (clipId: string) => {
      setTracks(prev => prev.map(t => ({
          ...t,
          clips: t.clips.filter(c => c.id !== clipId)
      })));
      if (selectedClipId === clipId) setSelectedClipId(null);
  };

  const moveSelectedClipWithKeys = (dt: number, dTrack: number) => {
    if (!selectedClipId) return;
    setTracks(prev => {
        // Find current track index and clip
        let sourceTrackIndex = -1;
        let clip: PlaylistClip | undefined;
        
        prev.forEach((t, i) => {
            const found = t.clips.find(c => c.id === selectedClipId);
            if (found) {
                sourceTrackIndex = i;
                clip = found;
            }
        });

        if (sourceTrackIndex === -1 || !clip) return prev;

        const targetTrackIndex = sourceTrackIndex + dTrack;
        
        // 1. Time Move Only (Same Track)
        if (dTrack === 0) {
             return prev.map((t, i) => {
                 if (i !== sourceTrackIndex) return t;
                 return {
                     ...t,
                     clips: t.clips.map(c => c.id === selectedClipId ? { ...c, startTime: Math.max(0, c.startTime + dt) } : c)
                 };
             });
        }

        // 2. Track Change (Cut and Paste logic)
        if (targetTrackIndex < 0 || targetTrackIndex >= prev.length) return prev; // Boundary check

        const newStartTime = Math.max(0, clip.startTime + dt);
        const updatedClip = { ...clip, startTime: newStartTime };

        const newTracks = [...prev];
        // Remove from source
        newTracks[sourceTrackIndex] = {
            ...newTracks[sourceTrackIndex],
            clips: newTracks[sourceTrackIndex].clips.filter(c => c.id !== selectedClipId)
        };
        // Add to target
        newTracks[targetTrackIndex] = {
            ...newTracks[targetTrackIndex],
            clips: [...newTracks[targetTrackIndex].clips, updatedClip]
        };
        
        return newTracks;
    });
  };

  return (
    <div className="flex flex-col h-full bg-synth-dark overflow-hidden select-none relative" onPointerUp={handlePointerUp} onPointerMove={handlePointerMove}>
        
        {/* Toolbar */}
        <div className="h-10 bg-synth-panel border-b border-synth-grid flex items-center px-2 justify-between shrink-0 z-20 relative">
            <div className="flex items-center gap-2">
                <button onClick={handleAddTrack} className="bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1"><Plus size={14}/> TRACK</button>
                {onCreatePatternClip && (
                    <button onClick={onCreatePatternClip} className="bg-synth-pop hover:bg-pink-400 text-white text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1"><Zap size={14}/> RENDER PATTERN</button>
                )}
                <div className="h-4 w-px bg-slate-600 mx-1"/>
                <span className="text-[10px] text-slate-400 font-bold uppercase hidden sm:inline">Zoom</span>
                <input type="range" min="0.5" max="5" step="0.1" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="w-16 accent-emerald-500"/>
            </div>
            <div className="text-[10px] text-emerald-400 font-mono flex items-center gap-2">
                <button onClick={() => { setLoopStart(Math.max(0, loopStart - 1)); setLoopEnd(Math.max(1, loopEnd - 1)); }} className="p-1 hover:bg-slate-700 rounded"><ArrowLeft size={10}/></button>
                <span>LOOP: {formatTime(loopStart)} - {formatTime(loopEnd)}</span>
                <button onClick={() => { setLoopStart(loopStart + 1); setLoopEnd(loopEnd + 1); }} className="p-1 hover:bg-slate-700 rounded"><ArrowRight size={10}/></button>
            </div>
        </div>

        <div className="flex-1 flex overflow-hidden relative" onPointerDown={() => setSelectedClipId(null)}>
            
            {/* Track Headers */}
            <div className="w-24 sm:w-32 bg-synth-panel border-r border-synth-grid shrink-0 z-20 flex flex-col mt-[30px]">
                {tracks.map(track => (
                    <div key={track.id} className="border-b border-synth-grid flex flex-col p-2 gap-1 bg-synth-panel relative group" style={{height: TRACK_HEIGHT}}>
                        <div className="flex justify-between items-center">
                            <input 
                                className="bg-transparent text-[10px] sm:text-xs text-white font-bold w-full outline-none truncate" 
                                value={track.name}
                                onChange={(e) => setTracks(prev => prev.map(t => t.id === track.id ? {...t, name: e.target.value} : t))}
                            />
                            <button onClick={() => handleRemoveTrack(track.id)} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12}/></button>
                        </div>
                        <div className="flex gap-1 mt-auto">
                            <button 
                                onClick={() => setTracks(prev => prev.map(t => t.id === track.id ? {...t, muted: !t.muted} : t))}
                                className={`p-1 rounded ${track.muted ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-400'}`}
                            ><VolumeX size={12}/></button>
                            <button 
                                onClick={() => setTracks(prev => prev.map(t => t.id === track.id ? {...t, solo: !t.solo} : t))}
                                className={`p-1 rounded ${track.solo ? 'bg-yellow-400 text-black' : 'bg-slate-700 text-slate-400'}`}
                            >S</button>
                        </div>
                        <input 
                            type="range" min="0" max="1" step="0.05" value={track.volume} 
                            onChange={(e) => setTracks(prev => prev.map(t => t.id === track.id ? {...t, volume: parseFloat(e.target.value)} : t))}
                            className="w-full h-1 bg-slate-800 rounded-full appearance-none accent-synth-accent mt-1"
                        />
                    </div>
                ))}
            </div>

            {/* Timeline Area */}
            <div ref={containerRef} className="flex-1 overflow-auto relative bg-slate-900/50">
                <div style={{ width: Math.max(duration, loopEnd + 10) * pxPerSec, height: tracks.length * TRACK_HEIGHT + HEADER_HEIGHT }}>
                    
                    {/* Ruler / Region Selector */}
                    <div className="sticky top-0 h-[30px] bg-synth-dark border-b border-synth-grid z-10 w-full relative">
                        {/* Marks */}
                        {Array.from({length: Math.ceil(Math.max(duration, loopEnd + 10))}).map((_, i) => (
                            <div key={i} className="absolute top-0 bottom-0 border-l border-slate-700 text-[8px] text-slate-500 pl-1" style={{left: i * pxPerSec}}>
                                {i}s
                            </div>
                        ))}
                        
                        {/* Render Region Overlay */}
                        <div 
                            className="absolute top-0 h-full bg-emerald-500/20 border-x border-emerald-500/50 pointer-events-none"
                            style={{ left: loopStart * pxPerSec, width: (loopEnd - loopStart) * pxPerSec }}
                        >
                            <div className="w-full h-full flex items-center justify-center text-[9px] text-emerald-300 font-bold opacity-50 tracking-widest truncate">RENDER REGION</div>
                        </div>

                        {/* Drag Handles for Region */}
                        <div 
                            className="absolute top-0 bottom-0 w-4 bg-emerald-500/50 hover:bg-emerald-400 cursor-ew-resize z-20 flex items-center justify-center group"
                            style={{ left: (loopStart * pxPerSec) - 2 }}
                            onPointerDown={(e) => handlePointerDown(e, 'MOVE_LOOP_START', { initialValue: loopStart })}
                        >
                            <div className="w-px h-full bg-white opacity-50"/>
                        </div>
                        <div 
                            className="absolute top-0 bottom-0 w-4 bg-emerald-500/50 hover:bg-emerald-400 cursor-ew-resize z-20 flex items-center justify-center"
                            style={{ left: (loopEnd * pxPerSec) - 2 }}
                            onPointerDown={(e) => handlePointerDown(e, 'MOVE_LOOP_END', { initialValue: loopEnd })}
                        >
                             <div className="w-px h-full bg-white opacity-50"/>
                        </div>
                    </div>

                    {/* Tracks Rows */}
                    <div className="relative">
                        {/* Playhead Line */}
                        <div className="absolute top-0 bottom-0 w-px bg-white z-30 pointer-events-none shadow-[0_0_10px_white]" style={{left: playbackTime * pxPerSec, height: tracks.length * TRACK_HEIGHT}} />

                        {tracks.map((track, trackIndex) => (
                            <div key={track.id} className="relative w-full border-b border-synth-grid/30 bg-black/20" style={{height: TRACK_HEIGHT}}>
                                {/* Grid Lines */}
                                {Array.from({length: Math.ceil(Math.max(duration, loopEnd))}).map((_, i) => (
                                    <div key={i} className="absolute top-0 bottom-0 border-l border-slate-800/50 pointer-events-none" style={{left: i * pxPerSec}} />
                                ))}

                                {/* Clips */}
                                {track.clips.map(clip => (
                                    <div 
                                        key={clip.id}
                                        className={`absolute top-1 bottom-1 rounded-md border overflow-hidden group cursor-move flex flex-col justify-center px-2 shadow-lg transition-colors ${selectedClipId === clip.id ? 'ring-2 ring-white z-10' : ''} ${clip.type === 'VOCAL_RENDER' ? 'bg-synth-accent/20 border-synth-accent text-synth-accent' : 'bg-emerald-500/20 border-emerald-500 text-emerald-400'}`}
                                        style={{
                                            left: clip.startTime * pxPerSec,
                                            width: clip.duration * pxPerSec
                                        }}
                                        onPointerDown={(e) => handlePointerDown(e, 'MOVE_CLIP', { clipId: clip.id, trackId: track.id, initialStartTime: clip.startTime })}
                                    >
                                        <div className="flex justify-between items-center pointer-events-none select-none">
                                            <span className="text-[10px] font-bold truncate">{clip.name}</span>
                                        </div>
                                        
                                        {/* Waveform Fake */}
                                        <div className="h-4 w-full opacity-30 flex items-center gap-px">
                                            {Array.from({length: 20}).map((_, i) => <div key={i} className="flex-1 bg-current rounded-full" style={{height: `${Math.random()*100}%`}}/>)}
                                        </div>

                                        {/* Resize Handle Right */}
                                        <div 
                                            className="absolute right-0 top-0 bottom-0 w-3 cursor-e-resize hover:bg-white/20 flex items-center justify-center"
                                            onPointerDown={(e) => handlePointerDown(e, 'RESIZE_CLIP', { clipId: clip.id, trackId: track.id, initialDuration: clip.duration })}
                                        >
                                            <div className="w-0.5 h-4 bg-white/50 rounded"/>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        {/* Floating D-PAD for Clips */}
        {selectedClipId && (
            <div className="absolute bottom-4 right-4 z-50 flex items-end gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200 pointer-events-auto">
                <div className="bg-synth-panel/95 backdrop-blur border border-synth-grid rounded-2xl p-2 shadow-2xl flex flex-col items-center gap-1">
                    <button onClick={() => moveSelectedClipWithKeys(0, -1)} className="p-2 hover:bg-synth-accent/20 rounded-lg text-synth-accent transition-colors active:scale-95 bg-white/5"><ArrowUp size={20} /></button>
                    <div className="flex gap-1">
                            <button onClick={() => moveSelectedClipWithKeys(-0.1, 0)} className="p-2 hover:bg-synth-accent/20 rounded-lg text-synth-accent transition-colors active:scale-95 bg-white/5"><ArrowLeft size={20} /></button>
                            <button onClick={() => moveSelectedClipWithKeys(0, 1)} className="p-2 hover:bg-synth-accent/20 rounded-lg text-synth-accent transition-colors active:scale-95 bg-white/5"><ArrowDown size={20} /></button>
                            <button onClick={() => moveSelectedClipWithKeys(0.1, 0)} className="p-2 hover:bg-synth-accent/20 rounded-lg text-synth-accent transition-colors active:scale-95 bg-white/5"><ArrowRight size={20} /></button>
                    </div>
                </div>
                <button onClick={() => handleDeleteClip(selectedClipId)} className="bg-red-500 hover:bg-red-600 text-white p-4 rounded-2xl shadow-xl active:scale-90 transition-all border border-red-400/50"><Trash2 size={24} /></button>
            </div>
        )}
    </div>
  );
};
