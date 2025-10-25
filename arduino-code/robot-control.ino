// MesaMate Robot Control Code for Arduino Uno R3
// Controls robot movement with precision distance and angle control
// Integrated with ADXL345 gyroscope for encoder functionality
// Calibration: 24 inches in 6 seconds = 1 unit

#include <SoftwareWire.h>

// --- ADXL345 (Software I2C using A4/A5) ---
SoftwareWire myWire(A4, A5);
const byte ADXL345_ADDR = 0x53;

// Motor pin definitions (matching motorgyro.ino configuration)
const int motorA1 = 6;       // Left motor IN1
const int motorB1 = 5;       // Left motor IN2
const int speedMotorAB = 7;  // Left motor ENA (PWM)

const int motora2 = 8;       // Right motor IN3
const int motorb2 = 9;       // Right motor IN4
const int speedMotorab = 10; // Right motor ENB (PWM)

// --- Ultrasonic Sensor pins ---
const int UTS1_TRIG = 36;    // UTS1 Trigger pin
const int UTS1_ECHO = 38;    // UTS1 Echo pin
const int UTS2_TRIG = 40;    // UTS2 Trigger pin
const int UTS2_ECHO = 42;    // UTS2 Echo pin
const int UTS3_TRIG = 44;    // UTS3 Trigger pin
const int UTS3_ECHO = 46;    // UTS3 Echo pin

// --- Table indicator LED pins ---
const int TABLE1_LED_PIN = 20; // Table 1 indicator
const int TABLE2_LED_PIN = 32; // Table 2 indicator
const int TABLE3_LED_PIN = 34; // Table 3 indicator

// Precision motor control settings
const int baseSpeed = 180;     // Base speed (0-255) - calibrated for 4 inches/second
const int turnSpeed = 120;     // Speed for turning (0-255)
const int precisionSpeed = 150; // Slower speed for precise movements

// --- Base Speeds for gyroscope correction ---
int baseLeft = 180;
int baseRight = 180;

// --- Reference ADXL steady values ---
const int normalX = 13;
const int normalY = 172;
const int tolerance = 4;

// --- Ultrasonic Sensor settings ---
bool UTS_ENABLED = true;                  // TEMP: disable ultrasonic obstacle logic for sync testing
const float OBSTACLE_DISTANCE_CM = 20.32;  // 8 inches in cm triggers obstacle detection
const int MAX_DISTANCE = 200;              // Maximum reliable distance for ultrasonic sensors

// Ultrasonic filtering & hysteresis
const int UTS_SAMPLES = 5;                 // Median of N samples to reduce spikes
const int UTS_INTER_READ_DELAY_MS = 50;    // Delay between sensor reads to avoid cross-talk
const float CLEAR_HYSTERESIS_CM = 5.0;     // Additional margin to clear obstacle state
const int REQUIRED_CONSECUTIVE_HITS = 3;   // Debounce counts for detect/clear

// Calibration constants (based on 24 inches in 6 seconds = 1 unit)
const float INCHES_PER_SECOND = 3.0;  // Adjusted for precision speed (100) - 3 inches/second
const float MS_PER_INCH = 1000.0 / INCHES_PER_SECOND;  // 333ms per inch
const float DEGREES_PER_MS = 90.0 / 500.0;  // 90 degrees in 500ms = 0.18 degrees/ms

// Legacy movement timing (in milliseconds)
const int forwardTime = 1000;  // Time to move forward one grid cell
const int turnTime = 500;      // Time to turn 90 degrees

// Current robot state
bool isMoving = false;
String currentCommand = "";
unsigned long movementStartTime = 0;
float targetDistance = 0.0;
float targetAngle = 0.0;
bool isPrecisionMode = false;
bool pausedForObstacle = false;
unsigned long pauseStartTime = 0;
unsigned long totalPausedMs = 0;

// Obstacle latch state with debounce
int obstacleHitCount = 0;
int clearHitCount = 0;
bool obstacleLatched = false;

// --- I2C helpers for ADXL345 ---
void writeTo(byte reg, byte val) {
  myWire.beginTransmission(ADXL345_ADDR);
  myWire.write(reg);
  myWire.write(val);
  myWire.endTransmission();
}

