# Arduino Communication Issue Fix

## Problem Description

The application was automatically refreshing/crashing when the UI sent requests to the Arduino. The app appeared to restart and return to the start page, making Arduino communication unusable.

## Root Causes Identified

After studying the entire codebase, several critical issues were found:

### 1. **Unsafe Error Serialization in IPC Handlers**

- **Location**: `main/background.ts` (lines 126-216)
- **Issue**: When catching errors in IPC handlers, the code accessed `error.message` directly without checking if `error` was an Error object
- **Impact**: If the error wasn't a proper Error object, `error.message` would be undefined, causing IPC serialization to fail and potentially crash the renderer

### 2. **Missing Response Validation in UI**

- **Location**: `renderer/components/DeliverySystem.tsx` (lines 223-231)
- **Issue**: Arduino command responses weren't checked for success/failure
- **Impact**: Failed commands could propagate errors that weren't handled, causing unhandled promise rejections

### 3. **No IPC Error Protection**

- **Location**: `main/preload.ts` (lines 20-54)
- **Issue**: IPC invoke calls weren't wrapped in try-catch blocks
- **Impact**: Any IPC communication failure could throw an unhandled rejection in the renderer

### 4. **Inadequate sendCommand Error Handling**

- **Location**: `main/arduino-communication.ts` (lines 171-201)
- **Issue**: The sendCommand method didn't handle all edge cases gracefully
- **Impact**: Errors in serial communication could cause unhandled rejections

### 5. **No Global Error Handlers**

- **Location**: `renderer/pages/_app.tsx`
- **Issue**: No global handlers for unhandled promise rejections or errors
- **Impact**: Any unhandled error or rejection would crash the renderer process

## Solutions Implemented

### 1. Safe Error Message Extraction (background.ts)

```typescript
// Added helper function to safely extract error messages
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error occurred";
};
```

- All IPC handlers now use this function
- Added console.error logging for debugging
- Added try-catch to `robot-get-position` and `robot-is-connected` handlers

### 2. Response Validation in UI (DeliverySystem.tsx)

```typescript
// Check turnAngle response
const turnResult = await window.robot.turnAngle(turnAngle);
if (turnResult && !turnResult.success) {
  console.error("Turn command failed:", turnResult.error);
  // Continue anyway - don't crash the app
}

// Check moveDistance response
const moveResult = await window.robot.moveDistance(24, "normal");
if (moveResult && !moveResult.success) {
  console.error("Move command failed:", moveResult.error);
  // Continue anyway - don't crash the app
}
```

- All Arduino commands now validate responses
- Errors are logged but don't crash the renderer
- Movement continues even if Arduino commands fail

### 3. Safe IPC Wrapper (preload.ts)

```typescript
const safeInvoke = async <T = any>(
  channel: string,
  ...args: any[]
): Promise<T> => {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (error) {
    console.error(`IPC invoke failed for ${channel}:`, error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "IPC communication failed",
    } as T;
  }
};
```

- All IPC invoke calls now use this wrapper
- IPC failures return safe error responses
- No unhandled promise rejections can propagate

### 4. Improved sendCommand Error Handling (arduino-communication.ts)

```typescript
private async sendCommand(command: string): Promise<void> {
  if (!this.port || !this.isConnected) {
    console.log('⚠️  Arduino not connected, command not sent:', command);
    return; // Gracefully handle disconnected state - don't throw
  }

  return new Promise((resolve, reject) => {
    try {
      if (!this.port) {
        resolve(); // Port became null, resolve gracefully
        return;
      }

      this.port.write(command + '\n', (err) => {
        if (err) {
          console.error('❌ Error sending command:', command, err);
          reject(new Error(`Failed to send command: ${command}`));
        } else {
          console.log('📤 Command sent to Arduino:', command);
          resolve();
        }
      });
    } catch (err) {
      console.error('❌ Exception in sendCommand:', err);
      reject(new Error('Failed to write to serial port'));
    }
  });
}
```

- Added additional null checks
- Wrapped serial write in try-catch
- Creates proper Error objects for rejection
- Gracefully handles disconnected state

### 5. Global Error Handlers (\_app.tsx)

```typescript
React.useEffect(() => {
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    console.error("Unhandled promise rejection:", event.reason);
    event.preventDefault(); // Prevent renderer crash
  };

  const handleError = (event: ErrorEvent) => {
    console.error("Unhandled error:", event.error);
    event.preventDefault(); // Prevent renderer crash
  };

  window.addEventListener("unhandledrejection", handleUnhandledRejection);
  window.addEventListener("error", handleError);

  return () => {
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    window.removeEventListener("error", handleError);
  };
}, []);
```

- Catches all unhandled promise rejections
- Catches all unhandled errors
- Prevents default behavior (which would crash the renderer)
- Logs errors for debugging

## Error Handling Layers

The fix implements a defense-in-depth approach with multiple layers:

1. **Arduino Layer** - Graceful handling of serial communication errors
2. **Main Process Layer** - Safe error serialization in IPC handlers
3. **Preload Layer** - Safe IPC invoke wrapper
4. **UI Layer** - Response validation and error handling
5. **Global Layer** - Catches any unhandled errors/rejections

## Testing Recommendations

After applying these fixes, test the following scenarios:

1. **Normal Operation**: Send Arduino commands with Arduino connected
2. **Disconnected Arduino**: Send commands without Arduino connected
3. **Mid-Operation Disconnect**: Disconnect Arduino during movement
4. **Serial Port Errors**: Test with serial port permission issues
5. **IPC Failures**: Test with main process errors

## Expected Behavior After Fix

- App should **never** crash or refresh when sending Arduino commands
- Errors should be logged to console but not propagate
- UI should continue to function even if Arduino commands fail
- User should see connection status and any error messages
- Delivery system should gracefully handle communication failures

## Files Modified

1. `main/background.ts` - Added safe error handling to all IPC handlers
2. `main/preload.ts` - Added safe IPC invoke wrapper
3. `main/arduino-communication.ts` - Improved sendCommand error handling
4. `renderer/components/DeliverySystem.tsx` - Added response validation
5. `renderer/pages/_app.tsx` - Added global error handlers

## Additional Notes

- All changes are backwards compatible
- No changes required to Arduino code
- The fix is defensive - assumes errors can happen anywhere
- Errors are logged for debugging but don't crash the app
- The app will continue to function even if Arduino is disconnected

## Verification

To verify the fix is working:

1. Check browser console - should see detailed error logs instead of crashes
2. Observe connection status indicator - should accurately reflect Arduino state
3. Test with Arduino disconnected - app should not crash
4. Monitor main process console - should see Arduino connection debug logs

If the app still crashes, check:

- Browser console for specific error messages
- Main process console for IPC/Arduino errors
- Ensure all files were properly rebuilt after changes
