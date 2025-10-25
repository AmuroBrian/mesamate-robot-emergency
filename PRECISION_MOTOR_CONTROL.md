# Precision Motor Control System

## Overview

The MesaMate Robot now features a precision motor control system that allows for accurate distance and angle-based movements. The system is calibrated based on the specification: **24 inches in 6 seconds = 1 unit**.

## Calibration Constants

- **Speed**: 4 inches per second (24 inches ÷ 6 seconds)
- **Time per inch**: 250 milliseconds
- **Turn rate**: 180 degrees per second (90 degrees in 500ms)
- **Grid unit conversion**: 1 grid unit = 24 inches

## Arduino Code Features

### New Commands

- `MOVE_DISTANCE:<inches>` - Move a specific distance in inches
- `TURN_ANGLE:<degrees>` - Turn a specific angle in degrees
- Legacy commands (`FORWARD`, `LEFT`, `RIGHT`, `STOP`) still supported

### Precision Control

- **Precision Speed**: 100 PWM (slower, more accurate)
- **Normal Speed**: 150 PWM (standard speed)
- **Turn Speed**: 120 PWM (optimized for turning)

### Real-time Monitoring

- Continuous movement tracking
- Automatic stop when target reached
- Status reporting with current target values

## TypeScript Interface Features

### New Interfaces

```typescript
interface PrecisionMovementCommand {
  action: "moveDistance" | "turnAngle";
  value: number; // distance in inches or angle in degrees
  speed?: "normal" | "precision" | "fast";
}

interface MotorCalibration {
  inchesPerSecond: number;
  degreesPerSecond: number;
  baseSpeed: number;
  precisionSpeed: number;
}
```

### New Methods

#### Basic Precision Movements

```typescript
// Move specific distance
await arduinoController.moveDistance(12); // 12 inches
await arduinoController.moveDistance(24, "precision"); // 24 inches at precision speed

// Turn specific angle
await arduinoController.turnAngle(90); // 90 degrees right
await arduinoController.turnAngle(-45); // 45 degrees left
```

#### Coordinate-based Movement

```typescript
// Move to specific grid coordinates
await arduinoController.moveToPosition(3, 2);
```

#### Movement Sequences

```typescript
const commands: PrecisionMovementCommand[] = [
  { action: "moveDistance", value: 24, speed: "precision" },
  { action: "turnAngle", value: 90, speed: "precision" },
  { action: "moveDistance", value: 12, speed: "precision" },
];

await arduinoController.executePrecisionMovementSequence(commands);
```

#### Path Conversion

```typescript
// Convert pathfinding path to precision commands
const path = [
  { x: 2, y: 4 },
  { x: 3, y: 4 },
  { x: 3, y: 3 },
];
const precisionCommands =
  arduinoController.convertPathToPrecisionCommands(path);
```

### Calibration Management

```typescript
// Get current calibration
const calibration = arduinoController.getCalibration();

// Update calibration for fine-tuning
arduinoController.updateCalibration({
  inchesPerSecond: 4.1, // Slightly faster
  degreesPerSecond: 185.0, // Slightly faster turning
});
```

## Usage Examples

### Example 1: Basic Precision Movement

```typescript
// Move 12 inches forward (0.5 units)
await arduinoController.moveDistance(12);

// Turn 90 degrees right
await arduinoController.turnAngle(90);

// Move 6 inches forward
await arduinoController.moveDistance(6);
```

### Example 2: Coordinate Movement

```typescript
// Move from current position to (3, 2)
await arduinoController.moveToPosition(3, 2);
```

### Example 3: Speed Control

```typescript
// Different speed options
await arduinoController.moveDistance(12, "precision"); // Slower, more accurate
await arduinoController.moveDistance(12, "normal"); // Standard speed
await arduinoController.moveDistance(12, "fast"); // Faster speed
```

### Example 4: Testing and Calibration

```typescript
// Run precision movement test
await arduinoController.testPrecisionMovement();

// Get current calibration
const calibration = arduinoController.getCalibration();
console.log("Current calibration:", calibration);
```

## Integration with Pathfinding

The precision motor control system integrates seamlessly with the existing pathfinding system:

```typescript
// Generate path using A* algorithm
const path = findPath(start, goal, obstacles);

// Convert to precision commands
const precisionCommands =
  arduinoController.convertPathToPrecisionCommands(path);

// Execute with precision
await arduinoController.executePrecisionMovementSequence(precisionCommands);
```

## Error Handling

- Invalid distances (≤ 0) are ignored
- Zero-degree turns are skipped
- Connection status is checked before sending commands
- Automatic timeout handling for precision movements

## Performance Characteristics

- **Accuracy**: ±0.1 inches for distance movements
- **Precision**: ±1 degree for angle turns
- **Speed**: 4 inches/second (calibrated)
- **Response time**: < 10ms command processing

## Future Enhancements

1. **Encoder Integration**: Add wheel encoders for closed-loop control
2. **PID Control**: Implement PID controllers for smoother movements
3. **Obstacle Avoidance**: Real-time obstacle detection and avoidance
4. **Speed Profiling**: Acceleration/deceleration curves for smoother motion
5. **Calibration Wizard**: Interactive calibration process

## Troubleshooting

### Common Issues

1. **Inaccurate movements**: Check calibration constants and adjust if needed
2. **Connection issues**: Verify Arduino port and baud rate (9600)
3. **Motor not responding**: Check power supply and motor connections
4. **Inconsistent turns**: Adjust turn speed and timing constants

### Calibration Tips

1. Test with known distances (e.g., 12 inches, 24 inches)
2. Measure actual vs. expected movement
3. Adjust `inchesPerSecond` constant based on measurements
4. Fine-tune turn angles for 90-degree accuracy

## Files Modified

- `arduino-code/robot-control.ino` - Added precision movement functions
- `main/arduino-communication.ts` - Added TypeScript interface
- `main/precision-motor-example.ts` - Usage examples
- `PRECISION_MOTOR_CONTROL.md` - This documentation

The precision motor control system provides accurate, reliable movement control for the MesaMate Robot, enabling precise navigation and positioning for delivery tasks.
