#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#include <napi.h>
#import <string>

// Forward declarations for caret observer exports
Napi::Value StartCaretObserver(const Napi::CallbackInfo& info);
Napi::Value StopCaretObserver(const Napi::CallbackInfo& info);

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
        CFTypeRef role = NULL;
        AXUIElementCopyAttributeValue(elementUnderMouse, kAXRoleAttribute, &role);
        
        if (role) {
            NSString* roleString = (__bridge NSString*)role;
            
            // Narrow mapping: avoid broad AXWebArea => text
            if ([roleString isEqualToString:(__bridge NSString*)kAXTextFieldRole] ||
                [roleString isEqualToString:(__bridge NSString*)kAXTextAreaRole] ||
                [roleString containsString:@"Text"]) {
                cursorType = "text";
            } else if ([roleString isEqualToString:@"AXLink"] ||
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
        // Prefer system cursor first for accuracy
        NSCursor* currentCursor = [NSCursor currentCursor];
        if (!currentCursor) {
            currentCursor = [NSCursor currentSystemCursor];
        }
        if (!currentCursor) {
            currentCursor = [NSCursor arrowCursor];
        }
        std::string nsCursorType = NSCursorToString(currentCursor);
        if (nsCursorType != "default") {
            return Napi::String::New(env, nsCursorType);
        }
        
        // Fall back to Accessibility-based detection when the cursor appears as arrow
        if (HasAccessibilityPermissions()) {
            std::string axType = GetCursorTypeFromAccessibility();
            return Napi::String::New(env, axType);
        }
        
        return Napi::String::New(env, "default");
    }
}

// N-API function to get cursor at specific screen coordinates - NOT USED, keeping for future use
Napi::String GetCursorAtPoint(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "Expected two numbers (x, y)").ThrowAsJavaScriptException();
        return Napi::String::New(env, "default");
    }
    
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

