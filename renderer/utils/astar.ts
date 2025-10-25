// A* Pathfinding Algorithm Implementation
// For MesaMate Robot Navigation System

export interface Position {
  x: number;
  y: number;
}

export interface Node {
  x: number;
  y: number;
  g: number; // Cost from start
  h: number; // Heuristic cost to goal
  f: number; // Total cost (g + h)
  parent: Node | null;
}

export interface PathfindingResult {
  path: Position[];
  success: boolean;
  message: string;
}

export class AStarPathfinder {
  private grid: number[][];
  private rows: number;
  private cols: number;

  constructor(grid: number[][]) {
    this.grid = grid;
    this.rows = grid.length;
    this.cols = grid[0].length;
  }

  // Calculate Manhattan distance heuristic
  private heuristic(a: Position, b: Position): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  // Check if position is valid and walkable
  private isValidPosition(x: number, y: number): boolean {
    return (
      x >= 0 &&
      x < this.cols &&
      y >= 0 &&
      y < this.rows &&
      this.grid[y][x] === 0
    );
  }

  // Get neighboring positions
  private getNeighbors(node: Node): Position[] {
    const neighbors: Position[] = [];
    const directions = [
      { x: 0, y: -1 }, // Up
      { x: 1, y: 0 },  // Right
      { x: 0, y: 1 },  // Down
      { x: -1, y: 0 }  // Left
    ];

    for (const dir of directions) {
      const newX = node.x + dir.x;
      const newY = node.y + dir.y;
      
      if (this.isValidPosition(newX, newY)) {
        neighbors.push({ x: newX, y: newY });
      }
    }

    return neighbors;
  }

  // Find path using A* algorithm
  public findPath(start: Position, goal: Position): PathfindingResult {
    // Validate start and goal positions
    if (!this.isValidPosition(start.x, start.y)) {
      return {
        path: [],
        success: false,
        message: "Invalid start position"
      };
    }

    if (!this.isValidPosition(goal.x, goal.y)) {
      return {
        path: [],
        success: false,
        message: "Invalid goal position"
      };
    }

    // Initialize open and closed sets
    const openSet: Node[] = [];
    const closedSet: Set<string> = new Set();

    // Create start node
    const startNode: Node = {
      x: start.x,
      y: start.y,
      g: 0,
      h: this.heuristic(start, goal),
      f: 0,
      parent: null
    };
    startNode.f = startNode.g + startNode.h;

    openSet.push(startNode);

    while (openSet.length > 0) {
      // Find node with lowest f cost
      let currentNode = openSet[0];
      let currentIndex = 0;

      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < currentNode.f) {
          currentNode = openSet[i];
          currentIndex = i;
        }
      }

      // Remove current node from open set
      openSet.splice(currentIndex, 1);
      closedSet.add(`${currentNode.x},${currentNode.y}`);

      // Check if we reached the goal
      if (currentNode.x === goal.x && currentNode.y === goal.y) {
        const path: Position[] = [];
        let current: Node | null = currentNode;

        while (current !== null) {
          path.unshift({ x: current.x, y: current.y });
          current = current.parent;
        }

        return {
          path,
          success: true,
          message: "Path found successfully"
        };
      }

      // Explore neighbors
      const neighbors = this.getNeighbors(currentNode);

      for (const neighborPos of neighbors) {
        const neighborKey = `${neighborPos.x},${neighborPos.y}`;

        // Skip if already in closed set
        if (closedSet.has(neighborKey)) {
          continue;
        }

        // Calculate tentative g score
        const tentativeG = currentNode.g + 1;

        // Check if this path to neighbor is better
        const existingNode = openSet.find(
          node => node.x === neighborPos.x && node.y === neighborPos.y
        );

        if (!existingNode) {
          // New node
          const neighborNode: Node = {
            x: neighborPos.x,
            y: neighborPos.y,
            g: tentativeG,
            h: this.heuristic(neighborPos, goal),
            f: 0,
            parent: currentNode
          };
          neighborNode.f = neighborNode.g + neighborNode.h;
          openSet.push(neighborNode);
        } else if (tentativeG < existingNode.g) {
          // Better path found
          existingNode.g = tentativeG;
          existingNode.f = existingNode.g + existingNode.h;
          existingNode.parent = currentNode;
        }
      }
    }

    return {
      path: [],
      success: false,
      message: "No path found"
    };
  }

  // Find optimal delivery route for multiple tables
  public findDeliveryRoute(start: Position, tables: Position[]): PathfindingResult {
    if (tables.length === 0) {
      return {
        path: [start],
        success: true,
        message: "No tables to visit"
      };
    }

    let currentPosition = start;
    let totalPath: Position[] = [start];
    let visitedTables: Position[] = [];

    // Visit each table in order
    for (const table of tables) {
      const result = this.findPath(currentPosition, table);
      
      if (!result.success) {
        return {
          path: totalPath,
          success: false,
          message: `Cannot reach table at (${table.x}, ${table.y}): ${result.message}`
        };
      }

      // Add path to table (excluding the starting position to avoid duplicates)
      totalPath.push(...result.path.slice(1));
      currentPosition = table;
      visitedTables.push(table);
    }

    // Return to starting position
    const returnResult = this.findPath(currentPosition, start);
    if (!returnResult.success) {
      return {
        path: totalPath,
        success: false,
        message: `Cannot return to start position: ${returnResult.message}`
      };
    }

    totalPath.push(...returnResult.path.slice(1));

    return {
      path: totalPath,
      success: true,
      message: `Successfully planned route visiting ${visitedTables.length} tables`
    };
  }
}

// Restaurant map configuration
// 0 = walkable, 1 = obstacle (tables)
export const RESTAURANT_MAP = [
  [1, 0, 0, 0, 1], // T1, 0, 0, 0, T2
  [1, 0, 0, 0, 1], // T3, 0, 0, 0, T4
  [1, 0, 0, 0, 1], // T5, 0, 0, 0, T6
  [1, 0, 0, 0, 1], // T7, 0, 0, 0, T8
  [0, 0, 0, 0, 0]  // 0, 0, X, 0, 0
];

// Table positions mapping (adjacent to tables, not on tables)
export const TABLE_POSITIONS: Record<string, Position> = {
  'T1': { x: 1, y: 0 }, // Adjacent to T1 table
  'T2': { x: 3, y: 0 }, // Adjacent to T2 table
  'T3': { x: 1, y: 1 }, // Adjacent to T3 table
  'T4': { x: 3, y: 1 }, // Adjacent to T4 table
  'T5': { x: 1, y: 2 }, // Adjacent to T5 table
  'T6': { x: 3, y: 2 }, // Adjacent to T6 table
  'T7': { x: 1, y: 3 }, // Adjacent to T7 table
  'T8': { x: 3, y: 3 }  // Adjacent to T8 table
};

// Robot starting position
export const ROBOT_START_POSITION: Position = { x: 2, y: 4 };

// Create pathfinder instance
export const pathfinder = new AStarPathfinder(RESTAURANT_MAP);
