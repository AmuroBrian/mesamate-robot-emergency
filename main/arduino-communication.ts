// Arduino Mega Communication System
// Handles serial communication with robot motors

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

export interface RobotPosition {
  x: number;
  y: number;
  direction: 'north' | 'south' | 'east' | 'west';
}

export interface MovementCommand {
  action: 'forward' | 'left' | 'right' | 'stop';
  duration?: number; // in milliseconds
}

export interface PrecisionMovementCommand {
  action: 'moveDistance' | 'turnAngle';
  value: number; // distance in inches or angle in degrees
  speed?: 'normal' | 'precision' | 'fast';
}

export interface MotorCalibration {
  inchesPerSecond: number;
  degreesPerSecond: number;
  baseSpeed: number;
  precisionSpeed: number;
}

export class ArduinoController {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private currentPosition: RobotPosition = {
    x: 2,
    y: 4,
    direction: 'north'
  };
  private isConnected = false;
  
  // Motor calibration constants (24 inches in 6 seconds = 1 unit)
  private readonly calibration: MotorCalibration = {
    inchesPerSecond: 4.0,  // 24 inches / 6 seconds = 4 inches/second
    degreesPerSecond: 180.0, // 90 degrees in 500ms = 180 degrees/second
    baseSpeed: 150,
    precisionSpeed: 100
  };

  constructor() {
    this.initializeConnection();
  }

  private async initializeConnection() {
    try {
      // List available ports
      const ports = await SerialPort.list();
      console.log('========== ARDUINO CONNECTION DEBUG ==========');
      console.log('Available ports:', JSON.stringify(ports, null, 2));

      // Find Arduino port (usually contains 'usb' or 'arduino' in description)
      const arduinoPort = ports.find(port => 
        port.manufacturer?.toLowerCase().includes('arduino') ||
        port.path.includes('usb') ||
        port.path.includes('tty.usb') ||
        port.path.includes('ttyUSB') ||
        port.path.includes('ttyACM')
      );

      if (!arduinoPort) {
        console.log('❌ Arduino not found!');
        console.log('Available ports:', ports.map(p => ({ path: p.path, manufacturer: p.manufacturer, productId: p.productId })));
        console.log('Looking for ports with: usb, tty.usb, ttyUSB, ttyACM, or arduino in manufacturer');
        console.log('==============================================');
        return;
      }

      console.log('✅ Found Arduino port:', arduinoPort.path);
      console.log('   Manufacturer:', arduinoPort.manufacturer);
      console.log('   Product ID:', arduinoPort.productId);

      // Create serial connection
      this.port = new SerialPort({
        path: arduinoPort.path,
        baudRate: 9600,
        autoOpen: false,
        // Raspberry Pi serial settings for better stability
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        rtscts: false,
        xon: false,
        xoff: false
      });
      
      console.log('Serial port settings: 9600 8N1');

      // Create parser for reading data
      this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

      // Handle connection events
      this.port.on('open', () => {
        console.log('✅ Arduino connected successfully');
        console.log('==============================================');
        this.isConnected = true;
      });

      this.port.on('error', (err) => {
        console.error('❌ Arduino connection error:', err);
        console.log('==============================================');
        this.isConnected = false;
      });

      this.port.on('close', () => {
        console.log('⚠️  Arduino disconnected');
        this.isConnected = false;
      });

      // Handle incoming data
      this.parser.on('data', (data) => {
        const response = data.toString().trim();
        console.log('📥 Arduino response:', response);
        
        // Handle movement completion signals
        if (response.startsWith('MOVEMENT_COMPLETE:')) {
          const status = response.split(':')[1];
          console.log('✅ Movement completed with status:', status);
          // Just log it - no need to wait for this anymore
        }

        // Handle blocked command warnings (indicates stuck state)
        if (response.includes('BLOCKED') || response.includes('already moving')) {
          console.log('⚠️  Arduino is in stuck state - automatically sending RESET');
          // Auto-reset if Arduino reports blocked state
          this.sendCommand('RESET').catch(err => console.error('Failed to auto-reset:', err));
        }

        // Forward obstacle state events to renderer via Electron IPC
        if (response === 'OBSTACLE:DETECTED' || response === 'OBSTACLE:CLEARED' ||
            response === 'MOVEMENT_PAUSED:OBSTACLE' || response === 'MOVEMENT_RESUMED') {
          try {
            const { BrowserWindow } = require('electron');
            const win = BrowserWindow.getAllWindows()[0];
            if (win) {
              win.webContents.send('robot-obstacle-event', response);
            }
          } catch (e) {
            console.warn('Failed to forward obstacle event:', e);
          }
        }
      });

      // Open the connection
      console.log('Opening serial port...');
      await this.port.open();
      
      // Wait for Arduino to reset after serial connection (DTR toggles reset on most Arduinos)
      console.log('Waiting for Arduino to initialize (3 seconds)...');
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error) {
      console.error('Failed to initialize Arduino connection:', error);
    }
  }

