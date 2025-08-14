#include <napi.h>
#include <enet/enet.h>
#include <memory>
#include <vector>
#include <cstdio>
// @note bigint-safe peer id handling
#include <cstdint>
#include <atomic>

// @note reference count for global enet initialize/deinitialize
static std::atomic<uint32_t> g_enetInitCount{0};

static ENetPeer* JsValueToPeer(const Napi::Value& value, bool& outOk) {
    outOk = false;
    if (value.IsBigInt()) {
        bool lossless = false;
        uint64_t id = value.As<Napi::BigInt>().Uint64Value(&lossless);
        if (!lossless) {
            return nullptr;
        }
        outOk = true;
        return reinterpret_cast<ENetPeer*>(static_cast<uintptr_t>(id));
    }
    if (value.IsNumber()) {
        // @note legacy support (unsafe but tolerated): accept 53-bit numbers
        uint64_t id = static_cast<uint64_t>(value.As<Napi::Number>().Int64Value());
        outOk = true;
        return reinterpret_cast<ENetPeer*>(static_cast<uintptr_t>(id));
    }
    return nullptr;
}

class ENetWrapper : public Napi::ObjectWrap<ENetWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    ENetWrapper(const Napi::CallbackInfo& info);
    ~ENetWrapper();

private:
    static Napi::FunctionReference constructor;
    
    // Methods
    Napi::Value Initialize(const Napi::CallbackInfo& info);
    Napi::Value Deinitialize(const Napi::CallbackInfo& info);
    Napi::Value CreateHost(const Napi::CallbackInfo& info);
    Napi::Value DestroyHost(const Napi::CallbackInfo& info);
    Napi::Value HostService(const Napi::CallbackInfo& info);
    Napi::Value Flush(const Napi::CallbackInfo& info);
    Napi::Value Connect(const Napi::CallbackInfo& info);
    Napi::Value Disconnect(const Napi::CallbackInfo& info);
    Napi::Value SendPacket(const Napi::CallbackInfo& info);
    Napi::Value SendRawPacket(const Napi::CallbackInfo& info);
    Napi::Value SetCompression(const Napi::CallbackInfo& info);
    Napi::Value SetChecksum(const Napi::CallbackInfo& info);
    Napi::Value SetNewPacket(const Napi::CallbackInfo& info);
    
    ENetHost* host = nullptr;
    bool initialized = false;
};

Napi::FunctionReference ENetWrapper::constructor;

Napi::Object ENetWrapper::Init(Napi::Env env, Napi::Object exports) {
    Napi::HandleScope scope(env);

    Napi::Function func = DefineClass(env, "ENet", {
        InstanceMethod("initialize", &ENetWrapper::Initialize),
        InstanceMethod("deinitialize", &ENetWrapper::Deinitialize),
        InstanceMethod("createHost", &ENetWrapper::CreateHost),
        InstanceMethod("destroyHost", &ENetWrapper::DestroyHost),
        InstanceMethod("hostService", &ENetWrapper::HostService),
        InstanceMethod("flush", &ENetWrapper::Flush),
        InstanceMethod("connect", &ENetWrapper::Connect),
        InstanceMethod("disconnect", &ENetWrapper::Disconnect),
        InstanceMethod("sendPacket", &ENetWrapper::SendPacket),
        InstanceMethod("sendRawPacket", &ENetWrapper::SendRawPacket),
        InstanceMethod("setCompression", &ENetWrapper::SetCompression),
        InstanceMethod("setChecksum", &ENetWrapper::SetChecksum),
        InstanceMethod("setNewPacket", &ENetWrapper::SetNewPacket)
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();

    exports.Set("ENet", func);
    return exports;
}

ENetWrapper::ENetWrapper(const Napi::CallbackInfo& info) : Napi::ObjectWrap<ENetWrapper>(info) {
}

ENetWrapper::~ENetWrapper() {
    if (host) {
        enet_host_destroy(host);
        host = nullptr;
    }
    if (initialized) {
        initialized = false;
        if (g_enetInitCount.fetch_sub(1, std::memory_order_acq_rel) == 1) {
            enet_deinitialize();
        }
    }
}

Napi::Value ENetWrapper::Initialize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (initialized) {
        return Napi::Boolean::New(env, true);
    }
    
    if (g_enetInitCount.fetch_add(1, std::memory_order_acq_rel) == 0) {
        if (enet_initialize() != 0) {
            g_enetInitCount.fetch_sub(1, std::memory_order_acq_rel);
            Napi::TypeError::New(env, "Failed to initialize ENet").ThrowAsJavaScriptException();
            return env.Null();
        }
    }
    
    initialized = true;
    return Napi::Boolean::New(env, true);
}

Napi::Value ENetWrapper::Deinitialize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (host) {
        enet_host_destroy(host);
        host = nullptr;
    }
    
    if (initialized) {
        initialized = false;
        if (g_enetInitCount.fetch_sub(1, std::memory_order_acq_rel) == 1) {
            enet_deinitialize();
        }
    }
    
    return env.Undefined();
}