bool readAccel(int16_t &x, int16_t &y, int16_t &z) {
  myWire.beginTransmission(ADXL345_ADDR);
  myWire.write(0x32);
  if (myWire.endTransmission(false) != 0) return false;

  myWire.requestFrom(ADXL345_ADDR, 6);
  if (myWire.available() < 6) return false;

  x = (int16_t)((myWire.read()) | (myWire.read() << 8));
  y = (int16_t)((myWire.read()) | (myWire.read() << 8));
  z = (int16_t)((myWire.read()) | (myWire.read() << 8));
  return true;
}

// --- Ultrasonic Sensor functions ---
long readUltrasonicDistance(int trigPin, int echoPin) {
  // Clear the trigger pin
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  
  // Send a 10 microsecond pulse to trigger
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  
  // Read the echo pin and calculate distance
  long duration = pulseIn(echoPin, HIGH, 30000); // 30ms timeout
  if (duration == 0) {
    return MAX_DISTANCE; // Return max distance if no echo received
  }
  
  // Calculate distance in cm (speed of sound = 343 m/s = 0.0343 cm/μs)
  long distance = duration * 0.0343 / 2;
  return min(distance, MAX_DISTANCE);
}

long readUltrasonicMedian(int trigPin, int echoPin) {
  long readings[UTS_SAMPLES];
  for (int i = 0; i < UTS_SAMPLES; i++) {
    readings[i] = readUltrasonicDistance(trigPin, echoPin);
    delay(5); // small delay between samples for stability
  }
  // Simple insertion sort
  for (int i = 1; i < UTS_SAMPLES; i++) {
    long key = readings[i];
    int j = i - 1;
    while (j >= 0 && readings[j] > key) {
      readings[j + 1] = readings[j];
      j--;
    }
    readings[j + 1] = key;
  }
  return readings[UTS_SAMPLES / 2];
}

bool checkForObstacles() {
  long distance1 = readUltrasonicMedian(UTS1_TRIG, UTS1_ECHO);
  delay(UTS_INTER_READ_DELAY_MS);
  long distance2 = readUltrasonicMedian(UTS2_TRIG, UTS2_ECHO);
  delay(UTS_INTER_READ_DELAY_MS);
  long distance3 = readUltrasonicMedian(UTS3_TRIG, UTS3_ECHO);
  
  // Determine detection with hysteresis and debounce
  bool anyBelow = (distance1 < OBSTACLE_DISTANCE_CM) || (distance2 < OBSTACLE_DISTANCE_CM) || (distance3 < OBSTACLE_DISTANCE_CM);
  bool allClearWithMargin = (distance1 > OBSTACLE_DISTANCE_CM + CLEAR_HYSTERESIS_CM) &&
                            (distance2 > OBSTACLE_DISTANCE_CM + CLEAR_HYSTERESIS_CM) &&
                            (distance3 > OBSTACLE_DISTANCE_CM + CLEAR_HYSTERESIS_CM);

  if (anyBelow) {
    obstacleHitCount = min(obstacleHitCount + 1, REQUIRED_CONSECUTIVE_HITS);
    clearHitCount = 0;
  } else if (allClearWithMargin) {
    clearHitCount = min(clearHitCount + 1, REQUIRED_CONSECUTIVE_HITS);
    obstacleHitCount = 0;
  }

  if (!obstacleLatched && obstacleHitCount >= REQUIRED_CONSECUTIVE_HITS) {
    obstacleLatched = true;
    Serial.print("⚠️ OBSTACLE LATCHED! UTS1: ");
    Serial.print(distance1);
    Serial.print("cm, UTS2: ");
    Serial.print(distance2);
    Serial.print("cm, UTS3: ");
    Serial.print(distance3);
    Serial.println("cm");
  }

  if (obstacleLatched && clearHitCount >= REQUIRED_CONSECUTIVE_HITS) {
    obstacleLatched = false;
    Serial.println("✅ OBSTACLE CLEARED (debounced)");
  }

  return obstacleLatched;
}

void testUltrasonicSensors() {
  Serial.println("🔍 Testing Ultrasonic Sensors...");
  
  long distance1 = readUltrasonicDistance(UTS1_TRIG, UTS1_ECHO);
  long distance2 = readUltrasonicDistance(UTS2_TRIG, UTS2_ECHO);
  long distance3 = readUltrasonicDistance(UTS3_TRIG, UTS3_ECHO);
  
  Serial.print("UTS1 (Front): ");
  Serial.print(distance1);
  Serial.println(" cm");
  
  Serial.print("UTS2 (Left): ");
  Serial.print(distance2);
  Serial.println(" cm");
  
  Serial.print("UTS3 (Right): ");
  Serial.print(distance3);
  Serial.println(" cm");
  
  if (checkForObstacles()) {
    Serial.println("⚠️ Obstacle detected by at least one sensor!");
  } else {
    Serial.println("✅ No obstacles detected");
  }
}

