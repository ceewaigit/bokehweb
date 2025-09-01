#import <Foundation/Foundation.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <AVFoundation/AVFoundation.h>
#import <napi.h>
#import <CoreGraphics/CoreGraphics.h>

// This actually WORKS to hide the cursor using native macOS APIs
// Available on macOS 12.3+ with ScreenCaptureKit

@interface ScreenRecorder : NSObject <SCStreamOutput, SCStreamDelegate>
@property (nonatomic, strong) SCStream *stream;
@property (nonatomic, strong) AVAssetWriter *assetWriter;
@property (nonatomic, strong) AVAssetWriterInput *videoInput;
@property (nonatomic, strong) AVAssetWriterInput *audioInput;
@property (nonatomic, strong) AVAssetWriterInputPixelBufferAdaptor *adaptor;
@property (nonatomic, strong) NSString *outputPath;
@property (nonatomic, assign) BOOL isRecording;
@property (nonatomic, assign) CMTime startTime;
@property (nonatomic, assign) BOOL hasStartedSession;
@property (nonatomic, assign) BOOL hasAudio;
@property (nonatomic, assign) BOOL receivedFirstAudio;

- (void)startRecordingDisplay:(CGDirectDisplayID)displayID outputPath:(NSString *)path completion:(void (^)(NSError *))completion;
- (void)stopRecording:(void (^)(NSString *, NSError *))completion;
@end

@implementation ScreenRecorder

