import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { BackgroundLayerProps } from './types';
import { BackgroundType } from '@/types/project';

export const BackgroundLayer: React.FC<BackgroundLayerProps> = ({
  backgroundData,
  videoWidth,
  videoHeight
}) => {
  if (!backgroundData?.type) {
    return null;
  }

  let backgroundStyle: React.CSSProperties = {};

  switch (backgroundData.type) {
    case BackgroundType.Wallpaper:
      // Wallpaper type must render gradient (wallpaper is optional enhancement)
      if (backgroundData.gradient?.colors?.length) {
        const { colors, angle = 135 } = backgroundData.gradient;
        const gradientColors = colors.map((color, index) => {
          const percentage = (index / (colors.length - 1)) * 100;
          return `${color} ${percentage}%`;
        }).join(', ');
        backgroundStyle = {
          background: `linear-gradient(${angle}deg, ${gradientColors})`
        };

        // Layer wallpaper on top if available
        if (backgroundData.wallpaper) {
          // We'll need to return a more complex structure for layered backgrounds
          // For now, just use wallpaper when available
          backgroundStyle = {
            backgroundImage: `url(${backgroundData.wallpaper})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          };
        }
      }
      break;

    case BackgroundType.Color:
      backgroundStyle = {
        backgroundColor: backgroundData.color || '#000000'
      };
      break;

    case BackgroundType.Gradient:
      if (!backgroundData.gradient?.colors?.length) return null;
      const { colors, angle = 135 } = backgroundData.gradient;
      const gradientColors = colors.map((color, index) => {
        const percentage = (index / (colors.length - 1)) * 100;
        return `${color} ${percentage}%`;
      }).join(', ');
      backgroundStyle = {
        background: `linear-gradient(${angle}deg, ${gradientColors})`
      };
      break;

    case BackgroundType.Image:
      if (!backgroundData.image) return null;
      backgroundStyle = {
        backgroundImage: `url(${backgroundData.image})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      };
      break;

    case BackgroundType.None:
      return null;

    default:
      return null;
  }

  // Apply blur for image-based backgrounds
  if (backgroundData.blur && backgroundData.blur > 0 && (backgroundData.type === BackgroundType.Wallpaper || backgroundData.type === BackgroundType.Image)) {
    backgroundStyle.filter = `blur(${backgroundData.blur}px)`;
  }

  return <AbsoluteFill style={backgroundStyle} />;
};