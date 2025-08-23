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

  // Handle different background types
  let backgroundStyle: React.CSSProperties = {};

  switch (effects.type) {
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

        // Apply blur if specified
        if (effects.blur) {
          backgroundStyle.filter = `blur(${effects.blur}px)`;
        }
      }
      break;

    case 'wallpaper':
      if (effects.wallpaper) {
        backgroundStyle = {
          backgroundImage: `url(${effects.wallpaper})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        };

        // Apply blur if specified
        if (effects.blur) {
          backgroundStyle.filter = `blur(${effects.blur}px)`;
        }
      }
      break;

    case 'blur':
      // This would require the video to be duplicated and blurred
      // For now, fall back to gradient
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
      // Default gradient
      backgroundStyle = {
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)'
      };
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