// N-API function to return the insertion caret screen rect using AX APIs
Napi::Value GetInsertionPointScreenRect(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    @autoreleasepool {
        if (!HasAccessibilityPermissions()) {
            return env.Null();
        }
        
        AXUIElementRef systemWide = AXUIElementCreateSystemWide();
        AXUIElementRef focusedElement = NULL;
        AXError err = AXUIElementCopyAttributeValue(systemWide, kAXFocusedUIElementAttribute, (CFTypeRef*)&focusedElement);
        if (err != kAXErrorSuccess || !focusedElement) {
            if (systemWide) CFRelease(systemWide);
            return env.Null();
        }
        
        // Get the selected text range on the focused element
        AXValueRef selectedRangeValue = NULL;
        err = AXUIElementCopyAttributeValue(focusedElement, kAXSelectedTextRangeAttribute, (CFTypeRef*)&selectedRangeValue);
        if (err != kAXErrorSuccess || !selectedRangeValue) {
            if (selectedRangeValue) CFRelease(selectedRangeValue);
            CFRelease(focusedElement);
            CFRelease(systemWide);
            return env.Null();
        }
        
        CFRange selectedRange;
        if (AXValueGetType(selectedRangeValue) != kAXValueCFRangeType || !AXValueGetValue(selectedRangeValue, (AXValueType)kAXValueCFRangeType, &selectedRange)) {
            CFRelease(selectedRangeValue);
            CFRelease(focusedElement);
            CFRelease(systemWide);
            return env.Null();
        }
        
        // Debug: Log the selected range to see if it's changing
        NSLog(@"[CARET-NATIVE] Selected range: location=%ld, length=%ld", (long)selectedRange.location, (long)selectedRange.length);
        
        // Caret is at the end of selection (or same index if length == 0)
        CFRange caretRange = CFRangeMake(selectedRange.location + selectedRange.length, 0);
        AXValueRef caretRangeValue = AXValueCreate((AXValueType)kAXValueCFRangeType, &caretRange);
        
        AXValueRef rectValue = NULL;
        err = AXUIElementCopyParameterizedAttributeValue(focusedElement, kAXBoundsForRangeParameterizedAttribute, caretRangeValue, (CFTypeRef*)&rectValue);
        if (caretRangeValue) CFRelease(caretRangeValue);
        CFRelease(selectedRangeValue);
        
        if (err != kAXErrorSuccess || !rectValue || AXValueGetType(rectValue) != kAXValueCGRectType) {
            if (rectValue) CFRelease(rectValue);
            CFRelease(focusedElement);
            CFRelease(systemWide);
            return env.Null();
        }
        
        CGRect rect;
        AXValueGetValue(rectValue, (AXValueType)kAXValueCGRectType, &rect);
        CFRelease(rectValue);
        
        // Debug: Log the bounds returned by the API
        NSLog(@"[CARET-NATIVE] Bounds for caret at position %ld: x=%.1f, y=%.1f, w=%.1f, h=%.1f", 
              (long)(selectedRange.location + selectedRange.length), rect.origin.x, rect.origin.y, rect.size.width, rect.size.height);

        // If the bounds are element-relative, offset by the element's position to get screen DIP
        AXValueRef elementPosValue = NULL;
        if (AXUIElementCopyAttributeValue(focusedElement, kAXPositionAttribute, (CFTypeRef*)&elementPosValue) == kAXErrorSuccess && elementPosValue && AXValueGetType(elementPosValue) == kAXValueCGPointType) {
            CGPoint pos;
            AXValueGetValue(elementPosValue, (AXValueType)kAXValueCGPointType, &pos);
            rect.origin.x += pos.x;
            rect.origin.y += pos.y;
        }
        if (elementPosValue) CFRelease(elementPosValue);

        // Convert Cocoa bottom-left global coordinates to top-left global, then to physical pixels
        // Find containing screen and global top-most Y across all screens
        NSScreen* containing = nil;
        CGFloat globalMaxTopY = -CGFLOAT_MAX;
        for (NSScreen* screen in [NSScreen screens]) {
            NSRect f = [screen frame];
            if (NSMaxY(f) > globalMaxTopY) {
                globalMaxTopY = NSMaxY(f);
            }
            if (NSPointInRect(NSMakePoint(rect.origin.x, rect.origin.y), f)) {
                containing = screen;
            }
        }
        if (containing == nil) {
            containing = [NSScreen mainScreen];
        }

        // Compute top-left Y in DIP
        CGFloat tlY_DIP = globalMaxTopY - (rect.origin.y + rect.size.height);
        CGFloat tlX_DIP = rect.origin.x;

        // Exact physical pixels using the containing screen's scale
        CGFloat scale = [containing backingScaleFactor];
        NSInteger pxX = llround(tlX_DIP * scale);
        NSInteger pxY = llround(tlY_DIP * scale);
        NSInteger pxW = llround(MAX((CGFloat)1.0, rect.size.width * scale));
        NSInteger pxH = llround(MAX((CGFloat)1.0, rect.size.height * scale));
        
        Napi::Object out = Napi::Object::New(env);
        out.Set("x", Napi::Number::New(env, (double)pxX));
        out.Set("y", Napi::Number::New(env, (double)pxY));
        out.Set("width", Napi::Number::New(env, (double)pxW));
        out.Set("height", Napi::Number::New(env, (double)pxH));
        out.Set("scale", Napi::Number::New(env, scale));
        
        CFRelease(focusedElement);
        CFRelease(systemWide);
        return out;
    }
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
    exports.Set(Napi::String::New(env, "getInsertionPointScreenRect"),
                Napi::Function::New(env, GetInsertionPointScreenRect));

    // Add caret observer exports here instead of a second module
    exports.Set(Napi::String::New(env, "startCaretObserver"), Napi::Function::New(env, StartCaretObserver));
    exports.Set(Napi::String::New(env, "stopCaretObserver"), Napi::Function::New(env, StopCaretObserver));
    return exports;
}

NODE_API_MODULE(cursor_detector, Init)

// ===================== Caret Observer (AXObserver) =====================

static AXObserverRef gCaretObserver = NULL;
static AXUIElementRef gObservedApp = NULL;
static Napi::ThreadSafeFunction gCaretTSFN;

