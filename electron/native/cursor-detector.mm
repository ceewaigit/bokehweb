#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
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

// Check if we have accessibility permissions
bool HasAccessibilityPermissions() {
    return AXIsProcessTrusted();
}

// Request accessibility permissions if needed
bool RequestAccessibilityPermissions() {
    if (!HasAccessibilityPermissions()) {
        // This will prompt the user to grant accessibility permissions
        NSDictionary* options = @{(__bridge id)kAXTrustedCheckOptionPrompt: @YES};
        return AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
    }
    return true;
}

// Get cursor type using Accessibility API
std::string GetCursorTypeFromAccessibility() {
    if (!HasAccessibilityPermissions()) {
        return "default";
    }
    
    // Get the element under the mouse
    CGPoint mouseLocation;
    CGEventRef event = CGEventCreate(NULL);
    mouseLocation = CGEventGetLocation(event);
    CFRelease(event);
    
    AXUIElementRef systemWideElement = AXUIElementCreateSystemWide();
    AXUIElementRef elementUnderMouse = NULL;
    
    AXError error = AXUIElementCopyElementAtPosition(systemWideElement, 
                                                      mouseLocation.x, 
                                                      mouseLocation.y, 
                                                      &elementUnderMouse);
    
    std::string cursorType = "default";
    
    if (error == kAXErrorSuccess && elementUnderMouse) {
        // Get the role of the element
        CFTypeRef role = NULL;
        AXUIElementCopyAttributeValue(elementUnderMouse, kAXRoleAttribute, &role);
        
        if (role) {
            NSString* roleString = (__bridge NSString*)role;
            
            // Detect cursor type based on element role
            if ([roleString isEqualToString:(__bridge NSString*)kAXTextFieldRole] ||
                [roleString isEqualToString:(__bridge NSString*)kAXTextAreaRole] ||
                [roleString isEqualToString:@"AXWebArea"] ||
                [roleString containsString:@"Text"]) {
                cursorType = "text";
            } else if ([roleString isEqualToString:(__bridge NSString*)kAXLinkRole] ||
                       [roleString isEqualToString:(__bridge NSString*)kAXButtonRole]) {
                cursorType = "pointer";
            } else if ([roleString isEqualToString:(__bridge NSString*)kAXSliderRole] ||
                       [roleString isEqualToString:(__bridge NSString*)kAXScrollBarRole]) {
                cursorType = "grab";
            }
            
            CFRelease(role);
        }
        
        CFRelease(elementUnderMouse);
    }
    
    CFRelease(systemWideElement);
    
    return cursorType;
}

// N-API function to get current cursor type
Napi::String GetCurrentCursorType(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    @autoreleasepool {
        std::string cursorType = "default";
        
        // First try Accessibility API if we have permissions
        if (HasAccessibilityPermissions()) {
            cursorType = GetCursorTypeFromAccessibility();
        } else {
            // Fall back to NSCursor detection
            NSCursor* currentCursor = [NSCursor currentCursor];
            
            if (!currentCursor) {
                currentCursor = [NSCursor currentSystemCursor];
            }
            
            if (!currentCursor) {
                currentCursor = [NSCursor arrowCursor];
            }
            
            cursorType = NSCursorToString(currentCursor);
        }
        
        return Napi::String::New(env, cursorType);
    }
}

// N-API function to get cursor at specific screen coordinates - NOT USED, keeping for future use
Napi::String GetCursorAtPoint(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "Expected two numbers (x, y)").ThrowAsJavaScriptException();
        return Napi::String::New(env, "default");
    }
    
    // Just return current cursor for now - this function isn't being used
    return GetCurrentCursorType(info);
}

// N-API function to check accessibility permissions
Napi::Boolean CheckAccessibilityPermissions(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::Boolean::New(env, HasAccessibilityPermissions());
}

// N-API function to request accessibility permissions
Napi::Boolean RequestAccessibilityPermissionsAPI(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::Boolean::New(env, RequestAccessibilityPermissions());
}

// Initialize the module
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "getCurrentCursorType"),
                Napi::Function::New(env, GetCurrentCursorType));
    exports.Set(Napi::String::New(env, "getCursorAtPoint"),
                Napi::Function::New(env, GetCursorAtPoint));
    exports.Set(Napi::String::New(env, "hasAccessibilityPermissions"),
                Napi::Function::New(env, CheckAccessibilityPermissions));
    exports.Set(Napi::String::New(env, "requestAccessibilityPermissions"),
                Napi::Function::New(env, RequestAccessibilityPermissionsAPI));
    return exports;
}

NODE_API_MODULE(cursor_detector, Init)