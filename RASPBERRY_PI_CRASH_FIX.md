# Raspberry Pi Immediate Crash Fix

## Problem

The renderer crashes with **exit code 5** immediately on startup (on the welcome screen), even without any user interaction. This is a **Raspberry Pi-specific GPU/rendering issue**.

```
⚠️  Renderer crashed! Check console for errors.
   Reason: crashed
   Exit code: 5
```

## Root Cause

This is **different** from the Arduino IPC blocking issue. This crash happens because:

1. **Raspberry Pi GPU is weak** - Can't handle Chromium's default GPU acceleration
2. **Next.js Image optimization** - Uses GPU to optimize images, triggers GPU rendering
3. **CSS animations** - `animate-pulse` uses GPU-accelerated transitions
4. **Chromium expects GPU** - Even with some flags disabled, still tries to use GPU features

Exit code 5 on Raspberry Pi typically means:

- GPU rendering failed (VideoCore GPU can't handle Chromium's demands)
- Chromium security violation (GPU sandbox issues)
- Software rasterizer initialization failed

## The Fixes Applied

### Fix 1: Aggressive GPU Disabling (background.ts)

**Added comprehensive GPU disabling flags**:

```typescript
if (isLinuxArm) {
  console.log("🍓 Raspberry Pi detected - applying compatibility fixes");

  // Disable all GPU/hardware acceleration
  app.disableHardwareAcceleration();

  // Core GPU disabling
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
  app.commandLine.appendSwitch("disable-software-rasterizer");
  app.commandLine.appendSwitch("disable-gpu-rasterization");
  app.commandLine.appendSwitch("disable-gpu-sandbox");

  // Disable 2D/3D acceleration
  app.commandLine.appendSwitch("disable-accelerated-2d-canvas");
  app.commandLine.appendSwitch("disable-accelerated-video-decode");
  app.commandLine.appendSwitch("disable-accelerated-mjpeg-decode");

  // Disable WebGL
  app.commandLine.appendSwitch("disable-webgl");
  app.commandLine.appendSwitch("disable-webgl2");

  // Use software rendering
  app.commandLine.appendSwitch("use-gl", "swiftshader");

  // Disable sandbox
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-setuid-sandbox");

  // Reduce memory usage
  app.commandLine.appendSwitch("js-flags", "--max-old-space-size=512");
  app.commandLine.appendSwitch("disable-dev-shm-usage");
}
```

**What this does**:

- Forces pure software rendering (no GPU)
- Disables all WebGL and hardware acceleration
- Reduces memory footprint
- Disables sandboxing (can cause issues on ARM)

### Fix 2: Remove Next.js Image Component (home.tsx)

**Before**:

```typescript
import Image from "next/image";

<Image src="/images/logo.png" alt="MesaMate Logo" width={80} height={80} />;
```

**After**:

```typescript
// import Image from "next/image"; // Disabled - causes GPU issues on Raspberry Pi

<img
  src="/images/logo.png"
  alt="MesaMate Logo"
  width={80}
  height={80}
  style={{ display: "block" }}
/>
```

**Why**: Next.js `<Image>` component uses GPU for optimization (resizing, format conversion). Regular `<img>` doesn't.

### Fix 3: Remove CSS Animations (home.tsx)

**Before**:

```typescript
<div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
```

**After**:

```typescript
<div className="w-2 h-2 bg-gray-400 rounded-full"></div>
```

**Why**: CSS animations (`animate-pulse`) use GPU-accelerated transitions. Static styles don't.

### Fix 4: Better Crash Diagnostics (background.ts)

**Enhanced crash logging**:

```typescript
mainWindow.webContents.on("render-process-gone", (_event, details) => {
  console.error("========================================");
  console.error("❌ RENDERER PROCESS CRASHED");
  console.error("========================================");
  console.error("Exit code:", details.exitCode);

  if (details.exitCode === 5) {
    console.error("⚠️  Exit code 5: GPU/Rendering issue");
    if (isLinuxArm) {
      console.error("🍓 RASPBERRY PI DETECTED");
      console.error("   Try these system-level fixes:");
      console.error("   1. Increase GPU memory: sudo raspi-config");
      console.error("   2. Increase swap memory");
      console.error("   3. Disable desktop compositor");
      console.error("   4. Update firmware: sudo rpi-update");
    }
  }
});
```

**What this does**:

- Provides clear crash information
- Gives specific Raspberry Pi troubleshooting steps
- Doesn't auto-reload on exit code 5 (would just crash again)

### Fix 5: Longer Window Show Timeout (background.ts)

**Before**:

```typescript
setTimeout(() => {
  mainWindow.show();
}, 8000);
```

**After**:

```typescript
const forceShowTimeout = isLinuxArm ? 15000 : 8000;
setTimeout(() => {
  if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
    console.log("⚠️  Force-showing window");
    mainWindow.show();
  }
}, forceShowTimeout);
```

**Why**: Software rendering on Raspberry Pi takes longer to initialize. Give it more time.

## Files Changed

1. ✅ `main/background.ts` - Aggressive GPU disabling + better diagnostics
2. ✅ `renderer/pages/home.tsx` - Remove Next.js Image + CSS animations

## Testing the Fix

### 1. Clean and restart:

