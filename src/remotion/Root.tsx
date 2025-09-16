import React from 'react';
import { Composition } from 'remotion';
import { MainComposition } from './compositions/MainComposition';
import { SegmentsComposition } from './compositions/SegmentsComposition';

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
          // Calculate duration from segments if available
          if (props.segments && Array.isArray(props.segments) && props.segments.length > 0) {
            const firstSegment = props.segments[0] as any;
            const lastSegment = props.segments[props.segments.length - 1] as any;
            
            if (firstSegment?.startTime !== undefined && lastSegment?.endTime !== undefined) {
              const totalDurationMs = lastSegment.endTime - firstSegment.startTime;
              const fps = props.framerate || 30;
              const durationInFrames = Math.ceil((totalDurationMs / 1000) * fps);
              
              return {
                durationInFrames,
                fps,
                width: props.resolution?.width || 1920,
                height: props.resolution?.height || 1080,
              };
            }
          }
          
          // Fallback to defaults
          return {
            durationInFrames: 900,
            fps: props.framerate || 30,
            width: props.resolution?.width || 1920,
            height: props.resolution?.height || 1080,
          };
        }}
        defaultProps={{
          videoUrl: '',
          clip: null,
          effects: null, // Effects come from timeline.effects now
          cursorEvents: [],
          clickEvents: [],
          keystrokeEvents: [],
          videoWidth: 0, // Always overridden by actual recording
          videoHeight: 0, // Always overridden by actual recording
          segments: [],
          framerate: 30,
          resolution: { width: 1920, height: 1080 }
        }}
      />
      
      {/* New composition for handling segments with proper video URL resolution */}
      <Composition
        id="SegmentsComposition"
        component={SegmentsComposition as any}
        durationInFrames={900} // Default, will be overridden by calculateMetadata
        fps={30}
        width={1920}
        height={1080}
        calculateMetadata={({ props }: { props: any }) => {
          // Calculate duration from segments if available
          if (props.segments && Array.isArray(props.segments) && props.segments.length > 0) {
            const firstSegment = props.segments[0] as any;
            const lastSegment = props.segments[props.segments.length - 1] as any;
            
            if (firstSegment?.startTime !== undefined && lastSegment?.endTime !== undefined) {
              const totalDurationMs = lastSegment.endTime - firstSegment.startTime;
              const fps = props.framerate || 30;
              const durationInFrames = Math.ceil((totalDurationMs / 1000) * fps);
              
              return {
                durationInFrames,
                fps,
                width: props.resolution?.width || 1920,
                height: props.resolution?.height || 1080,
              };
            }
          }
          
          // Fallback to defaults
          return {
            durationInFrames: 900,
            fps: props.framerate || 30,
            width: props.resolution?.width || 1920,
            height: props.resolution?.height || 1080,
          };
        }}
        defaultProps={{
          segments: [],
          recordings: {},
          metadata: {},
          videoUrls: {},
          framerate: 30,
          resolution: { width: 1920, height: 1080 }
        }}
      />
    </>
  );
};