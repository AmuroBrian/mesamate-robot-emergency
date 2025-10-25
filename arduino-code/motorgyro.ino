#include <SoftwareWire.h>

// --- ADXL345 (Software I2C using A4/A5) ---
const bool USE_ADXL345 = false; // Set to true to enable ADXL345

#if USE_ADXL345
SoftwareWire myWire(A4, A5);
const byte ADXL345_ADDR = 0x53;
#endif

// --- Motor pins ---
int motorA1 = 6;       // Left motor IN1
int motorB1 = 5;       // Left motor IN2
int speedMotorAB = 7;  // Left motor ENA (PWM)

int motora2 = 8;       // Right motor IN3
int motorb2 = 9;       // Right motor IN4
int speedMotorab = 10; // Right motor ENB (PWM)

// --- Base Speeds ---
int baseLeft = 120;
int baseRight = 120;

// --- Stop state (starts stopped by default) ---
bool isStopped = true;

// --- Rotation state ---
bool isRotating = false;
char rotationDirection = ' '; // 'L' for left, 'R' for right

// --- Reference ADXL steady values ---
const int normalX = 13;
const int normalY = 172;
const int tolerance = 4;

// --- I2C helpers ---
#if USE_ADXL345
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
#endif

// --- Setup ---
void setup() {
  Serial.begin(9600);
  
#if USE_ADXL345
  myWire.begin();
  // Check sensor
  myWire.beginTransmission(ADXL345_ADDR);
  if (myWire.endTransmission() != 0) {
    Serial.println("❌ ADXL345 not detected! Check wiring.");
    while (1);
  }
  writeTo(0x2D, 0x08); // Measurement mode
  writeTo(0x31, 0x0B); // Full resolution ±16g
  writeTo(0x2C, 0x0A); // 100Hz rate
#endif

  // Setup motors
  pinMode(motorA1, OUTPUT);
  pinMode(motorB1, OUTPUT);
  pinMode(speedMotorAB, OUTPUT);

  pinMode(motora2, OUTPUT);
  pinMode(motorb2, OUTPUT);
  pinMode(speedMotorab, OUTPUT);

#if USE_ADXL345
  Serial.println("✅ ADXL345 + Motor Auto-Correct Initialized");
#else
  Serial.println("✅ Motor Control Initialized (ADXL345 disabled)");
#endif
  delay(500);
}

// --- Move forward function ---
void moveForward(int leftSpeed, int rightSpeed) {
  digitalWrite(motorA1, HIGH);
  digitalWrite(motorB1, LOW);
  analogWrite(speedMotorAB, leftSpeed);

  digitalWrite(motora2, HIGH);
  digitalWrite(motorb2, LOW);
  analogWrite(speedMotorab, rightSpeed);
}

// --- Rotate left function ---
void rotateLeft(int speed) {
  // Left motor backward, right motor forward
  digitalWrite(motorA1, LOW);
  digitalWrite(motorB1, HIGH);
  analogWrite(speedMotorAB, speed);

  digitalWrite(motora2, HIGH);
  digitalWrite(motorb2, LOW);
  analogWrite(speedMotorab, speed);
}

// --- Rotate right function ---
void rotateRight(int speed) {
  // Left motor forward, right motor backward
  digitalWrite(motorA1, HIGH);
  digitalWrite(motorB1, LOW);
  analogWrite(speedMotorAB, speed);

  digitalWrite(motora2, LOW);
  digitalWrite(motorb2, HIGH);
  analogWrite(speedMotorab, speed);
}

// --- Stop motors function ---
void stopMotors() {
  // Cut PWM to both motors
  analogWrite(speedMotorAB, 0);
  analogWrite(speedMotorab, 0);
  // Ensure H-bridge inputs are low
  digitalWrite(motorA1, LOW);
  digitalWrite(motorB1, LOW);
  digitalWrite(motora2, LOW);
  digitalWrite(motorb2, LOW);
}

