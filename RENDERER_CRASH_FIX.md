# Renderer Crash Fix - "Back to Start Page" Issue

## Problem Description

**Symptom**: When the robot starts moving, the UI automatically goes back to the start page (like refreshing the app itself).

**Root Cause**: The renderer process was crashing during robot movement, and the auto-reload mechanism in `background.ts` was recovering by reloading the home page, causing loss of delivery state.

## Why Was the Renderer Crashing?

### 1. **Race Conditions in moveRobot()**

The `moveRobot()` function is async and takes 10+ seconds to complete (due to Arduino operations). However, the useEffect that triggers it was re-firing while the function was still running, causing:

- Multiple concurrent `moveRobot()` calls
- State updates happening in unpredictable order
- Memory leaks from uncanceled intervals
- Stale closures accessing old state

### 2. **State Updates After Unmount**

If the component unmounted (due to crash or navigation) while `moveRobot()` was still running, React would throw errors when trying to update state on an unmounted component, causing a crash cascade.

### 3. **Missing Dependencies in useEffect**

The useEffect had `moveRobot` and other closures in its dependency array implicitly (ESLint warnings), causing:

- Effect re-running on every render
- Creating new timers before old ones completed
- Accumulating scheduled calls

### 4. **Auto-Reload Loop**

When renderer crashed:
1. `render-process-gone` event fired
2. Auto-reload mechanism reloaded the home page
3. Lost all delivery state
4. User saw "back to start page" behavior
5. If crash persisted, created infinite reload loop

## Solutions Implemented

### 1. **Race Condition Prevention**

Added `isMovingRef` to prevent concurrent `moveRobot()` calls:

```typescript
// Ref to prevent multiple concurrent moveRobot calls
const isMovingRef = React.useRef(false);

const moveRobot = async () => {
  // Prevent concurrent calls
  if (isMovingRef.current) {
    console.log('moveRobot already in progress, skipping');
    return;
  }
  
  isMovingRef.current = true;
  
  try {
    // ... movement logic ...
  } finally {
    // Always clear the moving flag when done
    isMovingRef.current = false;
  }
};
```

**Benefits**:
- Only one `moveRobot()` call can run at a time
- Prevents state corruption from concurrent updates
- Ensures proper cleanup with finally block

### 2. **Mount Status Tracking**

Added `isMountedRef` to prevent state updates after unmount:

```typescript
const isMountedRef = React.useRef(true);

// Track component mount status
useEffect(() => {
  isMountedRef.current = true;
  return () => {
    isMountedRef.current = false;
  };
}, []);

// Check before state updates
if (!isMountedRef.current) {
  console.log('Component unmounted, skipping state update');
  return;
}
```

**Benefits**:
- Prevents "setState on unmounted component" errors
- Gracefully handles mid-operation crashes
- No memory leaks from pending state updates

### 3. **Fixed useEffect Dependencies**

Simplified useEffect to only trigger on meaningful changes:

```typescript
useEffect(() => {
  if (
    deliveryState.isMoving &&
    deliveryState.deliveryStatus === "moving" &&
    !obstructed &&
    !isMovingRef.current // Don't trigger if already moving
  ) {
    const timer = setTimeout(() => {
      if (!isMovingRef.current && isMountedRef.current) {
        moveRobot();
      }
    }, arduinoConnected ? 10000 : 2000);

    return () => clearTimeout(timer);
  }
}, [
  deliveryState.currentStep, // Only trigger on step changes
  deliveryState.isMoving,
  deliveryState.deliveryStatus,
  obstructed,
]);
```

**Benefits**:
- Effect only fires when step actually changes
- Double-checks refs before calling `moveRobot()`
- Properly cleans up timers on unmount
- No more accumulating scheduled calls

### 4. **Disabled Aggressive Auto-Reload**

Modified crash recovery to not auto-reload on actual crashes:

```typescript
mainWindow.webContents.on('render-process-gone', (_event, details) => {
  console.error('Renderer process gone:', details)
  // Log crash details but DON'T auto-reload since it loses delivery state
  console.error('⚠️  Renderer crashed! Check console for errors.')
  
  // Only auto-reload on clean exits (not crashes)
  if (details.exitCode === 0 && !mainWindow.isDestroyed()) {
    console.log('Clean exit detected, reloading...')
    // ... reload logic ...
  }
})
```

**Benefits**:
- Preserves crash logs for debugging
- Doesn't lose delivery state on crash
- User can see what went wrong
- Prevents infinite reload loops

## Changes Summary

### Files Modified:

#### 1. `renderer/components/DeliverySystem.tsx`
- Added `isMovingRef` to prevent concurrent movement calls
- Added `isMountedRef` to track component mount status
- Wrapped `moveRobot()` in try-finally with proper cleanup
- Added mount checks before all state updates
- Fixed useEffect dependencies
- Protected `confirmDelivery()` with same checks

#### 2. `main/background.ts`
- Disabled auto-reload on renderer crashes
- Only auto-reload on clean exits (exitCode 0)
- Added detailed crash logging
- Preserves delivery state on crash

## Testing the Fix

### Step 1: Clean Build
```bash
cd /Volumes/inspire/softwaredev/thesisproject/mesamate-robot
npm run dev
```

### Step 2: Monitor Console

**Look for these logs in DevTools console:**

✅ **Good (no crash):**
```
Scheduling moveRobot for step 0
Moving from (2, 4) to (2, 3)
Turn angle: 0°, Target direction: up
Moving forward 24 inches (now facing up)
Movement completed
```

✅ **Protection working:**
```
moveRobot already in progress, skipping
(multiple calls prevented)
```

