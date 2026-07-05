import React, { useRef, useEffect, useState } from 'react';
import { playTickSound } from '../utils/audio';

interface WheelProps {
  items: string[];
  spinning: boolean;
  targetIndex: number | null;
  onSpinComplete: (item: string) => void;
}

export const Wheel: React.FC<WheelProps> = ({
  items,
  spinning,
  targetIndex,
  onSpinComplete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [currentAngle, setCurrentAngle] = useState(0);
  const requestRef = useRef<number | null>(null);
  const stateRef = useRef({
    angle: 0,
    velocity: 0,
    isSpinning: false,
    startTime: 0,
    duration: 5000, // 5 seconds spin
    startAngle: 0,
    targetAngle: 0,
    lastTickIndex: -1,
  });

  const colors = [
    '#6366f1', // Indigo
    '#ec4899', // Pink
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#8b5cf6', // Violet
    '#ef4444', // Red
    '#06b6d4', // Cyan
    '#f97316', // Orange
    '#14b8a6', // Teal
    '#a855f7', // Purple
  ];

  // Draw the wheel
  const drawWheel = (ctx: CanvasRenderingContext2D, angle: number) => {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const radius = Math.min(width, height) / 2 - 10;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    if (items.length === 0) {
      // Empty wheel placeholder
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fillStyle = '#1e293b';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#334155';
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Brak uczestników', centerX, centerY);
      return;
    }

    const arcSize = (2 * Math.PI) / items.length;

    // Draw slices
    for (let i = 0; i < items.length; i++) {
      const sliceStart = angle + i * arcSize;
      const sliceEnd = sliceStart + arcSize;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, sliceStart, sliceEnd);
      ctx.closePath();

      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();

      // Outer rim outline
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.stroke();

      // Draw text
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(sliceStart + arcSize / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      
      // Dynamic font size based on item count and name length
      const fontSize = Math.max(11, Math.min(18, 300 / items.length));
      ctx.font = `bold ${fontSize}px sans-serif`;
      
      // Shadow for text readability
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 4;

      // Truncate name if it's too long
      const displayName = items[i].length > 12 ? items[i].substring(0, 10) + '..' : items[i];
      ctx.fillText(displayName, radius - 20, 0);
      ctx.restore();
    }

    // Draw center peg/button
    ctx.beginPath();
    ctx.arc(centerX, centerY, 24, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 6;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 18, 0, 2 * Math.PI);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.shadowBlur = 0; // reset shadow

    // Inner gold border
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();

    // Draw external golden studs around the rim
    for (let i = 0; i < items.length; i++) {
      const studAngle = angle + i * arcSize;
      const studX = centerX + radius * Math.cos(studAngle);
      const studY = centerY + radius * Math.sin(studAngle);

      ctx.beginPath();
      ctx.arc(studX, studY, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
    }
  };

  // Easing function: Cubic Out
  const easeOutCubic = (t: number): number => {
    return 1 - Math.pow(1 - t, 3);
  };

  // Keep track of ticks
  const checkTick = (angle: number) => {
    if (items.length === 0) return;
    const arcSize = (2 * Math.PI) / items.length;
    // Pointer is at the top (-Math.PI / 2)
    const pointerAngle = -Math.PI / 2;
    // Normalized current angle under pointer
    const relativeAngle = (pointerAngle - angle) % (2 * Math.PI);
    const normalized = (relativeAngle + 2 * Math.PI) % (2 * Math.PI);
    const currentIndex = Math.floor(normalized / arcSize) % items.length;

    if (currentIndex !== stateRef.current.lastTickIndex) {
      stateRef.current.lastTickIndex = currentIndex;
      playTickSound(450 - (items.length - currentIndex) * 10);
    }
  };

  // Spin animation loop
  const animateSpin = (timestamp: number) => {
    const { startTime, duration, startAngle, targetAngle, isSpinning } = stateRef.current;
    if (!isSpinning) return;

    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    const easedProgress = easeOutCubic(progress);
    const newAngle = startAngle + (targetAngle - startAngle) * easedProgress;
    
    stateRef.current.angle = newAngle;
    setCurrentAngle(newAngle);
    checkTick(newAngle);

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawWheel(ctx, newAngle);
      }
    }

    if (progress < 1) {
      requestRef.current = requestAnimationFrame(animateSpin);
    } else {
      stateRef.current.isSpinning = false;
      if (targetIndex !== null && targetIndex >= 0 && targetIndex < items.length) {
        onSpinComplete(items[targetIndex]);
      }
    }
  };

  // Handle spin trigger
  useEffect(() => {
    if (spinning && targetIndex !== null && items.length > 0) {
      // Calculate start and end angles
      const startAngle = stateRef.current.angle % (2 * Math.PI);
      const arcSize = (2 * Math.PI) / items.length;
      
      // We want targetIndex to land at the pointer (top, -Math.PI/2)
      // Math: sliceStart + arc/2 + theta = -Math.PI/2 -> theta = -Math.PI/2 - (sliceStart + arc/2)
      // We add a tiny random offset to make it look organic
      const randomOffset = (Math.random() - 0.5) * arcSize * 0.6;
      const targetSliceCenter = targetIndex * arcSize + arcSize / 2 + randomOffset;
      
      // Calculate target rotation relative to top pointer
      const pointerAngle = -Math.PI / 2;
      const destinationAngle = pointerAngle - targetSliceCenter;
      
      // We want to rotate at least 4-6 full spins for maximum visual impact
      const fullSpins = 5 + Math.floor(Math.random() * 3);
      const targetAngle = destinationAngle - fullSpins * 2 * Math.PI;

      stateRef.current = {
        ...stateRef.current,
        startTime: performance.now(),
        startAngle,
        targetAngle,
        isSpinning: true,
      };

      requestRef.current = requestAnimationFrame(animateSpin);
    }

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [spinning, targetIndex]);

  // Handle redraw on list update
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawWheel(ctx, stateRef.current.angle);
      }
    }
  }, [items]);

  return (
    <div className="relative flex flex-col items-center justify-center">
      {/* Decorative pointer pointing down from the top */}
      <div className="absolute top-[-8px] z-20 flex flex-col items-center">
        <div 
          className="w-12 h-16 bg-amber-400 shadow-[0_4px_12px_rgba(251,191,36,0.5)] border-t-2 border-white"
          style={{ clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }}
        />
      </div>

      <div className="relative p-4 bg-indigo-900/30 backdrop-blur-md rounded-full border-[16px] border-indigo-400 shadow-[0_0_80px_rgba(129,140,248,0.2)]">
        <canvas
          ref={canvasRef}
          width={380}
          height={380}
          className="max-w-full w-[300px] h-[300px] sm:w-[380px] sm:h-[380px] rounded-full"
        />
      </div>
    </div>
  );
};
