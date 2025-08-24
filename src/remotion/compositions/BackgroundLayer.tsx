import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { BackgroundLayerProps } from './types';

export const BackgroundLayer: React.FC<BackgroundLayerProps> = ({
  effects,
  videoWidth,
  videoHeight
}) => {
  // Default background if no effects specified
  if (!effects) {
    return (
      <AbsoluteFill
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)'
        }}
      />
    );
  }

  // Show skeleton loader when wallpaper is selected but not loaded yet
  if (effects.type === 'wallpaper' && !effects.wallpaper) {
    return (
      <AbsoluteFill>
        {/* Skeleton background with shimmer effect */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, #1a1a2e 25%, #16213e 50%, #1a1a2e 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 2s infinite'
          }}
        />
        {/* Loading indicator */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'rgba(255, 255, 255, 0.3)',
            fontSize: '14px',
            fontFamily: 'system-ui',
            letterSpacing: '0.1em'
          }}
        >
          Loading wallpaper...
        </div>
        <style>{`
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
        `}</style>
      </AbsoluteFill>
    );
  }

  // Handle different background types
  let backgroundStyle: React.CSSProperties = {};

  switch (effects.type) {
    case 'wallpaper':
      if (effects.wallpaper) {
        backgroundStyle = {
          backgroundImage: `url(${effects.wallpaper})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        };
      }
      break;

    case 'color':
      backgroundStyle = {
        backgroundColor: effects.color || '#000000'
      };
      break;

    case 'gradient':
      if (effects.gradient) {
        const { colors = ['#0F172A', '#1E293B'], angle = 135 } = effects.gradient;
        const gradientColors = colors.map((color, index) => {
          const percentage = (index / (colors.length - 1)) * 100;
          return `${color} ${percentage}%`;
        }).join(', ');

        backgroundStyle = {
          background: `linear-gradient(${angle}deg, ${gradientColors})`
        };
      }
      break;

    case 'image':
      if (effects.image) {
        backgroundStyle = {
          backgroundImage: `url(${effects.image})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        };
      }
      break;

    case 'blur':
      // Video blur background - fallback to gradient for now
      backgroundStyle = {
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        filter: `blur(${effects.blur || 20}px)`
      };
      break;

    case 'none':
      backgroundStyle = {
        backgroundColor: '#000000'
      };
      break;

    default:
      backgroundStyle = {
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)'
      };
  }

  // Apply blur filter if specified (works for wallpaper and image types)
  if (effects.blur && effects.type !== 'blur') {
    backgroundStyle.filter = `blur(${effects.blur}px)`;
  }

  return (
    <AbsoluteFill style={backgroundStyle}>
      {/* If blur background is selected and we have video, we could add a blurred video layer here */}
      {effects.type === 'blur' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.3)' // Semi-transparent overlay for better contrast
          }}
        />
      )}
    </AbsoluteFill>
  );
};