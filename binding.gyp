{
  "targets": [
    {
      "target_name": "enet",
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "sources": [
        "src/enet_addon.cpp",
        "enet/address.c",
        "enet/callbacks.c",
        "enet/compress.c",
        "enet/host.c",
        "enet/list.c",
        "enet/packet.c",
        "enet/peer.c",
        "enet/protocol.c",
        "enet/unix.c"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "enet/include"
      ],
      "libraries": [],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "NAPI_VERSION=6"
      ],
      "conditions": [
        ["OS=='win'", {
          "sources": ["enet/win32.c"],
          "libraries": ["winmm.lib", "ws2_32.lib"]
        }]
      ]
    }
  ]
}