void testGyroSensor() {
  Serial.println("🔍 Testing ADXL345 Gyroscope...");
  Serial.println("Reading 10 samples over 2 seconds:");
  Serial.println("Format: X | Y | Z | ΔX | ΔY | Status");
  Serial.println("----------------------------------------");
  
  for (int i = 0; i < 10; i++) {
    int16_t x, y, z;
    if (readAccel(x, y, z)) {
      int deltaX = x - normalX;
      int deltaY = y - normalY;
      
      Serial.print("Sample "); Serial.print(i + 1); Serial.print(": ");
      Serial.print("X="); Serial.print(x);
      Serial.print(" Y="); Serial.print(y);
      Serial.print(" Z="); Serial.print(z);
      Serial.print(" | ΔX="); Serial.print(deltaX);
      Serial.print(" ΔY="); Serial.print(deltaY);
      
      // Interpret tilt direction
      if (deltaX > tolerance) {
        Serial.print(" | TILTED RIGHT");
      } else if (deltaX < -tolerance) {
        Serial.print(" | TILTED LEFT");
      } else {
        Serial.print(" | LEVEL X");
      }
      
      if (abs(deltaY) > tolerance) {
        Serial.print(", Y UNSTABLE");
      } else {
        Serial.print(", Y STABLE");
      }
      
      Serial.println();
    } else {
      Serial.print("Sample "); Serial.print(i + 1); Serial.println(": ❌ READ FAILED!");
    }
    delay(200);
  }
  
  Serial.println("----------------------------------------");
  Serial.print("Reference values - X: "); Serial.print(normalX);
  Serial.print(", Y: "); Serial.print(normalY);
  Serial.print(", Tolerance: ±"); Serial.println(tolerance);
  Serial.println("✅ Gyro test complete");
}

// --- Table indicator helpers ---
void tableArrived(int tableNumber) {
  int pin = -1;
  if (tableNumber == 1) pin = TABLE1_LED_PIN;
  else if (tableNumber == 2) pin = TABLE2_LED_PIN;
  else if (tableNumber == 3) pin = TABLE3_LED_PIN;
  if (pin == -1) return;
  digitalWrite(pin, HIGH);
  Serial.print("TABLE");
  Serial.print(tableNumber);
  Serial.println("_LIGHT:ON");
}

void tableReceived(int tableNumber) {
  int pin = -1;
  if (tableNumber == 1) pin = TABLE1_LED_PIN;
  else if (tableNumber == 2) pin = TABLE2_LED_PIN;
  else if (tableNumber == 3) pin = TABLE3_LED_PIN;
  if (pin == -1) return;
  digitalWrite(pin, LOW);
  Serial.print("TABLE");
  Serial.print(tableNumber);
  Serial.println("_LIGHT:OFF");
}

