import React from 'react';

interface Props {
  score: number;
  level: string;
}

export const RiskIndicator: React.FC<Props> = ({ score, level }) => {
  const isHigh = score > 50 || level.includes('HIGH') || level.includes('CRITICAL');
  const isWarning = score > 20 && !isHigh;

  const bgClass = isHigh
    ? 'bg-red-500/20 text-red-300 border-red-500/40 font-bold animate-pulse'
    : isWarning
    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold';

  return (
    <div className={`px-2.5 py-1 rounded-lg text-xs border flex items-center gap-1.5 ${bgClass}`}>
      <span className="w-2 h-2 rounded-full bg-current animate-ping" />
      <span>RISK: {Math.round(score)}% ({level})</span>
    </div>
  );
};
