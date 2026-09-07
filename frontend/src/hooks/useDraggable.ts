import { useState, useRef } from 'react';

interface Position {
  x: number;
  y: number;
}

export function useDraggable(initialPos?: Position | null) {
  const [position, setPosition] = useState<Position | null>(initialPos || null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number }>({
    mouseX: 0,
    mouseY: 0,
    posX: 0,
    posY: 0,
  });
  const hasMovedRef = useRef(false);

  const handleDragStart = (e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
    // Ignore interactive elements like buttons, inputs, selects, links
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a, [data-no-drag]')) {
      return;
    }

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const elem = e.currentTarget.getBoundingClientRect();
    const currentX = position ? position.x : elem.left;
    const currentY = position ? position.y : elem.top;

    isDraggingRef.current = true;
    hasMovedRef.current = false;
    dragStartRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      posX: currentX,
      posY: currentY,
    };

    const handleMouseMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isDraggingRef.current) return;
      const moveX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : (moveEvent as MouseEvent).clientX;
      const moveY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : (moveEvent as MouseEvent).clientY;

      const deltaX = moveX - dragStartRef.current.mouseX;
      const deltaY = moveY - dragStartRef.current.mouseY;

      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        hasMovedRef.current = true;
      }

      const nextX = Math.max(10, Math.min(window.innerWidth - elem.width - 10, dragStartRef.current.posX + deltaX));
      const nextY = Math.max(10, Math.min(window.innerHeight - elem.height - 10, dragStartRef.current.posY + deltaY));

      setPosition({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleMouseMove);
    window.addEventListener('touchend', handleMouseUp);
  };

  const style: React.CSSProperties = position
    ? {
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        right: 'auto',
        bottom: 'auto',
        margin: 0,
        transform: 'none',
      }
    : {};

  return {
    position,
    setPosition,
    handleDragStart,
    hasMoved: hasMovedRef.current,
    style,
  };
}
