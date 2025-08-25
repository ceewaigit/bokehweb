import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { BackgroundLayerProps } from './types';

export const BackgroundLayer: React.FC<BackgroundLayerProps> = ({
  effects,
  videoWidth,
  videoHeight
}) => {
  if (!effects) {
    return <AbsoluteFill />;
  }

  let backgroundStyle: React.CSSProperties = {};

  // Create unique key based on background content to force re-render
  const backgroundKey = React.useMemo(() => {
    if (!effects) return 'none';
    if (effects.type === 'wallpaper' && effects.wallpaper) {
      return `wallpaper-${effects.wallpaper.substring(0, 50)}`;
    }
    if (effects.type === 'gradient' && effects.gradient) {
      return `gradient-${effects.gradient.colors.join('-')}`;
    }
    return effects.type;
  }, [effects]);

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

    case 'none':
      backgroundStyle = {
        backgroundColor: '#000000'
      };
      break;
  }

  // Apply blur filter only for image-based backgrounds (wallpaper/image)
  // Blur doesn't make sense for solid colors or gradients
  if (effects.blur && (effects.type === 'wallpaper' || effects.type === 'image')) {
    backgroundStyle.filter = `blur(${effects.blur}px)`;
  }

  return <AbsoluteFill key={backgroundKey} style={backgroundStyle} />;
};