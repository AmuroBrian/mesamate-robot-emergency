// Simple Robot Control for MesaMate
// Serial Commands: F (Forward), L (Left), R (Right), S (Stop)
// LED Commands: 1 (LED1), 2 (LED2), 3 (LED3)
// Ultrasonic sensor stops forward movement when obstacle detected

// Motor pins (from sample.ino)
const int motorA1 = 6;       // Left motor IN1
const int motorB1 = 5;       // Left motor IN2
const int speedMotorAB = 7;  // Left motor ENA (PWM)

const int motora2 = 8;       // Right motor IN3
const int motorb2 = 9;       // Right motor IN4
const int speedMotorab = 10; // Right motor ENB (PWM)

// Ultrasonic sensor pins (from sample.ino - 3 sensors)
const int UTS1_TRIG = 36;    // UTS1 Trigger pin
const int UTS1_ECHO = 38;    // UTS1 Echo pin
const int UTS2_TRIG = 40;    // UTS2 Trigger pin
const int UTS2_ECHO = 42;    // UTS2 Echo pin
const int UTS3_TRIG = 44;    // UTS3 Trigger pin
const int UTS3_ECHO = 46;    // UTS3 Echo pin

// LED pins (from sample.ino)
const int LED1_PIN = 20;     // Table 1 indicator
const int LED2_PIN = 32;     // Table 2 indicator
const int LED3_PIN = 34;     // Table 3 indicator

// Motor speeds
const int forwardSpeed = 150;
const int turnSpeed = 120;

// Obstacle detection
const float OBSTACLE_DISTANCE_CM = 20.0;  // 20cm = ~8 inches
bool isMovingForward = false;

void setup() {
  Serial.begin(9600);
  
  // Set motor pins as outputs
  pinMode(motorA1, OUTPUT);
  pinMode(motorB1, OUTPUT);
  pinMode(speedMotorAB, OUTPUT);
  pinMode(motora2, OUTPUT);
  pinMode(motorb2, OUTPUT);
  pinMode(speedMotorab, OUTPUT);
  
  // Set ultrasonic sensor pins (3 sensors)
  pinMode(UTS1_TRIG, OUTPUT);
  pinMode(UTS1_ECHO, INPUT);
  pinMode(UTS2_TRIG, OUTPUT);
  pinMode(UTS2_ECHO, INPUT);
  pinMode(UTS3_TRIG, OUTPUT);
  pinMode(UTS3_ECHO, INPUT);
  
  // Set LED pins
  pinMode(LED1_PIN, OUTPUT);
  pinMode(LED2_PIN, OUTPUT);
  pinMode(LED3_PIN, OUTPUT);
  
  // Initialize all LEDs off
  digitalWrite(LED1_PIN, LOW);
  digitalWrite(LED2_PIN, LOW);
  digitalWrite(LED3_PIN, LOW);
  
  // Stop all motors
  stopMotors();
  
  Serial.println("MesaMate Simple Robot Control Ready");
  Serial.println("Commands:");
  Serial.println("F - Forward");
  Serial.println("L - Turn Left (3 seconds)");
  Serial.println("R - Turn Right (3 seconds)");
  Serial.println("S - Stop");
  Serial.println("1 - Turn on LED1");
  Serial.println("2 - Turn on LED2");
  Serial.println("3 - Turn on LED3");
  Serial.println("0 - Turn off all LEDs");
}

void loop() {
  // Check for obstacle if moving forward
  if (isMovingForward) {
    if (checkForObstacles()) {
      Serial.println("Obstacle detected! Stopping...");
      stopMotors();
      isMovingForward = false;
    }
  }
  
  // Check for serial commands
  if (Serial.available()) {
    char command = Serial.read();
    command = toupper(command);
    
    Serial.print("Received command: ");
    Serial.println(command);
    
    switch (command) {
      case 'F':
        moveForward();
        break;
      case 'L':
        turnLeft();
        break;
      case 'R':
        turnRight();
        break;
      case 'S':
        stopMotors();
        break;
      case '1':
        controlLED(1);
        break;
      case '2':
        controlLED(2);
        break;
      case '3':
        controlLED(3);
        break;
      case '0':
        turnOffAllLEDs();
        break;
      default:
        Serial.println("Unknown command");
        break;
    }
  }
  
  delay(50);
}

