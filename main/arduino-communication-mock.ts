// Mock Arduino Communication System
// Simulates serial communication with robot motors for testing

export interface RobotPosition {
  x: number;
  y: number;
  direction: 'north' | 'south' | 'east' | 'west';
}

export interface MovementCommand {
  action: 'forward' | 'left' | 'right' | 'stop';
  duration?: number; // in milliseconds
}

export class ArduinoController {
  private currentPosition: RobotPosition = {
    x: 2,
    y: 4,
    direction: 'north'
  };
  private isConnected = true; // Mock as always connected

  constructor() {
    console.log('Mock Arduino Controller initialized');
  }

  // Send command to Arduino (mock)
  private async sendCommand(command: string): Promise<void> {
    console.log('Mock Arduino command sent:', command);
    // Simulate some processing time
    await this.delay(100);
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
  private delay(ms: number): Promise<void> {
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

  // Table LED control methods (mock)
  public async tableArrived(tableNumber: number): Promise<void> {
    if (tableNumber < 1 || tableNumber > 3) {
      console.error('Invalid table number:', tableNumber);
      return;
    }
    
    console.log(`Mock: Turning on LED for table ${tableNumber}`);
    await this.sendCommand(`TABLE${tableNumber}_ARRIVED`);
  }

  public async tableReceived(tableNumber: number): Promise<void> {
    if (tableNumber < 1 || tableNumber > 3) {
      console.error('Invalid table number:', tableNumber);
      return;
    }
    
    console.log(`Mock: Turning off LED for table ${tableNumber}`);
    await this.sendCommand(`TABLE${tableNumber}_RECEIVED`);
  }

  // Close connection
  public async close(): Promise<void> {
    console.log('Mock Arduino connection closed');
    this.isConnected = false;
  }
}

// Create singleton instance
export const arduinoController = new ArduinoController();