// --- Main Loop ---
void loop() {
  // --- Check for serial commands ---
  if (Serial.available() > 0) {
    char cmd = Serial.read();
    if (cmd == 'S' || cmd == 's') {
      isStopped = true;
      isRotating = false;
      Serial.println("\xF0\x9F\x9B\x91 Stop command received");
    }
    else if (cmd == 'G' || cmd == 'g') {
      isStopped = false;
      isRotating = false;
      Serial.println("\xE2\x96\xB6\xEF\xB8\x8F Go command received - resuming forward movement");
    }
    else if (cmd == 'R' || cmd == 'r') {
      baseLeft += 5;
      baseLeft = constrain(baseLeft, 50, 255);
      Serial.print("🔧 Left motor speed increased to: ");
      Serial.println(baseLeft);
    }
    else if (cmd == 'L' || cmd == 'l') {
      baseRight += 5;
      baseRight = constrain(baseRight, 50, 255);
      Serial.print("🔧 Right motor speed increased to: ");
      Serial.println(baseRight);
    }
    else if (cmd == 'Q' || cmd == 'q') {
      baseLeft -= 5;
      baseLeft = constrain(baseLeft, 50, 255);
      Serial.print("🔧 Left motor speed decreased to: ");
      Serial.println(baseLeft);
    }
    else if (cmd == 'W' || cmd == 'w') {
      baseRight -= 5;
      baseRight = constrain(baseRight, 50, 255);
      Serial.print("🔧 Right motor speed decreased to: ");
      Serial.println(baseRight);
    }
    else if (cmd == 'A' || cmd == 'a') {
      // Rotate left
      isStopped = false;
      isRotating = true;
      rotationDirection = 'L';
      Serial.println("🔄 Rotating LEFT");
    }
    else if (cmd == 'D' || cmd == 'd') {
      // Rotate right
      isStopped = false;
      isRotating = true;
      rotationDirection = 'R';
      Serial.println("🔄 Rotating RIGHT");
    }
    else if (cmd == 'I' || cmd == 'i') {
      Serial.println("📊 Current motor speeds:");
      Serial.print("  Left: "); Serial.print(baseLeft);
      Serial.print(" | Right: "); Serial.println(baseRight);
      Serial.println("🎮 Commands: S=Stop, G=Go, A=RotateLeft, D=RotateRight");
      Serial.println("🎮 Speed: R=Right+, L=Left+, Q=Right-, W=Left-, I=Info");
    }
  }

  if (isStopped) {
    stopMotors();
    delay(100);
    return;
  }

  // Handle rotation
  if (isRotating) {
    int rotationSpeed = (baseLeft + baseRight) / 2; // Use average speed for rotation
    if (rotationDirection == 'L') {
      rotateLeft(rotationSpeed);
      Serial.print("🔄 Rotating LEFT at speed: ");
      Serial.println(rotationSpeed);
    } else if (rotationDirection == 'R') {
      rotateRight(rotationSpeed);
      Serial.print("🔄 Rotating RIGHT at speed: ");
      Serial.println(rotationSpeed);
    }
    delay(100);
    return;
  }

  int leftSpeed = baseLeft;
  int rightSpeed = baseRight;

#if USE_ADXL345
  int16_t x, y, z;
  if (!readAccel(x, y, z)) {
    Serial.println("⚠️ Read error from ADXL345");
    return;
  }

  int deltaX = x - normalX;
  int deltaY = y - normalY;

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

  // --- Debug info with ADXL345 ---
  Serial.print("X: "); Serial.print(x);
  Serial.print(" | Y: "); Serial.print(y);
  Serial.print(" | L: "); Serial.print(leftSpeed);
  Serial.print(" | R: "); Serial.println(rightSpeed);
#else
  // --- Simple forward movement without ADXL345 ---
  Serial.print("L: "); Serial.print(leftSpeed);
  Serial.print(" | R: "); Serial.println(rightSpeed);
#endif

  // --- Ensure minimum forward speed = 100 ---
  leftSpeed = constrain(leftSpeed, 100, 255);
  rightSpeed = constrain(rightSpeed, 100, 255);

  // --- Drive motors ---
  moveForward(leftSpeed, rightSpeed);

  delay(100);
}
