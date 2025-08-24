#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#include <napi.h>
#import <string>

// Convert NSCursor to our cursor type string
std::string NSCursorToString(NSCursor* cursor) {
    if (!cursor) return "default";
    
    // Check against known system cursors
    if (cursor == [NSCursor arrowCursor]) return "default";
    if (cursor == [NSCursor IBeamCursor]) return "text";
    if (cursor == [NSCursor pointingHandCursor]) return "pointer";
    if (cursor == [NSCursor closedHandCursor]) return "grabbing";
    if (cursor == [NSCursor openHandCursor]) return "grab";
    if (cursor == [NSCursor crosshairCursor]) return "crosshair";
    if (cursor == [NSCursor resizeLeftCursor]) return "w-resize";
    if (cursor == [NSCursor resizeRightCursor]) return "e-resize";
    if (cursor == [NSCursor resizeUpCursor]) return "n-resize";
    if (cursor == [NSCursor resizeDownCursor]) return "s-resize";
    if (cursor == [NSCursor resizeLeftRightCursor]) return "ew-resize";
    if (cursor == [NSCursor resizeUpDownCursor]) return "ns-resize";
    if (cursor == [NSCursor contextualMenuCursor]) return "context-menu";
    if (cursor == [NSCursor disappearingItemCursor]) return "disappearing-item";
    if (cursor == [NSCursor dragCopyCursor]) return "copy";
    if (cursor == [NSCursor dragLinkCursor]) return "alias";
    if (cursor == [NSCursor operationNotAllowedCursor]) return "not-allowed";
    if (cursor == [NSCursor IBeamCursorForVerticalLayout]) return "vertical-text";
    
    // Check for resize diagonal cursors (these don't have direct NSCursor equivalents)
    NSString* cursorDescription = [cursor description];
    if ([cursorDescription containsString:@"resize"]) {
        if ([cursorDescription containsString:@"northeast"] || 
            [cursorDescription containsString:@"southwest"]) {
            return "nesw-resize";
        }
        if ([cursorDescription containsString:@"northwest"] || 
            [cursorDescription containsString:@"southeast"]) {
            return "nwse-resize";
        }
    }
    
    // Default fallback
    return "default";
}

// N-API function to get current cursor type
Napi::String GetCurrentCursorType(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    @autoreleasepool {
        // First try to get the current cursor (this is more reliable)
        NSCursor* currentCursor = [NSCursor currentCursor];
        
        // If that fails, try system cursor
        if (!currentCursor) {
            currentCursor = [NSCursor currentSystemCursor];
        }
        
        // As a fallback, check the frontmost app's cursor
        if (!currentCursor) {
            NSApplication* app = [NSApplication sharedApplication];
            NSWindow* keyWindow = [app keyWindow];
            if (keyWindow) {
                // Try to get cursor from the key window's content view
                NSView* contentView = [keyWindow contentView];
                if (contentView) {
                    // Get the mouse location in window coordinates
                    NSPoint mouseLocation = [keyWindow mouseLocationOutsideOfEventStream];
                    NSView* hitView = [contentView hitTest:mouseLocation];
                    if (hitView) {
                        // Check tracking areas for cursor info
                        for (NSTrackingArea* area in [hitView trackingAreas]) {
                            NSDictionary* userInfo = [area userInfo];
                            if (userInfo && userInfo[@"cursor"]) {
                                currentCursor = userInfo[@"cursor"];
                                break;
                            }
                        }
                    }
                }
            }
        }
        
        // Convert to string
        std::string cursorType = NSCursorToString(currentCursor);
        
        // Debug logging
        NSLog(@"Detected cursor type: %s", cursorType.c_str());
        
        return Napi::String::New(env, cursorType);
    }
}

// N-API function to get cursor at specific screen coordinates
Napi::String GetCursorAtPoint(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Validate arguments
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "Expected two numbers (x, y)").ThrowAsJavaScriptException();
        return Napi::String::New(env, "default");
    }
    
    double x = info[0].As<Napi::Number>().DoubleValue();
    double y = info[1].As<Napi::Number>().DoubleValue();
    
    @autoreleasepool {
        // Convert to NSPoint (flip Y coordinate for screen coordinates)
        NSPoint point = NSMakePoint(x, y);
        
        // Try to get window at point and its cursor
        NSInteger windowNumber = [NSWindow windowNumberAtPoint:point belowWindowWithWindowNumber:0];
        
        if (windowNumber > 0) {
            // Try to find the window
            for (NSWindow* window in [NSApp windows]) {
                if ([window windowNumber] == windowNumber) {
                    // Check if window has a specific cursor
                    NSView* contentView = [window contentView];
                    if (contentView) {
                        // Convert point to window coordinates
                        NSPoint windowPoint = [window convertPointFromScreen:point];
                        NSView* hitView = [contentView hitTest:windowPoint];
                        
                        // Try to get cursor from view's tracking areas
                        if (hitView) {
                            for (NSTrackingArea* area in [hitView trackingAreas]) {
                                NSDictionary* userInfo = [area userInfo];
                                if (userInfo && userInfo[@"cursor"]) {
                                    NSCursor* cursor = userInfo[@"cursor"];
                                    return Napi::String::New(env, NSCursorToString(cursor));
                                }
                            }
                        }
                    }
                    break;
                }
            }
        }
        
        // Fallback to current system cursor
        NSCursor* currentCursor = [NSCursor currentSystemCursor];
        if (!currentCursor) {
            currentCursor = [NSCursor currentCursor];
        }
        
        std::string cursorType = NSCursorToString(currentCursor);
        return Napi::String::New(env, cursorType);
    }
}

// Initialize the module
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "getCurrentCursorType"),
                Napi::Function::New(env, GetCurrentCursorType));
    exports.Set(Napi::String::New(env, "getCursorAtPoint"),
                Napi::Function::New(env, GetCursorAtPoint));
    return exports;
}

NODE_API_MODULE(cursor_detector, Init)