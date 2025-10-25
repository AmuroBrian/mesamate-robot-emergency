# Robot Not Moving - Root Cause Analysis & Fix

## 🔍 Problem Summary

**Symptoms:**
- Robot sometimes doesn't move when commands are sent
- Console shows: `Movement completed with result: TIMEOUT`
- No `📥` Arduino responses appear in the console
- Subsequent commands also fail to execute

## 🎯 Root Causes Identified

### 1. **CRITICAL: Stuck `isMoving` Flag in Arduino** ⚠️

**The Main Issue:**
Every movement function in the Arduino code checks if the robot is already moving:

```cpp
void moveDistance(float inches) {
  if (isMoving) return;  // Silently blocks all commands!
  // ... rest of the function
}
```

**Why it gets stuck:**
- If a movement completes abnormally (timeout, power glitch, obstacle, etc.)
- The `isMoving` flag may stay `true`
- **All subsequent commands are silently ignored** - they return immediately
- The Node.js app never receives a "BLOCKED" message, so it just waits and times out

**Evidence:**
```
Command 1: MOVE_DISTANCE:24.00  → Times out (Arduino still thinks it's moving)
Command 2: MOVE_DISTANCE:12.00  → Immediately returns (isMoving=true blocks it)
Command 3: MOVE_DISTANCE:6.00   → Immediately returns (isMoving=true blocks it)
```

### 2. **Communication Timeout Too Short**

**The Problem:**
```typescript
// Timeout was capped at 6 seconds
const maxTimeout = Math.min(duration + 1000, 6000);
```

**Why it fails:**
- Moving 24 inches at precision speed (3 inches/sec) takes 8 seconds
- Timeout triggers after 6 seconds
- Arduino is still moving, but Node.js already gave up
- This leaves Arduino in `isMoving=true` state

### 3. **Arduino Initialization Timing**

**The Problem:**
- Arduino Mega needs 2-3 seconds to boot after serial connection opens
- Previous wait time was only 2 seconds
- First command sometimes sent before Arduino is ready
- Command is lost, but Node.js thinks it was sent

## ✅ Solutions Implemented

### 1. **Added RESET Command**

**Arduino code (`robot-control.ino`):**
```cpp
} else if (command == "RESET") {
  // Emergency reset command to clear stuck state
  stopMotors();
  isMoving = false;
  isPrecisionMode = false;
  pausedForObstacle = false;
  currentCommand = "STOP";
  Serial.println("✅ Robot state RESET - ready for commands");
}
```

**Usage:**
- Send `RESET` command to clear stuck state
- Available via `window.robot.reset()` in the app
- Automatically sent when Arduino reports "BLOCKED"

### 2. **Added Debug Output for Blocked Commands**

**Arduino code:**
```cpp
void moveDistance(float inches) {
  if (isMoving) {
    Serial.println("⚠️ BLOCKED: Robot already moving. Send RESET if stuck.");
    return;
  }
  // ...
}
```

**Benefit:**
- Now you'll see when commands are being blocked
- Console shows: `⚠️ BLOCKED: Robot already moving. Send RESET if stuck.`
- Automatic reset is triggered when this message is detected

### 3. **Auto-Reset on Blocked State**

**Node.js code (`arduino-communication.ts`):**
```typescript
// Handle blocked command warnings (indicates stuck state)
if (response.includes('BLOCKED') || response.includes('already moving')) {
  console.log('⚠️  Arduino is in stuck state - automatically sending RESET');
  this.sendCommand('RESET').catch(err => console.error('Failed to auto-reset:', err));
}
```

**Benefit:**
- System self-recovers from stuck states
- No manual intervention needed

### 4. **Increased Timeout Duration**

**Node.js code:**
```typescript
// Add 2 second buffer, cap at 15 seconds instead of 6
const maxTimeout = Math.min(duration + 2000, 15000);
console.log(`Timeout set to ${maxTimeout}ms for ${inches} inches at ${speed} speed`);
```

**Benefit:**
- Long movements (24 inches = 8 seconds) now have enough time
- Better diagnostic logging shows expected vs actual times

### 5. **Longer Arduino Initialization Wait**

**Node.js code:**
```typescript
// Increased from 2 to 3 seconds
console.log('Waiting for Arduino to initialize (3 seconds)...');
await new Promise(resolve => setTimeout(resolve, 3000));
```

**Benefit:**
- Arduino is fully booted before first command
- Reduces chance of lost initial commands

### 6. **Explicit State Initialization**

**Arduino code:**
```cpp
void setup() {
  // ... other setup code ...
  stopMotors();
  isMoving = false;  // Explicitly reset movement flag
  // ...
}
```

**Benefit:**
- Clean state on Arduino boot/reset
- No leftover state from previous sessions

## 🧪 Testing the Fix

### Step 1: Upload Updated Arduino Code

```bash
# Re-upload the fixed sketch
arduino-cli compile --fqbn arduino:avr:mega arduino-code/robot-control/
arduino-cli upload -p /dev/ttyACM0 --fqbn arduino:avr:mega arduino-code/robot-control/
```

### Step 2: Rebuild and Run the App

```bash
npm run dev
```

### Step 3: Watch for Diagnostic Output

