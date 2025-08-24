import Foundation
import AVFoundation
import ScreenCaptureKit
import AppKit

@available(macOS 13.0, *)
@objc public class ScreenRecorder: NSObject {
    private var stream: SCStream?
    private var streamOutput: StreamOutput?
    private var outputURL: URL?
    
    @objc public var isRecording: Bool = false
    @objc public var outputPath: String?
    
    private class StreamOutput: NSObject, SCStreamOutput, SCStreamDelegate {
        private var assetWriter: AVAssetWriter?
        private var videoInput: AVAssetWriterInput?
        private var adaptor: AVAssetWriterInputPixelBufferAdaptor?
        private var startTime: CMTime?
        private var frameCount = 0
        
        let outputURL: URL
        let width: Int
        let height: Int
        
        init(outputURL: URL, width: Int, height: Int) {
            self.outputURL = outputURL
            self.width = width
            self.height = height
            super.init()
        }
        
        func setupWriter() throws {
            assetWriter = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
            
            let videoSettings: [String: Any] = [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: width,
                AVVideoHeightKey: height,
                AVVideoCompressionPropertiesKey: [
                    AVVideoAverageBitRateKey: 5_000_000,
                    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                    AVVideoH264EntropyModeKey: AVVideoH264EntropyModeCABAC
                ]
            ]
            
            videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
            videoInput?.expectsMediaDataInRealTime = true
            
            let sourcePixelBufferAttributes: [String: Any] = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                kCVPixelBufferWidthKey as String: width,
                kCVPixelBufferHeightKey as String: height
            ]
            
            adaptor = AVAssetWriterInputPixelBufferAdaptor(
                assetWriterInput: videoInput!,
                sourcePixelBufferAttributes: sourcePixelBufferAttributes
            )
            
            if let videoInput = videoInput {
                assetWriter?.add(videoInput)
            }
            
            guard assetWriter?.startWriting() == true else {
                throw NSError(domain: "ScreenRecorder", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to start writing"])
            }
        }
        
        func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
            guard type == .screen,
                  let videoInput = videoInput,
                  videoInput.isReadyForMoreMediaData,
                  let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
                return
            }
            
            let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
            
            if startTime == nil {
                startTime = timestamp
                assetWriter?.startSession(atSourceTime: timestamp)
            }
            