void setup() {
  // Initialize serial communication
  Serial.begin(9600);
  myWire.begin();
  
  // Check ADXL345 sensor
  myWire.beginTransmission(ADXL345_ADDR);
  if (myWire.endTransmission() != 0) {
    Serial.println("❌ ADXL345 not detected! Check wiring.");
    while (1);
  }
  
  Serial.println("✅ ADXL345 detected successfully!");
  
  // Configure ADXL345
  writeTo(0x2D, 0x08); // Measurement mode
  writeTo(0x31, 0x0B); // Full resolution ±16g
  writeTo(0x2C, 0x0A); // 100Hz rate
  
  // Test read gyro values
  int16_t x, y, z;
  delay(100);
  if (readAccel(x, y, z)) {
    Serial.println("🔍 Initial ADXL345 readings:");
    Serial.print("  X: "); Serial.print(x);
    Serial.print("  Y: "); Serial.print(y);
    Serial.print("  Z: "); Serial.println(z);
    Serial.print("  Reference X: "); Serial.print(normalX);
    Serial.print("  Reference Y: "); Serial.println(normalY);
  } else {
    Serial.println("⚠️ Warning: Could not read ADXL345 initial values!");
  }
  
  // Set motor pins as outputs (using correct pin assignments)
  pinMode(motorA1, OUTPUT);
  pinMode(motorB1, OUTPUT);
  pinMode(speedMotorAB, OUTPUT);
  pinMode(motora2, OUTPUT);
  pinMode(motorb2, OUTPUT);
  pinMode(speedMotorab, OUTPUT);
  
  // Set ultrasonic sensor pins
  pinMode(UTS1_TRIG, OUTPUT);
  pinMode(UTS1_ECHO, INPUT);
  pinMode(UTS2_TRIG, OUTPUT);
  pinMode(UTS2_ECHO, INPUT);
  pinMode(UTS3_TRIG, OUTPUT);
  pinMode(UTS3_ECHO, INPUT);

  // Set table indicator pins
  pinMode(TABLE1_LED_PIN, OUTPUT);
  pinMode(TABLE2_LED_PIN, OUTPUT);
  pinMode(TABLE3_LED_PIN, OUTPUT);
  digitalWrite(TABLE1_LED_PIN, LOW);
  digitalWrite(TABLE2_LED_PIN, LOW);
  digitalWrite(TABLE3_LED_PIN, LOW);
  
  // Initialize motors as stopped and ensure isMoving is false
  stopMotors();
  isMoving = false;  // Explicitly reset movement flag
  
  Serial.println("✅ MesaMate Robot Ready - Precision Mode with Gyroscope & Ultrasonic Sensors");
  Serial.println("Commands: FORWARD, LEFT, RIGHT, STOP, TEST_UTS, TEST_GYRO, RESET");
  Serial.println("Precision Commands: MOVE_DISTANCE:<inches>, TURN_ANGLE:<degrees>");
  Serial.println("Table Commands: TABLE1_ARRIVED, TABLE1_RECEIVED, TABLE2_ARRIVED, TABLE2_RECEIVED, TABLE3_ARRIVED, TABLE3_RECEIVED");
  Serial.println("Calibration: 24 inches in 6 seconds = 1 unit (4 inches/second)");
  if (UTS_ENABLED) {
    Serial.println("Obstacle Detection: ENABLED (stops if any UTS < 20.32cm)");
  } else {
    Serial.println("Obstacle Detection: DISABLED (testing motor/app sync)");
  }
  delay(500);
}

void loop() {
  // Publish obstacle state changes continuously (only if enabled)
  if (UTS_ENABLED) {
    static bool lastObstacle = false;
    bool obstacleNow = checkForObstacles();
    if (obstacleNow != lastObstacle) {
      if (obstacleNow) {
        Serial.println("OBSTACLE:DETECTED");
      } else {
        Serial.println("OBSTACLE:CLEARED");
      }
      lastObstacle = obstacleNow;
    }
  }

  // Check for incoming commands
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    command.toUpperCase();
    
    Serial.println("Received: " + command);
    
    // Handle precision distance commands
    if (command.startsWith("MOVE_DISTANCE:")) {
      float distance = command.substring(14).toFloat();
      moveDistance(distance);
    }
    // Handle precision angle commands
    else if (command.startsWith("TURN_ANGLE:")) {
      float angle = command.substring(11).toFloat();
      turnAngle(angle);
    }
    // Handle legacy commands
    else if (command == "FORWARD") {
      moveForward();
    } else if (command == "LEFT") {
      turnLeft();
    } else if (command == "RIGHT") {
      turnRight();
    } else if (command == "STOP") {
      stopMotors();
    } else if (command == "TEST_UTS") {
      testUltrasonicSensors();
    } else if (command == "TEST_GYRO") {
      testGyroSensor();
    } else if (command == "TABLE1_ARRIVED") {
      tableArrived(1);
    } else if (command == "TABLE1_RECEIVED") {
      tableReceived(1);
    } else if (command == "TABLE2_ARRIVED") {
      tableArrived(2);
    } else if (command == "TABLE2_RECEIVED") {
      tableReceived(2);
    } else if (command == "TABLE3_ARRIVED") {
      tableArrived(3);
    } else if (command == "TABLE3_RECEIVED") {
      tableReceived(3);
    } else if (command == "STATUS") {
      Serial.println(getStatus());
    } else if (command == "RESET") {
      // Emergency reset command to clear stuck state
      stopMotors();
      isMoving = false;
      isPrecisionMode = false;
      pausedForObstacle = false;
      currentCommand = "STOP";
      Serial.println("✅ Robot state RESET - ready for commands");
    } else {
      Serial.println("Unknown command: " + command);
    }
  }
  
  // Check if precision movement is complete
  if (isMoving && isPrecisionMode) {
    checkPrecisionMovement();
  }
  
  delay(10);
}

