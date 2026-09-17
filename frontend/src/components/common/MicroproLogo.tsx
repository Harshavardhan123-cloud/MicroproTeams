import React from 'react';

interface MicroproLogoProps {
  className?: string;
  size?: number;
}

export const MicroproLogo: React.FC<MicroproLogoProps> = ({ className = "w-8 h-8", size }) => {
  const style = size ? { width: `${size}px`, height: `${size}px` } : undefined;
  const fitClass = className.includes('object-') ? '' : 'object-cover';

  return (
    <img
      src="./Logo2.png"
      alt="Micropro Logo"
      className={`select-none ${fitClass} ${className}`}
      style={style}
    />
  );
};
