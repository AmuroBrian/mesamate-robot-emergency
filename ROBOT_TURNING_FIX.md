# Robot Turning Fix - Navigation Alignment

## Problem

The robot was always moving forward without turning to face the correct direction. When navigating the map, it would receive movement commands to go in different directions (left, right, up, down) but wouldn't actually turn before moving, causing misalignment with the map-based pathfinding.

## Root Cause

In `DeliverySystem.tsx`, the `moveRobot` function was calculating the direction to move (dx, dy) but only sending forward movement commands (`moveDistance`) to the Arduino. There was no logic to:

1. Track which direction the robot is currently facing
2. Calculate the required turn to face the target direction
3. Send turn commands before forward movement

## Solution Implemented

### 1. Added Robot Direction Tracking

- Added `robotDirection` field to `DeliveryState` interface to track current facing direction
- Robot starts facing "up" from the starting position (2, 4)
- Direction is updated after each turn

### 2. Created Helper Functions

Three new helper functions were added:

**`calculateTurnAngle(currentDir, targetDir)`**

- Calculates the required turn angle in degrees (-180 to +180)
- Uses clockwise rotation: up → right → down → left → up
- Returns positive angles for right turns, negative for left turns

**`getDirectionFromDelta(dx, dy)`**

- Converts movement delta to a direction ("up", "down", "left", "right")
- Used to determine which direction the robot needs to face

**`getNewDirection(currentDir, angle)`**

- Calculates the new facing direction after a turn
- Updates robot's orientation state

### 3. Updated Movement Logic

The `moveRobot` function now:

1. Determines the target direction based on the next grid position
2. Calculates the required turn angle from current to target direction
3. **Sends turn command first** if a turn is needed
4. Waits 500ms for the turn to complete
5. **Then sends forward movement** command (24 inches = 1 grid unit)
6. Updates the robot's facing direction in state

### 4. Adjusted Timing

- Increased auto-move delay from 8 seconds to 10 seconds when Arduino is connected
- This accounts for both turning time (~1-2 seconds) and forward movement time (~6 seconds)

## Example Movement Sequence

### Before Fix:

```
Position (2,4) → (2,3): Forward 24 inches ❌ (robot facing up)
Position (2,3) → (3,3): Forward 24 inches ❌ (robot still facing up, should turn right!)
```

### After Fix:

```
Position (2,4) → (2,3):
  - Already facing up ✓
  - Forward 24 inches ✓

Position (2,3) → (3,3):
  - Turn 90° right (up → right) ✓
  - Forward 24 inches ✓
  - Now facing right ✓
```

## Arduino Commands Sent

The Arduino now receives proper command sequences:

```
TURN_ANGLE:90.0     // Turn right 90°
MOVE_DISTANCE:24.00 // Move forward 24 inches
TURN_ANGLE:-90.0    // Turn left 90°
MOVE_DISTANCE:24.00 // Move forward 24 inches
```

## Testing

The robot should now:

1. Turn to face the correct direction before each move
2. Navigate the map correctly following the pathfinding route
3. Arrive at the correct table positions
4. Return to the starting position along the correct path

## Files Modified

- `/renderer/components/DeliverySystem.tsx` - Added direction tracking and turn logic

## Related Components (Already Working)

- `/main/arduino-communication.ts` - `turnAngle()` function exists
- `/main/preload.ts` - `turnAngle()` exposed to renderer
- `/main/background.ts` - IPC handler for `robot-turn-angle`
- `/arduino-code/robot-control.ino` - `TURN_ANGLE:<degrees>` command handler

## Notes

- The robot's coordinate system: up = -y, down = +y, left = -x, right = +x
- Turning is clockwise: 90° = right turn, -90° = left turn
- Each grid cell = 24 inches
- Robot starts at (2, 4) facing up
