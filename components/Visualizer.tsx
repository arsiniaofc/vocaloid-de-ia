import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
}

export const Visualizer: React.FC<VisualizerProps> = ({ analyser, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High DPI scaling
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    
    // Data Buffers
    const bufferLength = analyser ? analyser.frequencyBinCount : 1024;
    const dataArray = new Uint8Array(bufferLength);
    const timeArray = new Uint8Array(bufferLength);

    // Simulation Data (Fake Math Logs)
    let logLines: string[] = [];
    let frameCount = 0;

    const generateMathLog = () => {
       const ops = ['FFT', 'LFO', 'ENV', 'OSC', 'FLT', 'DSP'];
       const vars = ['freq', 'amp', 'phase', 'Q', 'gain', 'detune'];
       const op = ops[Math.floor(Math.random() * ops.length)];
       const vr = vars[Math.floor(Math.random() * vars.length)];
       const val = (Math.random() * 1000).toFixed(4);
       return `[${op}] ${vr} = ${val}`;
    };

    const render = () => {
      frameCount++;
      ctx.fillStyle = '#0f172a'; // Synth Dark
      ctx.fillRect(0, 0, width, height);

      // Draw Grid
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for(let x=0; x<width; x+=40) { ctx.moveTo(x,0); ctx.lineTo(x,height); }
      for(let y=0; y<height; y+=40) { ctx.moveTo(0,y); ctx.lineTo(width,y); }
      ctx.stroke();

      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(dataArray);
        analyser.getByteTimeDomainData(timeArray);

        // 1. Draw Spectrum (Bars)
        const barWidth = (width / bufferLength) * 2.5;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * (height / 2);
          
          const r = barHeight + (25 * (i/bufferLength));
          const g = 250 * (i/bufferLength);
          const b = 50;

          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, height - barHeight, barWidth, barHeight);
          x += barWidth + 1;
        }

        // 2. Draw Oscilloscope (Line)
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#38bdf8'; // Cyan
        ctx.beginPath();
        const sliceWidth = width * 1.0 / bufferLength;
        let startX = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = timeArray[i] / 128.0;
          const y = (v * height) / 2; // Top half

          if (i === 0) ctx.moveTo(startX, y);
          else ctx.lineTo(startX, y);

          startX += sliceWidth;
        }
        ctx.stroke();

        // 3. Math Overlay (Cool Text)
        if (frameCount % 10 === 0) {
            logLines.push(generateMathLog());
            if (logLines.length > 8) logLines.shift();
        }

        ctx.font = '10px monospace';
        ctx.fillStyle = '#f472b6'; // Pink
        let ly = 20;
        logLines.forEach(line => {
            ctx.fillText(line, 10, ly);
            ly += 15;
        });

        // Circular Lissajous-ish thing in center
        const cx = width / 2;
        const cy = height / 2;
        const radius = (dataArray[10] / 255) * 100;
        
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.stroke();

      } else {
        // Idle State
        ctx.font = '12px monospace';
        ctx.fillStyle = '#475569';
        ctx.fillText("WAITING FOR SIGNAL...", width/2 - 70, height/2);
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [analyser, isPlaying]);

  return (
    <div className="w-full h-full bg-black rounded-xl overflow-hidden border border-synth-grid shadow-[0_0_20px_rgba(56,189,248,0.1)] relative">
        <canvas ref={canvasRef} className="w-full h-full" />
        <div className="absolute top-2 right-2 flex flex-col items-end pointer-events-none">
            <span className="text-[9px] text-synth-accent font-mono animate-pulse">DSP ENGINE: ONLINE</span>
            <span className="text-[9px] text-slate-500 font-mono">SAMPLE RATE: 44.1kHz</span>
            <span className="text-[9px] text-slate-500 font-mono">BIT DEPTH: 32-FLOAT</span>
        </div>
    </div>
  );
};