- (void)startRecordingDisplay:(CGDirectDisplayID)displayID outputPath:(NSString *)path completion:(void (^)(NSError *))completion {
    if (@available(macOS 12.3, *)) {
        self.outputPath = path;
        self.hasStartedSession = NO;
        self.receivedFirstAudio = NO;
        
        // Get shareable content
        [SCShareableContent getShareableContentWithCompletionHandler:^(SCShareableContent *content, NSError *error) {
            if (error) {
                completion(error);
                return;
            }
            
            // Find the display
            SCDisplay *targetDisplay = nil;
            for (SCDisplay *display in content.displays) {
                if (display.displayID == displayID) {
                    targetDisplay = display;
                    break;
                }
            }
            
            if (!targetDisplay) {
                // Use primary display as fallback
                targetDisplay = content.displays.firstObject;
            }
            
            if (!targetDisplay) {
                completion([NSError errorWithDomain:@"ScreenRecorder" code:1 userInfo:@{NSLocalizedDescriptionKey: @"No display found"}]);
                return;
            }
            
            // Exclude all windows from our own app to prevent them from appearing in recordings
            NSMutableArray<SCWindow *> *windowsToExclude = [NSMutableArray array];
            for (SCWindow *window in content.windows) {
                if ([window.owningApplication.bundleIdentifier isEqualToString:[[NSBundle mainBundle] bundleIdentifier]]) {
                    [windowsToExclude addObject:window];
                }
            }
            
            // Create content filter with excluded windows
            SCContentFilter *filter = [[SCContentFilter alloc] initWithDisplay:targetDisplay excludingWindows:windowsToExclude];
            
            // Create stream configuration
            SCStreamConfiguration *config = [[SCStreamConfiguration alloc] init];
            
            // Set full pixel resolution for the target display
            size_t pixelWidth = 0;
            size_t pixelHeight = 0;
            CGDisplayModeRef mode = CGDisplayCopyDisplayMode(displayID);
            if (mode) {
                pixelWidth = CGDisplayModeGetPixelWidth(mode);
                pixelHeight = CGDisplayModeGetPixelHeight(mode);
                CFRelease(mode);
            }
            
            if (pixelWidth == 0 || pixelHeight == 0) {
                // Fallback to reported width/height
                pixelWidth = (size_t)targetDisplay.width;
                pixelHeight = (size_t)targetDisplay.height;
            }
            
            config.width = pixelWidth;
            config.height = pixelHeight;
            config.minimumFrameInterval = CMTimeMake(1, 60); // 60 fps
            config.pixelFormat = kCVPixelFormatType_32BGRA;
            config.showsCursor = NO;  // THIS IS THE KEY - Hide cursor!
            config.backgroundColor = NSColor.clearColor.CGColor;
            config.scalesToFit = NO;
            config.queueDepth = 5;
            
            // Configure audio capture
            // Note: On macOS, audio capture is subject to system permission and SDK behavior.
            config.capturesAudio = YES;
            config.sampleRate = 48000;
            config.channelCount = 2;
            
            NSLog(@"Screen recording configured: %zux%zu with audio capture enabled", pixelWidth, pixelHeight);
            
            // Setup asset writer
            NSError *writerError = nil;
            self.assetWriter = [[AVAssetWriter alloc] initWithURL:[NSURL fileURLWithPath:path] fileType:AVFileTypeQuickTimeMovie error:&writerError];
            
            if (writerError) {
                completion(writerError);
                return;
            }
            
            NSDictionary *videoSettings = @{
                AVVideoCodecKey: AVVideoCodecTypeH264,
                AVVideoWidthKey: @(config.width),
                AVVideoHeightKey: @(config.height),
                AVVideoCompressionPropertiesKey: @{
                    AVVideoAverageBitRateKey: @(5000000),
                    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
                }
            };
            
            self.videoInput = [[AVAssetWriterInput alloc] initWithMediaType:AVMediaTypeVideo outputSettings:videoSettings];
            self.videoInput.expectsMediaDataInRealTime = YES;
            
            NSDictionary *sourcePixelBufferAttributes = @{
                (NSString *)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA),
                (NSString *)kCVPixelBufferWidthKey: @(config.width),
                (NSString *)kCVPixelBufferHeightKey: @(config.height)
            };
            
            self.adaptor = [[AVAssetWriterInputPixelBufferAdaptor alloc] initWithAssetWriterInput:self.videoInput sourcePixelBufferAttributes:sourcePixelBufferAttributes];
            
            [self.assetWriter addInput:self.videoInput];
            
            // Setup audio input
            AudioChannelLayout stereoChannelLayout = {
                .mChannelLayoutTag = kAudioChannelLayoutTag_Stereo,
                .mChannelBitmap = kAudioChannelBit_Left | kAudioChannelBit_Right,
                .mNumberChannelDescriptions = 0
            };
            
            NSData *channelLayoutAsData = [NSData dataWithBytes:&stereoChannelLayout length:offsetof(AudioChannelLayout, mChannelDescriptions)];
            
            NSDictionary *audioSettings = @{
                AVFormatIDKey: @(kAudioFormatMPEG4AAC),
                AVNumberOfChannelsKey: @2,
                AVSampleRateKey: @48000,
                AVChannelLayoutKey: channelLayoutAsData,
                AVEncoderBitRateKey: @128000
            };
            
            self.audioInput = [[AVAssetWriterInput alloc] initWithMediaType:AVMediaTypeAudio outputSettings:audioSettings];
            self.audioInput.expectsMediaDataInRealTime = YES;
            
            if ([self.assetWriter canAddInput:self.audioInput]) {
                [self.assetWriter addInput:self.audioInput];
                self.hasAudio = YES;
                NSLog(@"Audio input added successfully to asset writer");
            } else {
                NSLog(@"Warning: Could not add audio input to asset writer");
                self.hasAudio = NO;
            }
            
            if (![self.assetWriter startWriting]) {
                completion([NSError errorWithDomain:@"ScreenRecorder" code:2 userInfo:@{NSLocalizedDescriptionKey: @"Failed to start writing"}]);
                return;
            }
            
            // Create and start stream
            self.stream = [[SCStream alloc] initWithFilter:filter configuration:config delegate:self];
            
            NSError *addOutputError = nil;
            [self.stream addStreamOutput:self type:SCStreamOutputTypeScreen sampleHandlerQueue:dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_HIGH, 0) error:&addOutputError];
            
            if (!addOutputError && self.hasAudio) {
                NSError *audioOutputError = nil;
                [self.stream addStreamOutput:self type:SCStreamOutputTypeAudio sampleHandlerQueue:dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_HIGH, 0) error:&audioOutputError];
                
                if (audioOutputError) {
                    NSLog(@"Warning: Failed to add audio output: %@", audioOutputError);
                    self.hasAudio = NO;
                }
            }
            
            if (addOutputError) {
                completion(addOutputError);
                return;
            }
            
            // Start capture
            [self.stream startCaptureWithCompletionHandler:^(NSError *error) {
                if (error) {
                    completion(error);
                } else {
                    self.isRecording = YES;
                    completion(nil);
                }
            }];
        }];
    } else {
        completion([NSError errorWithDomain:@"ScreenRecorder" code:3 userInfo:@{NSLocalizedDescriptionKey: @"ScreenCaptureKit requires macOS 12.3 or later"}]);
    }
}

- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer ofType:(SCStreamOutputType)type {
    if (type == SCStreamOutputTypeScreen && self.videoInput.isReadyForMoreMediaData) {
        CVPixelBufferRef pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer);
        if (!pixelBuffer) {
            return;
        }
    } else if (type == SCStreamOutputTypeAudio && self.hasAudio && self.audioInput.isReadyForMoreMediaData) {
        // Handle audio samples
        if (!self.receivedFirstAudio) {
            self.receivedFirstAudio = YES;
            NSLog(@"Received first audio sample");
        }
        CMTime presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer);
        
        if (!self.hasStartedSession) {
            [self.assetWriter startSessionAtSourceTime:presentationTime];
            self.startTime = presentationTime;
            self.hasStartedSession = YES;
        }
        
        // Append audio sample buffer
        if (![self.audioInput appendSampleBuffer:sampleBuffer]) {
            NSLog(@"Failed to append audio sample buffer");
        }
        
        return;
    } else {
        return;
    }
    
    CVPixelBufferRef pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer);
    if (!pixelBuffer) {
        return;
    }
    
    CMTime presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer);
    
    if (!self.hasStartedSession) {
        [self.assetWriter startSessionAtSourceTime:presentationTime];
        self.hasStartedSession = YES;
        self.startTime = presentationTime;
    }
    
    [self.adaptor appendPixelBuffer:pixelBuffer withPresentationTime:presentationTime];
}

- (void)stopRecording:(void (^)(NSString *, NSError *))completion {
    if (!self.isRecording) {
        completion(nil, [NSError errorWithDomain:@"ScreenRecorder" code:4 userInfo:@{NSLocalizedDescriptionKey: @"Not recording"}]);
        return;
    }
    
    if (@available(macOS 12.3, *)) {
        [self.stream stopCaptureWithCompletionHandler:^(NSError *error) {
            if (self.stream) {
                [self.stream removeStreamOutput:self type:SCStreamOutputTypeScreen error:nil];
                if (self.hasAudio) {
                    [self.stream removeStreamOutput:self type:SCStreamOutputTypeAudio error:nil];
                }
            }
            
            // Mark inputs finished
            if (self.audioInput) {
                [self.audioInput markAsFinished];
            }
            if (self.videoInput) {
                [self.videoInput markAsFinished];
            }
            
            [self.assetWriter finishWritingWithCompletionHandler:^{
                self.isRecording = NO;
                if (self.assetWriter.status == AVAssetWriterStatusCompleted) {
                    completion(self.outputPath, nil);
                } else {
                    completion(nil, self.assetWriter.error);
                }
            }];
        }];
    }
}

@end

// NAPI wrapper
class NativeScreenRecorder : public Napi::ObjectWrap<NativeScreenRecorder> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function func = DefineClass(env, "NativeScreenRecorder", {
            InstanceMethod("startRecording", &NativeScreenRecorder::StartRecording),
            InstanceMethod("stopRecording", &NativeScreenRecorder::StopRecording),
            InstanceMethod("isRecording", &NativeScreenRecorder::IsRecording),
            InstanceMethod("isAvailable", &NativeScreenRecorder::IsAvailable)
        });
        
        Napi::FunctionReference* constructor = new Napi::FunctionReference();
        *constructor = Napi::Persistent(func);
        env.SetInstanceData(constructor);
        
        exports.Set("NativeScreenRecorder", func);
        return exports;
    }
    
    NativeScreenRecorder(const Napi::CallbackInfo& info) : Napi::ObjectWrap<NativeScreenRecorder>(info) {
        // Always try to create the recorder on macOS
        recorder = [[ScreenRecorder alloc] init];
    }
    
