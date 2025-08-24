#import <Foundation/Foundation.h>
#import <napi.h>
#import <thread>
#import <dispatch/dispatch.h>

// Forward declaration - Swift class will be imported via bridging header
#if __has_include("screenstudio-Swift.h")
#import "screenstudio-Swift.h"
#else
// Fallback declaration if Swift isn't compiled yet
@interface ScreenRecorderBridge : NSObject
- (void)startDisplayRecording:(uint32_t)displayID 
                    outputPath:(NSString *)outputPath 
                    completion:(void (^)(BOOL success, NSString *error))completion;
- (void)startWindowRecording:(uint32_t)windowID 
                   outputPath:(NSString *)outputPath 
                   completion:(void (^)(BOOL success, NSString *error))completion;
- (void)stopRecording:(void (^)(NSString *path))completion;
- (BOOL)isRecording;
@end
#endif

class NativeScreenRecorder : public Napi::ObjectWrap<NativeScreenRecorder> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function func = DefineClass(env, "NativeScreenRecorder", {
            InstanceMethod("startDisplayRecording", &NativeScreenRecorder::StartDisplayRecording),
            InstanceMethod("startWindowRecording", &NativeScreenRecorder::StartWindowRecording),
            InstanceMethod("stopRecording", &NativeScreenRecorder::StopRecording),
            InstanceMethod("isRecording", &NativeScreenRecorder::IsRecording)
        });
        
        Napi::FunctionReference* constructor = new Napi::FunctionReference();
        *constructor = Napi::Persistent(func);
        env.SetInstanceData(constructor);
        
        exports.Set("NativeScreenRecorder", func);
        return exports;
    }
    
    NativeScreenRecorder(const Napi::CallbackInfo& info) : Napi::ObjectWrap<NativeScreenRecorder>(info) {
        // Check if macOS 13.0+ is available
        if (@available(macOS 13.0, *)) {
            recorder = [[ScreenRecorderBridge alloc] init];
        } else {
            recorder = nil;
        }
    }
    
private:
    ScreenRecorderBridge* recorder;
    
    Napi::Value StartDisplayRecording(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (!recorder) {
            Napi::Error::New(env, "ScreenCaptureKit requires macOS 13.0 or later").ThrowAsJavaScriptException();
            return env.Undefined();
        }
        
        if (info.Length() < 3 || !info[0].IsNumber() || !info[1].IsString() || !info[2].IsFunction()) {
            Napi::TypeError::New(env, "Expected (displayID: number, outputPath: string, callback: function)")
                .ThrowAsJavaScriptException();
            return env.Undefined();
        }
        
        uint32_t displayID = info[0].As<Napi::Number>().Uint32Value();
        std::string outputPath = info[1].As<Napi::String>().Utf8Value();
        Napi::ThreadSafeFunction tsfn = Napi::ThreadSafeFunction::New(
            env,
            info[2].As<Napi::Function>(),
            "StartDisplayRecordingCallback",
            0,
            1
        );
        
        NSString* path = [NSString stringWithUTF8String:outputPath.c_str()];
        
        dispatch_async(dispatch_get_main_queue(), ^{
            [recorder startDisplayRecording:displayID 
                                outputPath:path 
                                completion:^(BOOL success, NSString *error) {
                auto callback = [success, error](Napi::Env env, Napi::Function jsCallback) {
                    if (success) {
                        jsCallback.Call({env.Null()});
                    } else {
                        std::string errorStr = error ? [error UTF8String] : "Unknown error";
                        jsCallback.Call({Napi::Error::New(env, errorStr).Value()});
                    }
                };
                tsfn.BlockingCall(callback);
                tsfn.Release();
            }];
        });
        
        return env.Undefined();
    }
    
    Napi::Value StartWindowRecording(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (!recorder) {
            Napi::Error::New(env, "ScreenCaptureKit requires macOS 13.0 or later").ThrowAsJavaScriptException();
            return env.Undefined();
        }
        
        if (info.Length() < 3 || !info[0].IsNumber() || !info[1].IsString() || !info[2].IsFunction()) {
            Napi::TypeError::New(env, "Expected (windowID: number, outputPath: string, callback: function)")
                .ThrowAsJavaScriptException();
            return env.Undefined();
        }
        
        uint32_t windowID = info[0].As<Napi::Number>().Uint32Value();
        std::string outputPath = info[1].As<Napi::String>().Utf8Value();
        Napi::ThreadSafeFunction tsfn = Napi::ThreadSafeFunction::New(
            env,
            info[2].As<Napi::Function>(),
            "StartWindowRecordingCallback",
            0,
            1
        );
        
        NSString* path = [NSString stringWithUTF8String:outputPath.c_str()];
        
        dispatch_async(dispatch_get_main_queue(), ^{
            [recorder startWindowRecording:windowID 
                               outputPath:path 
                               completion:^(BOOL success, NSString *error) {
                auto callback = [success, error](Napi::Env env, Napi::Function jsCallback) {
                    if (success) {
                        jsCallback.Call({env.Null()});
                    } else {
                        std::string errorStr = error ? [error UTF8String] : "Unknown error";
                        jsCallback.Call({Napi::Error::New(env, errorStr).Value()});
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
            Napi::Error::New(env, "ScreenCaptureKit requires macOS 13.0 or later").ThrowAsJavaScriptException();
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
            [recorder stopRecording:^(NSString *path) {
                auto callback = [path](Napi::Env env, Napi::Function jsCallback) {
                    if (path) {
                        std::string pathStr = [path UTF8String];
                        jsCallback.Call({env.Null(), Napi::String::New(env, pathStr)});
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
};

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return NativeScreenRecorder::Init(env, exports);
}

NODE_API_MODULE(screen_recorder, Init)