**Good output (fixed):**
```
📤 Command sent to Arduino: MOVE_DISTANCE:24.00
Timeout set to 10000ms for 24 inches at precision speed
📥 Arduino response: Received: MOVE_DISTANCE:24.00
📥 Arduino response: Moving 24 inches (8000ms)
📥 Arduino response: Distance movement complete: 24 inches
📥 Arduino response: MOVEMENT_COMPLETE:SUCCESS
Movement completed with result: SUCCESS
```

**If still stuck (auto-recovery):**
```
📤 Command sent to Arduino: MOVE_DISTANCE:24.00
📥 Arduino response: ⚠️ BLOCKED: Robot already moving. Send RESET if stuck.
⚠️  Arduino is in stuck state - automatically sending RESET
📤 Command sent to Arduino: RESET
📥 Arduino response: ✅ Robot state RESET - ready for commands
```

### Step 4: Manual Testing

Open DevTools console and test:

```javascript
// Test basic movement
await window.robot.moveDistance(12, "precision");

// If robot doesn't move, manually reset
await window.robot.reset();

// Try again
await window.robot.moveDistance(12, "precision");
```

## 📊 Diagnostic Commands

### Check Arduino State

Send `STATUS` command via Serial Monitor:
```
STATUS
```

Expected response:
```
Status: Stopped | Command: STOP
```

If it shows:
```
Status: Moving | Command: MOVE_DISTANCE | Precision Mode | Target: 24.0 inches
```
But robot is not moving, the state is stuck → send `RESET`.

### Test Serial Communication

```bash
# Connect to Arduino
screen /dev/ttyACM0 9600

# Send commands
STATUS
RESET
MOVE_DISTANCE:12
```

## 🔧 Troubleshooting

### Issue: Still seeing TIMEOUT

**Possible causes:**
1. **Arduino not receiving commands at all**
   - Check serial port connection
   - Verify baud rate (9600)
   - Check permissions (`dialout` group)
   - Try different USB cable/port

2. **Arduino not responding**
   - Power supply issue (motors draw too much current)
   - Check motor driver connections
   - Verify Arduino doesn't have compilation errors

3. **Timeout still too short**
   - Check console for: `Timeout set to Xms`
   - If moving 24 inches at precision speed, needs ~10 seconds
   - Increase `maxTimeout` in `arduino-communication.ts` if needed

### Issue: Robot moves but immediately stops

**Possible causes:**
1. **Ultrasonic sensors triggering**
   - Check if `UTS_ENABLED = true` in Arduino code
   - Temporarily disable: `UTS_ENABLED = false;` (line 49)
   - Re-upload sketch

2. **Obstacle detected**
   - Check console for: `⚠️ OBSTACLE LATCHED!`
   - Clear obstacles from sensors
   - Test sensors: send `TEST_UTS` command

3. **Power supply insufficient**
   - Motors need 6-12V external power
   - Check battery voltage
   - Verify motor driver connections

### Issue: Commands work intermittently

**Likely causes:**
1. **USB connection unstable**
   - Try different USB port/cable
   - Check `dmesg | tail` for USB disconnects
   - Add USB hub with power supply

2. **Race condition in state management**
   - Add delay between sequential commands
   - Use `await` properly in JavaScript
   - Let previous movement fully complete

## 📝 Summary of Changes

### Files Modified:

1. **`arduino-code/robot-control.ino`**
   - Added `RESET` command handler
   - Added debug output for blocked commands
   - Explicit state initialization in `setup()`

2. **`main/arduino-communication.ts`**
   - Increased timeout from 6s to 15s max
   - Added auto-reset on blocked state detection
   - Increased initialization wait from 2s to 3s
   - Added `reset()` method
   - Better timeout logging

3. **`main/background.ts`**
   - Added `robot-reset` IPC handler

4. **`main/preload.ts`**
   - Exposed `reset()` method to renderer

### New Commands Available:

- **Arduino:** `RESET` - Clears stuck state
- **JavaScript:** `window.robot.reset()` - Reset Arduino state from app
- **Arduino:** `STATUS` - Shows current robot state (existing, mentioned for completeness)

## 🎯 Expected Results

After these fixes:

✅ **Auto-recovery:** Robot automatically resets when stuck state is detected  
✅ **Better diagnostics:** Console shows why commands are blocked  
✅ **Longer movements work:** 24-inch movements no longer timeout prematurely  
✅ **Manual reset available:** `window.robot.reset()` clears any stuck state  
✅ **Cleaner initialization:** Arduino starts in known-good state  

## 🚀 Next Steps

1. Upload the updated Arduino sketch
2. Restart the Electron app
3. Test a delivery
4. Monitor console for diagnostic messages
5. If issues persist, manually call `window.robot.reset()`

## 📞 Still Having Issues?

Share these diagnostic outputs:

```bash
# 1. Arduino connection debug
npm run dev 2>&1 | grep -A 10 "ARDUINO CONNECTION DEBUG"

# 2. Movement attempt
# (Start a delivery and copy console output)

# 3. Arduino serial monitor
screen /dev/ttyACM0 9600
# Send: STATUS
# Send: MOVE_DISTANCE:12
# Copy all output
```

This will help identify if the issue is:
- Communication (no Arduino responses at all)
- State management (BLOCKED messages)
- Hardware (motors not responding)
- Timing (timeouts too short)

