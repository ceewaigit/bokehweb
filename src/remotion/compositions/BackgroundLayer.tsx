import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { BackgroundLayerProps } from './types';

export const BackgroundLayer: React.FC<BackgroundLayerProps> = ({
  effects,
  videoWidth,
  videoHeight
}) => {
  if (!effects?.type) {
    return null;
  }

  let backgroundStyle: React.CSSProperties = {};

  switch (effects.type) {
    case 'wallpaper':
      if (!effects.wallpaper) return null;
      backgroundStyle = {
        backgroundImage: `url(${effects.wallpaper})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      };
      break;

    case 'color':
      backgroundStyle = {
        backgroundColor: effects.color || '#000000'
      };
      break;

    case 'gradient':
      if (!effects.gradient?.colors?.length) return null;
      const { colors, angle = 135 } = effects.gradient;
      const gradientColors = colors.map((color, index) => {
        const percentage = (index / (colors.length - 1)) * 100;
        return `${color} ${percentage}%`;
      }).join(', ');
      backgroundStyle = {
        background: `linear-gradient(${angle}deg, ${gradientColors})`
      };
      break;

    case 'image':
      if (!effects.image) return null;
      backgroundStyle = {
        backgroundImage: `url(${effects.image})`,
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
  if (effects.blur && effects.blur > 0 && (effects.type === 'wallpaper' || effects.type === 'image')) {
    backgroundStyle.filter = `blur(${effects.blur}px)`;
  }

  return <AbsoluteFill style={backgroundStyle} />;
};