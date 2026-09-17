import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  RotateCw,
  Crop,
  Wand2,
  Pencil,
  Type,
  Square,
  Grid,
  Smile,
  Tag,
  Copy,
  Download,
  Send,
  Undo2,
  Redo2,
  Check,
  Circle,
  ArrowRight,
  Highlighter,
  Sliders,
  CheckCircle2,
  Eye,
  Trash2,
  Plus,
  ImageIcon,
  Minimize2,
  Maximize2
} from 'lucide-react';
import { useNotificationStore } from '../../stores/notificationStore';

export interface MediaAnnotationResult {
  file: File;
  previewUrl: string;
  caption: string;
  isViewOnce: boolean;
  isHD: boolean;
  dimensions: { width: number; height: number };
}

interface MediaAnnotationModalProps {
  isOpen: boolean;
  imageSource: File | string | null;
  initialCaption?: string;
  onClose: () => void;
  onSend: (result: MediaAnnotationResult) => void | Promise<void>;
  onMinimize?: () => void;
  topOffset?: string;
  className?: string;
}

type ToolMode = 'none' | 'crop' | 'filter' | 'pen' | 'text' | 'shape' | 'blur' | 'emoji' | 'sticker';
type ShapeType = 'rect' | 'circle' | 'arrow' | 'highlight';

interface DrawPoint {
  x: number;
  y: number;
}

interface DrawStroke {
  id: string;
  points: DrawPoint[];
  color: string;
  width: number;
  isHighlight?: boolean;
}

interface ShapeItem {
  id: string;
  type: ShapeType;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
  width: number;
}

interface TextItem {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  background: 'transparent' | 'dark' | 'light' | 'yellow';
}

interface BlurRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface StickerItem {
  id: string;
  content: string;
  x: number;
  y: number;
  size: number;
  type: 'emoji' | 'badge';
  bgColor?: string;
}

const COLORS = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#EAB308', // Yellow
  '#10B981', // Green
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#FFFFFF', // White
  '#000000', // Black
];

const BRUSH_SIZES = [
  { label: 'Fine', value: 3 },
  { label: 'Medium', value: 6 },
  { label: 'Thick', value: 12 },
  { label: 'Marker', value: 24 }
];

const FILTERS = [
  { id: 'normal', label: 'Normal', filter: 'none' },
  { id: 'vivid', label: 'Vivid', filter: 'contrast(125%) saturate(140%)' },
  { id: 'bw', label: 'B&W', filter: 'grayscale(100%) contrast(120%)' },
  { id: 'sepia', label: 'Sepia', filter: 'sepia(80%)' },
  { id: 'warm', label: 'Warm', filter: 'sepia(30%) saturate(120%) hue-rotate(-15deg)' },
  { id: 'cool', label: 'Cool', filter: 'hue-rotate(30deg) saturate(110%)' },
  { id: 'invert', label: 'Invert', filter: 'invert(100%)' }
];

const STICKERS = [
  { text: 'URGENT', bg: '#DC2626' },
  { text: 'APPROVED', bg: '#16A34A' },
  { text: 'CONFIDENTIAL', bg: '#7C3AED' },
  { text: 'BUG', bg: '#EA580C' },
  { text: 'WIP', bg: '#0284C7' },
  { text: 'REVIEWED', bg: '#059669' },
  { text: 'DO NOT SHARE', bg: '#B91C1C' }
];

const EMOJIS = ['👍', '❤️', '🔥', '🎉', '🚀', '💡', '✅', '❌', '⚠️', '👀', '💯', '👏', '🎯', '🔒', '⭐', '😂'];

