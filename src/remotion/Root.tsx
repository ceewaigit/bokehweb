import React from 'react';
import { Composition } from 'remotion';
import { MainComposition } from './compositions/MainComposition';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MainComposition"
        component={MainComposition as any}
        durationInFrames={900} // Default, will be overridden by calculateMetadata
        fps={30}
        width={1920}
        height={1080}
        calculateMetadata={({ props }: { props: any }) => {
          // Calculate duration from clip
          const clip = props.clip;
          const fps = props.framerate || 30;

          if (clip && typeof clip.duration === 'number' && clip.duration > 0) {
            const durationInFrames = Math.ceil((clip.duration / 1000) * fps);

            return {
              durationInFrames,
              fps,
              width: props.videoWidth || props.resolution?.width || 1920,
              height: props.videoHeight || props.resolution?.height || 1080,
            };
          }

          // Fallback for minimal props during composition selection
          const defaultWidth = props.videoWidth || props.resolution?.width || 1920;
          const defaultHeight = props.videoHeight || props.resolution?.height || 1080;

          return {
            durationInFrames: 900, // Default fallback
            fps,
            width: defaultWidth,
            height: defaultHeight,
          };
        }}
        defaultProps={{
          videoUrl: '',
          clip: null,
          effects: [],
          cursorEvents: [],
          clickEvents: [],
          keystrokeEvents: [],
          scrollEvents: [],
          videoWidth: 1920,
          videoHeight: 1080,
          framerate: 30,
          resolution: { width: 1920, height: 1080 }
        }}
      />
    </>
  );
};