{
  "targets": [{
    "target_name": "sc_overlay_tracker",
    "sources": ["sc_overlay_tracker.cpp"],

    "include_dirs": [
      "../node_modules/node-addon-api"
    ],

    "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],

    "cflags!":    ["-fexceptions"],
    "cflags_cc!": ["-fexceptions"],

    "conditions": [
      ["OS=='win'", {
        "libraries": [
          "dwmapi.lib"
        ],
        "msvs_settings": {
          "VCCLCompilerTool": {
            "ExceptionHandling": 0
          }
        }
      }]
    ]
  }]
}
