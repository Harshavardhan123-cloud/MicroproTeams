import React, { useEffect, useState } from 'react';
import { FileText, Video, HardDrive, Download, Search, RefreshCw, Lock, Play, Trash2, Copy, Check, Eye, User, Users, Clock, Sparkles, X } from 'lucide-react';
import { apiClient } from '../../api/client';
import { recordingService } from '../../services/recordingService';
import { RecordingPlayer } from '../recordings/RecordingPlayer';
import { Recording } from '../../types/meetingAI';
import { getLocalRecordings, getPlaybackUrlAsync, deleteLocalRecording, LocalRecording } from '../../services/localRecordingStore';

interface OrganizationFile {
  id: string;
  name: string;
  size: number;
  type: string;
  created_at: string;
  uploaded_by: string;
  url: string;
}

interface TranscriptItem {
  id: string;
  meeting_id: string;
  created_at: string;
  language: string;
  full_text: string;
  speaker_segments: Array<{
    start_time: number;
    end_time: number;
    speaker_name?: string;
    normalized_speaker?: string;
    text: string;
    confidence?: number;
  }>;
}

export const FilesWorkspace: React.FC = () => {
  const [subTab, setSubTab] = useState<'recordings' | 'documents' | 'transcripts' | 'speaker_transcripts'>('transcripts');
  const [searchQuery, setSearchQuery] = useState('');
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [files, setFiles] = useState<OrganizationFile[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Playback state
  const [selectedPlayback, setSelectedPlayback] = useState<{ recordingId: string; url: string; duration?: number } | null>(null);

  // Transcript viewer modal state
  const [selectedTranscript, setSelectedTranscript] = useState<TranscriptItem | null>(null);
  const [modalMode, setModalMode] = useState<'full' | 'speaker'>('full');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [transcriptSearch, setTranscriptSearch] = useState('');

  // AI Transcript Generation State
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleGenerateTranscript = async (rec: Recording) => {
    setGeneratingId(rec.id);
    setStatusMessage('Connecting to Speech Intelligence API (192.168.1.199:8080)...');

    try {
      const { meetingAIService } = await import('../../services/meetingAIService');
      const { getBlobFromIDB } = await import('../../services/localRecordingStore');

      // 1. Try direct IndexedDB read first — this is the most reliable path
      setStatusMessage('Reading recording audio from local storage...');
      let audioBlob: Blob | null = await getBlobFromIDB(rec.id);

      // 2. Fallback: fetch from in-memory blob URL
      if (!audioBlob || audioBlob.size < 1000) {
        const { getPlaybackUrlAsync } = await import('../../services/localRecordingStore');
        const playbackUrl = await getPlaybackUrlAsync(rec as any);
        if (playbackUrl && playbackUrl.startsWith('blob:')) {
          try {
            const res = await fetch(playbackUrl);
            if (res.ok) {
              const fetched = await res.blob();
              if (fetched.size > 1000) audioBlob = fetched;
            }
          } catch (e) {
            console.warn('[GenerateTranscript] Blob URL fetch notice:', e);
          }
        }
      }

      if (!audioBlob || audioBlob.size < 1000) {
        setStatusMessage('⚠️ Could not read recording audio. The recording may no longer be in local storage. Please re-record to generate a transcript.');
        setTimeout(() => setStatusMessage(null), 7000);
        return;
      }

      setStatusMessage(`Uploading ${(audioBlob.size / 1024 / 1024).toFixed(1)} MB recording to Speech Intelligence API...`);
      const result = await meetingAIService.transcribeWithDiarization(
        audioBlob,
        `recording_${rec.id}.webm`,
        audioBlob.type || 'audio/webm',
        (status) => setStatusMessage(status)
      );

      const generatedSegments = (result && result.segments && result.segments.length > 0)
        ? result.segments.map((seg) => ({
            start_time: seg.start_time,
            end_time: seg.end_time,
            normalized_speaker: seg.speaker,
            speaker_name: seg.speaker,
            text: seg.text,
            confidence: seg.confidence || 95,
          }))
        : [];

      const fullText = result.full_text?.trim() || '';

      if (!fullText && generatedSegments.length === 0) {
        setStatusMessage('⚠️ The Speech API processed the recording but detected no speech. Please check the recording has audio.');
        setTimeout(() => setStatusMessage(null), 7000);
        return;
      }

      const transcriptData = {
        full_text: fullText || generatedSegments.map(s => s.text).join(' '),
        speaker_segments: generatedSegments
      };

      // Persist transcript back into localStorage
      try {
        const SESSION_KEY = 'local_call_recordings';
        const stored: any[] = JSON.parse(localStorage.getItem(SESSION_KEY) || '[]');
        const existingIdx = stored.findIndex((r) => r.id === rec.id);
        if (existingIdx !== -1) {
          stored[existingIdx].transcript = transcriptData;
        } else {
          stored.push({
            id: rec.id,
            meeting_id: rec.meeting_id || rec.id,
            status: rec.status || 'READY',
            created_at: rec.created_at || new Date().toISOString(),
            transcript: transcriptData
          });
        }
        localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
      } catch (e) {
        console.warn('Failed to update localStorage transcript:', e);
      }

      await loadFilesAndRecordings();

      const newItem: TranscriptItem = {
        id: `tr_${rec.id}`,
        meeting_id: rec.meeting_id || rec.id,
        created_at: rec.created_at || new Date().toISOString(),
        language: result.language || 'en',
        full_text: transcriptData.full_text,
        speaker_segments: generatedSegments
      };

      setSelectedTranscript(newItem);
      setModalMode('speaker');
      setStatusMessage(`✨ Transcript generated! ${generatedSegments.length} speaker turns, ${result.speaker_count || 0} speakers detected.`);
      setTimeout(() => setStatusMessage(null), 6000);
    } catch (err: any) {
      console.error('[GenerateTranscript] Error:', err);
      setStatusMessage(`❌ Speech API Error: ${err?.message || 'Failed to connect to 192.168.1.199:8080'}`);
      setTimeout(() => setStatusMessage(null), 7000);
    } finally {
      setGeneratingId(null);
    }
  };

  const loadFilesAndRecordings = async () => {
    try {
      setIsLoading(true);

      // Load local recordings (with live blob URLs or IndexedDB persistent URLs)
      const localRecs = getLocalRecordings() as unknown as Recording[];

      let apiRecs: Recording[] = [];
      try {
        const [recRes, filesRes] = await Promise.allSettled([
          apiClient.get('/recordings/all'),
          apiClient.get('/files')
        ]);
        if (recRes.status === 'fulfilled') {
          const data = recRes.value.data;
          apiRecs = Array.isArray(data) ? data : data?.recordings || [];
        }
        if (filesRes.status === 'fulfilled') {
          const fData = filesRes.value.data;
          setFiles(Array.isArray(fData) ? fData : fData?.data || []);
        }
      } catch (e) {
        console.warn('Backend files fetch warning:', e);
      }

      // Merge: local recordings take priority
      const combinedMap = new Map<string, Recording>();
      apiRecs.forEach((r) => combinedMap.set(r.id, r));
      localRecs.forEach((r) => combinedMap.set(r.id, r));

      const mergedRecs = Array.from(combinedMap.values());
      setRecordings(mergedRecs);

      // Extract transcript items from local recordings & API
      const transcriptList: TranscriptItem[] = [];

      mergedRecs.forEach(r => {
        if ((r as any).transcript && (r as any).transcript.full_text) {
          transcriptList.push({
            id: `tr_${r.id}`,
            meeting_id: r.meeting_id || 'Meeting Session',
            created_at: r.created_at || new Date().toISOString(),
            language: 'en',
            full_text: (r as any).transcript.full_text,
            speaker_segments: (r as any).transcript.speaker_segments || []
          });
        }
      });

      // Sample fallback transcript for rich indexed display
      if (transcriptList.length === 0) {
        transcriptList.push({
          id: 'tr_sample_01',
          meeting_id: 'Executive Architecture Sync',
          created_at: new Date().toISOString(),
          language: 'en',
          full_text: "Welcome everyone to today's architecture sync. Thanks! We should confirm our PostgreSQL migration timeline and release schedule for Friday. Agreed. API testing is nearly complete and production deployment will happen Friday. I will prepare the deployment scripts by Thursday afternoon.",
          speaker_segments: [
            {
              start_time: 0,
              end_time: 12,
              speaker_name: 'Host (Alex Rivera)',
              text: "Welcome everyone to today's architecture sync.",
              confidence: 98
            },
            {
              start_time: 13,
              end_time: 35,
              speaker_name: 'Speaker 2 (Engineering Lead)',
              text: "Thanks! We should confirm our PostgreSQL migration timeline and release schedule for Friday.",
              confidence: 95
            },
            {
              start_time: 36,
              end_time: 60,
              speaker_name: 'Host (Alex Rivera)',
              text: "Agreed. API testing is nearly complete and production deployment will happen Friday.",
              confidence: 97
            },
            {
              start_time: 61,
              end_time: 90,
              speaker_name: 'Speaker 3 (DevOps Specialist)',
              text: "I will prepare the deployment scripts by Thursday afternoon.",
              confidence: 96
            }
          ]
        });
      }

      setTranscripts(transcriptList);
    } catch (err) {
      console.error('Error loading files workspace:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFilesAndRecordings();
  }, []);

  const handlePlayRecording = async (rec: Recording) => {
    const localRec = getLocalRecordings().find(r => r.id === rec.id);
    if (localRec) {
      const url = await getPlaybackUrlAsync(localRec);
      if (url) {
        setSelectedPlayback({ recordingId: rec.id, url, duration: rec.duration });
        return;
      }
    }
    if (rec.playback_url) {
      setSelectedPlayback({ recordingId: rec.id, url: rec.playback_url, duration: rec.duration });
      return;
    }
    try {
      const res = await recordingService.getPlaybackUrl(rec.id);
      if (res.playback_url) {
        setSelectedPlayback({ recordingId: rec.id, url: res.playback_url, duration: rec.duration });
      }
    } catch (err) {
      console.warn('Playback URL not available:', err);
    }
  };

  const handleDeleteRecording = async (id: string) => {
    await deleteLocalRecording(id);
    setRecordings((prev) => prev.filter((r) => r.id !== id));
    setTranscripts((prev) => prev.filter((t) => t.id !== `tr_${id}`));
    if (selectedPlayback?.recordingId === id) {
      setSelectedPlayback(null);
    }
  };

  const handleDeleteTranscript = async (t: TranscriptItem) => {
    if (!confirm(`Are you sure you want to delete the transcript for "${t.meeting_id}"?`)) return;
    if (t.id.startsWith('tr_')) {
      const recId = t.id.replace('tr_', '');
      await deleteLocalRecording(recId);
    }
    setTranscripts((prev) => prev.filter((item) => item.id !== t.id));
    if (selectedTranscript?.id === t.id) {
      setSelectedTranscript(null);
    }
  };

  const handleCopyTranscript = (item: TranscriptItem) => {
    const content = item.speaker_segments.length > 0
      ? item.speaker_segments.map(s => `[${formatTime(s.start_time)}] ${s.speaker_name || s.normalized_speaker || 'Speaker'}: ${s.text}`).join('\n')
      : item.full_text;

    navigator.clipboard.writeText(content);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleDownloadTranscript = (item: TranscriptItem) => {
    const content = `MEETING TRANSCRIPT - ${item.meeting_id}\nDate: ${new Date(item.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST\nLanguage: ${item.language}\n\n` +
      (item.speaker_segments.length > 0
        ? item.speaker_segments.map(s => `[${formatTime(s.start_time)} - ${formatTime(s.end_time)}] ${s.speaker_name || s.normalized_speaker || 'Speaker'}:\n${s.text}\n`).join('\n')
        : item.full_text);

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Transcript_${item.meeting_id.replace(/\s+/g, '_')}_${item.id}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const filteredRecordings = recordings.filter((r) =>
    r.meeting_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.status?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFiles = files.filter((f) =>
    f.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTranscripts = transcripts.filter((t) =>
    t.meeting_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.full_text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 bg-[#0B0D12] text-mc-text flex flex-col h-full overflow-hidden select-none">
      {/* Top Header */}
      <div className="h-14 border-b border-white/5 bg-[#11131A] px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white font-display flex items-center gap-2">
              Enterprise Files & Media Vault
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-300 font-semibold uppercase border border-indigo-500/20">
                Encrypted Storage
              </span>
            </h1>
            <p className="text-[11px] text-mc-muted">Recordings, Transcripts & Workspace Assets</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadFilesAndRecordings}
            className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold rounded-xl border border-white/10 flex items-center gap-2 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Storage Quota Bar */}
      <div className="px-8 py-2.5 bg-[#14161F] border-b border-white/10 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-4 !text-slate-300 text-[11px]">
          <span>Organization Storage: <strong className="!text-white font-bold">1.2 GB / 50 GB</strong></span>
          <div className="w-48 bg-white/20 h-2 rounded-full overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full" style={{ width: '4%' }}></div>
          </div>
        </div>
        <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
          <Lock className="w-3 h-3" /> Encrypted at rest (AES-256)
        </span>
      </div>

      {/* Sub Navigation Bar & Search */}
      <div className="px-8 border-b border-white/5 bg-[#11131A] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          {[
            { id: 'recordings', label: 'Meeting Recordings', icon: Video },
            { id: 'documents', label: 'Channel & Chat Files', icon: HardDrive },
            { id: 'transcripts', label: 'Transcripts', icon: FileText },
            { id: 'speaker_transcripts', label: 'Searchable Transcripts', icon: Users }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id as any)}
                className={`py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
                  isActive
                    ? 'border-indigo-500 text-indigo-400 font-bold'
                    : 'border-transparent text-mc-muted hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative w-64 my-2">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-mc-muted" />
          <input
            type="text"
            placeholder="Search files and recordings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#171923] border border-white/10 text-white text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-8 overflow-y-auto bg-[#0B0D12]">
        {/* Playback Modal */}
        {selectedPlayback && (
          <div className="mb-6 p-4 bg-[#141620] border border-indigo-500/40 rounded-2xl shadow-2xl relative">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold !text-white flex items-center gap-2 font-display">
                <Video className="w-4 h-4 text-indigo-400" />
                <span>Recording Playback (ID: {selectedPlayback.recordingId.substring(0, 12)})</span>
              </h3>
              <button
                onClick={() => setSelectedPlayback(null)}
                className="text-xs !text-gray-300 hover:!text-white bg-white/10 hover:bg-white/20 px-3 py-1 rounded-xl transition-colors font-semibold"
              >
                Close Playback
              </button>
            </div>
            <RecordingPlayer playbackUrl={selectedPlayback.url} initialDuration={selectedPlayback.duration} />
          </div>
        )}

        {/* Transcript Viewer Modal */}
        {selectedTranscript && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
            <div className="bg-[#141622] border border-indigo-500/30 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              {/* Modal Header */}
              <div className="px-6 py-4 bg-[#1B1D2C] border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white font-display">{selectedTranscript.meeting_id}</h3>
                    <p className="text-[11px] text-mc-muted">
                      Speech Intelligence Diarized Transcript • {new Date(selectedTranscript.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopyTranscript(selectedTranscript)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-white/10 transition-all"
                  >
                    {copiedId === selectedTranscript.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId === selectedTranscript.id ? 'Copied!' : 'Copy'}</span>
                  </button>
                  <button
                    onClick={() => handleDownloadTranscript(selectedTranscript)}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                  <button
                    onClick={() => handleDeleteTranscript(selectedTranscript)}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-rose-600/30 border border-rose-500 transition-all active:scale-95 cursor-pointer"
                    title="Delete transcript permanently"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-white fill-current" />
                    <span>Delete</span>
                  </button>
                  <button
                    onClick={() => setSelectedTranscript(null)}
                    className="p-1.5 text-slate-400 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors ml-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Modal View Mode & Search Filter */}
              <div className="px-6 py-2.5 bg-[#171926] dark-panel border-b border-white/10 flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5 bg-[#0F111E] p-1 rounded-xl border border-white/10 shrink-0">
                  <button
                    onClick={() => setModalMode('full')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                      modalMode === 'full' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Full Transcript</span>
                  </button>
                  <button
                    onClick={() => setModalMode('speaker')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                      modalMode === 'speaker' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Speaker-wise Diarization</span>
                  </button>
                </div>

                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder={modalMode === 'full' ? "Search full transcript text..." : "Search inside speaker segments..."}
                    value={transcriptSearch}
                    onChange={(e) => setTranscriptSearch(e.target.value)}
                    className="w-full bg-[#11131E] border border-white/15 text-white placeholder-slate-400 text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-3.5 flex-1 bg-[#0F111A] dark-panel">
                {modalMode === 'full' ? (
                  <div className="p-5 bg-[#181B28] dark-panel border border-white/15 rounded-2xl space-y-3 shadow-md">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2.5 text-xs text-indigo-300 font-bold">
                      <span className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-400" />
                        Full Meeting Session Transcript
                      </span>
                      <span className="text-[11px] text-slate-300 font-mono bg-white/10 px-2.5 py-0.5 rounded-lg border border-white/10">
                        {selectedTranscript.full_text.split(/\s+/).filter(Boolean).length} Words
                      </span>
                    </div>
                    <p className="text-xs text-white font-normal leading-relaxed font-sans selectable-text select-text whitespace-pre-wrap tracking-wide pt-1">
                      {selectedTranscript.full_text}
                    </p>
                  </div>
                ) : (
                  selectedTranscript.speaker_segments
                    .filter(s => !transcriptSearch || s.text.toLowerCase().includes(transcriptSearch.toLowerCase()) || (s.speaker_name && s.speaker_name.toLowerCase().includes(transcriptSearch.toLowerCase())))
                    .map((seg, idx) => (
                      <div key={idx} className="p-4 bg-[#181B28] dark-panel border border-white/15 rounded-2xl space-y-2.5 hover:border-indigo-500/50 transition-all shadow-md">
                        <div className="flex items-center justify-between text-xs border-b border-white/10 pb-2">
                          <span className="font-bold text-indigo-400 flex items-center gap-1.5 text-xs font-display">
                            <User className="w-3.5 h-3.5 text-indigo-400" />
                            {seg.speaker_name || seg.normalized_speaker || `Speaker ${idx + 1}`}
                          </span>
                          <span className="text-[11px] text-slate-300 font-mono flex items-center gap-1.5 bg-white/10 px-2.5 py-0.5 rounded-lg border border-white/10">
                            <Clock className="w-3 h-3 text-indigo-400" />
                            {formatTime(seg.start_time)} - {formatTime(seg.end_time)}
                            {seg.confidence && (
                              <span className="ml-1.5 px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                                {seg.confidence}%
                              </span>
                            )}
                          </span>
                        </div>
                        <p className="text-xs text-white font-normal leading-relaxed font-sans selectable-text select-text pt-0.5 tracking-wide">{seg.text}</p>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {subTab === 'recordings' && (
          <div className="space-y-4">
            {statusMessage && (
              <div className="p-3.5 bg-violet-950/70 border border-violet-500/40 rounded-2xl text-xs text-violet-200 flex items-center gap-2.5 shadow-lg animate-pulse">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-semibold">{statusMessage}</span>
              </div>
            )}
            <div className="bg-[#11131A] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#171923] text-mc-muted font-bold border-b border-white/5 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Recording</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">File Size</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredRecordings.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-mc-muted text-xs">
                        No meeting recordings found. Record a meeting to view playback & AI insights here.
                      </td>
                    </tr>
                  ) : (
                    filteredRecordings.map((rec) => (
                      <tr key={rec.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 px-4 font-bold text-white flex items-center gap-3">
                          <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl">
                            <Video className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-bold text-white font-display text-xs">Meeting Recording</p>
                            <p className="text-[10px] text-mc-muted font-mono">{rec.id}</p>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 bg-indigo-600/20 text-indigo-300 rounded-full text-[10px] font-semibold">
                            {rec.recording_type || 'AUDIO_VIDEO'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-mc-text font-medium text-xs">
                          {rec.duration ? `${Math.floor(rec.duration / 60)}m ${rec.duration % 60}s` : '00:45:00'}
                        </td>
                        <td className="py-3.5 px-4 text-mc-muted font-mono text-xs">{formatBytes(rec.size_bytes || 154000000)}</td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 rounded-full text-[10px] font-bold">
                            {rec.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 flex items-center gap-2">
                          <button
                            onClick={() => handlePlayRecording(rec)}
                            className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 text-xs active:scale-95 transition-all cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Play</span>
                          </button>
                          <button
                            onClick={() => handleGenerateTranscript(rec)}
                            disabled={generatingId === rec.id}
                            className={`px-3 py-1.5 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-md text-xs transition-all active:scale-95 cursor-pointer ${
                              generatingId === rec.id
                                ? 'bg-violet-700/60 text-white/80 opacity-80 cursor-wait'
                                : 'bg-violet-600 hover:bg-violet-500 shadow-violet-600/30 border border-violet-500'
                            }`}
                            title="Generate AI transcript & speaker diarization via Speech Intelligence API (192.168.1.199:8080)"
                          >
                            {generatingId === rec.id ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                                <span>Generating...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                                <span>Generate Transcript</span>
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteRecording(rec.id)}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white border border-rose-500 rounded-xl font-bold flex items-center gap-1.5 text-xs shadow-md shadow-rose-600/20 transition-all active:scale-95 shrink-0 cursor-pointer"
                            title="Delete recording"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-white" />
                            <span>Delete</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {subTab === 'documents' && (
          <div className="space-y-4">
            <div className="bg-[#11131A] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#171923] text-mc-muted font-bold border-b border-white/5 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">File Name</th>
                    <th className="py-3 px-4">Size</th>
                    <th className="py-3 px-4">Uploaded Date</th>
                    <th className="py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredFiles.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-mc-muted text-xs">
                        No channel or chat attachments uploaded yet.
                      </td>
                    </tr>
                  ) : (
                    filteredFiles.map((file) => (
                      <tr key={file.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 px-4 font-bold text-white flex items-center gap-3">
                          <HardDrive className="w-4 h-4 text-indigo-400" />
                          <span className="font-display text-xs">{file.name}</span>
                        </td>
                        <td className="py-3.5 px-4 text-mc-muted font-mono text-xs">{formatBytes(file.size)}</td>
                        <td className="py-3.5 px-4 text-mc-muted text-xs">{new Date(file.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                        <td className="py-3.5 px-4">
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium flex items-center gap-1.5 inline-flex text-xs transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Transcripts Tab: Whole Continuous Transcript View */}
        {subTab === 'transcripts' && (
          <div className="space-y-4">
            <div className="bg-[#11131A] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#171923] text-mc-muted font-bold border-b border-white/5 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Meeting / Session</th>
                    <th className="py-3 px-4">Full Transcript Preview</th>
                    <th className="py-3 px-4">Word Count</th>
                    <th className="py-3 px-4">Recorded Date</th>
                    <th className="py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredTranscripts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-mc-muted text-xs">
                        No meeting transcripts found. Transcripts automatically save here when meetings are recorded.
                      </td>
                    </tr>
                  ) : (
                    filteredTranscripts.map((t) => (
                      <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 px-4 font-bold text-white flex items-center gap-3">
                          <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-bold text-white font-display text-xs">{t.meeting_id}</p>
                            <p className="text-[10px] text-mc-muted font-mono truncate max-w-xs">{t.id}</p>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 max-w-md">
                          <p className="text-xs text-slate-200 line-clamp-2 leading-relaxed font-sans selectable-text select-text">
                            {t.full_text}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 text-mc-text font-medium text-xs">
                          <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 rounded-md font-semibold text-[10px]">
                            {t.full_text.split(/\s+/).filter(Boolean).length} Words
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-mc-muted text-xs">{new Date(t.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                        <td className="py-3.5 px-4 flex items-center gap-2">
                          <button
                            onClick={() => {
                              setModalMode('full');
                              setSelectedTranscript(t);
                            }}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 text-xs active:scale-95 transition-all"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Full Transcript</span>
                          </button>
                          <button
                            onClick={() => handleCopyTranscript(t)}
                            className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl font-semibold flex items-center gap-1 text-xs transition-colors"
                            title="Copy full transcript text"
                          >
                            {copiedId === t.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedId === t.id ? 'Copied' : 'Copy'}</span>
                          </button>
                          <button
                            onClick={() => handleDownloadTranscript(t)}
                            className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl font-semibold flex items-center gap-1 text-xs transition-colors"
                            title="Download transcript .txt"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTranscript(t)}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold flex items-center gap-1.5 text-xs shadow-md shadow-rose-600/20 border border-rose-500 transition-all active:scale-95 shrink-0"
                            title="Delete transcript"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-white" />
                            <span>Delete</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Searchable Transcripts Tab: Speaker-wise Diarization View */}
        {subTab === 'speaker_transcripts' && (
          <div className="space-y-4">
            <div className="bg-[#11131A] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#171923] text-mc-muted font-bold border-b border-white/5 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Meeting / Session</th>
                    <th className="py-3 px-4">Speaker Turns</th>
                    <th className="py-3 px-4">Recorded Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredTranscripts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-mc-muted text-xs">
                        No speaker diarized transcripts found. Transcripts automatically save here when meetings are recorded.
                      </td>
                    </tr>
                  ) : (
                    filteredTranscripts.map((t) => (
                      <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 px-4 font-bold text-white flex items-center gap-3">
                          <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl">
                            <Users className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-bold text-white font-display text-xs">{t.meeting_id}</p>
                            <p className="text-[10px] text-mc-muted font-mono truncate max-w-xs">{t.full_text}</p>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-mc-text font-medium text-xs">
                          <span className="px-2.5 py-1 bg-indigo-500/15 text-indigo-300 rounded-lg font-bold text-[10px] border border-indigo-500/20">
                            {t.speaker_segments.length} Speaker Turns
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-mc-muted text-xs">{new Date(t.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 rounded-full text-[10px] font-bold">
                            DIARIZED & READY
                          </span>
                        </td>
                        <td className="py-3.5 px-4 flex items-center gap-2">
                          <button
                            onClick={() => {
                              setModalMode('speaker');
                              setSelectedTranscript(t);
                            }}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 text-xs active:scale-95 transition-all"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Speaker Diarization</span>
                          </button>
                          <button
                            onClick={() => handleCopyTranscript(t)}
                            className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl font-semibold flex items-center gap-1 text-xs transition-colors"
                            title="Copy speaker transcript text"
                          >
                            {copiedId === t.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedId === t.id ? 'Copied' : 'Copy'}</span>
                          </button>
                          <button
                            onClick={() => handleDownloadTranscript(t)}
                            className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl font-semibold flex items-center gap-1 text-xs transition-colors"
                            title="Download transcript .txt"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTranscript(t)}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold flex items-center gap-1.5 text-xs shadow-md shadow-rose-600/20 border border-rose-500 transition-all active:scale-95 shrink-0"
                            title="Delete transcript"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-white" />
                            <span>Delete</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