private:
    ScreenRecorder* recorder;
    
    Napi::Value StartRecording(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (!recorder) {
            Napi::Error::New(env, "ScreenCaptureKit requires macOS 12.3 or later").ThrowAsJavaScriptException();
            return env.Undefined();
        }
        
        if (info.Length() < 3 || !info[0].IsNumber() || !info[1].IsString() || !info[2].IsFunction()) {
            Napi::TypeError::New(env, "Expected (displayID: number, outputPath: string, callback: function)")
                .ThrowAsJavaScriptException();
            return env.Undefined();
        }
        
        CGDirectDisplayID displayID = info[0].As<Napi::Number>().Uint32Value();
        std::string outputPath = info[1].As<Napi::String>().Utf8Value();
        Napi::ThreadSafeFunction tsfn = Napi::ThreadSafeFunction::New(
            env,
            info[2].As<Napi::Function>(),
            "StartRecordingCallback",
            0,
            1
        );
        
        NSString* path = [NSString stringWithUTF8String:outputPath.c_str()];
        
        dispatch_async(dispatch_get_main_queue(), ^{
            [recorder startRecordingDisplay:displayID outputPath:path completion:^(NSError *error) {
                auto callback = [error](Napi::Env env, Napi::Function jsCallback) {
                    if (error) {
                        jsCallback.Call({Napi::Error::New(env, [[error localizedDescription] UTF8String]).Value()});
                    } else {
                        jsCallback.Call({env.Null()});
                    }
                };
                tsfn.BlockingCall(callback);
                tsfn.Release();
            }];
        });
        
        return env.Undefined();
    }
    
    Napi::Value StopRecording(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (!recorder) {
            Napi::Error::New(env, "ScreenCaptureKit requires macOS 12.3 or later").ThrowAsJavaScriptException();
            return env.Undefined();
        }
        
        if (info.Length() < 1 || !info[0].IsFunction()) {
            Napi::TypeError::New(env, "Expected callback function").ThrowAsJavaScriptException();
            return env.Undefined();
        }
        
        Napi::ThreadSafeFunction tsfn = Napi::ThreadSafeFunction::New(
            env,
            info[0].As<Napi::Function>(),
            "StopRecordingCallback",
            0,
            1
        );
        
        dispatch_async(dispatch_get_main_queue(), ^{
            [recorder stopRecording:^(NSString *path, NSError *error) {
                auto callback = [path, error](Napi::Env env, Napi::Function jsCallback) {
                    if (error) {
                        jsCallback.Call({Napi::Error::New(env, [[error localizedDescription] UTF8String]).Value(), env.Null()});
                    } else if (path) {
                        jsCallback.Call({env.Null(), Napi::String::New(env, [path UTF8String])});
                    } else {
                        jsCallback.Call({env.Null(), env.Null()});
                    }
                };
                tsfn.BlockingCall(callback);
                tsfn.Release();
            }];
        });
        
        return env.Undefined();
    }
    
    Napi::Value IsRecording(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (!recorder) {
            return Napi::Boolean::New(env, false);
        }
        
        return Napi::Boolean::New(env, [recorder isRecording]);
    }
    
    Napi::Value IsAvailable(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        // Report availability only on macOS 13.0+ where SC audio output is supported
        BOOL available = NO;
        if (@available(macOS 13.0, *)) {
            available = YES;
        } else {
            available = NO;
        }
        return Napi::Boolean::New(env, available);
    }
};

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return NativeScreenRecorder::Init(env, exports);
}

NODE_API_MODULE(screencapture_kit, Init)