✅ **Graceful unmount:**
```
Component unmounted, skipping state update
Clearing moveRobot timer
```

❌ **If you see crashes:**
```
Renderer process gone: { reason: 'crashed', exitCode: 5 }
⚠️  Renderer crashed! Check console for errors.
```

### Step 3: Test Scenarios

1. **Normal delivery** - Should complete without going back to start
2. **Cancel mid-delivery** - Should clean up properly
3. **Arduino timeout** - Should handle gracefully without crash
4. **Rapid navigation** - Should not accumulate calls

## Expected Behavior After Fix

### ✅ What Should Happen:

- Delivery continues smoothly without resets
- UI stays on delivery page during robot movement
- Console shows "Scheduling moveRobot" and "moveRobot already in progress"
- State updates happen in correct order
- Canceling delivery cleans up properly

### ❌ What Should NOT Happen:

- UI jumping back to start/welcome page
- Multiple "Scheduling moveRobot" without "already in progress" (indicates race)
- "setState on unmounted component" warnings
- Renderer crash/reload during movement

## Diagnostic Commands

### Check for Race Conditions:
Open DevTools console during delivery:

```javascript
// Should see protection messages
// "moveRobot already in progress, skipping"
```

### Check Component Mount Status:
```javascript
// After canceling delivery, should see:
// "Component unmounted, skipping state update"
// "Clearing moveRobot timer"
```

### Monitor Main Process:
In terminal where `npm run dev` is running:

```bash
# Look for crash logs
# Should NOT see:
# "Renderer process gone: { reason: 'crashed' }"

# If you do see crashes, check the exitCode:
# - exitCode 5: GPU/sandbox issue (should be fixed by Pi optimizations)
# - exitCode 1: Out of memory
# - exitCode 11: Segfault (serious, need to investigate)
```

## Troubleshooting

### Issue: Still Going Back to Start Page

**Possible causes:**

1. **Renderer still crashing** (but now without auto-reload)
   - Check main process console for crash logs
   - Look for exitCode in crash details
   - Check DevTools console for React errors

2. **Navigation happening in code**
   - Search codebase for `router.push` or `window.location`
   - Check if error boundary is triggering reload

3. **Next.js hot reload** (dev mode only)
   - Save a file triggers hot reload
   - Disable auto-save in editor during testing
   - Try production build: `npm run build && npm start`

### Issue: Component Unmounted Messages But Still Moving

This is GOOD - it means:
- Component is cleaning up properly
- State updates are being prevented
- No memory leaks occurring

The robot will continue moving (Arduino commands already sent) but the UI won't crash trying to update state.

### Issue: Movement Gets Stuck

Check console for:
```
moveRobot already in progress, skipping
moveRobot already in progress, skipping
(repeating indefinitely)
```

This means `isMovingRef.current` never got cleared. Possible causes:
- Exception thrown before `finally` block (should not happen with our code)
- Arduino command hanging indefinitely
- Component unmounted before `finally` runs

**Fix**: Refresh the page or send reset command:
```javascript
await window.robot.reset()
```

## Additional Safety Measures

### Already Implemented (from previous fixes):

1. **Global error handlers** (`_app.tsx`) - Catch unhandled rejections
2. **Error boundary** (`_app.tsx`) - Catch React errors
3. **Safe IPC wrapper** (`preload.ts`) - Prevent IPC failures
4. **Keepalive heartbeat** (`DeliverySystem.tsx`) - Keep renderer responsive
5. **Response validation** - Check Arduino command results

### New in This Fix:

6. **Race condition prevention** - isMovingRef guard
7. **Mount status tracking** - isMountedRef checks
8. **Proper useEffect dependencies** - No stale closures
9. **Controlled auto-reload** - Only on clean exits

## Performance Impact

These changes have **minimal performance impact**:

- Refs are O(1) operations (no re-renders)
- Extra checks are simple boolean comparisons
- Memory usage unchanged (refs replace setState bugs)
- Actually **improves** performance by preventing crashes

## Verification Checklist

Before considering this fixed, verify:

- [ ] Can complete full delivery without going back to start
- [ ] Console shows "already in progress" messages during movement
- [ ] Canceling delivery shows "Component unmounted" messages
- [ ] No "setState on unmounted component" warnings
- [ ] Main process console shows no crash logs
- [ ] Can run multiple deliveries in a row
- [ ] Arduino timeout doesn't cause app reset
- [ ] Rapid clicking doesn't cause issues

## If Issues Persist

### Gather Diagnostic Information:

1. **DevTools Console Output** (full log from start to crash)
2. **Main Process Console** (terminal where `npm run dev` runs)
3. **Steps to reproduce** (exactly when it goes back to start page)
4. **Crash details** if any:
   ```
   Renderer process gone: {
     reason: '...',
     exitCode: ...
   }
   ```

### Common Exit Codes:

- **0**: Clean exit (normal, will reload)
- **1**: Error exit (out of memory, unhandled exception)
- **5**: Chromium security violation (sandbox/GPU issue)
- **11**: Segfault (serious crash, GPU driver or native module)
- **134**: Abort signal (assertion failed)

## Summary

This fix addresses the renderer crash issue by:

1. **Preventing race conditions** that corrupt state
2. **Tracking mount status** to prevent updates after unmount
3. **Fixing useEffect dependencies** to prevent over-triggering
4. **Disabling aggressive auto-reload** that loses state

The app should now maintain delivery state throughout robot movement without crashes or resets.

## Related Documentation

- `ARDUINO_COMMUNICATION_FIX.md` - IPC error handling
- `RASPBERRY_PI_FIXES.md` - GPU and sandbox fixes
- `ROBOT_NOT_MOVING_FIX.md` - Arduino state management

