"use strict";
/**
 * Project format for non-destructive editing
 * Keeps original recordings separate from effects metadata
 *
 * This file contains ONLY type definitions - no business logic
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MouseButton = exports.KeystrokePosition = exports.ZoomFollowStrategy = exports.CursorStyle = exports.AnnotationType = exports.ScreenEffectPreset = exports.BackgroundType = exports.QualityLevel = exports.ExportFormat = exports.RecordingSourceType = exports.TransitionType = exports.TimelineTrackType = exports.TrackType = exports.EffectType = void 0;
var effects_1 = require("./effects");
Object.defineProperty(exports, "EffectType", { enumerable: true, get: function () { return effects_1.EffectType; } });
// Enums for various types
var TrackType;
(function (TrackType) {
    TrackType["Video"] = "video";
    TrackType["Audio"] = "audio";
    TrackType["Annotation"] = "annotation";
})(TrackType || (exports.TrackType = TrackType = {}));
// Timeline display track types (includes effect lanes)
var TimelineTrackType;
(function (TimelineTrackType) {
    TimelineTrackType["Video"] = "video";
    TimelineTrackType["Audio"] = "audio";
    TimelineTrackType["Zoom"] = "zoom";
    TimelineTrackType["Keystroke"] = "keystroke";
})(TimelineTrackType || (exports.TimelineTrackType = TimelineTrackType = {}));
var TransitionType;
(function (TransitionType) {
    TransitionType["Fade"] = "fade";
    TransitionType["Dissolve"] = "dissolve";
    TransitionType["Wipe"] = "wipe";
    TransitionType["Slide"] = "slide";
})(TransitionType || (exports.TransitionType = TransitionType = {}));
var RecordingSourceType;
(function (RecordingSourceType) {
    RecordingSourceType["Screen"] = "screen";
    RecordingSourceType["Window"] = "window";
    RecordingSourceType["Area"] = "area";
})(RecordingSourceType || (exports.RecordingSourceType = RecordingSourceType = {}));
var ExportFormat;
(function (ExportFormat) {
    ExportFormat["MP4"] = "mp4";
    ExportFormat["MOV"] = "mov";
    ExportFormat["WEBM"] = "webm";
    ExportFormat["GIF"] = "gif";
})(ExportFormat || (exports.ExportFormat = ExportFormat = {}));
var QualityLevel;
(function (QualityLevel) {
    QualityLevel["Low"] = "low";
    QualityLevel["Medium"] = "medium";
    QualityLevel["High"] = "high";
    QualityLevel["Ultra"] = "ultra";
    QualityLevel["Custom"] = "custom";
})(QualityLevel || (exports.QualityLevel = QualityLevel = {}));
// Background type enum
var BackgroundType;
(function (BackgroundType) {
    BackgroundType["None"] = "none";
    BackgroundType["Color"] = "color";
    BackgroundType["Gradient"] = "gradient";
    BackgroundType["Image"] = "image";
    BackgroundType["Wallpaper"] = "wallpaper";
})(BackgroundType || (exports.BackgroundType = BackgroundType = {}));
// Screen effect preset enum
var ScreenEffectPreset;
(function (ScreenEffectPreset) {
    ScreenEffectPreset["Subtle"] = "subtle";
    ScreenEffectPreset["Medium"] = "medium";
    ScreenEffectPreset["Dramatic"] = "dramatic";
    ScreenEffectPreset["Window"] = "window";
    ScreenEffectPreset["Cinematic"] = "cinematic";
    ScreenEffectPreset["Hero"] = "hero";
    ScreenEffectPreset["Isometric"] = "isometric";
    ScreenEffectPreset["Flat"] = "flat";
    ScreenEffectPreset["TiltLeft"] = "tilt-left";
    ScreenEffectPreset["TiltRight"] = "tilt-right";
})(ScreenEffectPreset || (exports.ScreenEffectPreset = ScreenEffectPreset = {}));
// Annotation type enum
var AnnotationType;
(function (AnnotationType) {
    AnnotationType["Text"] = "text";
    AnnotationType["Arrow"] = "arrow";
    AnnotationType["Highlight"] = "highlight";
    AnnotationType["Keyboard"] = "keyboard";
})(AnnotationType || (exports.AnnotationType = AnnotationType = {}));
// Cursor style enum
var CursorStyle;
(function (CursorStyle) {
    CursorStyle["Default"] = "default";
    CursorStyle["MacOS"] = "macOS";
    CursorStyle["Custom"] = "custom";
})(CursorStyle || (exports.CursorStyle = CursorStyle = {}));
// Zoom follow strategy enum
var ZoomFollowStrategy;
(function (ZoomFollowStrategy) {
    ZoomFollowStrategy["Mouse"] = "mouse";
})(ZoomFollowStrategy || (exports.ZoomFollowStrategy = ZoomFollowStrategy = {}));
// Keystroke position enum
var KeystrokePosition;
(function (KeystrokePosition) {
    KeystrokePosition["BottomCenter"] = "bottom-center";
    KeystrokePosition["BottomRight"] = "bottom-right";
    KeystrokePosition["TopCenter"] = "top-center";
})(KeystrokePosition || (exports.KeystrokePosition = KeystrokePosition = {}));
var MouseButton;
(function (MouseButton) {
    MouseButton["Left"] = "left";
    MouseButton["Right"] = "right";
    MouseButton["Middle"] = "middle";
})(MouseButton || (exports.MouseButton = MouseButton = {}));