            adaptor?.append(pixelBuffer, withPresentationTime: timestamp)
            frameCount += 1
        }
        
        func finishWriting() async throws {
            videoInput?.markAsFinished()
            await assetWriter?.finishWriting()
            
            if let error = assetWriter?.error {
                throw error
            }
        }
    }
    
    @objc public func startRecording(displayID: UInt32, outputPath: String) async throws {
        // Clean up any existing recording
        await stopRecording()
        
        // Get shareable content
        let content = try await SCShareableContent.current
        
        // Find the display with matching ID
        guard let display = content.displays.first(where: { $0.displayID == displayID }) else {
            throw NSError(domain: "ScreenRecorder", code: 2, userInfo: [NSLocalizedDescriptionKey: "Display not found"])
        }
        
        // Create stream configuration
        let config = SCStreamConfiguration()
        config.width = display.width
        config.height = display.height
        config.minimumFrameInterval = CMTime(value: 1, timescale: 60) // 60 fps
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.showsCursor = false // THIS IS THE KEY - Hide cursor from recording
        config.backgroundColor = .clear
        config.scalesToFit = false
        config.queueDepth = 5
        
        // Create content filter for the display
        let filter = SCContentFilter(display: display, excludingWindows: [])
        
        // Create output URL
        self.outputURL = URL(fileURLWithPath: outputPath)
        self.outputPath = outputPath
        
        // Create stream output handler
        streamOutput = StreamOutput(
            outputURL: self.outputURL!,
            width: display.width,
            height: display.height
        )
        try streamOutput?.setupWriter()
        
        // Create and configure stream
        stream = SCStream(filter: filter, configuration: config, delegate: streamOutput)
        
        // Add stream output
        try stream?.addStreamOutput(streamOutput!, type: .screen, sampleHandlerQueue: DispatchQueue(label: "screencapture.queue"))
        
        // Start capture
        try await stream?.startCapture()
        isRecording = true
        
        print("Started recording display \(displayID) to \(outputPath)")
    }
    
    @objc public func startRecordingWindow(windowID: UInt32, outputPath: String) async throws {
        // Clean up any existing recording
        await stopRecording()
        
        // Get shareable content
        let content = try await SCShareableContent.current
        
        // Find window with matching ID
        guard let window = content.windows.first(where: { $0.windowID == windowID }) else {
            throw NSError(domain: "ScreenRecorder", code: 3, userInfo: [NSLocalizedDescriptionKey: "Window not found"])
        }
        
        // Get the display containing the window
        let display = content.displays.first { display in
            let displayFrame = CGRect(x: 0, y: 0, width: display.width, height: display.height)
            return displayFrame.intersects(window.frame)
        } ?? content.displays.first!
        
        // Create stream configuration
        let config = SCStreamConfiguration()
        config.width = Int(window.frame.width) * 2 // Retina resolution
        config.height = Int(window.frame.height) * 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 60) // 60 fps
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.showsCursor = false // Hide cursor from recording
        config.backgroundColor = .clear
        config.scalesToFit = true
        config.queueDepth = 5
        
        // Create content filter for the window
        let filter = SCContentFilter(desktopIndependentWindow: window)
        
        // Create output URL
        self.outputURL = URL(fileURLWithPath: outputPath)
        self.outputPath = outputPath
        
        // Create stream output handler
        streamOutput = StreamOutput(
            outputURL: self.outputURL!,
            width: config.width,
            height: config.height
        )
        try streamOutput?.setupWriter()
        
        // Create and configure stream
        stream = SCStream(filter: filter, configuration: config, delegate: streamOutput)
        
        // Add stream output
        try stream?.addStreamOutput(streamOutput!, type: .screen, sampleHandlerQueue: DispatchQueue(label: "screencapture.queue"))
        
        // Start capture
        try await stream?.startCapture()
        isRecording = true
        
        print("Started recording window \(windowID) to \(outputPath)")
    }
    
    @objc public func stopRecording() async -> String? {
        guard isRecording else { return nil }
        
        do {
            // Stop the stream
            try await stream?.stopCapture()
            
            // Remove output
            if let streamOutput = streamOutput {
                try stream?.removeStreamOutput(streamOutput, type: .screen)
            }
            
            // Finish writing
            try await streamOutput?.finishWriting()
            
            // Clean up
            stream = nil
            streamOutput = nil
            isRecording = false
            
            print("Recording stopped, saved to: \(outputPath ?? "unknown")")
            return outputPath
        } catch {
            print("Error stopping recording: \(error)")
            return nil
        }
    }
}

// Objective-C bridge for Node.js addon
@available(macOS 13.0, *)
@objc public class ScreenRecorderBridge: NSObject {
    private let recorder = ScreenRecorder()
    
    @objc public func startDisplayRecording(_ displayID: UInt32, outputPath: String, completion: @escaping (Bool, String?) -> Void) {
        Task {
            do {
                try await recorder.startRecording(displayID: displayID, outputPath: outputPath)
                completion(true, nil)
            } catch {
                completion(false, error.localizedDescription)
            }
        }
    }
    
    @objc public func startWindowRecording(_ windowID: UInt32, outputPath: String, completion: @escaping (Bool, String?) -> Void) {
        Task {
            do {
                try await recorder.startRecordingWindow(windowID: windowID, outputPath: outputPath)
                completion(true, nil)
            } catch {
                completion(false, error.localizedDescription)
            }
        }
    }
    
    @objc public func stopRecording(_ completion: @escaping (String?) -> Void) {
        Task {
            let path = await recorder.stopRecording()
            completion(path)
        }
    }
    
    @objc public var isRecording: Bool {
        return recorder.isRecording
    }
}