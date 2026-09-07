import React from 'react';
import { Sparkles, CheckCircle2, AlertTriangle, HelpCircle, Tag, FileText } from 'lucide-react';
import { MeetingSummary as SummaryType } from '../../types/meetingAI';

interface MeetingSummaryProps {
  summary: SummaryType | null;
  isLoading?: boolean;
}

export const MeetingSummaryView: React.FC<MeetingSummaryProps> = ({ summary, isLoading }) => {
  if (isLoading) {
    return (
      <div className="p-6 text-center text-teams-muted flex flex-col items-center justify-center gap-3">
        <Sparkles className="w-6 h-6 text-teams-purple animate-pulse" />
        <span className="text-xs font-semibold">Generating AI Meeting Intelligence…</span>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-6 text-center text-teams-muted text-xs">
        No AI summary available for this meeting yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-xs select-none">
      {/* Executive Summary Box */}
      <div className="p-4 bg-[#252424] border border-teams-purple/30 rounded-xl shadow-lg">
        <div className="flex items-center gap-2 mb-2 font-bold text-teams-purple text-sm">
          <Sparkles className="w-4 h-4" />
          <span>Executive Summary</span>
        </div>
        <p className="text-white leading-relaxed font-normal">{summary.summary}</p>
      </div>

      {/* Key Points */}
      {summary.key_points && summary.key_points.length > 0 && (
        <div className="p-4 bg-[#222121] border border-teams-border rounded-xl">
          <div className="flex items-center gap-2 mb-2.5 font-semibold text-emerald-400">
            <FileText className="w-4 h-4" />
            <span>Key Points</span>
          </div>
          <ul className="space-y-1.5 text-teams-text list-disc list-inside">
            {summary.key_points.map((pt, idx) => (
              <li key={idx} className="leading-relaxed">{pt}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Decisions */}
      {summary.decisions && summary.decisions.length > 0 && (
        <div className="p-4 bg-[#222121] border border-teams-border rounded-xl">
          <div className="flex items-center gap-2 mb-2.5 font-semibold text-indigo-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Explicit Decisions</span>
          </div>
          <ul className="space-y-1.5 text-teams-text">
            {summary.decisions.map((dec, idx) => (
              <li key={idx} className="flex items-start gap-2 bg-[#1A1919] p-2 rounded-lg border border-teams-border/60">
                <span className="text-indigo-400 font-bold">•</span>
                <span className="leading-relaxed">{dec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Topics & Risks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {summary.topics && summary.topics.length > 0 && (
          <div className="p-3 bg-[#222121] border border-teams-border rounded-xl">
            <div className="flex items-center gap-2 mb-2 font-semibold text-cyan-400">
              <Tag className="w-3.5 h-3.5" />
              <span>Topics</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {summary.topics.map((tp, idx) => (
                <span key={idx} className="px-2 py-0.5 bg-cyan-950/60 border border-cyan-800/50 text-cyan-300 rounded text-[10px] font-semibold">
                  {tp}
                </span>
              ))}
            </div>
          </div>
        )}

        {summary.risks && summary.risks.length > 0 && (
          <div className="p-3 bg-[#222121] border border-teams-border rounded-xl">
            <div className="flex items-center gap-2 mb-2 font-semibold text-rose-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Identified Risks</span>
            </div>
            <ul className="space-y-1 text-teams-text">
              {summary.risks.map((rk, idx) => (
                <li key={idx} className="text-[11px] text-rose-300">• {rk}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