Napi::Value ENetWrapper::CreateHost(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!initialized) {
        Napi::TypeError::New(env, "ENet not initialized").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (host) {
        enet_host_destroy(host);
    }
    
    ENetAddress address;
    memset(&address, 0, sizeof(ENetAddress));
    bool isServer = false;
    
    if (info.Length() > 0 && info[0].IsObject()) {
        Napi::Object config = info[0].As<Napi::Object>();
        
        address.type = ENET_ADDRESS_TYPE_IPV4;
        
        if (config.Has("address") && config.Get("address").IsString()) {
            std::string addr = config.Get("address").As<Napi::String>().Utf8Value();
            if (enet_address_set_host_ip(&address, addr.c_str()) != 0) {
                Napi::TypeError::New(env, "Failed to set host address").ThrowAsJavaScriptException();
                return env.Null();
            }
            isServer = true;
        }
        
        if (config.Has("port") && config.Get("port").IsNumber()) {
            address.port = config.Get("port").As<Napi::Number>().Uint32Value();
            if (!isServer) {
                // If no address specified but port is, bind to all interfaces
                address.host.v4[0] = 0;
                address.host.v4[1] = 0;
                address.host.v4[2] = 0;
                address.host.v4[3] = 0;
            }
            isServer = true;
        }
    }
    
    size_t peerCount = 32;
    size_t channelLimit = 2;
    enet_uint32 incomingBandwidth = 0;
    enet_uint32 outgoingBandwidth = 0;
    
    if (info.Length() > 1 && info[1].IsObject()) {
        Napi::Object options = info[1].As<Napi::Object>();
        
        if (options.Has("peerCount")) {
            peerCount = options.Get("peerCount").As<Napi::Number>().Uint32Value();
        }
        if (options.Has("channelLimit")) {
            channelLimit = options.Get("channelLimit").As<Napi::Number>().Uint32Value();
        }
        if (options.Has("incomingBandwidth")) {
            incomingBandwidth = options.Get("incomingBandwidth").As<Napi::Number>().Uint32Value();
        }
        if (options.Has("outgoingBandwidth")) {
            outgoingBandwidth = options.Get("outgoingBandwidth").As<Napi::Number>().Uint32Value();
        }
    }
    
    host = enet_host_create(
        ENET_ADDRESS_TYPE_IPV4,
        isServer ? &address : nullptr,
        peerCount,
        channelLimit,
        incomingBandwidth,
        outgoingBandwidth
    );
    
    if (!host) {
        Napi::TypeError::New(env, "Failed to create ENet host").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    return Napi::Boolean::New(env, true);
}

Napi::Value ENetWrapper::DestroyHost(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (host) {
        enet_host_destroy(host);
        host = nullptr;
    }
    
    return env.Undefined();
}

Napi::Value ENetWrapper::HostService(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!host) {
        Napi::TypeError::New(env, "Host not created").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    enet_uint32 timeout = 0;
    if (info.Length() > 0 && info[0].IsNumber()) {
        timeout = info[0].As<Napi::Number>().Uint32Value();
    }
    
    ENetEvent event;
    int result = enet_host_service(host, &event, timeout);
    
    if (result < 0) {
        Napi::TypeError::New(env, "Error occurred during host service").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (result == 0) {
        return env.Null(); // No event
    }
    
    Napi::Object eventObj = Napi::Object::New(env);
    
    switch (event.type) {
        case ENET_EVENT_TYPE_CONNECT:
            eventObj.Set("type", "connect");
            eventObj.Set("peer", Napi::BigInt::New(env, static_cast<uint64_t>(reinterpret_cast<uintptr_t>(event.peer))));
            break;
            
        case ENET_EVENT_TYPE_DISCONNECT:
            eventObj.Set("type", "disconnect");
            eventObj.Set("peer", Napi::BigInt::New(env, static_cast<uint64_t>(reinterpret_cast<uintptr_t>(event.peer))));
            eventObj.Set("data", Napi::Number::New(env, event.data));
            break;
            
        case ENET_EVENT_TYPE_RECEIVE:
            eventObj.Set("type", "receive");
            eventObj.Set("peer", Napi::BigInt::New(env, static_cast<uint64_t>(reinterpret_cast<uintptr_t>(event.peer))));
            eventObj.Set("channelID", Napi::Number::New(env, event.channelID));
            
            // Convert packet data to Buffer
            if (event.packet) {
                auto buffer = Napi::Buffer<enet_uint8>::Copy(env, event.packet->data, event.packet->dataLength);
                eventObj.Set("data", buffer);
                enet_packet_destroy(event.packet);
            }
            break;
            
        default:
            eventObj.Set("type", "unknown");
            break;
    }
    
    return eventObj;
}

Napi::Value ENetWrapper::Flush(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!host) {
        Napi::TypeError::New(env, "Host not created").ThrowAsJavaScriptException();
        return env.Null();
    }
    enet_host_flush(host);
    return env.Undefined();
}

Napi::Value ENetWrapper::Connect(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!host) {
        Napi::TypeError::New(env, "Host not created").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "Expected address (string) and port (number)").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    std::string address = info[0].As<Napi::String>().Utf8Value();
    enet_uint16 port = info[1].As<Napi::Number>().Uint32Value();
    
    ENetAddress enetAddress;
    memset(&enetAddress, 0, sizeof(ENetAddress));
    enetAddress.type = ENET_ADDRESS_TYPE_IPV4;
    
    if (enet_address_set_host_ip(&enetAddress, address.c_str()) != 0) {
        Napi::TypeError::New(env, "Failed to set host address").ThrowAsJavaScriptException();
        return env.Null();
    }
    enetAddress.port = port;
    
    size_t channelCount = 2;
    enet_uint32 data = 0;
    
    if (info.Length() > 2 && info[2].IsNumber()) {
        channelCount = info[2].As<Napi::Number>().Uint32Value();
    }
    
    if (info.Length() > 3 && info[3].IsNumber()) {
        data = info[3].As<Napi::Number>().Uint32Value();
    }
    
    ENetPeer* peer = enet_host_connect(host, &enetAddress, channelCount, data);
    
    if (!peer) {
        Napi::TypeError::New(env, "Failed to connect").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    return Napi::BigInt::New(env, static_cast<uint64_t>(reinterpret_cast<uintptr_t>(peer)));
}

Napi::Value ENetWrapper::Disconnect(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !(info[0].IsBigInt() || info[0].IsNumber())) {
        Napi::TypeError::New(env, "Expected peer ID (bigint or number)").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    bool ok = false;
    ENetPeer* peer = JsValueToPeer(info[0], ok);
    if (!ok || !peer) {
        Napi::TypeError::New(env, "Invalid peer id").ThrowAsJavaScriptException();
        return env.Null();
    }
    enet_uint32 data = 0;
    
    if (info.Length() > 1 && info[1].IsNumber()) {
        data = info[1].As<Napi::Number>().Uint32Value();
    }
    
    enet_peer_disconnect(peer, data);
    return env.Undefined();
}

Napi::Value ENetWrapper::SendPacket(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 3 || !(info[0].IsBigInt() || info[0].IsNumber()) || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "Expected peer ID (bigint), channel ID, and data").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    bool ok = false;
    ENetPeer* peer = JsValueToPeer(info[0], ok);
    if (!ok || !peer) {
        Napi::TypeError::New(env, "Invalid peer id").ThrowAsJavaScriptException();
        return env.Null();
    }
    enet_uint8 channelID = info[1].As<Napi::Number>().Uint32Value();
    
    enet_uint32 flags = ENET_PACKET_FLAG_RELIABLE;
    if (info.Length() > 3 && info[3].IsNumber()) {
        flags = info[3].As<Napi::Number>().Uint32Value();
    }
    // @note disallow NO_ALLOCATE to avoid unsafe zero-copy from JS memory
    flags &= ~ENET_PACKET_FLAG_NO_ALLOCATE;
    
    ENetPacket* packet = nullptr;
    
    if (info[2].IsBuffer()) {
        Napi::Buffer<enet_uint8> buffer = info[2].As<Napi::Buffer<enet_uint8>>();
        packet = enet_packet_create(buffer.Data(), buffer.Length(), flags);
    } else if (info[2].IsString()) {
        std::string str = info[2].As<Napi::String>().Utf8Value();
        // Create packet with ENET_PACKET_FLAG_RELIABLE which copies the data
        packet = enet_packet_create(str.c_str(), str.length(), flags);
    } else {
        Napi::TypeError::New(env, "Data must be a Buffer or string").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!packet) {
        Napi::TypeError::New(env, "Failed to create packet").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    int result = enet_peer_send(peer, channelID, packet);
    if (result < 0) {
        enet_packet_destroy(packet);
    }
    return Napi::Number::New(env, result);
}

Napi::Value ENetWrapper::SendRawPacket(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 3 || !(info[0].IsBigInt() || info[0].IsNumber()) || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "Expected peer ID (bigint), channel ID, and data").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    bool ok = false;
    ENetPeer* peer = JsValueToPeer(info[0], ok);
    if (!ok || !peer) {
        Napi::TypeError::New(env, "Invalid peer id").ThrowAsJavaScriptException();
        return env.Null();
    }
    enet_uint8 channelID = info[1].As<Napi::Number>().Uint32Value();
    
    enet_uint32 flags = ENET_PACKET_FLAG_RELIABLE;
    if (info.Length() > 3 && info[3].IsNumber()) {
        flags = info[3].As<Napi::Number>().Uint32Value();
    }
    // @note disallow NO_ALLOCATE to avoid unsafe zero-copy from JS memory
    flags &= ~ENET_PACKET_FLAG_NO_ALLOCATE;
    
    ENetPacket* packet = nullptr;
    
    if (info[2].IsBuffer()) {
        Napi::Buffer<enet_uint8> buffer = info[2].As<Napi::Buffer<enet_uint8>>();
        // Create packet directly from raw buffer data - this is the "raw" functionality
        packet = enet_packet_create(buffer.Data(), buffer.Length(), flags);
    } else if (info[2].IsTypedArray()) {
        Napi::TypedArray typedArray = info[2].As<Napi::TypedArray>();
        Napi::ArrayBuffer arrayBuffer = typedArray.ArrayBuffer();
        
        // Get the raw data from the typed array
        uint8_t* data = static_cast<uint8_t*>(arrayBuffer.Data()) + typedArray.ByteOffset();
        size_t length = typedArray.ByteLength();
        
        packet = enet_packet_create(data, length, flags);
    } else if (info[2].IsArrayBuffer()) {
        Napi::ArrayBuffer arrayBuffer = info[2].As<Napi::ArrayBuffer>();
        packet = enet_packet_create(arrayBuffer.Data(), arrayBuffer.ByteLength(), flags);
    } else {
        Napi::TypeError::New(env, "Data must be a Buffer, TypedArray, or ArrayBuffer for raw packet").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (!packet) {
        Napi::TypeError::New(env, "Failed to create raw packet").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    int result = enet_peer_send(peer, channelID, packet);
    if (result < 0) {
        enet_packet_destroy(packet);
    }
    return Napi::Number::New(env, result);
}

Napi::Value ENetWrapper::SetCompression(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!host) {
        Napi::TypeError::New(env, "Host not created").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    bool enable = true;
    if (info.Length() > 0 && info[0].IsBoolean()) {
        enable = info[0].As<Napi::Boolean>().Value();
    }
    
    if (enable) {
        int result = enet_host_compress_with_range_coder(host);
        return Napi::Number::New(env, result);
    } else {
        enet_host_compress(host, NULL);
        return Napi::Boolean::New(env, true);
    }
}

Napi::Value ENetWrapper::SetChecksum(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!host) {
        Napi::TypeError::New(env, "Host not created").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    bool enable = true;
    if (info.Length() > 0 && info[0].IsBoolean()) {
        enable = info[0].As<Napi::Boolean>().Value();
    }
    
    if (enable) {
        host->checksum = enet_crc32;
    } else {
        host->checksum = nullptr;
    }
    
    return Napi::Boolean::New(env, true);
}

Napi::Value ENetWrapper::SetNewPacket(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!host) {
        Napi::TypeError::New(env, "Host not created").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    bool enable = false;
    bool isServer = false;
    
    if (info.Length() > 0 && info[0].IsBoolean()) {
        enable = info[0].As<Napi::Boolean>().Value();
    }
    
    if (info.Length() > 1 && info[1].IsBoolean()) {
        isServer = info[1].As<Napi::Boolean>().Value();
    }
    
    if (isServer) {
        host->usingNewPacketForServer = enable ? 1 : 0;
    } else {
        host->usingNewPacket = enable ? 1 : 0;
    }
    
    return Napi::Boolean::New(env, true);
}

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    return ENetWrapper::Init(env, exports);
}

NODE_API_MODULE(enet, InitAll)
