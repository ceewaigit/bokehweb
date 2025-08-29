import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { BackgroundLayerProps } from './types';

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
    case 'wallpaper':
      if (!backgroundData.wallpaper) return null;
      backgroundStyle = {
        backgroundImage: `url(${backgroundData.wallpaper})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      };
      break;

    case 'color':
      backgroundStyle = {
        backgroundColor: backgroundData.color || '#000000'
      };
      break;

    case 'gradient':
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

    case 'image':
      if (!backgroundData.image) return null;
      backgroundStyle = {
        backgroundImage: `url(${backgroundData.image})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      };
      break;

    case 'none':
      return null;

    default:
      return null;
  }

  // Apply blur for image-based backgrounds
  if (backgroundData.blur && backgroundData.blur > 0 && (backgroundData.type === 'wallpaper' || backgroundData.type === 'image')) {
    backgroundStyle.filter = `blur(${backgroundData.blur}px)`;
  }

  return <AbsoluteFill style={backgroundStyle} />;
};