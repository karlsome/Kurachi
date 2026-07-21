const { MongoClient } = require('mongodb');

async function run() {
  const client = new MongoClient('mongodb://localhost:27017');
  try {
    await client.connect();
    const db = client.db('Sasaki_Coating_MasterDB');
    const collection = db.collection('firstFactoryProduction');
    
    const count = await collection.countDocuments();
    console.log(`Total documents: ${count}`);
    
    const sample = await collection.find({ hinban: { $regex: 'C13' } }).limit(5).toArray();
    console.log(`Documents with C13:`, sample.map(doc => doc.hinban));

    const tbSample = await collection.find({ hinban: { $regex: 'TB/310D' } }).limit(5).toArray();
    console.log(`Documents with TB/310D:`, tbSample.map(doc => doc.hinban));
    
  } finally {
    await client.close();
  }
}

run().catch(console.error);
