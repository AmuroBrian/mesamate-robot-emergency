# Arduino Connection Troubleshooting

## Problem: Motors Don't Move (All Commands Timeout)

You're seeing in the console:

```
Command sent: MOVE_DISTANCE:24.00
Movement completed with result: TIMEOUT
```

This means **the Arduino is not receiving or not responding to commands**.

## Diagnosis Steps

### 1. Check Console for Connection Debug

When you start `npm run dev`, look for this section:

```
========== ARDUINO CONNECTION DEBUG ==========
Available ports: [...]
✅ Found Arduino port: /dev/ttyACM0  (or /dev/ttyUSB0)
   Manufacturer: Arduino
✅ Arduino connected successfully
==============================================
```

**If you see `❌ Arduino not found!`**: The serial port isn't detected.

**If you see `✅ Found Arduino` but motors don't move**: The Arduino is connected but not communicating properly.

### 2. Verify Arduino is Plugged In

```bash
# On Raspberry Pi, list USB serial devices
ls -la /dev/ttyUSB* /dev/ttyACM*

# You should see something like:
# crw-rw---- 1 root dialout 166, 0 Oct 20 22:00 /dev/ttyACM0
```

**If nothing appears**: Arduino is not plugged in or not recognized by the system.

### 3. Check User Permissions

The user must be in the `dialout` group to access serial ports:

```bash
# Add current user to dialout group
sudo usermod -a -G dialout $USER

# Log out and log back in (or reboot)
sudo reboot

# Verify you're in the group
groups | grep dialout
```

### 4. Test Arduino with Serial Monitor

Upload the robot-control.ino sketch to Arduino and test with Arduino IDE Serial Monitor:

```bash
# Install Arduino CLI (if not already installed)
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh

# List connected boards
arduino-cli board list

# Should show something like:
# Port         Protocol Type              Board Name  FQBN            Core
# /dev/ttyACM0 serial   Serial Port (USB) Arduino Uno arduino:avr:uno arduino:avr
```

Open Arduino IDE Serial Monitor (115200 baud) and send commands:

- Send: `STATUS` → Should reply with robot status
- Send: `MOVE_DISTANCE:12` → Motors should move forward 12 inches

**If motors move in Serial Monitor but not in the app**: The issue is with the Electron app's serial port connection.

### 5. Check Baud Rate Mismatch

Verify the baud rate matches between Arduino and the Node.js app:

**Arduino (`robot-control.ino`):**

```cpp
Serial.begin(115200);  // Line ~276
```

**Node.js (`arduino-communication.ts`):**

```typescript
baudRate: 9600,  // Line ~85
```

**🚨 MISMATCH FOUND! Arduino uses 115200 but Node.js uses 9600!**

This is why commands are sent but never received by Arduino.

## Fix: Update Baud Rate

You need to match the baud rates. Either:

### Option A: Update Node.js to match Arduino (Recommended)

In `main/arduino-communication.ts` line ~85:

```typescript
baudRate: 115200,  // Changed from 9600
```

### Option B: Update Arduino to match Node.js

In `arduino-code/robot-control.ino` line ~276:

```cpp
Serial.begin(9600);  // Changed from 115200
```

**Option A is recommended** because 115200 is faster and more reliable for real-time robot control.

## After Fixing

1. Restart the dev server: `npm run dev`
2. Watch console for Arduino responses (look for 📥 emoji)
3. Start a delivery - you should see:
   ```
   📤 Command sent to Arduino: MOVE_DISTANCE:24.00
   📥 Arduino response: Received: MOVE_DISTANCE:24.00
   📥 Arduino response: Moving 24 inches (8000ms)
   📥 Arduino response: Distance movement complete: 24 inches
   📥 Arduino response: MOVEMENT_COMPLETE:SUCCESS
   Movement completed with result: SUCCESS
   ```

## Common Issues

### "Arduino connected" shown in UI but motors don't move

- Check baud rate mismatch (see above)
- Verify Arduino sketch is uploaded and running
- Check motor power supply is connected
- Test with Serial Monitor first

### Permission denied errors

```bash
sudo chmod 666 /dev/ttyACM0
# OR add user to dialout group (see step 3)
```

### "Port is not open" errors

- Another process (like Arduino IDE) is using the port
- Close all other serial connections
- Try unplugging and replugging the Arduino

### Motors move but stop immediately

- Check ultrasonic sensors (if enabled in sketch)
- Verify obstacle detection isn't triggering
- Check battery/power supply voltage

### Raspberry Pi doesn't detect Arduino

- Try a different USB port
- Try a different USB cable (some are power-only)
- Check `dmesg | tail` after plugging in Arduino

## Debug Commands

Send these via the app or Serial Monitor to test:

```
STATUS           - Get current robot state
TEST_UTS         - Test ultrasonic sensors
MOVE_DISTANCE:12 - Move forward 12 inches
TURN_ANGLE:90    - Turn right 90 degrees
STOP             - Emergency stop
```

## Still Not Working?

1. Check if SerialPort package is installed correctly on Raspberry Pi:

   ```bash
   cd /path/to/mesamate-robot
   npm rebuild serialport --build-from-source
   ```

2. Try the mock Arduino controller for testing UI without hardware:

   ```typescript
   // In main/background.ts, temporarily import:
   import { arduinoController } from "./arduino-communication-mock";
   ```

3. Enable verbose SerialPort logging:
   ```bash
   DEBUG=serialport* npm run dev
   ```