export const MediaAnnotationModal: React.FC<MediaAnnotationModalProps> = ({
  isOpen,
  imageSource,
  initialCaption = '',
  onClose,
  onSend,
  onMinimize,
  topOffset = 'top-12',
  className = ''
}) => {
  const [activeTool, setActiveTool] = useState<ToolMode>('none');
  const [caption, setCaption] = useState(initialCaption);
  const [isViewOnce, setIsViewOnce] = useState(false);
  const [isHD, setIsHD] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Portal to parent chat viewport if mounted inside chat hierarchy
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const addImageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const target = document.querySelector('[data-chat-viewport="true"]') as HTMLElement | null;
    setPortalTarget(target);
  }, [isOpen]);

  // Styling options
  const [currentColor, setCurrentColor] = useState('#EF4444');
  const [currentBrushWidth, setCurrentBrushWidth] = useState(6);
  const [currentShape, setCurrentShape] = useState<ShapeType>('rect');
  const [activeFilter, setActiveFilter] = useState('normal');

  // Transformations
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [flipH, setFlipH] = useState(false);

  // Annotations history
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const [shapes, setShapes] = useState<ShapeItem[]>([]);
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [blurRegions, setBlurRegions] = useState<BlurRegion[]>([]);
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [undoStack, setUndoStack] = useState<string[]>([]); // record history actions

  // Interactive drawing states
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<DrawPoint[]>([]);
  const [shapeStart, setShapeStart] = useState<DrawPoint | null>(null);
  const [shapeCurrent, setShapeCurrent] = useState<DrawPoint | null>(null);

  // Text input popover state
  const [editingText, setEditingText] = useState<{ x: number; y: number; text: string } | null>(null);
  const [draggingTextId, setDraggingTextId] = useState<string | null>(null);

  // Canvas and Image references
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [imgNaturalSize, setImgNaturalSize] = useState({ width: 800, height: 600 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const addToast = useNotificationStore((s) => s.addToast);

  const handleAdditionalImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        setLoadedImage(img);
        setImgNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
        setStrokes([]);
        setShapes([]);
        setTextItems([]);
        setBlurRegions([]);
        setStickers([]);
        setUndoStack([]);
      };
      img.src = url;
    }
    e.target.value = '';
  };

  // Load Image whenever imageSource changes with robust blob conversion to prevent CORS/cache issues
  useEffect(() => {
    if (!isOpen || !imageSource) {
      setLoadedImage(null);
      return;
    }

    let isCancelled = false;
    let localBlobUrl: string | null = null;

    const loadImage = async () => {
      try {
        let finalUrl = '';
        if (typeof imageSource === 'string') {
          if (imageSource.startsWith('blob:') || imageSource.startsWith('data:')) {
            finalUrl = imageSource;
          } else {
            // Fetch remote/backend image with cache: 'no-cache' to avoid non-CORS cached responses
            try {
              const res = await fetch(imageSource, { cache: 'no-cache' });
              if (res.ok) {
                const blob = await res.blob();
                if (isCancelled) return;
                localBlobUrl = URL.createObjectURL(blob);
                finalUrl = localBlobUrl;
              } else {
                finalUrl = imageSource;
              }
            } catch {
              finalUrl = imageSource;
            }
          }
        } else if (imageSource && typeof imageSource !== 'string') {
          localBlobUrl = URL.createObjectURL(imageSource);
          finalUrl = localBlobUrl;
        }

        if (isCancelled) {
          if (localBlobUrl) URL.revokeObjectURL(localBlobUrl);
          return;
        }

        const img = new Image();
        if (!finalUrl.startsWith('blob:') && !finalUrl.startsWith('data:')) {
          img.crossOrigin = 'anonymous';
        }
        img.onload = () => {
          if (isCancelled) return;
          setLoadedImage(img);
          setImgNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = () => {
          if (isCancelled) return;
          // Fallback without crossOrigin
          const fallback = new Image();
          fallback.onload = () => {
            if (isCancelled) return;
            setLoadedImage(fallback);
            setImgNaturalSize({ width: fallback.naturalWidth, height: fallback.naturalHeight });
          };
          fallback.src = finalUrl;
        };
        img.src = finalUrl;
      } catch (err) {
        console.error('Error loading image in annotation modal:', err);
      }
    };

    loadImage();

    return () => {
      isCancelled = true;
      if (localBlobUrl) {
        URL.revokeObjectURL(localBlobUrl);
      }
    };
  }, [isOpen, imageSource]);

  // Reset tool state when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTool('none');
      setCaption(initialCaption || '');
      setIsViewOnce(false);
      setIsHD(true);
      setRotation(0);
      setFlipH(false);
      setStrokes([]);
      setShapes([]);
      setTextItems([]);
      setBlurRegions([]);
      setStickers([]);
      setUndoStack([]);
    }
  }, [isOpen, initialCaption]);

  // Handle Escape key to close modal or clear active tool
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingText) {
          setEditingText(null);
        } else if (activeTool !== 'none') {
          setActiveTool('none');
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, editingText, activeTool, onClose]);

  // Handle Rotation (90 deg increments)
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Helper to convert screen coordinates to canvas intrinsic coordinates
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>): DrawPoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  // Main Canvas Rendering Loop
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loadedImage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Determine oriented dimensions
    const isRotated90 = rotation === 90 || rotation === 270;
    const w = isRotated90 ? imgNaturalSize.height : imgNaturalSize.width;
    const h = isRotated90 ? imgNaturalSize.width : imgNaturalSize.height;

    canvas.width = w;
    canvas.height = h;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // Apply Rotation and Flip transformations
    ctx.translate(w / 2, h / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    if (flipH) ctx.scale(-1, 1);

    // Apply Filter
    const filterObj = FILTERS.find((f) => f.id === activeFilter);
    ctx.filter = filterObj ? filterObj.filter : 'none';

    // Draw base image centered
    ctx.drawImage(
      loadedImage,
      -imgNaturalSize.width / 2,
      -imgNaturalSize.height / 2,
      imgNaturalSize.width,
      imgNaturalSize.height
    );
    ctx.restore();

    // 1. Draw Blur/Pixelation Regions
    for (const blur of blurRegions) {
      try {
        const sampleSize = 10;
        const imgData = ctx.getImageData(blur.x, blur.y, blur.width, blur.height);
        const data = imgData.data;
        for (let py = 0; py < blur.height; py += sampleSize) {
          for (let px = 0; px < blur.width; px += sampleSize) {
            const i = (py * blur.width + px) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(blur.x + px, blur.y + py, sampleSize, sampleSize);
          }
        }
      } catch (err) {
        // Fallback frosted block if cross-origin tainted
        ctx.fillStyle = 'rgba(100, 100, 100, 0.95)';
        ctx.fillRect(blur.x, blur.y, blur.width, blur.height);
      }
    }

    // 2. Draw Finished Freehand Strokes
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (stroke.isHighlight) {
        ctx.globalAlpha = 0.45;
      }
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw Active Freehand Stroke
    if (currentStroke.length > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentBrushWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 4. Draw Finished Shapes
    for (const shape of shapes) {
      ctx.save();
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const sx = shape.startX;
      const sy = shape.startY;
      const ex = shape.endX;
      const ey = shape.endY;

      if (shape.type === 'rect') {
        ctx.strokeRect(Math.min(sx, ex), Math.min(sy, ey), Math.abs(ex - sx), Math.abs(ey - sy));
      } else if (shape.type === 'highlight') {
        ctx.fillStyle = shape.color;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(Math.min(sx, ex), Math.min(sy, ey), Math.abs(ex - sx), Math.abs(ey - sy));
      } else if (shape.type === 'circle') {
        const rx = Math.abs(ex - sx) / 2;
        const ry = Math.abs(ey - sy) / 2;
        const cx = Math.min(sx, ex) + rx;
        const cy = Math.min(sy, ey) + ry;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (shape.type === 'arrow') {
        // Draw main line
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        // Draw arrow head
        const angle = Math.atan2(ey - sy, ex - sx);
        const headLen = Math.max(16, shape.width * 3.5);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headLen * Math.cos(angle - Math.PI / 6), ey - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headLen * Math.cos(angle + Math.PI / 6), ey - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
      ctx.restore();
    }

    // 5. Draw Active Shape Preview
    if (shapeStart && shapeCurrent) {
      ctx.save();
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentBrushWidth;
      ctx.setLineDash([6, 6]);

      const sx = shapeStart.x;
      const sy = shapeStart.y;
      const ex = shapeCurrent.x;
      const ey = shapeCurrent.y;

      if (activeTool === 'blur') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(Math.min(sx, ex), Math.min(sy, ey), Math.abs(ex - sx), Math.abs(ey - sy));
        ctx.strokeRect(Math.min(sx, ex), Math.min(sy, ey), Math.abs(ex - sx), Math.abs(ey - sy));
      } else if (currentShape === 'rect' || currentShape === 'highlight') {
        ctx.strokeRect(Math.min(sx, ex), Math.min(sy, ey), Math.abs(ex - sx), Math.abs(ey - sy));
      } else if (currentShape === 'circle') {
        const rx = Math.abs(ex - sx) / 2;
        const ry = Math.abs(ey - sy) / 2;
        ctx.beginPath();
        ctx.ellipse(Math.min(sx, ex) + rx, Math.min(sy, ey) + ry, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (currentShape === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 6. Draw Stickers & Emojis
    for (const st of stickers) {
      ctx.save();
      if (st.type === 'emoji') {
        ctx.font = `${st.size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(st.content, st.x, st.y);
      } else {
        // Badge
        ctx.font = `bold ${Math.max(14, st.size * 0.4)}px Inter, sans-serif`;
        const textWidth = ctx.measureText(st.content).width;
        const padX = 14;
        const padY = 8;
        const bx = st.x - textWidth / 2 - padX;
        const by = st.y - padY * 2;
        const bw = textWidth + padX * 2;
        const bh = padY * 3.5;

        // Badge pill
        ctx.fillStyle = st.bgColor || '#DC2626';
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 8);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(st.content, st.x, st.y);
      }
      ctx.restore();
    }

    // 7. Draw Text Overlays
    for (const t of textItems) {
      ctx.save();
      ctx.font = `bold ${t.fontSize}px Inter, sans-serif`;
      const textMetrics = ctx.measureText(t.text);
      const padding = 8;

      if (t.background !== 'transparent') {
        ctx.fillStyle =
          t.background === 'dark'
            ? 'rgba(0, 0, 0, 0.75)'
            : t.background === 'yellow'
            ? 'rgba(234, 179, 8, 0.9)'
            : 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.roundRect(
          t.x - padding,
          t.y - t.fontSize,
          textMetrics.width + padding * 2,
          t.fontSize + padding * 1.5,
          6
        );
        ctx.fill();
      }

      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }, [
    loadedImage,
    rotation,
    flipH,
    activeFilter,
    imgNaturalSize,
    strokes,
    currentStroke,
    currentColor,
    currentBrushWidth,
    shapes,
    shapeStart,
    shapeCurrent,
    activeTool,
    currentShape,
    stickers,
    textItems,
    blurRegions
  ]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Canvas Mouse Down Handler
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);

    if (activeTool === 'pen') {
      setIsDrawing(true);
      setCurrentStroke([coords]);
    } else if (activeTool === 'shape' || activeTool === 'blur') {
      setIsDrawing(true);
      setShapeStart(coords);
      setShapeCurrent(coords);
    } else if (activeTool === 'text') {
      setEditingText({ x: coords.x, y: coords.y, text: '' });
    }
  };

  // Canvas Mouse Move Handler
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const coords = getCanvasCoords(e);

    if (activeTool === 'pen') {
      setCurrentStroke((prev) => [...prev, coords]);
    } else if (activeTool === 'shape' || activeTool === 'blur') {
      setShapeCurrent(coords);
    }
  };

  // Canvas Mouse Up Handler
  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (activeTool === 'pen' && currentStroke.length > 0) {
      const newStroke: DrawStroke = {
        id: Math.random().toString(36).substring(2, 9),
        points: currentStroke,
        color: currentColor,
        width: currentBrushWidth
      };
      setStrokes((prev) => [...prev, newStroke]);
      setUndoStack((prev) => [...prev, 'stroke']);
      setCurrentStroke([]);
    } else if (activeTool === 'shape' && shapeStart && shapeCurrent) {
      const newShape: ShapeItem = {
        id: Math.random().toString(36).substring(2, 9),
        type: currentShape,
        startX: shapeStart.x,
        startY: shapeStart.y,
        endX: shapeCurrent.x,
        endY: shapeCurrent.y,
        color: currentColor,
        width: currentBrushWidth
      };
      setShapes((prev) => [...prev, newShape]);
      setUndoStack((prev) => [...prev, 'shape']);
      setShapeStart(null);
      setShapeCurrent(null);
    } else if (activeTool === 'blur' && shapeStart && shapeCurrent) {
      const sx = Math.min(shapeStart.x, shapeCurrent.x);
      const sy = Math.min(shapeStart.y, shapeCurrent.y);
      const w = Math.abs(shapeCurrent.x - shapeStart.x);
      const h = Math.abs(shapeCurrent.y - shapeStart.y);
      if (w > 5 && h > 5) {
        setBlurRegions((prev) => [...prev, { id: Math.random().toString(36).substring(2, 9), x: sx, y: sy, width: w, height: h }]);
        setUndoStack((prev) => [...prev, 'blur']);
      }
      setShapeStart(null);
      setShapeCurrent(null);
    }
  };

  // Text Drag Handlers - lets a placed text overlay be repositioned by dragging
  const handleTextDragStart = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingTextId(id);
  };

  useEffect(() => {
    if (!draggingTextId) return;

    const handleMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = Math.min(Math.max((e.clientX - rect.left) * scaleX, 0), canvas.width);
      const y = Math.min(Math.max((e.clientY - rect.top) * scaleY, 0), canvas.height);
      setTextItems((prev) => prev.map((t) => (t.id === draggingTextId ? { ...t, x, y } : t)));
    };
    const handleUp = () => setDraggingTextId(null);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [draggingTextId]);

  // Undo Handler
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const lastAction = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));

    if (lastAction === 'stroke') setStrokes((prev) => prev.slice(0, -1));
    else if (lastAction === 'shape') setShapes((prev) => prev.slice(0, -1));
    else if (lastAction === 'text') setTextItems((prev) => prev.slice(0, -1));
    else if (lastAction === 'blur') setBlurRegions((prev) => prev.slice(0, -1));
    else if (lastAction === 'sticker') setStickers((prev) => prev.slice(0, -1));
  };

  // Add Sticker or Emoji to Center of Canvas
  const handleAddSticker = (content: string, type: 'emoji' | 'badge', bgColor?: string) => {
    const canvas = canvasRef.current;
    const cx = canvas ? canvas.width / 2 : 400;
    const cy = canvas ? canvas.height / 2 : 300;
    const newSticker: StickerItem = {
      id: Math.random().toString(36).substring(2, 9),
      content,
      x: cx,
      y: cy,
      size: type === 'emoji' ? 56 : 32,
      type,
      bgColor
    };
    setStickers((prev) => [...prev, newSticker]);
    setUndoStack((prev) => [...prev, 'sticker']);
    setActiveTool('none');
  };

  // Submit Text Item
  const handleAddTextCommit = (text: string, background: TextItem['background']) => {
    if (!editingText || !text.trim()) {
      setEditingText(null);
      return;
    }
    const newText: TextItem = {
      id: Math.random().toString(36).substring(2, 9),
      text: text.trim(),
      x: editingText.x,
      y: editingText.y,
      color: currentColor,
      fontSize: currentBrushWidth * 4 + 14,
      background
    };
    setTextItems((prev) => [...prev, newText]);
    setUndoStack((prev) => [...prev, 'text']);
    setEditingText(null);
    setActiveTool('none');
  };

  // Copy annotated image to clipboard
  const handleCopyToClipboard = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob })
        ]);
        addToast({
          title: 'Copied',
          body: 'Annotated image copied to clipboard!',
          type: 'info'
        });
      }, 'image/png');
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  };

  // Download image directly
  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `annotation-${Date.now()}.png`;
    a.click();
  };

  // Final Send Handler: converts canvas to File and invokes onSend
  const handleSendFinal = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      setIsSubmitting(true);
      const mimeType = isHD ? 'image/png' : 'image/jpeg';
      const quality = isHD ? 1.0 : 0.85;

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `image-${Date.now()}.${isHD ? 'png' : 'jpg'}`, {
          type: mimeType
        });
        const previewUrl = URL.createObjectURL(blob);

        await onSend({
          file,
          previewUrl,
          caption: caption.trim(),
          isViewOnce,
          isHD,
          dimensions: { width: canvas.width, height: canvas.height }
        });

        setIsSubmitting(false);
        onClose();
      }, mimeType, quality);
    } catch (err) {
      console.error('Failed to export canvas image:', err);
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !imageSource) return null;

  // Compute responsive display dimensions so small images scale up for comfortable editing
  const isRotated90 = rotation === 90 || rotation === 270;
  const currentNaturalW = isRotated90 ? imgNaturalSize.height : imgNaturalSize.width;
  const currentNaturalH = isRotated90 ? imgNaturalSize.width : imgNaturalSize.height;

  const minDisplayW = 460;
  let targetDisplayW = currentNaturalW || minDisplayW;
  let targetDisplayH = currentNaturalH || 240;

  if (currentNaturalW > 0 && currentNaturalW < minDisplayW) {
    const scale = minDisplayW / currentNaturalW;
    targetDisplayW = minDisplayW;
    targetDisplayH = Math.round(currentNaturalH * scale);
  }

  const displayDims: React.CSSProperties = {
    width: `${targetDisplayW}px`,
    height: `${targetDisplayH}px`,
    maxWidth: '100%',
    maxHeight: '100%'
  };

  // Canvas pixels are the image's full resolution; the canvas element renders much
  // smaller on screen, so overlay positions (popover, draggable text) must be scaled
  // down by this factor to land where the user actually clicked/dragged.
  const canvasToDisplayScale = currentNaturalW > 0 ? targetDisplayW / currentNaturalW : 1;

  const modalContent = (
    <div
      className={`media-annotation-chat-pane absolute ${topOffset || 'top-12'} inset-x-0 bottom-0 z-30 flex flex-col select-none text-slate-800 dark:text-white bg-slate-50 dark:bg-[#0B0D12] animate-in fade-in duration-200 overflow-hidden ${className || ''}`}
    >
      {/* ==================================================================== */}
      {/* 1. TOP TOOLBAR (Micropro Teams Styled)                              */}
      {/* ==================================================================== */}
      <div className="media-annotation-header h-14 px-4 sm:px-6 flex items-center justify-between shrink-0 bg-white/95 dark:bg-[#11131A]/95 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/10 z-20 shadow-sm">
        {/* Left: Close & Minimize */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            title="Discard & Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              title="Minimize to view chat history"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Center: Tools */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Rotate */}
          <button
            type="button"
            onClick={handleRotate}
            className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all active:scale-95 border border-transparent cursor-pointer"
            title="Rotate 90°"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* Magic Wand / Filter */}
          <button
            type="button"
            onClick={() => setActiveTool(activeTool === 'filter' ? 'none' : 'filter')}
            className={`p-2.5 rounded-xl transition-all active:scale-95 border cursor-pointer ${
              activeTool === 'filter'
                ? 'bg-indigo-50 dark:bg-indigo-600/30 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40 shadow-sm'
                : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border-transparent'
            }`}
            title="Filters & Effects"
          >
            <Wand2 className="w-4 h-4" />
          </button>

          {/* Pen / Doodle */}
          <button
            type="button"
            onClick={() => setActiveTool(activeTool === 'pen' ? 'none' : 'pen')}
            className={`p-2.5 rounded-xl transition-all active:scale-95 border cursor-pointer ${
              activeTool === 'pen'
                ? 'bg-indigo-50 dark:bg-indigo-600/30 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40 shadow-sm'
                : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border-transparent'
            }`}
            title="Pen / Freehand Draw"
          >
            <Pencil className="w-4 h-4" />
          </button>

          {/* Text Annotation ("Aa") */}
          <button
            type="button"
            onClick={() => setActiveTool(activeTool === 'text' ? 'none' : 'text')}
            className={`p-2.5 rounded-xl transition-all active:scale-95 border cursor-pointer ${
              activeTool === 'text'
                ? 'bg-indigo-50 dark:bg-indigo-600/30 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40 shadow-sm'
                : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border-transparent'
            }`}
            title="Add Text ('Aa')"
          >
            <span className="font-serif font-black text-base leading-none">Aa</span>
          </button>

          {/* Shapes / Rectangle */}
          <button
            type="button"
            onClick={() => setActiveTool(activeTool === 'shape' ? 'none' : 'shape')}
            className={`p-2.5 rounded-xl transition-all active:scale-95 border cursor-pointer ${
              activeTool === 'shape'
                ? 'bg-indigo-50 dark:bg-indigo-600/30 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40 shadow-sm'
                : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border-transparent'
            }`}
            title="Shapes (Rectangle, Arrow, Circle)"
          >
            <Square className="w-4 h-4" />
          </button>

          {/* Blur / Pixelate */}
          <button
            type="button"
            onClick={() => setActiveTool(activeTool === 'blur' ? 'none' : 'blur')}
            className={`p-2.5 rounded-xl transition-all active:scale-95 border cursor-pointer ${
              activeTool === 'blur'
                ? 'bg-indigo-50 dark:bg-indigo-600/30 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40 shadow-sm'
                : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border-transparent'
            }`}
            title="Redact / Pixelate Sensitive Areas"
          >
            <Grid className="w-4 h-4" />
          </button>

          {/* Emoji Stamp */}
          <button
            type="button"
            onClick={() => setActiveTool(activeTool === 'emoji' ? 'none' : 'emoji')}
            className={`p-2.5 rounded-xl transition-all active:scale-95 border cursor-pointer ${
              activeTool === 'emoji'
                ? 'bg-indigo-50 dark:bg-indigo-600/30 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40 shadow-sm'
                : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border-transparent'
            }`}
            title="Stamp Emoji"
          >
            <Smile className="w-4 h-4" />
          </button>

          {/* Sticker Badges */}
          <button
            type="button"
            onClick={() => setActiveTool(activeTool === 'sticker' ? 'none' : 'sticker')}
            className={`p-2.5 rounded-xl transition-all active:scale-95 border cursor-pointer ${
              activeTool === 'sticker'
                ? 'bg-indigo-50 dark:bg-indigo-600/30 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40 shadow-sm'
                : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border-transparent'
            }`}
            title="Status Badges & Stickers"
          >
            <Tag className="w-4 h-4" />
          </button>

          {/* HD Toggle */}
          <button
            type="button"
            onClick={() => setIsHD(!isHD)}
            className={`px-2.5 py-1 rounded-xl border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              isHD
                ? 'border-indigo-500/60 bg-indigo-50 dark:bg-indigo-600/25 text-indigo-600 dark:text-indigo-300 shadow-sm'
                : 'border-slate-200 dark:border-white/20 text-slate-500 dark:text-white/60 hover:text-slate-800 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/40'
            }`}
            title="Toggle HD Quality"
          >
            <span>HD</span>
            <span className="text-[10px] text-indigo-600 dark:text-indigo-400">★</span>
          </button>
        </div>

        {/* Right: Actions (Undo, Copy, Download) */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {undoStack.length > 0 && (
            <button
              type="button"
              onClick={handleUndo}
              className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all border border-transparent cursor-pointer"
              title="Undo last annotation"
            >
              <Undo2 className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={handleCopyToClipboard}
            className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all border border-transparent cursor-pointer"
            title="Copy image to clipboard"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all border border-transparent cursor-pointer"
            title="Save / Download image"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. SECONDARY CONTEXT TOOLBAR (Color, Brush Size, Shapes, Filters)     */}
      {/* ==================================================================== */}
      {activeTool !== 'none' && (
        <div className="media-annotation-subtoolbar py-2 px-6 bg-white/95 dark:bg-[#151722]/95 backdrop-blur-xl border-b border-slate-200 dark:border-white/10 flex items-center justify-center gap-4 flex-wrap z-20 animate-in slide-in-from-top-2 text-slate-800 dark:text-white shadow-sm">
          {/* Color Palette (for Pen, Text, Shapes) */}
          {(activeTool === 'pen' || activeTool === 'text' || activeTool === 'shape') && (
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-black/30 p-1.5 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrentColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                    currentColor === c ? 'scale-125 ring-2 ring-indigo-500 shadow-md' : 'hover:scale-110 opacity-80'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Brush Size Slider (for Pen & Shapes) */}
          {(activeTool === 'pen' || activeTool === 'shape') && (
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-black/30 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm text-slate-700 dark:text-slate-200">
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="range"
                min="2"
                max="24"
                value={currentBrushWidth}
                onChange={(e) => setCurrentBrushWidth(Number(e.target.value))}
                className="w-20 accent-indigo-500 cursor-pointer"
              />
              <span className="text-[11px] font-mono w-6 text-slate-600 dark:text-slate-300">{currentBrushWidth}px</span>
            </div>
          )}

          {/* Shape Selector */}
          {activeTool === 'shape' && (
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-black/30 p-1 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm">
              <button
                type="button"
                onClick={() => setCurrentShape('rect')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${currentShape === 'rect' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}
                title="Rectangle"
              >
                <Square className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentShape('circle')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${currentShape === 'circle' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}
                title="Circle"
              >
                <Circle className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentShape('arrow')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${currentShape === 'arrow' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}
                title="Arrow"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentShape('highlight')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${currentShape === 'highlight' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}
                title="Highlight Box"
              >
                <Highlighter className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Filter Presets */}
          {activeTool === 'filter' && (
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setActiveFilter(f.id)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    activeFilter === f.id
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                      : 'bg-slate-100 dark:bg-black/30 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {/* Emoji Stamp Picker */}
          {activeTool === 'emoji' && (
            <div className="flex items-center gap-2 overflow-x-auto py-1">
              {EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => handleAddSticker(em, 'emoji')}
                  className="text-2xl hover:scale-125 transition-transform p-1 cursor-pointer"
                >
                  {em}
                </button>
              ))}
            </div>
          )}

          {/* Sticker Badges */}
          {activeTool === 'sticker' && (
            <div className="flex items-center gap-2 overflow-x-auto py-1">
              {STICKERS.map((st) => (
                <button
                  key={st.text}
                  type="button"
                  onClick={() => handleAddSticker(st.text, 'badge', st.bg)}
                  style={{ backgroundColor: st.bg }}
                  className="px-2.5 py-1 rounded-md text-[11px] font-black text-white hover:brightness-110 active:scale-95 shadow-sm cursor-pointer"
                >
                  {st.text}
                </button>
              ))}
            </div>
          )}

          {/* Blur hint */}
          {activeTool === 'blur' && (
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Drag over sensitive text, passwords, or tokens to pixelate.
            </span>
          )}

          {/* Text hint */}
          {activeTool === 'text' && (
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Click anywhere on the image to place text label.
            </span>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. CENTER CANVAS WORKSPACE (Studio Slate Background)                */}
      {/* ==================================================================== */}
      <div
        ref={containerRef}
        className="media-annotation-canvas-bg flex-1 min-h-0 overflow-hidden flex items-center justify-center p-3 sm:p-5 relative bg-slate-100 dark:bg-[#0B0D12]"
      >
        <div
          className="relative inline-flex items-center justify-center max-w-full max-h-full"
          style={displayDims}
        >
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{ width: '100%', height: '100%' }}
            className={`block max-w-full max-h-full object-contain drop-shadow-2xl rounded-lg border border-slate-200/80 dark:border-white/10 ${
              activeTool === 'pen'
                ? 'cursor-crosshair'
                : activeTool === 'text'
                ? 'cursor-text'
                : activeTool === 'shape' || activeTool === 'blur'
                ? 'cursor-crosshair'
                : 'cursor-default'
            }`}
          />

          {/* Draggable Text Overlays - invisible hit-areas layered over the baked-in
              canvas text so a placed label can be picked up and repositioned */}
          {textItems.map((t) => {
            const dispFont = t.fontSize * canvasToDisplayScale;
            const hitWidth = Math.max(32, t.text.length * dispFont * 0.58 + 16);
            const hitHeight = dispFont * 1.6;
            return (
              <div
                key={t.id}
                onMouseDown={(e) => handleTextDragStart(e, t.id)}
                style={{
                  left: `${t.x * canvasToDisplayScale - 8}px`,
                  top: `${t.y * canvasToDisplayScale - dispFont}px`,
                  width: `${hitWidth}px`,
                  height: `${hitHeight}px`,
                  cursor: draggingTextId === t.id ? 'grabbing' : 'grab'
                }}
                className={`absolute z-10 rounded-lg transition-colors select-none ${
                  draggingTextId === t.id
                    ? 'ring-2 ring-indigo-400 bg-indigo-500/10'
                    : 'hover:ring-2 hover:ring-indigo-400/60 hover:bg-indigo-500/10'
                }`}
                title="Drag to reposition"
              />
            );
          })}

          {/* In-Canvas Text Overlay Creator Dialog */}
          {editingText && (
            <div
              style={{
                left: `${Math.min(
                  Math.max(editingText.x * canvasToDisplayScale, 0),
                  Math.max(targetDisplayW - 240, 0)
                )}px`,
                top: `${Math.min(
                  Math.max(editingText.y * canvasToDisplayScale, 0),
                  Math.max(targetDisplayH - 100, 0)
                )}px`
              }}
              className="absolute z-30 p-3 bg-white dark:bg-[#171924] border border-indigo-500 rounded-2xl shadow-2xl flex flex-col gap-2 min-w-[240px]"
            >
              <input
                autoFocus
                type="text"
                placeholder="Enter text..."
                value={editingText.text}
                onChange={(e) => setEditingText({ ...editingText, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTextCommit(editingText.text, 'dark');
                  if (e.key === 'Escape') setEditingText(null);
                }}
                className="w-full bg-slate-50 dark:bg-[#0D0F16] border border-slate-200 dark:border-white/20 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500"
              />
              <div className="flex items-center justify-between gap-1 text-[10px]">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleAddTextCommit(editingText.text, 'dark')}
                    className="px-2 py-0.5 rounded bg-slate-900 text-white"
                  >
                    Dark
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddTextCommit(editingText.text, 'transparent')}
                    className="px-2 py-0.5 rounded bg-transparent text-slate-700 dark:text-white border border-slate-300 dark:border-white/20"
                  >
                    Clear
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddTextCommit(editingText.text, 'dark')}
                  className="px-2.5 py-1 bg-gradient-to-r from-indigo-600 to-violet-600 rounded text-white font-bold"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 4. FLOATING CAPTION INPUT CAPSULE                                   */}
      {/* ==================================================================== */}
      <div className="px-4 py-2 flex justify-center shrink-0 bg-transparent z-20">
        <div className="w-full max-w-xl media-annotation-pill flex items-center gap-3 bg-white dark:bg-[#171923] hover:border-indigo-400/60 dark:hover:bg-[#1C1E2A] border border-slate-200/90 dark:border-white/10 rounded-full px-5 py-2 shadow-lg dark:shadow-2xl transition-all relative focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500">
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendFinal();
              }
            }}
            placeholder="Type a message or caption..."
            className="media-annotation-input flex-1 bg-transparent text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none border-0 shadow-none ring-0 focus:ring-0"
          />

          {/* Emoji popover trigger */}
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-1 text-slate-400 hover:text-amber-500 dark:text-slate-400 dark:hover:text-amber-400 transition-colors cursor-pointer"
            title="Add emoji"
          >
            <Smile className="w-4 h-4" />
          </button>

          {/* View Once Ephemeral Toggle */}
          <button
            type="button"
            onClick={() => setIsViewOnce(!isViewOnce)}
            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs transition-all cursor-pointer ${
              isViewOnce
                ? 'border border-solid border-indigo-500 bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.4)]'
                : 'border border-dashed border-slate-300 dark:border-white/30 text-slate-400 dark:text-white/50 hover:text-slate-700 dark:hover:text-white hover:border-slate-400 dark:hover:border-white/60'
            }`}
            title={isViewOnce ? 'View Once: Enabled (1-time view)' : 'View Once: Disabled'}
          >
            1
          </button>

          {/* Emoji Picker Dropdown */}
          {showEmojiPicker && (
            <div className="absolute bottom-14 right-4 p-2.5 bg-white dark:bg-[#1B1D26] border border-slate-200 dark:border-white/15 rounded-2xl shadow-2xl z-50 grid grid-cols-6 gap-2 backdrop-blur-xl">
              {EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => {
                    setCaption((prev) => prev + em);
                    setShowEmojiPicker(false);
                  }}
                  className="text-xl hover:scale-125 transition-transform p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                >
                  {em}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 5. BOTTOM THUMBNAILS & SEND ACTION (Micropro Teams Styled)          */}
      {/* ==================================================================== */}
      <div className="media-annotation-footer h-16 px-6 flex items-center justify-between shrink-0 bg-white/95 dark:bg-[#11131A]/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-white/10 relative z-20 shadow-sm">
        {/* Left: View Chat Minimize button */}
        {onMinimize ? (
          <button
            type="button"
            onClick={onMinimize}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 transition-all cursor-pointer shadow-sm active:scale-95"
            title="Minimize editor to view chat history and other screens"
          >
            <Minimize2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="hidden sm:inline">View Chat</span>
          </button>
        ) : (
          <div className="w-12 shrink-0 hidden sm:block" />
        )}

        {/* Center: Image Thumbnails & Add Button */}
        <div className="flex items-center gap-2.5">
          {/* Active Thumbnail Card with Micropro Teams Indigo Highlight */}
          <div className="w-12 h-12 rounded-xl overflow-hidden border-2 border-indigo-600 dark:border-indigo-500 ring-2 ring-indigo-500/25 bg-slate-100 dark:bg-black/50 shadow-md relative flex items-center justify-center shrink-0">
            {loadedImage ? (
              <img
                src={loadedImage.src}
                alt="Current Attachment"
                className="w-full h-full object-cover"
              />
            ) : (
              <ImageIcon className="w-5 h-5 text-slate-400 dark:text-white/50" />
            )}
          </div>

          {/* Add More Images (+) Button */}
          <button
            type="button"
            onClick={() => addImageRef.current?.click()}
            className="w-12 h-12 rounded-xl border border-slate-200 dark:border-white/20 hover:border-indigo-500 dark:hover:border-white/40 bg-slate-100/80 hover:bg-slate-200/80 dark:bg-white/5 dark:hover:bg-white/10 flex items-center justify-center text-slate-600 dark:text-white/70 hover:text-indigo-600 dark:hover:text-white transition-all group shrink-0 cursor-pointer shadow-sm"
            title="Add another photo or file"
          >
            <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
          </button>
          <input
            ref={addImageRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAdditionalImageChange}
          />
        </div>

        {/* Right: Micropro Teams Indigo Gradient Send Button */}
        <button
          type="button"
          disabled={isSubmitting}
          onClick={handleSendFinal}
          className="px-4 h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 text-white flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-95 shrink-0 cursor-pointer font-semibold text-xs"
          title="Send (Enter)"
        >
          {isSubmitting ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span className="hidden sm:inline">Send</span>
              <Send className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>
    </div>
  );

  if (portalTarget) {
    return createPortal(modalContent, portalTarget);
  }

  return modalContent;
};