```bash
cd /Volumes/inspire/softwaredev/thesisproject/mesamate-robot

# Kill any running processes
pkill -f "npm run dev"
pkill -f "electron"

# Clear cache
rm -rf .next
rm -rf app

# Restart
npm run dev
```

### 2. Check console output:

**Should see**:

```
🍓 Raspberry Pi detected - applying compatibility fixes
✅ Raspberry Pi compatibility flags applied
✅ Window ready to show
```

**Should NOT see**:

```
❌ RENDERER PROCESS CRASHED
Exit code: 5
```

### 3. Monitor for crashes:

**If it still crashes**, the console will show:

```
========================================
❌ RENDERER PROCESS CRASHED
========================================
Exit code: 5
🍓 RASPBERRY PI DETECTED
   Try these system-level fixes:
   1. Increase GPU memory...
```

## If Still Crashing - System-Level Fixes

### Fix 1: Increase GPU Memory

```bash
sudo raspi-config
# Navigate to: Advanced Options → Memory Split
# Set to 256MB (if you have 2GB+ RAM)
# Reboot: sudo reboot
```

**Why**: Even with software rendering, Chromium needs some GPU memory for buffers.

### Fix 2: Increase Swap Memory

```bash
# Check current swap
free -h

# Increase swap to 2GB
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile
# Change: CONF_SWAPSIZE=2048
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
sudo reboot
```

**Why**: Electron uses a lot of memory. Swap prevents out-of-memory issues.

### Fix 3: Disable Desktop Compositor

```bash
# If using Raspberry Pi Desktop (X11)
sudo raspi-config
# Navigate to: Advanced Options → Compositor → Disable
# Reboot: sudo reboot
```

**Why**: Desktop compositing competes with Electron for GPU/memory resources.

### Fix 4: Run Without Desktop (Advanced)

```bash
# Switch to console mode (no X11)
sudo systemctl set-default multi-user.target
sudo reboot

# After reboot, start app from console
cd /path/to/mesamate-robot
DISPLAY=:0 npm run dev
```

**Why**: Running without X11 desktop eliminates GPU contention entirely.

### Fix 5: Update Raspberry Pi Firmware

```bash
sudo apt update
sudo apt upgrade -y
sudo rpi-update
sudo reboot
```

**Why**: Newer firmware has better GPU driver stability.

### Fix 6: Try Chromium Lite Build (Last Resort)

If nothing works, the issue might be that Electron's bundled Chromium is too heavy for your Raspberry Pi model.

**Check your RPi model**:

```bash
cat /proc/cpuinfo | grep Model
```

**Minimum recommended**: Raspberry Pi 4 with 4GB RAM

**If using RPi 3 or earlier**: Consider:

- Using a different UI framework (not Electron)
- Running the app on a more powerful device
- Using web-based UI instead (browser on RPi, app on PC)

## Expected Behavior After Fix

### ✅ Should Work:

1. **App starts without crash** - Welcome screen appears
2. **Console shows RPi detection** - "🍓 Raspberry Pi detected"
3. **No exit code 5** - Renderer stays alive
4. **UI is functional** - Can tap and navigate (may be slower than on PC)

### ⚠️ Expected Limitations:

- **Slower rendering** - Software rendering is slower than GPU
- **No animations** - Removed for stability
- **Higher CPU usage** - CPU does what GPU normally does
- **Longer load times** - More processing needed

### ❌ Still Need System Fixes If:

- Crash persists after code changes
- Exit code 5 still appears
- Console shows "GPU memory allocation failed"
- System runs out of memory

## Diagnostic Commands

### Check if app is using GPU:

```bash
# While app is running
ps aux | grep electron
# Look for --disable-gpu in the command line
```

### Check memory usage:

```bash
# While app is running
free -h
# Check if swap is being used heavily
```

### Check Electron logs:

```bash
# In terminal where npm run dev is running
# Should see:
# ✅ Raspberry Pi compatibility flags applied
# ✅ Window ready to show
```

### Check system resources:

```bash
# CPU usage (press 'q' to exit)
top

# Memory details
cat /proc/meminfo | grep -E "MemTotal|MemAvailable|SwapTotal"

# GPU memory
vcgencmd get_mem gpu
```

## Two Different Issues

| Issue                       | Cause                         | Fix                                      |
| --------------------------- | ----------------------------- | ---------------------------------------- |
| **Arduino Movement Crash**  | Blocking IPC calls (15s wait) | Non-blocking commands + setTimeout       |
| **Immediate Startup Crash** | Raspberry Pi GPU rendering    | Software rendering + remove GPU features |

**Both fixes are now applied!**

## Summary

The immediate crash on Raspberry Pi is caused by GPU rendering issues. Fixed by:

1. ✅ Aggressive GPU disabling in Electron
2. ✅ Removing Next.js Image component (GPU optimization)
3. ✅ Removing CSS animations (GPU acceleration)
4. ✅ Better crash diagnostics
5. ✅ Longer initialization timeout

**If still crashing after these code changes**, you need system-level fixes:

- Increase GPU memory (256MB)
- Increase swap (2GB)
- Disable desktop compositor
- Update firmware

The app will run slower on Raspberry Pi (software rendering), but it should **not crash**.

---

**Test it**: `npm run dev` and watch the console output. Should see "🍓 Raspberry Pi detected" and no crash.
