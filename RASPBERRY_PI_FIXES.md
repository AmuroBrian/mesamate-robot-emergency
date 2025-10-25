# Raspberry Pi Stability Fixes

## Issues Fixed

### 1. **White Screen / VSync Errors**
- **Problem**: `GetVSyncParametersIfAvailable() failed` errors caused white screens
- **Solution**: 
  - Disabled GPU acceleration for Linux ARM
  - Forced EGL rendering
  - Disabled hardware compositing and 2D canvas acceleration
  - Added X11 ozone platform hint
  - Enabled in-process GPU to reduce IPC overhead

### 2. **Renderer Process Crashes (exitCode: 5)**
- **Problem**: Renderer crashed during robot movement with `reason: 'crashed', exitCode: 5`
- **Solution**:
  - Disabled sandbox mode (common Pi issue with Chromium)
  - Added auto-reload on renderer crash
  - Wrapped app in React Error Boundary
  - Added comprehensive error logging

### 3. **Black Screen During Robot Delivery**
- **Problem**: Screen went black after first robot movement
- **Solution**:
  - Added keepalive heartbeat during Arduino operations (100ms interval)
  - Reduced Arduino timeout from 8+ seconds to max 6 seconds
  - Added try-catch around all Arduino IPC calls
  - Disabled background throttling
  - Prevented display sleep with powerSaveBlocker

## Changes Made

### Main Process (`main/background.ts`)
```typescript
// Auto-detect Linux ARM and apply stability flags
- GPU acceleration disabled
- EGL renderer forced
- No sandbox mode
- In-process GPU
- Ozone X11 platform hint
- Power save blocker to prevent display sleep
- Auto-reload on renderer crash
- Comprehensive crash logging
```

### Renderer (`renderer/`)
- **Error Boundary** in `_app.tsx`: Catches React errors and provides reload button
- **Keepalive Heartbeat** in `DeliverySystem.tsx`: Prevents renderer freeze during long Arduino operations
- **Better Error Handling**: All Arduino IPC calls wrapped in try-catch

### Arduino Communication (`main/arduino-communication.ts`)
- Reduced timeout from 8+ seconds to max 6 seconds
- Proper cleanup of callbacks on timeout
- Better error propagation

## Testing Instructions

### 1. Pre-flight Check
```bash
# Ensure GPIO memory is allocated
sudo raspi-config
# Navigate to: Advanced Options → Memory Split → Set to 256 MB
# Reboot
sudo reboot
```

### 2. Run Development Server
```bash
cd /path/to/mesamate-robot
npm run dev
```

### 3. Monitor Logs
Watch the console for:
- ✅ "Arduino connected successfully" (if Arduino is plugged in)
- ✅ Display detection logs
- ❌ "Renderer process gone" errors
- ❌ "Renderer became unresponsive" warnings

### 4. Test Robot Delivery
1. Select one or more tables
2. Start delivery
3. Verify:
   - Window stays visible (no black screen)
   - Robot moves without crashing renderer
   - Console shows movement logs
   - If crash occurs, auto-reload should recover

### 5. Expected Console Output
```
[Display: EVENT] Displays updated, count: 1
[Display: EVENT] Display[33] bounds=[0,0 1024x600]
Arduino connected successfully
Moving 24 inches at normal speed
Command sent: MOVE_DISTANCE:24.00
Movement completed with result: SUCCESS (or TIMEOUT)
```

## Troubleshooting

### If window still doesn't appear:
```bash
# Force X11 mode
ELECTRON_OZONE_PLATFORM_HINT=x11 npm run dev

# Enable verbose logging
ELECTRON_ENABLE_LOGGING=1 npm run dev
```

### If renderer still crashes:
Check console for "Renderer process gone: { reason, exitCode }":
- **exitCode 5**: Usually sandbox/GPU issues → already fixed
- **exitCode 1**: Memory exhaustion → reduce concurrent operations
- **exitCode 11**: Segfault → GPU driver issue, try software rendering

### If Arduino doesn't connect:
```bash
# List serial ports
ls -la /dev/ttyUSB* /dev/ttyACM*

# Check permissions
sudo usermod -a -G dialout $USER
# Log out and back in
```

### If screen still goes black:
1. Check if it's actual crash: `ps aux | grep electron`
2. If running, it might be display sleep:
   ```bash
   # Disable screen blanking
   xset s off
   xset -dpms
   xset s noblank
   ```

## Performance Tips

1. **Reduce Resolution**: Run at 720p instead of 1080p for better performance
2. **Close Background Apps**: Free up RAM and CPU
3. **Use Lite OS**: Raspberry Pi OS Lite + minimal X server is faster
4. **Overclock** (if cooling permits):
   ```bash
   sudo raspi-config
   # Performance Options → Overclock
   ```

## Known Limitations

- **No Hardware Acceleration**: Animations may be less smooth
- **Slower Rendering**: Expect 1-2 second delays on page transitions
- **Memory Constrained**: Avoid opening DevTools in production
- **Serial Latency**: Arduino commands have 100-200ms IPC overhead

## Rollback

If issues persist, you can revert to basic Electron without Pi optimizations:

In `main/background.ts`, comment out the Linux ARM detection block:
```typescript
// if (isLinuxArm) { ... }
```

Then restart the dev server.