// Read ultrasonic sensor distance for a specific sensor
float readUltrasonicDistance(int trigPin, int echoPin) {
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
    return 999.0; // Return large distance if no echo
  }
  
  // Calculate distance in cm
  float distance = duration * 0.0343 / 2;
  return distance;
}

// Check all 3 ultrasonic sensors for obstacles
bool checkForObstacles() {
  float distance1 = readUltrasonicDistance(UTS1_TRIG, UTS1_ECHO);
  delay(50); // Small delay between sensors
  float distance2 = readUltrasonicDistance(UTS2_TRIG, UTS2_ECHO);
  delay(50);
  float distance3 = readUltrasonicDistance(UTS3_TRIG, UTS3_ECHO);
  
  // Check if any sensor detects obstacle
  bool obstacle1 = distance1 < OBSTACLE_DISTANCE_CM;
  bool obstacle2 = distance2 < OBSTACLE_DISTANCE_CM;
  bool obstacle3 = distance3 < OBSTACLE_DISTANCE_CM;
  
  if (obstacle1 || obstacle2 || obstacle3) {
    Serial.print("Obstacle detected - UTS1: ");
    Serial.print(distance1);
    Serial.print("cm, UTS2: ");
    Serial.print(distance2);
    Serial.print("cm, UTS3: ");
    Serial.print(distance3);
    Serial.println("cm");
    return true;
  }
  
  return false;
}

// Move forward
void moveForward() {
  Serial.println("Moving forward...");
  isMovingForward = true;
  
  // Set both motors forward
  digitalWrite(motorA1, HIGH);
  digitalWrite(motorB1, LOW);
  analogWrite(speedMotorAB, forwardSpeed);
  
  digitalWrite(motora2, HIGH);
  digitalWrite(motorb2, LOW);
  analogWrite(speedMotorab, forwardSpeed);
}

// Turn left for 3 seconds
void turnLeft() {
  Serial.println("Turning left for 3 seconds...");
  isMovingForward = false;
  
  // Set left motor backward, right motor forward
  digitalWrite(motorA1, LOW);
  digitalWrite(motorB1, HIGH);
  analogWrite(speedMotorAB, turnSpeed);
  
  digitalWrite(motora2, HIGH);
  digitalWrite(motorb2, LOW);
  analogWrite(speedMotorab, turnSpeed);
  
  // Turn for 3 seconds
  delay(3000);
  
  // Stop after turning
  stopMotors();
  Serial.println("Left turn complete");
}

// Turn right for 3 seconds
void turnRight() {
  Serial.println("Turning right for 3 seconds...");
  isMovingForward = false;
  
  // Set left motor forward, right motor backward
  digitalWrite(motorA1, HIGH);
  digitalWrite(motorB1, LOW);
  analogWrite(speedMotorAB, turnSpeed);
  
  digitalWrite(motora2, LOW);
  digitalWrite(motorb2, HIGH);
  analogWrite(speedMotorab, turnSpeed);
  
  // Turn for 3 seconds
  delay(3000);
  
  // Stop after turning
  stopMotors();
  Serial.println("Right turn complete");
}

// Stop all motors
void stopMotors() {
  Serial.println("Stopping motors...");
  isMovingForward = false;
  
  // Stop left motor
  digitalWrite(motorA1, LOW);
  digitalWrite(motorB1, LOW);
  analogWrite(speedMotorAB, 0);
  
  // Stop right motor
  digitalWrite(motora2, LOW);
  digitalWrite(motorb2, LOW);
  analogWrite(speedMotorab, 0);
}

// Control LED
void controlLED(int ledNumber) {
  // Turn off all LEDs first
  turnOffAllLEDs();
  
  // Turn on selected LED
  switch (ledNumber) {
    case 1:
      digitalWrite(LED1_PIN, HIGH);
      Serial.println("LED1 ON");
      break;
    case 2:
      digitalWrite(LED2_PIN, HIGH);
      Serial.println("LED2 ON");
      break;
    case 3:
      digitalWrite(LED3_PIN, HIGH);
      Serial.println("LED3 ON");
      break;
  }
}

// Turn off all LEDs
void turnOffAllLEDs() {
  digitalWrite(LED1_PIN, LOW);
  digitalWrite(LED2_PIN, LOW);
  digitalWrite(LED3_PIN, LOW);
  Serial.println("All LEDs OFF");
}
