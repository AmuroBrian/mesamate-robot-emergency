# MesaMate - Standalone Table Management System

A simple, standalone table management system for restaurant delivery simulation.

## Features

- **Table Selection**: Choose up to 3 tables for delivery
- **Delivery Simulation**: Visual robot movement simulation with 5-second delays per tile
- **Pathfinding**: Automatic route calculation using A\* algorithm
- **Clean Interface**: Simple, responsive UI without external dependencies

## How to Use

1. **Start the App**: Click anywhere on the welcome screen
2. **Select Tables**: Choose up to 3 tables (T1-T8) for delivery
3. **Start Delivery**: Click "Deliver to Tables" to begin the simulation
4. **Watch Progress**: The robot will move through the restaurant map
5. **Confirm Delivery**: When the robot arrives at each table, confirm the delivery

## Technical Details

- **Movement Timing**: 5 seconds per tile/unit movement
- **No External Dependencies**: Completely standalone - no Arduino or hardware required
- **Pathfinding**: Uses A\* algorithm for optimal route calculation
- **Responsive Design**: Works on various screen sizes

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

## Architecture

- **Main Process**: Electron main process with minimal IPC
- **Renderer**: Next.js-based React application
- **Components**: Modular React components for table selection and delivery
- **Utils**: A\* pathfinding algorithm for route calculation

This is a clean, emergency-ready version without any hardware dependencies or crash-prone features.
