import React from 'react';

interface EventItem {
  event_id: string;
  type: string;
  severity: string;
  evidence: string;
  confidence: number;
}

interface Props {
  event: EventItem;
}

export const AlertCard: React.FC<Props> = ({ event }) => {
  const isDanger = event.severity === 'CRITICAL' || event.severity === 'HIGH';

  return (
    <div
      className={`p-2.5 rounded-xl border text-xs space-y-1 ${
        isDanger
          ? 'bg-red-500/10 border-red-500/30 text-red-200'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
      }`}
    >
      <div className="flex items-center justify-between font-bold">
        <span>[{event.type}]</span>
        <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-black/40 border border-white/10">
          {event.severity}
        </span>
      </div>
      <p className="text-[11px] opacity-90">{event.evidence}</p>
    </div>
  );
};
