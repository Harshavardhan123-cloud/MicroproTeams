import React from 'react';
import { FileText, FileSpreadsheet, Archive, Presentation, Download, FileCode, File } from 'lucide-react';
import { getMediaUrl } from '../../api/client';

interface AttachmentCardProps {
  name: string;
  url: string;
  size?: number;
  type?: string;
  className?: string;
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

export const AttachmentCard: React.FC<AttachmentCardProps> = ({ name, url, size, type, className = '' }) => {
  const [imgFailed, setImgFailed] = React.useState(false);
  const mediaUrl = getMediaUrl(url);
  const typeInfo = getFileTypeInfo(name, type);
  const IconComponent = typeInfo.icon;
  const isImage = !imgFailed && (type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(name || mediaUrl) || mediaUrl.startsWith('data:image/'));

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

  if (isImage) {
    return (
      <div className={`relative group max-w-sm rounded-2xl overflow-hidden border border-white/10 bg-[#11131A] shadow-lg ${className}`}>
        <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={mediaUrl}
            alt={name}
            className="max-h-60 max-w-full object-cover rounded-2xl hover:scale-[1.02] transition-transform duration-200"
            onError={() => setImgFailed(true)}
          />
        </a>
        <div className="p-2 bg-[#171923] border-t border-white/5 flex items-center justify-between text-xs">
          <span className="text-white font-medium truncate max-w-[200px]">{name}</span>
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
