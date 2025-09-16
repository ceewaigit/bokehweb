"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EffectType = exports.KeystrokePosition = exports.ZoomFollowStrategy = exports.CursorStyle = exports.AnnotationType = exports.ScreenEffectPreset = exports.BackgroundType = exports.QualityLevel = exports.ExportFormat = exports.RecordingSourceType = exports.TransitionType = exports.TimelineTrackType = exports.TrackType = exports.AudioInput = exports.RecordingArea = void 0;
var RecordingArea;
(function (RecordingArea) {
    RecordingArea["Fullscreen"] = "fullscreen";
    RecordingArea["Window"] = "window";
    RecordingArea["Region"] = "region";
})(RecordingArea || (exports.RecordingArea = RecordingArea = {}));
var AudioInput;
(function (AudioInput) {
    AudioInput["System"] = "system";
    AudioInput["Microphone"] = "microphone";
    AudioInput["Both"] = "both";
    AudioInput["None"] = "none";
})(AudioInput || (exports.AudioInput = AudioInput = {}));
// Re-export enums
var project_1 = require("./project");
Object.defineProperty(exports, "TrackType", { enumerable: true, get: function () { return project_1.TrackType; } });
Object.defineProperty(exports, "TimelineTrackType", { enumerable: true, get: function () { return project_1.TimelineTrackType; } });
Object.defineProperty(exports, "TransitionType", { enumerable: true, get: function () { return project_1.TransitionType; } });
Object.defineProperty(exports, "RecordingSourceType", { enumerable: true, get: function () { return project_1.RecordingSourceType; } });
Object.defineProperty(exports, "ExportFormat", { enumerable: true, get: function () { return project_1.ExportFormat; } });
Object.defineProperty(exports, "QualityLevel", { enumerable: true, get: function () { return project_1.QualityLevel; } });
Object.defineProperty(exports, "BackgroundType", { enumerable: true, get: function () { return project_1.BackgroundType; } });
Object.defineProperty(exports, "ScreenEffectPreset", { enumerable: true, get: function () { return project_1.ScreenEffectPreset; } });
Object.defineProperty(exports, "AnnotationType", { enumerable: true, get: function () { return project_1.AnnotationType; } });
Object.defineProperty(exports, "CursorStyle", { enumerable: true, get: function () { return project_1.CursorStyle; } });
Object.defineProperty(exports, "ZoomFollowStrategy", { enumerable: true, get: function () { return project_1.ZoomFollowStrategy; } });
Object.defineProperty(exports, "KeystrokePosition", { enumerable: true, get: function () { return project_1.KeystrokePosition; } });
// Re-export effect types
var effects_1 = require("./effects");
Object.defineProperty(exports, "EffectType", { enumerable: true, get: function () { return effects_1.EffectType; } });