static void SendCaretRectToJS(CGRect rect, CGFloat scale) {
    if (gCaretTSFN) {
        // Convert bottom-left to top-left in physical pixels
        // Compute global top-most Y
        CGFloat globalMaxTopY = -CGFLOAT_MAX;
        for (NSScreen* screen in [NSScreen screens]) {
            NSRect f = [screen frame];
            if (NSMaxY(f) > globalMaxTopY) {
                globalMaxTopY = NSMaxY(f);
            }
        }
        CGFloat tlY_DIP = globalMaxTopY - (rect.origin.y + rect.size.height);
        CGFloat tlX_DIP = rect.origin.x;
        NSInteger pxX = llround(tlX_DIP * scale);
        NSInteger pxY = llround(tlY_DIP * scale);
        NSInteger pxW = llround(MAX((CGFloat)1.0, rect.size.width * scale));
        NSInteger pxH = llround(MAX((CGFloat)1.0, rect.size.height * scale));

        gCaretTSFN.BlockingCall([=](Napi::Env env, Napi::Function jsCallback) {
            Napi::Object out = Napi::Object::New(env);
            out.Set("x", Napi::Number::New(env, (double)pxX));
            out.Set("y", Napi::Number::New(env, (double)pxY));
            out.Set("width", Napi::Number::New(env, (double)pxW));
            out.Set("height", Napi::Number::New(env, (double)pxH));
            out.Set("scale", Napi::Number::New(env, scale));
            jsCallback.Call({ out });
        });
    }
}

static bool ComputeCaretRect(CGRect* outRect, CGFloat* outScale) {
    if (!HasAccessibilityPermissions()) return false;
    AXUIElementRef systemWide = AXUIElementCreateSystemWide();
    AXUIElementRef focusedElement = NULL;
    AXError err = AXUIElementCopyAttributeValue(systemWide, kAXFocusedUIElementAttribute, (CFTypeRef*)&focusedElement);
    if (err != kAXErrorSuccess || !focusedElement) {
        if (systemWide) CFRelease(systemWide);
        return false;
    }

    AXValueRef selectedRangeValue = NULL;
    err = AXUIElementCopyAttributeValue(focusedElement, kAXSelectedTextRangeAttribute, (CFTypeRef*)&selectedRangeValue);
    if (err != kAXErrorSuccess || !selectedRangeValue) {
        if (selectedRangeValue) CFRelease(selectedRangeValue);
        CFRelease(focusedElement);
        CFRelease(systemWide);
        return false;
    }
    CFRange selectedRange;
    if (AXValueGetType(selectedRangeValue) != kAXValueCFRangeType || !AXValueGetValue(selectedRangeValue, (AXValueType)kAXValueCFRangeType, &selectedRange)) {
        CFRelease(selectedRangeValue);
        CFRelease(focusedElement);
        CFRelease(systemWide);
        return false;
    }

    CFRange caretRange = CFRangeMake(selectedRange.location + selectedRange.length, 0);
    AXValueRef caretRangeValue = AXValueCreate((AXValueType)kAXValueCFRangeType, &caretRange);

    AXValueRef rectValue = NULL;
    err = AXUIElementCopyParameterizedAttributeValue(focusedElement, kAXBoundsForRangeParameterizedAttribute, caretRangeValue, (CFTypeRef*)&rectValue);
    if (caretRangeValue) CFRelease(caretRangeValue);
    CFRelease(selectedRangeValue);

    if (err != kAXErrorSuccess || !rectValue || AXValueGetType(rectValue) != kAXValueCGRectType) {
        if (rectValue) CFRelease(rectValue);
        CFRelease(focusedElement);
        CFRelease(systemWide);
        return false;
    }

    CGRect rect;
    AXValueGetValue(rectValue, (AXValueType)kAXValueCGRectType, &rect);
    CFRelease(rectValue);

    // Offset by element position if provided
    AXValueRef elementPosValue = NULL;
    if (AXUIElementCopyAttributeValue(focusedElement, kAXPositionAttribute, (CFTypeRef*)&elementPosValue) == kAXErrorSuccess && elementPosValue && AXValueGetType(elementPosValue) == kAXValueCGPointType) {
        CGPoint pos;
        AXValueGetValue(elementPosValue, (AXValueType)kAXValueCGPointType, &pos);
        rect.origin.x += pos.x;
        rect.origin.y += pos.y;
    }
    if (elementPosValue) CFRelease(elementPosValue);

    // Determine scale for the screen containing the rect
    CGFloat scale = 1.0;
    for (NSScreen* screen in [NSScreen screens]) {
        NSRect f = [screen frame];
        NSPoint p = NSMakePoint(rect.origin.x, rect.origin.y);
        if (NSPointInRect(p, f)) {
            scale = [screen backingScaleFactor];
            break;
        }
    }

    if (outRect) *outRect = rect;
    if (outScale) *outScale = scale;

    CFRelease(focusedElement);
    CFRelease(systemWide);
    return true;
}

