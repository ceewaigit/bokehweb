import React from 'react';
import { Composition } from 'remotion';
import { MainComposition } from './compositions/MainComposition';
import type { MainCompositionProps } from './compositions/types';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MainComposition"
        component={MainComposition as any}
        durationInFrames={900} // 30 seconds at 30fps, will be dynamic
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          videoUrl: '',
          clip: null,
          effects: null,
          cursorEvents: [],
          clickEvents: [],
          keystrokeEvents: []
        }}
      />
    </>
  );
};