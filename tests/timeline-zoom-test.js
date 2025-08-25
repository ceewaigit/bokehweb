// Test script for zoom block resizing
const { TimelineEditor } = require('../src/lib/timeline/timeline-editor.ts')

// Create test data
const testBlocks = [
  { id: 'block1', startTime: 0, endTime: 1000 },
  { id: 'block2', startTime: 2000, endTime: 3000 },
  { id: 'block3', startTime: 4000, endTime: 5000 }
]

// Test resize operations
function testResize() {
  const editor = new TimelineEditor()
  
  console.log('Testing resize-right operation...')
  editor.startEdit('block1', 'clip1', 0, 1000, 'resize-right', 10000)
  
  // Try to extend right by 500ms
  const result1 = editor.updatePosition(500, testBlocks)
  console.log('Extend right by 500ms:', result1)
  // Expected: { startTime: 0, endTime: 1500 }
  
  // Try to extend into another block (should be constrained)
  const result2 = editor.updatePosition(1500, testBlocks)
  console.log('Extend right by 1500ms (should hit block2):', result2)
  // Expected: { startTime: 0, endTime: 2000 } (stops at block2)
  
  console.log('\nTesting resize-left operation...')
  editor.startEdit('block2', 'clip1', 2000, 3000, 'resize-left', 10000)
  
  // Try to move left by 500ms
  const result3 = editor.updatePosition(-500, testBlocks)
  console.log('Move left by 500ms:', result3)
  // Expected: { startTime: 1500, endTime: 3000 }
  
  // Try to move left into block1 (should be constrained)
  const result4 = editor.updatePosition(-1500, testBlocks)
  console.log('Move left by 1500ms (should hit block1):', result4)
  // Expected: { startTime: 1000, endTime: 3000 } (stops at block1)
  
  console.log('\nTesting minimum duration constraint...')
  editor.startEdit('block3', 'clip1', 4000, 5000, 'resize-right', 10000)
  
  // Try to shrink below minimum (100ms)
  const result5 = editor.updatePosition(-950, testBlocks)
  console.log('Shrink by 950ms (should maintain 100ms min):', result5)
  // Expected: { startTime: 4000, endTime: 4100 }
}

testResize()