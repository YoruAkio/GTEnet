## Most important improvements

### Safety
- [ ] Validate `channelId` in native sends (bounds vs `channelLimit`)
- [ ] Validate `port`/`channelLimit`/inputs in JS constructors
- [ ] Add max packet size guard (configurable)

### Performance
- [ ] Adaptive polling backoff when idle; reset on activity
- [ ] Expose `flush()` (native `enet_host_flush`) and manual tick mode

### API
- [x] `off(event, handler)` and `once(event, handler)`
- [x] `broadcast(channelId, data, reliable?)`
- [x] `Client.connect({ timeoutMs })`

### Ship it (CI & prebuilds)
- [ ] Prebuilds: linux x64/arm64 (glibc+musl), darwin x64/arm64, win x64/arm64
- [ ] GitHub Actions: build/test/prebuild matrix + release artifacts

### Tests
- [ ] Integration echo (connect/receive/disconnect)
- [ ] Load + memory stability (spam small/large payloads)

### Observability
- [ ] `GTENET_DEBUG` logging with levels

### Done (key)
- [x] BigInt peer IDs (no pointer truncation)
- [x] Destroy packet on send failure
- [x] Compression can be disabled; safe flags (no NO_ALLOCATE)
- [x] Native destructor + ENet init refcount
- [x] Configurable listen() poll interval 