// --- Gyroscope-corrected forward movement function ---
void moveForwardWithGyro(int leftSpeed, int rightSpeed) {
  digitalWrite(motorA1, HIGH);
  digitalWrite(motorB1, LOW);
  analogWrite(speedMotorAB, leftSpeed);

  digitalWrite(motora2, HIGH);
  digitalWrite(motorb2, LOW);
  analogWrite(speedMotorab, rightSpeed);
}

// Move robot forward with gyroscope correction
void moveForward() {
  if (isMoving) {
    Serial.println("⚠️ BLOCKED: Robot already moving. Send RESET if stuck.");
    return;
  }
  
  isMoving = true;
  currentCommand = "FORWARD";
  
  Serial.println("Moving forward with gyroscope correction...");
  
  // Move for specified time with gyroscope correction and obstacle detection
  unsigned long startTime = millis();
  unsigned long lastDebug = 0;
  
  while (millis() - startTime < forwardTime) {
    // Check for obstacles first - stop immediately if detected (only if enabled)
    if (UTS_ENABLED && checkForObstacles()) {
      Serial.println("🛑 STOPPING - Obstacle detected!");
      stopMotors();
      isMoving = false;
      return;
    }
    
    // Read gyroscope data
    int16_t x, y, z;
    if (readAccel(x, y, z)) {
      int deltaX = x - normalX;
      int deltaY = y - normalY;

      int leftSpeed = baseLeft;
      int rightSpeed = baseRight;

      // --- Tilt Correction (X-axis) ---
      if (deltaX > tolerance) {
        // Tilted RIGHT → boost right motor slightly
        rightSpeed += constrain(abs(deltaX) / 4, 0, 25);
      } 
      else if (deltaX < -tolerance) {
        // Tilted LEFT → boost left motor slightly
        leftSpeed += constrain(abs(deltaX) / 4, 0, 25);
      }

      // --- Stability (Y-axis small adjustment) ---
      if (abs(deltaY) > tolerance) {
        int adjust = constrain(abs(deltaY) / 10, 0, 8);
        leftSpeed -= adjust;
        rightSpeed -= adjust;
      }

      // --- Ensure minimum forward speed = 100 ---
      leftSpeed = constrain(leftSpeed, 100, 255);
      rightSpeed = constrain(rightSpeed, 100, 255);

      // --- Debug output every 200ms ---
      unsigned long now = millis();
      if (now - lastDebug > 200) {
        Serial.print("🔍 GYRO X:"); Serial.print(x);
        Serial.print(" Y:"); Serial.print(y);
        Serial.print(" | ΔX:"); Serial.print(deltaX);
        Serial.print(" ΔY:"); Serial.print(deltaY);
        Serial.print(" | L:"); Serial.print(leftSpeed);
        Serial.print(" R:"); Serial.println(rightSpeed);
        lastDebug = now;
      }

      // --- Drive motors with correction ---
      moveForwardWithGyro(leftSpeed, rightSpeed);
    } else {
      // Fallback to basic forward movement if gyroscope fails
      Serial.println("⚠️ GYRO READ FAILED - using base speed");
      moveForwardWithGyro(baseLeft, baseRight);
    }
    
    delay(50); // Small delay for gyroscope and ultrasonic readings
  }
  
  // Stop motors
  stopMotors();
  isMoving = false;
  
  Serial.println("Forward movement complete");
}

// Turn robot left (90 degrees)
void turnLeft() {
  if (isMoving) {
    Serial.println("⚠️ BLOCKED: Robot already moving. Send RESET if stuck.");
    return;
  }
  
  isMoving = true;
  currentCommand = "LEFT";
  
  // Set left motor backward (slower)
  digitalWrite(motorA1, LOW);
  digitalWrite(motorB1, HIGH);
  analogWrite(speedMotorAB, turnSpeed);
  
  // Set right motor forward (faster)
  digitalWrite(motora2, HIGH);
  digitalWrite(motorb2, LOW);
  analogWrite(speedMotorab, turnSpeed);
  
  Serial.println("Turning left...");
  
  // Turn for specified time
  delay(turnTime);
  
  // Stop motors
  stopMotors();
  isMoving = false;
  
  Serial.println("Left turn complete");
}

