import React from 'react';
import { FileText, FileSpreadsheet, Archive, Presentation, Download, FileCode, File, Edit3, Eye, Check, X, ShieldAlert } from 'lucide-react';
import { getMediaUrl } from '../../api/client';
import { MediaAnnotationModal, MediaAnnotationResult } from './MediaAnnotationModal';
import { useNotificationStore } from '../../stores/notificationStore';

interface AttachmentCardProps {
  name: string;
  url: string;
  size?: number;
  type?: string;
  className?: string;
  onAnnotateSend?: (result: MediaAnnotationResult) => void;
  messageId?: string;
  isViewOnce?: boolean;
  caption?: string;
}

export const formatFileSize = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const getFileTypeInfo = (fileName: string, mimeType?: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  
  if (ext === 'pdf' || mimeType?.includes('pdf')) {
    return {
      label: 'PDF',
      color: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      iconColor: 'text-rose-400',
      icon: FileText,
    };
  }
  if (['xlsx', 'xls', 'csv'].includes(ext) || mimeType?.includes('spreadsheet') || mimeType?.includes('excel') || mimeType?.includes('csv')) {
    return {
      label: ext.toUpperCase() || 'EXCEL',
      color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      iconColor: 'text-emerald-400',
      icon: FileSpreadsheet,
    };
  }
  if (['doc', 'docx'].includes(ext) || mimeType?.includes('word') || mimeType?.includes('wordprocessing')) {
    return {
      label: 'DOCX',
      color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      iconColor: 'text-blue-400',
      icon: FileText,
    };
  }
  if (['ppt', 'pptx'].includes(ext) || mimeType?.includes('presentation') || mimeType?.includes('powerpoint')) {
    return {
      label: 'PPTX',
      color: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      iconColor: 'text-amber-400',
      icon: Presentation,
    };
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mimeType?.includes('zip') || mimeType?.includes('compressed') || mimeType?.includes('archive')) {
    return {
      label: ext.toUpperCase() || 'ZIP',
      color: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      iconColor: 'text-purple-400',
      icon: Archive,
    };
  }
  if (['js', 'ts', 'jsx', 'tsx', 'json', 'py', 'html', 'css'].includes(ext)) {
    return {
      label: ext.toUpperCase(),
      color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      iconColor: 'text-cyan-400',
      icon: FileCode,
    };
  }
  
  return {
    label: ext ? ext.toUpperCase() : 'FILE',
    color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    iconColor: 'text-indigo-400',
    icon: File,
  };
};

