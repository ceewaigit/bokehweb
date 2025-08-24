{
  "targets": [
    {
      "target_name": "cursor_detector",
      "sources": [ "electron/native/cursor-detector.mm" ],
      "include_dirs": [
        "./node_modules/node-addon-api"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "10.15",
        "OTHER_CPLUSPLUSFLAGS": [
          "-std=c++17",
          "-stdlib=libc++"
        ]
      },
      "conditions": [
        ["OS=='mac'", {
          "sources": [ "electron/native/cursor-detector.mm" ],
          "link_settings": {
            "libraries": [
              "-framework AppKit",
              "-framework Foundation"
            ]
          }
        }]
      ],
      "msvs_settings": {
        "VCCLCompilerTool": { "ExceptionHandling": 1 }
      }
    },
    {
      "target_name": "screen_recorder",
      "sources": [ 
        "electron/native/screen-recorder.mm",
        "electron/native/ScreenRecorder.swift"
      ],
      "include_dirs": [
        "./node_modules/node-addon-api"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "13.0",
        "SWIFT_VERSION": "5.0",
        "CLANG_ENABLE_MODULES": "YES",
        "SWIFT_OBJC_BRIDGING_HEADER": "electron/native/ScreenRecorder-Bridging-Header.h",
        "OTHER_CPLUSPLUSFLAGS": [
          "-std=c++17",
          "-stdlib=libc++",
          "-fobjc-arc"
        ],
        "OTHER_SWIFT_FLAGS": [
          "-parse-as-library"
        ]
      },
      "conditions": [
        ["OS=='mac'", {
          "link_settings": {
            "libraries": [
              "-framework AppKit",
              "-framework Foundation",
              "-framework AVFoundation",
              "-framework ScreenCaptureKit",
              "-framework CoreMedia",
              "-framework CoreVideo"
            ]
          }
        }]
      ],
      "msvs_settings": {
        "VCCLCompilerTool": { "ExceptionHandling": 1 }
      }
    }
  ]
}