// Turn robot right (90 degrees)
void turnRight() {
  if (isMoving) {
    Serial.println("⚠️ BLOCKED: Robot already moving. Send RESET if stuck.");
    return;
  }
  
  isMoving = true;
  currentCommand = "RIGHT";
  
  // Set left motor forward (faster)
  digitalWrite(motorA1, HIGH);
  digitalWrite(motorB1, LOW);
  analogWrite(speedMotorAB, turnSpeed);
  
  // Set right motor backward (slower)
  digitalWrite(motora2, LOW);
  digitalWrite(motorb2, HIGH);
  analogWrite(speedMotorab, turnSpeed);
  
  Serial.println("Turning right...");
  
  // Turn for specified time
  delay(turnTime);
  
  // Stop motors
  stopMotors();
  isMoving = false;
  
  Serial.println("Right turn complete");
}

// Stop all motors
void stopMotors() {
  isMoving = false;
  currentCommand = "STOP";
  
  // Stop left motor
  digitalWrite(motorA1, LOW);
  digitalWrite(motorB1, LOW);
  analogWrite(speedMotorAB, 0);
  
  // Stop right motor
  digitalWrite(motora2, LOW);
  digitalWrite(motorb2, LOW);
  analogWrite(speedMotorab, 0);
  
  Serial.println("Motors stopped");
}

// Emergency stop function
void emergencyStop() {
  stopMotors();
  Serial.println("EMERGENCY STOP");
}

// Precision movement functions
void moveDistance(float inches) {
  if (isMoving) {
    Serial.println("⚠️ BLOCKED: Robot already moving. Send RESET if stuck.");
    return;
  }
  
  isMoving = true;
  isPrecisionMode = true;
  currentCommand = "MOVE_DISTANCE";
  targetDistance = inches;
  movementStartTime = millis();
  pausedForObstacle = false;
  totalPausedMs = 0;
  
  // Calculate movement time based on distance
  unsigned long movementTime = (unsigned long)(inches * MS_PER_INCH);
  
  Serial.print("Moving ");
  Serial.print(inches);
  Serial.print(" inches (");
  Serial.print(movementTime);
  Serial.println("ms) with GYRO correction");
  
  // Start forward movement - motors will be controlled in checkPrecisionMovement()
  // with gyro correction applied continuously
}

void turnAngle(float degrees) {
  if (isMoving) {
    Serial.println("⚠️ BLOCKED: Robot already moving. Send RESET if stuck.");
    return;
  }
  
  isMoving = true;
  isPrecisionMode = true;
  currentCommand = "TURN_ANGLE";
  targetAngle = degrees;
  movementStartTime = millis();
  
  // Calculate turn time based on angle
  unsigned long turnTime = (unsigned long)(abs(degrees) / DEGREES_PER_MS);
  
  Serial.print("Turning ");
  Serial.print(degrees);
  Serial.print(" degrees (");
  Serial.print(turnTime);
  Serial.println("ms)");
  
  if (degrees > 0) {
    // Turn right
    digitalWrite(motorA1, HIGH);
    digitalWrite(motorB1, LOW);
    analogWrite(speedMotorAB, turnSpeed);
    
    digitalWrite(motora2, LOW);
    digitalWrite(motorb2, HIGH);
    analogWrite(speedMotorab, turnSpeed);
  } else {
    // Turn left
    digitalWrite(motorA1, LOW);
    digitalWrite(motorB1, HIGH);
    analogWrite(speedMotorAB, turnSpeed);
    
    digitalWrite(motora2, HIGH);
    digitalWrite(motorb2, LOW);
    analogWrite(speedMotorab, turnSpeed);
  }
}

