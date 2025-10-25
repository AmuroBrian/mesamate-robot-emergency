import React, { useState, useEffect } from "react";
import {
  pathfinder,
  TABLE_POSITIONS,
  ROBOT_START_POSITION,
  Position,
} from "../utils/astar";

interface DeliverySystemProps {
  selectedTables: string[];
  onDeliveryComplete: () => void;
  onBackToSelection: () => void;
}

interface DeliveryState {
  currentPath: Position[];
  currentStep: number;
  robotPosition: Position;
  robotDirection: "up" | "down" | "left" | "right"; // Current facing direction
  isMoving: boolean;
  currentTable: string | null;
  showModal: boolean;
  deliveryStatus: "moving" | "arrived" | "delivered" | "returning" | "complete";
}

export default function DeliverySystem({
  selectedTables,
  onDeliveryComplete,
  onBackToSelection,
}: DeliverySystemProps) {
  const [deliveryState, setDeliveryState] = useState<DeliveryState>({
    currentPath: [],
    currentStep: 0,
    robotPosition: ROBOT_START_POSITION,
    robotDirection: "up", // Robot starts facing up
    isMoving: false,
    currentTable: null,
    showModal: false,
    deliveryStatus: "moving",
  });

  const [arduinoConnected, setArduinoConnected] = useState(false);
  const [obstructed, setObstructed] = useState(false);

  const [deliveryProgress, setDeliveryProgress] = useState({
    totalSteps: 0,
    completedSteps: 0,
    currentTableIndex: 0,
  });

  // Ref to prevent multiple concurrent moveRobot calls
  const isMovingRef = React.useRef(false);
  const isMountedRef = React.useRef(true);

  // Track component mount status
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initialize delivery when component mounts
  useEffect(() => {
    if (selectedTables.length > 0) {
      startDelivery();
    }
  }, [selectedTables]);

  // Check Arduino connection status
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const connected = await window.robot.isConnected();
        setArduinoConnected(connected);
      } catch (error) {
        console.error("Failed to check Arduino connection:", error);
        setArduinoConnected(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, []);

  // Subscribe to obstacle events from robot
  useEffect(() => {
    if (!(window as any).robotEvents) return;
    const unsubscribe = (window as any).robotEvents.onObstacleEvent(
      (msg: string) => {
        if (msg === "OBSTACLE:DETECTED" || msg === "MOVEMENT_PAUSED:OBSTACLE") {
          setObstructed(true);
        } else if (msg === "OBSTACLE:CLEARED" || msg === "MOVEMENT_RESUMED") {
          setObstructed(false);
        }
      }
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  // Helper function to calculate required turn angle
  const calculateTurnAngle = (
    currentDir: "up" | "down" | "left" | "right",
    targetDir: "up" | "down" | "left" | "right"
  ): number => {
    const directions = ["up", "right", "down", "left"];
    const currentIndex = directions.indexOf(currentDir);
    const targetIndex = directions.indexOf(targetDir);

    let turnSteps = targetIndex - currentIndex;

    // Normalize to -2 to +2 range
    if (turnSteps > 2) turnSteps -= 4;
    if (turnSteps < -2) turnSteps += 4;

    // Convert steps to degrees (90° per step)
    return turnSteps * 90;
  };

  // Helper function to get direction from movement delta
  const getDirectionFromDelta = (
    dx: number,
    dy: number
  ): "up" | "down" | "left" | "right" | null => {
    if (dx > 0) return "right";
    if (dx < 0) return "left";
    if (dy > 0) return "down";
    if (dy < 0) return "up";
    return null;
  };

  // Helper function to update direction after a turn
  const getNewDirection = (
    currentDir: "up" | "down" | "left" | "right",
    angle: number
  ): "up" | "down" | "left" | "right" => {
    const directions: ("up" | "down" | "left" | "right")[] = [
      "up",
      "right",
      "down",
      "left",
    ];
    const currentIndex = directions.indexOf(currentDir);
    const turns = angle / 90;
    const newIndex = (currentIndex + turns + 4) % 4;
    return directions[newIndex];
  };

  const startDelivery = () => {
    const tablePositions = selectedTables.map(
      (table) => TABLE_POSITIONS[table]
    );
    const result = pathfinder.findDeliveryRoute(
      ROBOT_START_POSITION,
      tablePositions
    );

    if (result.success) {
      setDeliveryState({
        currentPath: result.path,
        currentStep: 0,
        robotPosition: ROBOT_START_POSITION,
        robotDirection: "up", // Robot starts facing up
        isMoving: true,
        currentTable: null,
        showModal: false,
        deliveryStatus: "moving",
      });

      setDeliveryProgress({
        totalSteps: result.path.length,
        completedSteps: 0,
        currentTableIndex: 0,
      });
    } else {
      alert(`Delivery failed: ${result.message}`);
      onBackToSelection();
    }
  };

  const moveRobot = async () => {
    // Prevent concurrent calls
    if (isMovingRef.current) {
      console.log("moveRobot already in progress, skipping");
      return;
    }

    isMovingRef.current = true;

    try {
      // Get current state values before async operations
      const currentPos = deliveryState.robotPosition;
      const currentDir = deliveryState.robotDirection;
      const nextPos = deliveryState.currentPath[deliveryState.currentStep + 1];

      if (!nextPos) {
        // No next position - delivery complete
        if (isMountedRef.current) {
          setDeliveryState((prev) => ({
            ...prev,
            isMoving: false,
            deliveryStatus: "complete",
          }));
        }
        return;
      }

      // Calculate movement delta
      const dx = nextPos.x - currentPos.x;
      const dy = nextPos.y - currentPos.y;

      console.log(
        `Moving from (${currentPos.x}, ${currentPos.y}) to (${nextPos.x}, ${nextPos.y})`
      );
      console.log(`Delta: (${dx}, ${dy}), Current direction: ${currentDir}`);

      // Determine target direction
      const targetDir = getDirectionFromDelta(dx, dy);

      if (!targetDir) {
        console.error("Invalid movement delta!");
        return;
      }

      // Calculate required turn
      const turnAngle = calculateTurnAngle(currentDir, targetDir);
      console.log(`Turn angle: ${turnAngle}°, Target direction: ${targetDir}`);

      // Send Arduino commands (only if Arduino is connected)
      if (arduinoConnected) {
        try {
          // Commands now return immediately (non-blocking) to keep renderer responsive

          // First, turn to face the target direction (if needed)
          if (turnAngle !== 0) {
            console.log(`Turning ${turnAngle}° to face ${targetDir}`);
            const turnResult = await window.robot.turnAngle(turnAngle);
            if (turnResult && !turnResult.success) {
              console.error("Turn command failed:", turnResult.error);
            }

            // Calculate turn duration and wait for it to complete
            const turnSpeed = 120.0; // degrees per second (normal speed)
            const turnDuration = (Math.abs(turnAngle) / turnSpeed) * 1000;
            const turnWaitTime = turnDuration + 500; // Add buffer
            console.log(`Waiting ${turnWaitTime}ms for turn to complete...`);
            await new Promise((resolve) => setTimeout(resolve, turnWaitTime));
          }

          // Then, move forward 24 inches (1 grid unit)
          console.log(`Moving forward 24 inches (now facing ${targetDir})`);
          const moveResult = await window.robot.moveDistance(24, "normal");
          if (moveResult && !moveResult.success) {
            console.error("Move command failed:", moveResult.error);
          }

          // Calculate move duration and wait for it to complete
          const moveSpeed = 3.0; // inches per second (normal speed)
          const moveDuration = (24 / moveSpeed) * 1000;
          const moveWaitTime = moveDuration + 500; // Add buffer
          console.log(`Waiting ${moveWaitTime}ms for movement to complete...`);
          await new Promise((resolve) => setTimeout(resolve, moveWaitTime));
        } catch (error) {
          console.error("Arduino command failed:", error);
          // Don't let errors crash the renderer - just log and continue
        }
      }

      // Update state after movement (only if still mounted)
      if (!isMountedRef.current) {
        console.log("Component unmounted, skipping state update");
        return;
      }

      setDeliveryState((prev) => {
        if (prev.currentStep >= prev.currentPath.length - 1) {
          // Delivery complete
          return {
            ...prev,
            isMoving: false,
            deliveryStatus: "complete",
          };
        }

        const nextStep = prev.currentStep + 1;
        const nextPosition = prev.currentPath[nextStep];

        // Update robot direction after turn
        const newDirection =
          turnAngle !== 0
            ? getNewDirection(prev.robotDirection, turnAngle)
            : prev.robotDirection;

        // Check if we've arrived at a table
        const tableAtPosition = selectedTables.find((table) => {
          const tablePos = TABLE_POSITIONS[table];
          return tablePos.x === nextPosition.x && tablePos.y === nextPosition.y;
        });

        if (tableAtPosition) {
          // Send LED command to Arduino when robot arrives at table
          const tableNumber = parseInt(tableAtPosition.replace("T", ""));
          if (arduinoConnected && tableNumber >= 1 && tableNumber <= 3) {
            window.robot.tableArrived(tableNumber).catch((error) => {
              console.error("Failed to turn on table LED:", error);
            });
          }

          return {
            ...prev,
            currentStep: nextStep,
            robotPosition: nextPosition,
            robotDirection: newDirection,
            currentTable: tableAtPosition,
            showModal: true,
            deliveryStatus: "arrived",
          };
        }

        return {
          ...prev,
          currentStep: nextStep,
          robotPosition: nextPosition,
          robotDirection: newDirection,
          isMoving: true,
        };
      });

      if (isMountedRef.current) {
        setDeliveryProgress((prev) => ({
          ...prev,
          completedSteps: prev.completedSteps + 1,
        }));
      }
    } finally {
      // Always clear the moving flag when done
      isMovingRef.current = false;
    }
  };

  const confirmDelivery = () => {
    if (isMountedRef.current) {
      // Send LED off command to Arduino when delivery is confirmed
      const currentTable = deliveryState.currentTable;
      if (currentTable && arduinoConnected) {
        const tableNumber = parseInt(currentTable.replace("T", ""));
        if (tableNumber >= 1 && tableNumber <= 3) {
          window.robot.tableReceived(tableNumber).catch((error) => {
            console.error("Failed to turn off table LED:", error);
          });
        }
      }

      setDeliveryState((prev) => ({
        ...prev,
        showModal: false,
        currentTable: null,
        isMoving: true,
        deliveryStatus: "moving",
      }));

      // Continue to next step after a delay (allow time for Arduino if connected)
      setTimeout(
        () => {
          if (!isMovingRef.current && isMountedRef.current) {
            moveRobot();
          }
        },
        arduinoConnected ? 1000 : 500
      );
    }
  };

  const callForAssistance = () => {
    alert("Assistance has been requested. Staff will be notified.");
    // Here you would typically send a notification to staff
  };

  // Auto-move robot with proper timing for Arduino synchronization
  useEffect(() => {
    // Only trigger on currentStep changes when ready to move
    if (
      deliveryState.isMoving &&
      deliveryState.deliveryStatus === "moving" &&
      !obstructed &&
      !isMovingRef.current // Don't trigger if already moving
    ) {
      console.log(`Scheduling moveRobot for step ${deliveryState.currentStep}`);
      const timer = setTimeout(
        () => {
          // Double-check before calling
          if (!isMovingRef.current && isMountedRef.current) {
            moveRobot();
          }
        },
        arduinoConnected ? 1000 : 500
      ); // Short delay since commands return immediately now

      return () => {
        console.log("Clearing moveRobot timer");
        clearTimeout(timer);
      };
    }
  }, [
    deliveryState.currentStep, // Only trigger on step changes
    deliveryState.isMoving,
    deliveryState.deliveryStatus,
    obstructed,
  ]);

  // Additional safety: Keep renderer responsive during long operations
  useEffect(() => {
    if (deliveryState.isMoving) {
      const keepAliveInterval = setInterval(() => {
        // Force a small DOM update to keep renderer responsive
        if (isMountedRef.current) {
          const now = Date.now();
          // This is a minimal operation that won't cause issues
          document.title = `MesaMate - ${now % 1000}`;
        }
      }, 100);

      return () => clearInterval(keepAliveInterval);
    }
  }, [deliveryState.isMoving]);

  const renderMap = () => {
    const map = [
      ["T1", "0", "0", "0", "T2"],
      ["T3", "0", "0", "0", "T4"],
      ["T5", "0", "0", "0", "T6"],
      ["T7", "0", "0", "0", "T8"],
      ["0", "0", "X", "0", "0"],
    ];

    return (
      <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
        <h3 className="compact-text font-semibold text-gray-900 mb-3 text-center">
          Restaurant Map
        </h3>
        <div className="grid grid-cols-5 gap-1 max-w-xs mx-auto">
          {map.map((row, y) =>
            row.map((cell, x) => {
              const isRobotHere =
                deliveryState.robotPosition.x === x &&
                deliveryState.robotPosition.y === y;
              const isTable = cell.startsWith("T");
              const isStart = cell === "X";
              const isSelectedTable = selectedTables.includes(cell);

              return (
                <div
                  key={`${x}-${y}`}
                  className={`
                    w-12 h-12 flex items-center justify-center text-xs font-bold rounded
                    ${
                      isRobotHere
                        ? "text-white animate-pulse"
                        : isTable
                        ? isSelectedTable
                          ? "bg-red-200 text-red-800 border-2 border-red-500"
                          : "bg-gray-200 text-gray-600"
                        : isStart
                        ? "bg-green-200 text-green-800"
                        : "bg-gray-100 text-gray-400"
                    }
                  `}
                  style={isRobotHere ? { backgroundColor: "#e41d28" } : {}}
                >
                  {isRobotHere ? "🤖" : cell}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const renderProgress = () => {
    const progressPercentage =
      (deliveryProgress.completedSteps / deliveryProgress.totalSteps) * 100;

    return (
      <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
        <h3 className="compact-text font-semibold text-gray-900 mb-3 text-center">
          Delivery Progress
        </h3>
        <div className="mb-2">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Progress</span>
            <span>
              {deliveryProgress.completedSteps}/{deliveryProgress.totalSteps}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{
                width: `${progressPercentage}%`,
                backgroundColor: "#e41d28",
              }}
            ></div>
          </div>
        </div>
        <div className="text-center">
          <span className="compact-text text-gray-600">
            {deliveryState.deliveryStatus === "moving" &&
              !obstructed &&
              "Moving to next location..."}
            {deliveryState.deliveryStatus === "moving" &&
              obstructed &&
              "Paused: Obstacle detected (within 8 inches)"}
            {deliveryState.deliveryStatus === "arrived" &&
              `Arrived at ${deliveryState.currentTable}`}
            {deliveryState.deliveryStatus === "complete" &&
              "Delivery complete!"}
          </span>
        </div>
      </div>
    );
  };

  const renderDeliveryModal = () => {
    if (!deliveryState.showModal || !deliveryState.currentTable) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
          <div className="text-center mb-6">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: "#fef2f2" }}
            >
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                style={{ color: "#e41d28" }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="compact-subheading font-bold text-gray-900 mb-2">
              Arrived at {deliveryState.currentTable}
            </h2>
            <p className="compact-text text-gray-600">
              Please confirm that the order has been received
            </p>
          </div>

          <div className="space-y-3">
            <button onClick={confirmDelivery} className="btn-primary w-full">
              ✓ Order Received
            </button>

            <button
              onClick={callForAssistance}
              className="btn-secondary w-full"
            >
              📞 Call for Assistance
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderCompletionScreen = () => {
    return (
      <div className="h-screen flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: "#fef2f2" }}
          >
            <svg
              className="w-10 h-10"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ color: "#e41d28" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <h1 className="compact-heading font-bold text-gray-900 mb-4">
            Delivery Complete!
          </h1>

          <p className="compact-text text-gray-600 mb-6">
            Successfully delivered to {selectedTables.length} table
            {selectedTables.length > 1 ? "s" : ""}
          </p>

          <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
            <h3 className="compact-text font-semibold text-gray-900 mb-3">
              Delivered Tables
            </h3>
            <div className="flex flex-wrap justify-center gap-2">
              {selectedTables.map((table) => (
                <span
                  key={table}
                  className="px-3 py-1 text-sm font-medium text-white rounded-full"
                  style={{ backgroundColor: "#e41d28" }}
                >
                  {table}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <button onClick={onDeliveryComplete} className="btn-primary w-full">
              New Delivery
            </button>

            <button
              onClick={onBackToSelection}
              className="btn-secondary w-full"
            >
              Back to Table Selection
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (deliveryState.deliveryStatus === "complete") {
    return renderCompletionScreen();
  }

  return (
    <div className="h-screen flex flex-col px-3 py-4">
      {/* Header */}
      <div className="text-center mb-4 flex-shrink-0">
        <h2 className="compact-subheading font-bold text-gray-900 mb-2">
          Robot Delivery
        </h2>
        <p className="compact-text text-gray-600">
          Delivering to {selectedTables.length} table
          {selectedTables.length > 1 ? "s" : ""}
        </p>

        {/* Arduino Connection Status */}
        <div className="mt-2 flex items-center justify-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              arduinoConnected ? "bg-green-500" : "bg-red-500"
            }`}
          ></div>
          <span className="compact-text text-xs text-gray-500">
            Arduino: {arduinoConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Map */}
      {renderMap()}

      {/* Progress */}
      {renderProgress()}

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 flex-shrink-0">
        <button onClick={onBackToSelection} className="btn-secondary w-full">
          Cancel Delivery
        </button>
      </div>

      {/* Delivery Modal */}
      {renderDeliveryModal()}
    </div>
  );
}
