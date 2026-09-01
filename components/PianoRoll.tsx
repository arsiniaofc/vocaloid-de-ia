
import React, { useRef, useState, useEffect } from 'react';
import { SequencerNote, SequencerTrack, ScaleType, SnapGrid } from '../types';
import { 
  Pencil, Eraser, Undo, Redo, Trash2, MousePointer2, Hand, 
  ArrowLeftRight, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, TrendingUp,
  Link2, Activity, Lock
} from 'lucide-react';
import { isNoteInScale, SCALE_INTERVALS, NOTE_FREQUENCIES } from '../services/audioEngine';

interface PianoRollProps {
  notes: SequencerNote[];
  setNotes: React.Dispatch<React.SetStateAction<SequencerNote[]>>;
  ghostTracks?: SequencerTrack[]; // New prop for background notes
  durationBeats: number; // Total beats
  onUndo: () => void;
  onRedo: () => void;
  addToHistory: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onEditPitch?: (noteId: string) => void;
  playbackBeat?: number; // Current beat from player
  
  // NEW PROPS
  scaleRoot?: string;
  scaleType?: ScaleType;
  scaleEnabled?: boolean;
  snapGrid?: SnapGrid;
}

const NOTE_HEIGHT = 20; // Compact height
const PIXELS_PER_BEAT = 60; // Zoom level
// Expanded Range: 0 (C-1) to 127 (G9) covers standard MIDI full range (~10.5 octaves)
const MIDI_MIN = 0; 
const MIDI_MAX = 127; 
const TOTAL_KEYS = MIDI_MAX - MIDI_MIN + 1;

type ToolType = 'POINTER' | 'PENCIL' | 'ERASER' | 'HAND';