void checkPrecisionMovement() {
  unsigned long currentTime = millis();
  unsigned long effectiveElapsed = currentTime - movementStartTime - totalPausedMs;
  
  bool shouldStop = false;
  
  // Check for obstacles first (only during forward movement)
  if (currentCommand == "MOVE_DISTANCE") {
    bool obstacle = UTS_ENABLED && checkForObstacles();
    if (obstacle) {
      if (!pausedForObstacle) {
        // Pause motors but do not end the movement
        stopMotors();
        pausedForObstacle = true;
        pauseStartTime = currentTime;
        Serial.println("MOVEMENT_PAUSED:OBSTACLE");
      }
      // While paused, we just wait
    } else {
      if (pausedForObstacle) {
        // Resume motors and adjust paused duration
        totalPausedMs += (currentTime - pauseStartTime);
        pausedForObstacle = false;
        Serial.println("MOVEMENT_RESUMED");
      }
      
      // Apply gyro correction during movement (when not paused)
      if (!pausedForObstacle) {
        int16_t x, y, z;
        if (readAccel(x, y, z)) {
          int deltaX = x - normalX;
          int deltaY = y - normalY;

          int leftSpeed = precisionSpeed;
          int rightSpeed = precisionSpeed;

          // --- Tilt Correction (X-axis) ---
          if (deltaX > tolerance) {
            // Tilted RIGHT → boost right motor to correct
            rightSpeed += constrain(abs(deltaX) / 4, 0, 30);
          } 
          else if (deltaX < -tolerance) {
            // Tilted LEFT → boost left motor to correct
            leftSpeed += constrain(abs(deltaX) / 4, 0, 30);
          }

          // --- Stability (Y-axis small adjustment) ---
          if (abs(deltaY) > tolerance) {
            int adjust = constrain(abs(deltaY) / 10, 0, 10);
            leftSpeed -= adjust;
            rightSpeed -= adjust;
          }

          // --- Ensure safe speed range ---
          leftSpeed = constrain(leftSpeed, 100, 255);
          rightSpeed = constrain(rightSpeed, 100, 255);

          // --- Debug output every 200ms ---
          static unsigned long lastDebug = 0;
          if (currentTime - lastDebug > 200) {
            Serial.print("🔍 GYRO X:"); Serial.print(x);
            Serial.print(" Y:"); Serial.print(y);
            Serial.print(" | ΔX:"); Serial.print(deltaX);
            Serial.print(" ΔY:"); Serial.print(deltaY);
            Serial.print(" | L:"); Serial.print(leftSpeed);
            Serial.print(" R:"); Serial.println(rightSpeed);
            lastDebug = currentTime;
          }

          // --- Drive motors with gyro correction ---
          digitalWrite(motorA1, HIGH);
          digitalWrite(motorB1, LOW);
          analogWrite(speedMotorAB, leftSpeed);
          
          digitalWrite(motora2, HIGH);
          digitalWrite(motorb2, LOW);
          analogWrite(speedMotorab, rightSpeed);
        } else {
          // Fallback if gyro read fails
          Serial.println("⚠️ GYRO READ FAILED - using base speed");
          digitalWrite(motorA1, HIGH);
          digitalWrite(motorB1, LOW);
          analogWrite(speedMotorAB, precisionSpeed);
          digitalWrite(motora2, HIGH);
          digitalWrite(motorb2, LOW);
          analogWrite(speedMotorab, precisionSpeed);
        }
      }
    }

    // Only check completion when not paused
    if (!pausedForObstacle) {
      unsigned long targetTime = (unsigned long)(targetDistance * MS_PER_INCH);
      if (effectiveElapsed >= targetTime) {
        shouldStop = true;
        Serial.print("Distance movement complete: ");
        Serial.print(targetDistance);
        Serial.println(" inches");
        Serial.println("MOVEMENT_COMPLETE:SUCCESS");
      }
    }
  } else if (currentCommand == "TURN_ANGLE") {
    unsigned long targetTime = (unsigned long)(abs(targetAngle) / DEGREES_PER_MS);
    if (effectiveElapsed >= targetTime) {
      shouldStop = true;
      Serial.print("Angle turn complete: ");
      Serial.print(targetAngle);
      Serial.println(" degrees");
      Serial.println("MOVEMENT_COMPLETE:SUCCESS");
    }
  }
  
  if (shouldStop) {
    stopMotors();
    isPrecisionMode = false;
  }
}

// Get current robot status
String getStatus() {
  String status = "Status: ";
  status += isMoving ? "Moving" : "Stopped";
  status += " | Command: " + currentCommand;
  if (isPrecisionMode) {
    status += " | Precision Mode";
    if (currentCommand == "MOVE_DISTANCE") {
      status += " | Target: " + String(targetDistance) + " inches";
    } else if (currentCommand == "TURN_ANGLE") {
      status += " | Target: " + String(targetAngle) + " degrees";
    }
  }
  return status;
}
