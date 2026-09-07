import React, { useState } from 'react';
import { Bot, Send, Clock, Sparkles, UserCheck } from 'lucide-react';
import { meetingAIService } from '../../services/meetingAIService';

interface MeetingAssistantProps {
  meetingId: string;
  onSeek?: (seconds: number) => void;
}

interface QAHistory {
  question: string;
  answer: string;
  source_timestamp?: number;
  source_speaker?: string;
  grounded?: boolean;
}

export const MeetingAssistantPanel: React.FC<MeetingAssistantProps> = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-3 bg-[#171923] border border-white/10 rounded-2xl">
      <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shadow-lg">
        <Sparkles className="w-6 h-6 animate-pulse text-amber-400" />
      </div>
      <div>
        <h3 className="font-bold text-sm text-white">AI Assistant Coming Soon</h3>
        <p className="text-xs text-mc-muted max-w-xs mt-1 leading-relaxed">
          Real-time meeting Q&A, automatic action item extraction, and smart transcript summaries will be available in the upcoming enterprise update.
        </p>
      </div>
    </div>
  );
};