static void CaretObserverCallback(AXObserverRef observer, AXUIElementRef element, CFStringRef notification, void* refcon) {
    CGRect rect;
    CGFloat scale = 1.0;
    if (ComputeCaretRect(&rect, &scale)) {
        SendCaretRectToJS(rect, scale);
    }
}

Napi::Value StartCaretObserver(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Expected callback function").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }

    if (!HasAccessibilityPermissions()) {
        return Napi::Boolean::New(env, false);
    }

    if (gCaretObserver) {
        // Already running
        return Napi::Boolean::New(env, true);
    }

    Napi::Function cb = info[0].As<Napi::Function>();
    gCaretTSFN = Napi::ThreadSafeFunction::New(env, cb, "CaretObserverCB", 0, 1);

    AXUIElementRef systemWide = AXUIElementCreateSystemWide();
    AXUIElementRef appRef = NULL;
    if (AXUIElementCopyAttributeValue(systemWide, kAXFocusedApplicationAttribute, (CFTypeRef*)&appRef) != kAXErrorSuccess || !appRef) {
        if (systemWide) CFRelease(systemWide);
        return Napi::Boolean::New(env, false);
    }

    pid_t pid = 0;
    AXUIElementGetPid(appRef, &pid);
    AXObserverRef observer = NULL;
    if (AXObserverCreate(pid, CaretObserverCallback, &observer) != kAXErrorSuccess || !observer) {
        CFRelease(appRef);
        CFRelease(systemWide);
        return Napi::Boolean::New(env, false);
    }

    AXObserverAddNotification(observer, appRef, kAXSelectedTextChangedNotification, NULL);
    AXObserverAddNotification(observer, appRef, kAXFocusedUIElementChangedNotification, NULL);
    CFRunLoopAddSource(CFRunLoopGetCurrent(), AXObserverGetRunLoopSource(observer), kCFRunLoopDefaultMode);

    // Save globals
    gCaretObserver = observer;
    gObservedApp = appRef;
    CFRelease(systemWide);

    // Emit an initial caret rect if available
    CGRect rect; CGFloat scale = 1.0;
    if (ComputeCaretRect(&rect, &scale)) {
        SendCaretRectToJS(rect, scale);
    }

    return Napi::Boolean::New(env, true);
}

Napi::Value StopCaretObserver(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (gCaretObserver) {
        CFRunLoopRemoveSource(CFRunLoopGetCurrent(), AXObserverGetRunLoopSource(gCaretObserver), kCFRunLoopDefaultMode);
        if (gObservedApp) {
            AXObserverRemoveNotification(gCaretObserver, gObservedApp, kAXSelectedTextChangedNotification);
            AXObserverRemoveNotification(gCaretObserver, gObservedApp, kAXFocusedUIElementChangedNotification);
            CFRelease(gObservedApp);
            gObservedApp = NULL;
        }
        CFRelease(gCaretObserver);
        gCaretObserver = NULL;
    }
    if (gCaretTSFN) {
        gCaretTSFN.Release();
        gCaretTSFN = nullptr;
    }
    return Napi::Boolean::New(env, true);
}