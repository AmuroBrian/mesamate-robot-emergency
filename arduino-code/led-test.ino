// LED Test for MesaMate Robot
// Tests LED1, LED2, and LED3 functionality
// Serial Commands: 1 (LED1), 2 (LED2), 3 (LED3), 0 (All OFF), T (Test All)

// LED pins (from simple-robot-control.ino)
const int LED1_PIN = 20;     // Table 1 indicator
const int LED2_PIN = 32;     // Table 2 indicator
const int LED3_PIN = 34;     // Table 3 indicator

// Test timing
const int LED_ON_TIME = 1000;    // 1 second per LED
const int LED_OFF_TIME = 500;    // 0.5 seconds between LEDs

void setup() {
  Serial.begin(9600);
  
  // Set LED pins as outputs
  pinMode(LED1_PIN, OUTPUT);
  pinMode(LED2_PIN, OUTPUT);
  pinMode(LED3_PIN, OUTPUT);
  
  // Initialize all LEDs off
  digitalWrite(LED1_PIN, LOW);
  digitalWrite(LED2_PIN, LOW);
  digitalWrite(LED3_PIN, LOW);
  
  Serial.println("MesaMate LED Test Ready");
  Serial.println("Commands:");
  Serial.println("1 - Turn on LED1");
  Serial.println("2 - Turn on LED2");
  Serial.println("3 - Turn on LED3");
  Serial.println("0 - Turn off all LEDs");
  Serial.println("T - Test all LEDs (automatic sequence)");
  Serial.println("A - All LEDs on");
  Serial.println("B - Blink all LEDs 3 times");
  Serial.println();
  Serial.println("Starting automatic LED test in 3 seconds...");
  
  delay(3000);
  testAllLEDs();
}

void loop() {
  // Check for serial commands
  if (Serial.available()) {
    char command = Serial.read();
    command = toupper(command);
    
    Serial.print("Received command: ");
    Serial.println(command);
    
    switch (command) {
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
      case 'T':
        testAllLEDs();
        break;
      case 'A':
        turnOnAllLEDs();
        break;
      case 'B':
        blinkAllLEDs();
        break;
      default:
        Serial.println("Unknown command");
        break;
    }
  }
  
  delay(50);
}

// Test all LEDs in sequence
void testAllLEDs() {
  Serial.println("=== Starting LED Test Sequence ===");
  
  // Test LED1
  Serial.println("Testing LED1...");
  digitalWrite(LED1_PIN, HIGH);
  delay(LED_ON_TIME);
  digitalWrite(LED1_PIN, LOW);
  delay(LED_OFF_TIME);
  
  // Test LED2
  Serial.println("Testing LED2...");
  digitalWrite(LED2_PIN, HIGH);
  delay(LED_ON_TIME);
  digitalWrite(LED2_PIN, LOW);
  delay(LED_OFF_TIME);
  
  // Test LED3
  Serial.println("Testing LED3...");
  digitalWrite(LED3_PIN, HIGH);
  delay(LED_ON_TIME);
  digitalWrite(LED3_PIN, LOW);
  delay(LED_OFF_TIME);
  
  // Test all LEDs together
  Serial.println("Testing all LEDs together...");
  digitalWrite(LED1_PIN, HIGH);
  digitalWrite(LED2_PIN, HIGH);
  digitalWrite(LED3_PIN, HIGH);
  delay(LED_ON_TIME);
  
  // Turn all off
  turnOffAllLEDs();
  
  Serial.println("=== LED Test Complete ===");
  Serial.println("All LEDs tested successfully!");
  Serial.println();
}

// Control individual LED
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

// Turn on all LEDs
void turnOnAllLEDs() {
  digitalWrite(LED1_PIN, HIGH);
  digitalWrite(LED2_PIN, HIGH);
  digitalWrite(LED3_PIN, HIGH);
  Serial.println("All LEDs ON");
}

// Blink all LEDs 3 times
void blinkAllLEDs() {
  Serial.println("Blinking all LEDs 3 times...");
  
  for (int i = 0; i < 3; i++) {
    // Turn all on
    digitalWrite(LED1_PIN, HIGH);
    digitalWrite(LED2_PIN, HIGH);
    digitalWrite(LED3_PIN, HIGH);
    delay(300);
    
    // Turn all off
    digitalWrite(LED1_PIN, LOW);
    digitalWrite(LED2_PIN, LOW);
    digitalWrite(LED3_PIN, LOW);
    delay(300);
  }
  
  Serial.println("Blink sequence complete");
}