export const PianoRoll: React.FC<PianoRollProps> = ({ 
  notes, setNotes, ghostTracks = [], durationBeats, onUndo, onRedo, addToHistory, canUndo, canRedo, onEditPitch, playbackBeat = 0,
  scaleRoot = 'C', scaleType = ScaleType.CHROMATIC, scaleEnabled = false, snapGrid = SnapGrid.BEAT
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolType>('POINTER');
  
  // Interaction State
  const dragRef = useRef<{ 
    type: 'MOVE' | 'RESIZE' | 'PAN' | 'CREATE', 
    noteId?: string, 
    startX: number, 
    startY: number, 
    initialStart?: number, 
    initialMidi?: number, 
    initialDuration?: number,
    initialScrollX?: number,
    initialScrollY?: number
  } | null>(null);

  // Generate Keys Data
  const keys = [];
  for (let i = MIDI_MAX; i >= MIDI_MIN; i--) {
    const isBlack = [1, 3, 6, 8, 10].includes(i % 12);
    // Label Logic: i=0 -> C-1, i=12 -> C0, i=60 -> C4
    const label = i % 12 === 0 ? `C${(i/12)-1}` : '';
    
    // Scale Highlight Check
    const isInScale = scaleType === ScaleType.CHROMATIC || isNoteInScale(i, scaleRoot, scaleType);
    
    keys.push({ midi: i, isBlack, label, isInScale });
  }

  // Auto-scroll to C4 on mount
  useEffect(() => {
    if (containerRef.current) {
        // Center C4 (Midi 60)
        const c4Midi = 60;
        const topPos = (MIDI_MAX - c4Midi) * NOTE_HEIGHT;
        const containerHeight = containerRef.current.clientHeight;
        // Scroll so C4 is roughly in the middle
        containerRef.current.scrollTop = topPos - (containerHeight / 2) + (NOTE_HEIGHT / 2);
    }
  }, []);

  // Auto-scroll to Playhead
  useEffect(() => {
      if (playbackBeat > 0 && containerRef.current) {
          const x = playbackBeat * PIXELS_PER_BEAT;
          const w = containerRef.current.clientWidth;
          const scroll = containerRef.current.scrollLeft;
          // If playhead goes out of view, center it
          if (x > scroll + w - 50 || x < scroll) {
             containerRef.current.scrollLeft = x - w / 2;
          }
      }
  }, [playbackBeat]);

  // --- Helpers ---
  const getNoteAt = (midi: number, beat: number) => {
    return notes.find(n => 
      n.midi === midi && 
      beat >= n.startTime && 
      beat < n.startTime + n.duration
    );
  };

  const snapToGrid = (val: number) => {
      if (snapGrid === SnapGrid.OFF) return val;
      const step = snapGrid;
      return Math.round(val / step) * step;
  };

  const snapToScale = (midi: number): number => {
      if (!scaleEnabled || scaleType === ScaleType.CHROMATIC) return midi;
      
      if (isNoteInScale(midi, scaleRoot, scaleType)) return midi;
      
      // Find nearest neighbor in scale
      let up = midi;
      let down = midi;
      while (up <= MIDI_MAX) {
          if (isNoteInScale(up, scaleRoot, scaleType)) return up;
          up++;
      }
      while (down >= MIDI_MIN) {
          if (isNoteInScale(down, scaleRoot, scaleType)) return down;
          down--;
      }
      return midi;
  };

  // --- Handlers ---

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    
    // Coordinates relative to the scroll container content
    // We must account for the sticky header (keys width)
    const KEYS_WIDTH = 48;
    const rawX = e.clientX - rect.left;
    const scrollX = containerRef.current.scrollLeft;
    const scrollY = containerRef.current.scrollTop;
    
    // Effective Grid Coordinates
    const gridX = rawX + scrollX - KEYS_WIDTH;
    const gridY = e.clientY - rect.top + scrollY;

    // Check bounds (don't click on keys column)
    if (rawX < KEYS_WIDTH && tool !== 'HAND') return;

    const beat = Math.max(0, gridX / PIXELS_PER_BEAT);
    const midi = MIDI_MAX - Math.floor(gridY / NOTE_HEIGHT);

    // --- TOOL LOGIC ---

    if (tool === 'HAND' || (e.button === 1)) { // Middle click or Hand tool
        dragRef.current = {
            type: 'PAN',
            startX: e.clientX,
            startY: e.clientY,
            initialScrollX: scrollX,
            initialScrollY: scrollY
        };
        return;
    }

    if (tool === 'ERASER') {
        const clickedNote = getNoteAt(midi, beat);
        if (clickedNote) {
            addToHistory();
            setNotes(prev => prev.filter(n => n.id !== clickedNote.id));
        }
        return;
    }

    if (tool === 'PENCIL') {
        const existing = getNoteAt(midi, beat);
        if (existing) {
            setSelectedNoteId(existing.id);
        } else {
            // Create
            addToHistory();
            const snappedStart = snapToGrid(beat);
            // Default duration based on grid or 1 beat
            const defaultDur = snapGrid === SnapGrid.OFF ? 1.0 : snapGrid;
            
            const newNote: SequencerNote = {
                id: Math.random().toString(36).substr(2, 9),
                midi: snapToScale(midi),
                startTime: snappedStart, 
                duration: defaultDur,
                lyric: 'la',
                pitchPoints: [{t:0,v:0},{t:1,v:0}],
                glide: false,
                connected: false
            };
            setNotes(prev => [...prev, newNote]);
            setSelectedNoteId(newNote.id);
        }
        return;
    }

    if (tool === 'POINTER') {
        const existing = getNoteAt(midi, beat);
        if (!existing) {
            setSelectedNoteId(null);
        }
    }
  };

  const handleNoteMouseDown = (e: React.MouseEvent, note: SequencerNote, type: 'MOVE' | 'RESIZE') => {
    e.stopPropagation();
    if (tool !== 'POINTER') return; // Only pointer modifies existing notes logic here

    addToHistory();
    setSelectedNoteId(note.id);
    
    dragRef.current = {
        type: type,
        noteId: note.id,
        startX: e.clientX,
        startY: e.clientY,
        initialStart: note.startTime,
        initialMidi: note.midi,
        initialDuration: note.duration
    };
  };

  const handleGlobalMove = (e: MouseEvent) => {
    if (!dragRef.current) return;
    const { type, startX, startY, noteId, initialStart, initialMidi, initialDuration, initialScrollX, initialScrollY } = dragRef.current;

    if (type === 'PAN' && containerRef.current) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        containerRef.current.scrollLeft = (initialScrollX || 0) - dx;
        containerRef.current.scrollTop = (initialScrollY || 0) - dy;
        return;
    }

    const deltaX = (e.clientX - startX) / PIXELS_PER_BEAT;
    const deltaY = (e.clientY - startY) / NOTE_HEIGHT;

    if (type === 'MOVE') {
        const newStart = Math.max(0, snapToGrid((initialStart || 0) + deltaX));
        let newMidi = Math.min(MIDI_MAX, Math.max(MIDI_MIN, Math.round((initialMidi || 0) - deltaY)));
        
        // MAGNET
        newMidi = snapToScale(newMidi);

        setNotes(prev => prev.map(n => n.id === noteId ? { ...n, startTime: newStart, midi: newMidi } : n));
    }

    if (type === 'RESIZE') {
        const rawDur = (initialDuration || 0) + deltaX;
        // Snap duration too? Usually yes if grid on
        const newDur = Math.max(0.125, snapToGrid(rawDur) || 0.125); 
        
        setNotes(prev => prev.map(n => n.id === noteId ? { ...n, duration: newDur } : n));
    }
  };

  const handleGlobalUp = () => {
    dragRef.current = null;
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalUp);
    return () => {
        window.removeEventListener('mousemove', handleGlobalMove);
        window.removeEventListener('mouseup', handleGlobalUp);
    };
  }, [snapGrid, scaleEnabled, scaleRoot, scaleType]); // Re-bind listeners if constraints change

  const updateNoteLyric = (id: string, newLyric: string) => {
    setNotes(notes.map(n => n.id === id ? { ...n, lyric: newLyric } : n));
  };

  const updateNoteDuration = (id: string, newDuration: number) => {
    if (isNaN(newDuration)) return;
    const d = Math.max(0.125, newDuration);
    setNotes(notes.map(n => n.id === id ? { ...n, duration: d } : n));
  };
  
  const toggleNoteProperty = (id: string, prop: 'glide' | 'connected') => {
      addToHistory();
      setNotes(prev => prev.map(n => n.id === id ? { ...n, [prop]: !n[prop] } : n));
  };

  const deleteNote = (id: string) => {
      addToHistory();
      setNotes(notes.filter(n => n.id !== id));
      setSelectedNoteId(null);
  };

  const moveSelectedNote = (dt: number, dMidi: number) => {
    if (!selectedNoteId) return;
    addToHistory();
    setNotes(prev => prev.map(n => {
        if (n.id !== selectedNoteId) return n;
        const newStart = Math.max(0, n.startTime + dt);
        let newMidi = Math.min(MIDI_MAX, Math.max(MIDI_MIN, n.midi + dMidi));
        
        // Manual move via D-PAD respects scale if enabled, unless shift held (not handled here on mobile dpad)
        // Let's force scale snap if enabled for D-PAD too
        newMidi = snapToScale(newMidi);

        return { ...n, startTime: newStart, midi: newMidi };
    }));
  };
  
  // Sort notes for drawing connections
  const sortedNotes = [...notes].sort((a,b) => a.startTime - b.startTime);

  return (
    <div className="flex flex-col h-full bg-gray-900 border border-synth-grid rounded-xl overflow-hidden select-none shadow-2xl relative group">
      
      {/* Toolbar */}
      <div className="bg-synth-panel p-2 flex gap-2 items-center border-b border-synth-grid shrink-0 z-30 relative overflow-x-auto no-scrollbar">
        
        <div className="flex bg-synth-dark rounded-lg p-0.5 border border-synth-grid shrink-0">
            <button onClick={() => setTool('POINTER')} className={`p-2 rounded-md ${tool === 'POINTER' ? 'bg-synth-accent text-synth-dark' : 'text-slate-400'}`} title="Select/Move/Resize">
                <MousePointer2 size={16} />
            </button>
            <button onClick={() => setTool('PENCIL')} className={`p-2 rounded-md ${tool === 'PENCIL' ? 'bg-synth-accent text-synth-dark' : 'text-slate-400'}`} title="Create">
                <Pencil size={16} />
            </button>
            <button onClick={() => setTool('HAND')} className={`p-2 rounded-md ${tool === 'HAND' ? 'bg-synth-accent text-synth-dark' : 'text-slate-400'}`} title="Navigate">
                <Hand size={16} />
            </button>
             <button onClick={() => setTool('ERASER')} className={`p-2 rounded-md ${tool === 'ERASER' ? 'bg-synth-pop text-white' : 'text-slate-400'}`} title="Erase">
                <Eraser size={16} />
            </button>
        </div>

        <div className="w-px h-6 bg-synth-grid mx-1 shrink-0"></div>

        <div className="flex gap-1 shrink-0">
             <button onClick={onUndo} disabled={!canUndo} className={`p-2 rounded-md ${canUndo ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-700'}`}><Undo size={16} /></button>
            <button onClick={onRedo} disabled={!canRedo} className={`p-2 rounded-md ${canRedo ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-700'}`}><Redo size={16} /></button>
        </div>

        {selectedNoteId && (
            <div className="flex items-center gap-2 ml-auto animate-in fade-in duration-200 border-l border-synth-grid pl-2 shrink-0">
                {/* Special Flags Buttons */}
                <div className="flex gap-1 mr-2">
                    <button 
                        onClick={() => toggleNoteProperty(selectedNoteId, 'connected')}
                        className={`p-1.5 rounded border transition-colors ${notes.find(n => n.id === selectedNoteId)?.connected ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-synth-dark text-slate-500 border-slate-700'}`}
                        title="Connect to next (Legato/Phrasing)"
                    >
                        <Link2 size={14}/>
                    </button>
                    <button 
                        onClick={() => toggleNoteProperty(selectedNoteId, 'glide')}
                        className={`p-1.5 rounded border transition-colors ${notes.find(n => n.id === selectedNoteId)?.glide ? 'bg-orange-500 text-white border-orange-400' : 'bg-synth-dark text-slate-500 border-slate-700'}`}
                        title="Slide/Portamento"
                    >
                        <Activity size={14}/>
                    </button>
                </div>

                <button 
                    onClick={() => onEditPitch && onEditPitch(selectedNoteId)}
                    className="flex items-center gap-1 px-2 py-1 bg-synth-dark border border-synth-grid rounded text-[10px] text-synth-pop hover:bg-slate-700"
                    title="Edit Pitch Bend"
                >
                    <TrendingUp size={12} />
                    <span className="hidden sm:inline">PITCH</span>
                </button>
                <input 
                    type="text" 
                    className="bg-synth-dark border border-synth-grid rounded px-2 py-1 text-xs text-white w-20 focus:border-synth-pop outline-none text-center"
                    value={notes.find(n => n.id === selectedNoteId)?.lyric || ''}
                    onChange={(e) => updateNoteLyric(selectedNoteId, e.target.value)}
                    onFocus={addToHistory}
                    placeholder="Lyric"
                    title="Lyric"
                />
                
                {/* Manual Duration Control */}
                <div className="flex items-center bg-synth-dark border border-synth-grid rounded px-1" title="Duration (Beats)">
                    <ArrowLeftRight size={10} className="text-slate-500 mr-1" />
                    <input 
                        type="number"
                        step={0.25}
                        min={0.125}
                        className="bg-transparent text-xs text-white w-10 focus:outline-none text-center font-mono appearance-none"
                        value={notes.find(n => n.id === selectedNoteId)?.duration || 0}
                        onChange={(e) => updateNoteDuration(selectedNoteId, parseFloat(e.target.value))}
                        onFocus={addToHistory}
                    />
                </div>
            </div>
        )}
      </div>

      {/* Main Scroll Container */}
      <div 
        ref={containerRef}
        className={`flex-1 overflow-auto bg-synth-dark relative scroll-smooth ${tool === 'HAND' ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
        onMouseDown={handleMouseDown}
      >
        <div 
            className="relative flex" 
            style={{ 
                height: `${TOTAL_KEYS * NOTE_HEIGHT}px`, 
                width: `${Math.max(durationBeats * PIXELS_PER_BEAT + 48, 1000)}px` // +48 for keys width
            }}
        >
            
            {/* STICKY KEYS COLUMN */}
            <div className="w-12 sticky left-0 z-20 bg-white border-r border-gray-300 flex flex-col shrink-0 shadow-lg">
                {keys.map((k) => (
                    <div 
                        key={k.midi} 
                        className={`h-[20px] border-b border-gray-300 text-[9px] flex items-center justify-end pr-1 font-bold ${k.isBlack ? 'bg-black text-white' : 'bg-white text-gray-800'} ${!k.isInScale && scaleEnabled ? 'opacity-30' : 'opacity-100'}`}
                        style={{ height: NOTE_HEIGHT }}
                    >
                        {k.label}
                    </div>
                ))}
            </div>

            {/* GRID AREA */}
            <div className="flex-1 relative">
                
                {/* Background Rows */}
                {keys.map((k, i) => (
                    <div 
                        key={k.midi}
                        className={`absolute w-full border-b border-synth-grid/10 ${k.isBlack ? 'bg-synth-grid/5' : ''} ${!k.isInScale && scaleEnabled ? 'bg-black/30' : ''}`}
                        style={{ top: i * NOTE_HEIGHT, height: NOTE_HEIGHT }}
                    />
                ))}

                {/* Vertical Beat Lines */}
                {Array.from({ length: Math.ceil(durationBeats * 4) + 1 }).map((_, i) => {
                    // i represents 16th notes (0.25)
                    // We only draw lines based on grid, but always draw beats
                    const beatPos = i * 0.25;
                    const pixelPos = beatPos * PIXELS_PER_BEAT;
                    
                    const isBar = beatPos % 4 === 0;
                    const isBeat = beatPos % 1 === 0;
                    
                    // Show grid lines based on snap?
                    // Let's show beats always, sub-beats faint
                    
                    return (
                        <div 
                            key={i} 
                            className={`absolute top-0 bottom-0 w-px ${isBar ? 'bg-synth-grid/60' : isBeat ? 'bg-synth-grid/30' : 'bg-synth-grid/10'}`}
                            style={{ left: pixelPos }}
                        >
                            {isBeat && <span className="absolute top-0 left-1 text-[8px] text-slate-500 font-mono">{beatPos}</span>}
                        </div>
                    );
                })}

                {/* CONNECTIONS / LEGATO CABLES */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                    {sortedNotes.map((note, i) => {
                        if (note.connected && i < sortedNotes.length - 1) {
                            const next = sortedNotes[i+1];
                            const x1 = (note.startTime + note.duration) * PIXELS_PER_BEAT;
                            const y1 = (MIDI_MAX - note.midi) * NOTE_HEIGHT + (NOTE_HEIGHT / 2);
                            const x2 = next.startTime * PIXELS_PER_BEAT;
                            const y2 = (MIDI_MAX - next.midi) * NOTE_HEIGHT + (NOTE_HEIGHT / 2);
                            
                            // Bezier Curve
                            const controlX1 = x1 + (x2 - x1) * 0.5;
                            const controlY1 = y1;
                            const controlX2 = x1 + (x2 - x1) * 0.5;
                            const controlY2 = y2;

                            return (
                                <path 
                                    key={`conn-${note.id}`}
                                    d={`M ${x1} ${y1} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${x2} ${y2}`}
                                    stroke="#10b981"
                                    strokeWidth="3"
                                    fill="none"
                                    strokeDasharray="4 2"
                                    opacity="0.6"
                                />
                            );
                        }
                        return null;
                    })}
                </svg>


                {/* GHOST NOTES (From other tracks) */}
                {ghostTracks.map(track => 
                    track.muted ? null : track.notes.map(note => {
                        const top = (MIDI_MAX - note.midi) * NOTE_HEIGHT;
                        const left = note.startTime * PIXELS_PER_BEAT;
                        const width = note.duration * PIXELS_PER_BEAT;
                        return (
                            <div
                                key={`ghost-${track.id}-${note.id}`}
                                className="absolute rounded-sm bg-gray-500/20 border border-gray-500/30 pointer-events-none z-0"
                                style={{
                                    top: top + 1,
                                    left: left,
                                    width: Math.max(width - 1, 4),
                                    height: NOTE_HEIGHT - 2,
                                }}
                            />
                        )
                    })
                )}

                {/* ACTIVE NOTES */}
                {notes.map(note => {
                    const top = (MIDI_MAX - note.midi) * NOTE_HEIGHT;
                    const left = note.startTime * PIXELS_PER_BEAT;
                    const width = note.duration * PIXELS_PER_BEAT;
                    const isSelected = selectedNoteId === note.id;

                    // Generate Pitch Curve SVG Path
                    let pitchPath = '';
                    if (note.pitchPoints && note.pitchPoints.length > 0) {
                        const h = NOTE_HEIGHT - 2;
                        const w = Math.max(width - 1, 4);
                        const points = note.pitchPoints.map(p => {
                            const px = p.t * w;
                            const py = (h/2) - (p.v/24)*h; 
                            return `${px},${py}`;
                        });
                        pitchPath = `M ${points.join(' L ')}`;
                    }

                    return (
                        <div
                            key={note.id}
                            onMouseDown={(e) => handleNoteMouseDown(e, note, 'MOVE')}
                            className={`absolute rounded-sm border text-[10px] flex items-center pl-1 overflow-hidden shadow-sm group z-10 transition-colors
                                ${isSelected 
                                    ? 'bg-synth-pop border-white text-white shadow-lg ring-1 ring-white' 
                                    : note.glide 
                                        ? 'bg-orange-500/90 border-orange-500 text-black' 
                                        : 'bg-synth-accent/90 border-synth-accent text-synth-dark hover:bg-synth-accent'
                                }`}
                            style={{
                                top: top + 1,
                                left: left,
                                width: Math.max(width - 1, 4),
                                height: NOTE_HEIGHT - 2,
                                cursor: tool === 'POINTER' ? 'move' : 'default',
                                clipPath: note.glide ? 'polygon(0% 0%, 100% 0%, 100% 100%, 10% 100%)' : undefined
                            }}
                        >
                            {/* Slide Indicator Graphic */}
                            {note.glide && (
                                <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent pointer-events-none" />
                            )}
                            
                            {/* Connection Indicator */}
                            {note.connected && (
                                <div className="absolute right-0 top-0 bottom-0 w-2 bg-emerald-500 pointer-events-none" />
                            )}

                            {/* Pitch Curve Overlay */}
                            {pitchPath && (
                                <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-50" viewBox={`0 0 ${Math.max(width-1,4)} ${NOTE_HEIGHT-2}`} preserveAspectRatio="none">
                                    <path d={pitchPath} stroke="white" strokeWidth="2" fill="none" />
                                </svg>
                            )}

                            <span className="truncate w-full pointer-events-none select-none relative z-10 drop-shadow-md flex items-center gap-1">
                                {note.glide && <Activity size={8} />}
                                {note.lyric}
                            </span>
                            
                            {/* Resize Handle */}
                            {tool === 'POINTER' && (
                                <div 
                                    className={`absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize z-20 flex items-center justify-center opacity-0 hover:opacity-100 ${isSelected ? 'opacity-100' : ''}`}
                                    onMouseDown={(e) => handleNoteMouseDown(e, note, 'RESIZE')}
                                >
                                    <div className="w-1 h-3 bg-white/60 rounded-full" />
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* PLAYBACK HEAD */}
                {playbackBeat > 0 && (
                    <div 
                        className="absolute top-0 bottom-0 w-0.5 bg-green-400 z-50 pointer-events-none shadow-[0_0_10px_rgba(74,222,128,0.8)]"
                        style={{ left: playbackBeat * PIXELS_PER_BEAT }}
                    >
                         <div className="absolute top-0 -left-1.5 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-green-400"></div>
                    </div>
                )}

            </div>
        </div>
      </div>

       {/* Floating Action Controls */}
       {selectedNoteId && (
        <div className="absolute bottom-4 right-4 z-50 flex items-end gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200 pointer-events-auto">
            {/* D-Pad */}
            <div className="bg-synth-panel/95 backdrop-blur border border-synth-grid rounded-2xl p-2 shadow-2xl flex flex-col items-center gap-1">
                <button onClick={() => moveSelectedNote(0, 1)} className="p-2 hover:bg-synth-accent/20 rounded-lg text-synth-accent transition-colors active:scale-95 bg-white/5"><ArrowUp size={20} /></button>
                <div className="flex gap-1">
                     <button onClick={() => moveSelectedNote(-0.25, 0)} className="p-2 hover:bg-synth-accent/20 rounded-lg text-synth-accent transition-colors active:scale-95 bg-white/5"><ArrowLeft size={20} /></button>
                     <button onClick={() => moveSelectedNote(0, -1)} className="p-2 hover:bg-synth-accent/20 rounded-lg text-synth-accent transition-colors active:scale-95 bg-white/5"><ArrowDown size={20} /></button>
                     <button onClick={() => moveSelectedNote(0.25, 0)} className="p-2 hover:bg-synth-accent/20 rounded-lg text-synth-accent transition-colors active:scale-95 bg-white/5"><ArrowRight size={20} /></button>
                </div>
            </div>
            <button onClick={() => deleteNote(selectedNoteId)} className="bg-red-500 hover:bg-red-600 text-white p-4 rounded-2xl shadow-xl active:scale-90 transition-all border border-red-400/50"><Trash2 size={24} /></button>
        </div>
      )}
    </div>
  );
};