  // Send command to Arduino
  private async sendCommand(command: string): Promise<void> {
    if (!this.port || !this.isConnected) {
      console.log('⚠️  Arduino not connected, command not sent:', command);
      console.log('   Port exists:', !!this.port);
      console.log('   Is connected:', this.isConnected);
      return; // Gracefully handle disconnected state - don't throw
    }

    return new Promise((resolve, reject) => {
      try {
        if (!this.port) {
          resolve(); // Port became null, resolve gracefully
          return;
        }
        
        // Add timeout to prevent hanging
        const timeout = setTimeout(() => {
          console.warn('⚠️  Command timeout:', command);
          resolve(); // Resolve instead of reject to prevent crashes
        }, 5000); // 5 second timeout
        
        this.port.write(command + '\n', (err) => {
          clearTimeout(timeout);
          if (err) {
            console.error('❌ Error sending command:', command, err);
            resolve(); // Resolve instead of reject to prevent crashes
          } else {
            console.log('📤 Command sent to Arduino:', command);
            resolve();
          }
        });
      } catch (err) {
        console.error('❌ Exception in sendCommand:', err);
        resolve(); // Resolve instead of reject to prevent crashes
      }
    });
  }

  // Motor control commands
  public async moveForward(duration: number = 1000): Promise<void> {
    await this.sendCommand('FORWARD');
    await this.delay(duration);
    await this.sendCommand('STOP');
    this.updatePositionAfterMove('forward');
  }

  public async turnLeft(): Promise<void> {
    await this.sendCommand('LEFT');
    await this.delay(500); // Adjust based on your robot's turn speed
    await this.sendCommand('STOP');
    this.updatePositionAfterMove('left');
  }

  public async turnRight(): Promise<void> {
    await this.sendCommand('RIGHT');
    await this.delay(500); // Adjust based on your robot's turn speed
    await this.sendCommand('STOP');
    this.updatePositionAfterMove('right');
  }

  public async stop(): Promise<void> {
    await this.sendCommand('STOP');
  }

  // Reset Arduino state (clears stuck isMoving flag)
  public async reset(): Promise<void> {
    console.log('🔄 Resetting Arduino state...');
    await this.sendCommand('RESET');
    await this.delay(100);
  }

  // Precision movement methods (non-blocking version)
  public async moveDistance(inches: number, speed: 'normal' | 'precision' | 'fast' = 'precision'): Promise<void> {
    if (inches <= 0) {
      console.log('Invalid distance:', inches);
      return;
    }

    console.log(`Moving ${inches} inches at ${speed} speed`);
    
    // Send command to Arduino and return immediately (non-blocking)
    await this.sendCommand(`MOVE_DISTANCE:${inches.toFixed(2)}`);
    
    // Calculate expected duration for the caller to know how long it will take
    const actualSpeed = speed === 'fast' ? 4.0 : (speed === 'normal' ? 3.0 : 2.5);
    const expectedDuration = (inches / actualSpeed) * 1000;
    console.log(`Expected movement duration: ${expectedDuration}ms (command sent, not waiting)`);
    
    // Update position immediately (optimistic update)
    this.updatePositionAfterMove('forward');
    
    // Note: We're NOT waiting for Arduino response here to keep renderer responsive
    // The Arduino will send MOVEMENT_COMPLETE when done, which will be logged
  }

  public async turnAngle(degrees: number, speed: 'normal' | 'precision' | 'fast' = 'precision'): Promise<void> {
    if (degrees === 0) {
      console.log('No turn needed');
      return;
    }

    console.log(`Turning ${degrees} degrees at ${speed} speed`);
    
    // Send command to Arduino and return immediately (non-blocking)
    await this.sendCommand(`TURN_ANGLE:${degrees.toFixed(1)}`);
    
    // Calculate expected duration for the caller
    const actualTurnSpeed = speed === 'fast' ? 180.0 : (speed === 'normal' ? 120.0 : 90.0);
    const expectedDuration = (Math.abs(degrees) / actualTurnSpeed) * 1000;
    console.log(`Expected turn duration: ${expectedDuration}ms (command sent, not waiting)`);
    
    // Update direction immediately (optimistic update)
    if (degrees > 0) {
      this.updatePositionAfterMove('right');
    } else {
      this.updatePositionAfterMove('left');
    }
    
    // Note: We're NOT waiting for Arduino response here to keep renderer responsive
  }

