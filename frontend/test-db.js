// Test script to check IndexedDB data
(async () => {
  const { db, dbHelpers } = await import('./src/db/database.ts');
  
  console.log('=== CHECKING INDEXEDDB ===');
  
  // Check if database is open
  console.log('Database open:', db.isOpen());
  
  // Get all detections
  const detections = await dbHelpers.getDetections(50);
  console.log('Total detections:', detections.length);
  
  if (detections.length > 0) {
    console.log('\nFirst record:');
    const first = detections[0];
    console.log('- ID:', first.id);
    console.log('- Label:', first.label);
    console.log('- Confidence:', first.confidence);
    console.log('- Timestamp:', new Date(first.timestamp));
    console.log('- Has imageBlob:', !!first.imageBlob);
    console.log('- Has imageThumbnail:', !!first.imageThumbnail);
    console.log('- imageThumbnail type:', first.imageThumbnail?.constructor.name);
    console.log('- Synced:', first.synced);
  }
  
  // Get stats
  const stats = await dbHelpers.getStats();
  console.log('\nStats:', stats);
  
})().catch(console.error);
