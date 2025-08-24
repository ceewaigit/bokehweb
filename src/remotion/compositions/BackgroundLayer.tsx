import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { BackgroundLayerProps } from './types';

export const BackgroundLayer: React.FC<BackgroundLayerProps> = ({
  effects,
  videoWidth,
  videoHeight
}) => {
  // No effects means transparent background
  if (!effects) {
    return <AbsoluteFill />;
  }

  // Show skeleton loader when wallpaper is selected but not loaded yet
  if (effects.type === 'wallpaper' && !effects.wallpaper) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: '#1a1a2e'
        }}
      />
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
      // Blur type is not implemented yet - show nothing
      backgroundStyle = {};
      break;

    case 'none':
      backgroundStyle = {
        backgroundColor: '#000000'
      };
      break;

    default:
      // Unknown type - show nothing
      backgroundStyle = {};
  }

  // Apply blur filter if specified (works for wallpaper and image types)
  if (effects.blur && effects.type !== 'blur') {
    backgroundStyle.filter = `blur(${effects.blur}px)`;
  }

  return (
    <AbsoluteFill style={backgroundStyle}>
    </AbsoluteFill>
  );
};