  // Move to specific coordinates with precision
  public async moveToPosition(targetX: number, targetY: number): Promise<void> {
    const currentPos = this.getCurrentPosition();
    const deltaX = targetX - currentPos.x;
    const deltaY = targetY - currentPos.y;
    
    console.log(`Moving from (${currentPos.x}, ${currentPos.y}) to (${targetX}, ${targetY})`);
    console.log(`Delta: (${deltaX}, ${deltaY})`);
    
    // Calculate required direction
    let requiredDirection: 'north' | 'south' | 'east' | 'west';
    
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      requiredDirection = deltaX > 0 ? 'east' : 'west';
    } else {
      requiredDirection = deltaY > 0 ? 'south' : 'north';
    }
    
    // Turn to face the required direction
    const currentDirection = currentPos.direction;
    const turnAngle = this.calculateTurnAngle(currentDirection, requiredDirection);
    
    if (turnAngle !== 0) {
      await this.turnAngle(turnAngle);
    }
    
    // Move the required distance
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance > 0) {
      // Convert grid units to inches (assuming 1 grid unit = 24 inches)
      const inchesToMove = distance * 24;
      await this.moveDistance(inchesToMove);
    }
  }

  // Calculate turn angle between current and required direction
  private calculateTurnAngle(current: string, required: string): number {
    const directions = ['north', 'east', 'south', 'west'];
    const currentIndex = directions.indexOf(current);
    const requiredIndex = directions.indexOf(required);
    
    let turns = (requiredIndex - currentIndex + 4) % 4;
    
    if (turns === 1) return 90;   // Right turn
    if (turns === 2) return 180;  // U-turn
    if (turns === 3) return -90;  // Left turn
    
    return 0; // No turn needed
  }

  // Update robot position based on movement
  private updatePositionAfterMove(movement: 'forward' | 'left' | 'right'): void {
    switch (movement) {
      case 'forward':
        switch (this.currentPosition.direction) {
          case 'north':
            this.currentPosition.y = Math.max(0, this.currentPosition.y - 1);
            break;
          case 'south':
            this.currentPosition.y = Math.min(4, this.currentPosition.y + 1);
            break;
          case 'east':
            this.currentPosition.x = Math.min(4, this.currentPosition.x + 1);
            break;
          case 'west':
            this.currentPosition.x = Math.max(0, this.currentPosition.x - 1);
            break;
        }
        break;
      
      case 'left':
        switch (this.currentPosition.direction) {
          case 'north':
            this.currentPosition.direction = 'west';
            break;
          case 'south':
            this.currentPosition.direction = 'east';
            break;
          case 'east':
            this.currentPosition.direction = 'north';
            break;
          case 'west':
            this.currentPosition.direction = 'south';
            break;
        }
        break;
      
      case 'right':
        switch (this.currentPosition.direction) {
          case 'north':
            this.currentPosition.direction = 'east';
            break;
          case 'south':
            this.currentPosition.direction = 'west';
            break;
          case 'east':
            this.currentPosition.direction = 'south';
            break;
          case 'west':
            this.currentPosition.direction = 'north';
            break;
        }
        break;
    }

    console.log('Robot position updated:', this.currentPosition);
  }

  // Get current robot position
  public getCurrentPosition(): RobotPosition {
    return { ...this.currentPosition };
  }

  // Check if Arduino is connected
  public isArduinoConnected(): boolean {
    return this.isConnected;
  }

  // Utility function for delays
  public delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Execute a sequence of movements
  public async executeMovementSequence(commands: MovementCommand[]): Promise<void> {
    for (const command of commands) {
      console.log('Executing command:', command);
      
      switch (command.action) {
        case 'forward':
          await this.moveForward(command.duration || 1000);
          break;
        case 'left':
          await this.turnLeft();
          break;
        case 'right':
          await this.turnRight();
          break;
        case 'stop':
          await this.stop();
          break;
      }
      
      // Small delay between commands
      await this.delay(200);
    }
  }

  // Execute a sequence of precision movements
  public async executePrecisionMovementSequence(commands: PrecisionMovementCommand[]): Promise<void> {
    for (const command of commands) {
      console.log('Executing precision command:', command);
      
      switch (command.action) {
        case 'moveDistance':
          await this.moveDistance(command.value, command.speed || 'precision');
          break;
        case 'turnAngle':
          await this.turnAngle(command.value, command.speed || 'precision');
          break;
      }
      
      // Small delay between commands
      await this.delay(100);
    }
  }

  // Convert pathfinding path to movement commands
  public convertPathToCommands(path: Array<{x: number, y: number}>): MovementCommand[] {
    const commands: MovementCommand[] = [];
    
    for (let i = 1; i < path.length; i++) {
      const current = path[i - 1];
      const next = path[i];
      
      const dx = next.x - current.x;
      const dy = next.y - current.y;
      
      // Determine required direction
      let requiredDirection: 'north' | 'south' | 'east' | 'west';
      
      if (dx > 0) requiredDirection = 'east';
      else if (dx < 0) requiredDirection = 'west';
      else if (dy > 0) requiredDirection = 'south';
      else if (dy < 0) requiredDirection = 'north';
      else continue; // Same position
      
      // Turn to face the required direction
      const currentDirection = this.currentPosition.direction;
      const turnCommands = this.getTurnCommands(currentDirection, requiredDirection);
      commands.push(...turnCommands);
      
      // Move forward
      commands.push({ action: 'forward', duration: 1000 });
    }
    
    return commands;
  }

  // Convert pathfinding path to precision movement commands
  public convertPathToPrecisionCommands(path: Array<{x: number, y: number}>): PrecisionMovementCommand[] {
    const commands: PrecisionMovementCommand[] = [];
    
    for (let i = 1; i < path.length; i++) {
      const current = path[i - 1];
      const next = path[i];
      
      const dx = next.x - current.x;
      const dy = next.y - current.y;
      
      // Calculate distance and angle
      const distance = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      
      if (distance > 0) {
        // Convert grid units to inches (1 grid unit = 24 inches)
        const inchesToMove = distance * 24;
        
        // Add turn command if needed
        if (angle !== 0) {
          commands.push({
            action: 'turnAngle',
            value: angle,
            speed: 'precision'
          });
        }
        
        // Add movement command
        commands.push({
          action: 'moveDistance',
          value: inchesToMove,
          speed: 'precision'
        });
      }
    }
    
    return commands;
  }

  // Get turn commands to face required direction
  private getTurnCommands(current: string, required: string): MovementCommand[] {
    const commands: MovementCommand[] = [];
    
    if (current === required) return commands;
    
    const directions = ['north', 'east', 'south', 'west'];
    const currentIndex = directions.indexOf(current);
    const requiredIndex = directions.indexOf(required);
    
    let turns = (requiredIndex - currentIndex + 4) % 4;
    
    if (turns === 1) {
      commands.push({ action: 'right' });
    } else if (turns === 2) {
      commands.push({ action: 'right' });
      commands.push({ action: 'right' });
    } else if (turns === 3) {
      commands.push({ action: 'left' });
    }
    
    return commands;
  }

  // Get motor calibration settings
  public getCalibration(): MotorCalibration {
    return { ...this.calibration };
  }

  // Update calibration settings (for fine-tuning)
  public updateCalibration(newCalibration: Partial<MotorCalibration>): void {
    Object.assign(this.calibration, newCalibration);
    console.log('Motor calibration updated:', this.calibration);
  }

  // Test precision movement with calibration
  public async testPrecisionMovement(): Promise<void> {
    console.log('Testing precision movement...');
    
    // Test 1: Move 12 inches (0.5 units)
    console.log('Test 1: Moving 12 inches');
    await this.moveDistance(12);
    await this.delay(1000);
    
    // Test 2: Turn 45 degrees
    console.log('Test 2: Turning 45 degrees');
    await this.turnAngle(45);
    await this.delay(1000);
    
    // Test 3: Move 6 inches
    console.log('Test 3: Moving 6 inches');
    await this.moveDistance(6);
    await this.delay(1000);
    
    // Test 4: Turn back -45 degrees
    console.log('Test 4: Turning back -45 degrees');
    await this.turnAngle(-45);
    
    console.log('Precision movement test complete');
  }

  // Table LED control methods
  public async tableArrived(tableNumber: number): Promise<void> {
    if (tableNumber < 1 || tableNumber > 3) {
      console.error('Invalid table number:', tableNumber);
      return;
    }
    
    console.log(`Turning on LED for table ${tableNumber}`);
    await this.sendCommand(`TABLE${tableNumber}_ARRIVED`);
  }

  public async tableReceived(tableNumber: number): Promise<void> {
    if (tableNumber < 1 || tableNumber > 3) {
      console.error('Invalid table number:', tableNumber);
      return;
    }
    
    console.log(`Turning off LED for table ${tableNumber}`);
    await this.sendCommand(`TABLE${tableNumber}_RECEIVED`);
  }

  // Close connection
  public async close(): Promise<void> {
    if (this.port) {
      await this.stop();
      this.port.close();
      this.isConnected = false;
    }
  }
}

// Create singleton instance
export const arduinoController = new ArduinoController();
