"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EffectLayerType = exports.EffectType = void 0;
// Enum for all effect types - single source of truth
var EffectType;
(function (EffectType) {
    EffectType["Zoom"] = "zoom";
    EffectType["Cursor"] = "cursor";
    EffectType["Keystroke"] = "keystroke";
    EffectType["Background"] = "background";
    EffectType["Annotation"] = "annotation";
    EffectType["Screen"] = "screen";
})(EffectType || (exports.EffectType = EffectType = {}));
// Enum for effect layer types (subset of effects that appear in the sidebar)
var EffectLayerType;
(function (EffectLayerType) {
    EffectLayerType["Zoom"] = "zoom";
    EffectLayerType["Cursor"] = "cursor";
    EffectLayerType["Background"] = "background";
    EffectLayerType["Screen"] = "screen";
})(EffectLayerType || (exports.EffectLayerType = EffectLayerType = {}));