export const AttachmentCard: React.FC<AttachmentCardProps> = ({
  name,
  url,
  size,
  type,
  className = '',
  onAnnotateSend,
  messageId,
  isViewOnce = false,
  caption = ''
}) => {
  const [imgFailed, setImgFailed] = React.useState(false);
  const [isAnnotating, setIsAnnotating] = React.useState(false);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [isOpened, setIsOpened] = React.useState(() => {
    if (!messageId) return false;
    return localStorage.getItem(`vo_opened_${messageId}`) === 'true';
  });
  const [isViewingOnce, setIsViewingOnce] = React.useState(false);

  const mediaUrl = getMediaUrl(url);
  const typeInfo = getFileTypeInfo(name, type);
  const IconComponent = typeInfo.icon;
  const isImage = !imgFailed && (type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(name || mediaUrl) || mediaUrl.startsWith('data:image/'));

  const handleAnnotationComplete = (result: MediaAnnotationResult) => {
    if (onAnnotateSend) {
      onAnnotateSend(result);
    } else {
      useNotificationStore.getState().addToast({
        title: 'Image Ready',
        body: 'Annotated image prepared.',
        type: 'info'
      });
    }
    setIsAnnotating(false);
  };

  const handleDownloadFile = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!mediaUrl) return;

    const fileName = name || 'document';

    // 1. Direct Base64 Data URL Download
    if (mediaUrl.startsWith('data:')) {
      const link = document.createElement('a');
      link.href = mediaUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // 2. Blob URL Download
    if (mediaUrl.startsWith('blob:')) {
      try {
        const link = document.createElement('a');
        link.href = mediaUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      } catch (err) {
        console.warn('Direct blob link download failed:', err);
      }
    }

    // 3. HTTP / Server Upload URL Download
    let downloadUrl = mediaUrl.includes('?') ? `${mediaUrl}&download=1` : `${mediaUrl}?download=1`;

    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (err) {
      console.warn('Fetch download failed, falling back to direct browser download:', err);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  if (isViewOnce) {
    return (
      <>
        {isOpened ? (
          <div className={`flex items-center gap-3 px-4 py-3 bg-[#13151F] border border-white/5 rounded-2xl max-w-xs select-none opacity-60 ${className}`}>
            <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-mc-muted text-xs font-bold">
              <span>1</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-mc-muted" />
                <span className="text-xs font-semibold text-mc-muted">Opened</span>
              </div>
              <span className="text-[10px] text-mc-muted/60">View once photo expired</span>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsViewingOnce(true)}
            className={`flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-indigo-950/40 via-[#181a29] to-[#141622] hover:from-indigo-900/40 hover:to-[#1a1d2e] border border-indigo-500/30 hover:border-indigo-500/60 rounded-2xl max-w-xs transition-all shadow-md group cursor-pointer text-left ${className}`}
            title="Click to view once photo"
          >
            <div className="w-9 h-9 rounded-full bg-indigo-500/20 border-2 border-dashed border-indigo-400 flex items-center justify-center text-indigo-300 font-extrabold text-sm group-hover:scale-105 transition-transform shadow-inner">
              1
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs font-bold text-white font-display">Photo</span>
                <span className="text-[9px] px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded font-semibold border border-indigo-500/30">View Once</span>
              </div>
              <p className="text-[10px] text-mc-muted truncate mt-0.5">Tap to view • Disappears after closing</p>
            </div>
          </button>
        )}

        {/* Dedicated Secure View Once Fullscreen Viewer */}
        {isViewingOnce && (
          <div
            className="fixed inset-0 z-[99999] bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-4 sm:p-6 animate-in fade-in duration-200"
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* Top Bar */}
            <div className="w-full max-w-4xl flex items-center justify-between py-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-400 flex items-center justify-center text-indigo-400 font-bold text-xs">
                  1
                </div>
                <span className="text-sm font-bold text-white">View Once Photo</span>
                <span className="text-xs text-amber-400/90 ml-2 hidden sm:inline">(Will disappear when closed)</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (messageId) {
                    localStorage.setItem(`vo_opened_${messageId}`, 'true');
                  }
                  setIsOpened(true);
                  setIsViewingOnce(false);
                }}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Close</span>
              </button>
            </div>

            {/* Main Image Display */}
            <div className="flex-1 w-full max-w-4xl flex items-center justify-center my-4 overflow-hidden select-none">
              <img
                src={mediaUrl}
                alt="View once media"
                draggable={false}
                className="max-h-[75vh] max-w-full object-contain rounded-xl shadow-2xl pointer-events-auto"
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>

            {/* Bottom Caption & Dismiss */}
            <div className="w-full max-w-4xl flex flex-col items-center gap-2 pb-2">
              {caption && (
                <p className="text-sm text-white bg-black/60 px-4 py-2 rounded-xl backdrop-blur-md max-w-md text-center">
                  {caption}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  if (messageId) {
                    localStorage.setItem(`vo_opened_${messageId}`, 'true');
                  }
                  setIsOpened(true);
                  setIsViewingOnce(false);
                }}
                className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (isImage) {
    return (
      <>
        <div className={`relative group max-w-sm rounded-2xl overflow-hidden border border-white/10 bg-[#11131A] shadow-lg ${className}`}>
          {/* Floating markup pill on hover */}
          <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsAnnotating(true);
              }}
              className="px-2.5 py-1 bg-black/80 hover:bg-black text-white text-[11px] font-semibold rounded-lg flex items-center gap-1.5 shadow-xl backdrop-blur-md border border-white/20 transition-transform active:scale-95 cursor-pointer"
              title="Markup / Annotate Image"
            >
              <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Markup</span>
            </button>
          </div>

          {/* Click image to open lightbox dialog (not new tab) */}
          <button
            type="button"
            className="block w-full cursor-zoom-in"
            onClick={() => setLightboxOpen(true)}
            title="Click to view image"
          >
            <img
              src={mediaUrl}
              alt={name}
              className="max-h-60 max-w-full object-cover rounded-t-2xl hover:scale-[1.02] transition-transform duration-200 w-full"
              onError={() => setImgFailed(true)}
            />
          </button>
          <div className="p-2 bg-[#171923] border-t border-white/5 flex items-center justify-between text-xs">
            <span className="text-white font-medium truncate max-w-[170px]">{name}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsAnnotating(true);
                }}
                className="p-1 text-mc-muted hover:text-emerald-400 transition-colors cursor-pointer flex items-center gap-1"
                title="Annotate Image (Crop, Draw, Text, Blur, Stickers)"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleDownloadFile}
                className="p-1 text-mc-muted hover:text-indigo-400 transition-colors cursor-pointer"
                title="Download Image"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Lightbox Dialog */}
        {lightboxOpen && (
          <div
            className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setLightboxOpen(false)}
          >
            <div
              className="relative max-w-5xl max-h-[90vh] w-full flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header bar */}
              <div className="w-full flex items-center justify-between mb-3 px-1">
                <span className="text-white/80 text-sm font-medium truncate max-w-[70%]">{name}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadFile}
                    className="p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors cursor-pointer"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(false)}
                    className="p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors cursor-pointer"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {/* Full-size image */}
              <img
                src={mediaUrl}
                alt={name}
                className="max-h-[80vh] max-w-full object-contain rounded-2xl shadow-2xl select-none"
                draggable={false}
                onError={() => setImgFailed(true)}
              />
            </div>
          </div>
        )}

        <MediaAnnotationModal
          isOpen={isAnnotating}
          imageSource={mediaUrl}
          initialCaption=""
          onClose={() => setIsAnnotating(false)}
          onSend={handleAnnotationComplete}
        />
      </>
    );
  }


  return (
    <div
      onClick={handleDownloadFile}
      className={`flex items-center gap-3 p-3 bg-[#171923] hover:bg-[#1C1F2E] border border-white/10 hover:border-indigo-500/50 rounded-2xl transition-all shadow-md group cursor-pointer ${className}`}
      title={`Click to download ${name}`}
    >
      <div className={`p-2.5 rounded-xl ${typeInfo.color} border flex items-center justify-center shrink-0`}>
        <IconComponent className={`w-5 h-5 ${typeInfo.iconColor}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-white truncate group-hover:text-indigo-300 transition-colors font-display">
            {name}
          </p>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${typeInfo.color} border border-white/10 shrink-0`}>
            {typeInfo.label}
          </span>
        </div>
        {size ? (
          <p className="text-[10px] text-mc-muted mt-0.5">{formatFileSize(size)}</p>
        ) : (
          <p className="text-[10px] text-mc-muted mt-0.5">Click to download document</p>
        )}
      </div>

      <button
        type="button"
        onClick={handleDownloadFile}
        className="p-1.5 rounded-xl bg-white/5 group-hover:bg-indigo-600 group-hover:text-white text-mc-muted transition-colors shrink-0 cursor-pointer"
        title="Download"
      >
        <Download className="w-4 h-4" />
      </button>
    </div>
  );
};
