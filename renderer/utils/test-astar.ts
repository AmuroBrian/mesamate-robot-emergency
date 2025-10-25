// Test file for A* Algorithm
// This file can be used to test the pathfinding functionality

import { pathfinder, TABLE_POSITIONS, ROBOT_START_POSITION } from './astar';

// Test function to verify A* algorithm works correctly
export function testAStarAlgorithm() {
  console.log('Testing A* Algorithm...');
  
  // Test 1: Single table delivery
  const testTable = 'T1';
  const tablePosition = TABLE_POSITIONS[testTable];
  
  console.log(`Testing delivery to ${testTable} at position (${tablePosition.x}, ${tablePosition.y})`);
  console.log(`Robot starts at (${ROBOT_START_POSITION.x}, ${ROBOT_START_POSITION.y})`);
  
  const result = pathfinder.findPath(ROBOT_START_POSITION, tablePosition);
  
  if (result.success) {
    console.log('✅ Single table path found successfully');
    console.log(`Path length: ${result.path.length} steps`);
    console.log('Path:', result.path);
  } else {
    console.log('❌ Single table path failed:', result.message);
  }
  
  // Test 2: Multiple table delivery
  const multipleTables = ['T1', 'T3', 'T5'];
  const tablePositions = multipleTables.map(table => TABLE_POSITIONS[table]);
  
  console.log(`\nTesting delivery to multiple tables: ${multipleTables.join(', ')}`);
  
  const multiResult = pathfinder.findDeliveryRoute(ROBOT_START_POSITION, tablePositions);
  
  if (multiResult.success) {
    console.log('✅ Multiple table route found successfully');
    console.log(`Total path length: ${multiResult.path.length} steps`);
    console.log('Route:', multiResult.path);
  } else {
    console.log('❌ Multiple table route failed:', multiResult.message);
  }
  
  // Test 3: Return to start
  console.log('\nTesting return to start position...');
  const returnResult = pathfinder.findPath(tablePosition, ROBOT_START_POSITION);
  
  if (returnResult.success) {
    console.log('✅ Return path found successfully');
    console.log(`Return path length: ${returnResult.path.length} steps`);
  } else {
    console.log('❌ Return path failed:', returnResult.message);
  }
  
  console.log('\nA* Algorithm testing complete!');
}

// Export for potential use in development
export default testAStarAlgorithm;
