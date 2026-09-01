import React from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  unit?: string;
  className?: string;
}

export const ControlSlider: React.FC<KnobProps> = ({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  unit = '',
  className = ''
}) => {
  // Safe cast to number to prevent .toFixed crashes if value comes in as string or undefined
  const safeValue = typeof value === 'number' && !isNaN(value) ? value : Number(value) || 0;

  return (
    <div className={`bg-synth-panel p-4 rounded-xl border border-synth-grid flex flex-col gap-2 ${className}`}>
      <div className="flex justify-between items-center mb-1">
        <label className="text-synth-accent text-sm font-bold tracking-wider uppercase">{label}</label>
        <span className="text-white font-mono text-xs bg-black/30 px-2 py-1 rounded">
          {safeValue.toFixed(2)}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={safeValue}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-synth-dark rounded-lg appearance-none cursor-pointer accent-synth-pop"
      />
      <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
};