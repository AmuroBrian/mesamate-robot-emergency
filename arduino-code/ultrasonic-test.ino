// MesaMate Robot - Ultrasonic Sensors Test
// Simple standalone sketch to test 3 ultrasonic sensors

// Pin assignments (match robot-control.ino)
const int UTS1_TRIG = 36;    // Sensor 1 Trigger
const int UTS1_ECHO = 38;    // Sensor 1 Echo
const int UTS2_TRIG = 40;    // Sensor 2 Trigger
const int UTS2_ECHO = 42;    // Sensor 2 Echo
const int UTS3_TRIG = 44;    // Sensor 3 Trigger
const int UTS3_ECHO = 46;    // Sensor 3 Echo

// Measurement configuration
const int MAX_DISTANCE_CM = 200;      // Cap unrealistic readings
const int UTS_SAMPLES = 5;            // Median of N samples
const int INTER_SENSOR_DELAY_MS = 50; // Delay between sensors to avoid cross-talk
const int LOOP_DELAY_MS = 250;        // Print cadence

long readUltrasonicDistance(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 30000); // 30ms timeout (~5m max)
  if (duration == 0) return MAX_DISTANCE_CM;
  long distance = duration * 0.0343 / 2; // cm
  return distance > MAX_DISTANCE_CM ? MAX_DISTANCE_CM : distance;
}

long readUltrasonicMedian(int trigPin, int echoPin) {
  long readings[UTS_SAMPLES];
  for (int i = 0; i < UTS_SAMPLES; i++) {
    readings[i] = readUltrasonicDistance(trigPin, echoPin);
    delay(5);
  }
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

void setup() {
  Serial.begin(9600);

  pinMode(UTS1_TRIG, OUTPUT);
  pinMode(UTS1_ECHO, INPUT);
  pinMode(UTS2_TRIG, OUTPUT);
  pinMode(UTS2_ECHO, INPUT);
  pinMode(UTS3_TRIG, OUTPUT);
  pinMode(UTS3_ECHO, INPUT);

  digitalWrite(UTS1_TRIG, LOW);
  digitalWrite(UTS2_TRIG, LOW);
  digitalWrite(UTS3_TRIG, LOW);

  delay(200);
  Serial.println("✅ Ultrasonic Sensors Test Ready");
  Serial.println("Pins: UTS1(36/38), UTS2(40/42), UTS3(44/46)");
}

void loop() {
  long d1 = readUltrasonicMedian(UTS1_TRIG, UTS1_ECHO);
  delay(INTER_SENSOR_DELAY_MS);
  long d2 = readUltrasonicMedian(UTS2_TRIG, UTS2_ECHO);
  delay(INTER_SENSOR_DELAY_MS);
  long d3 = readUltrasonicMedian(UTS3_TRIG, UTS3_ECHO);

  Serial.print("UTS1:");
  Serial.print(d1);
  Serial.print("cm | UTS2:");
  Serial.print(d2);
  Serial.print("cm | UTS3:");
  Serial.print(d3);
  Serial.println("cm");

  delay(LOOP_DELAY_MS);
}


