import Supermemory from 'supermemory';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, 'ui/.env.local') });

const client = new Supermemory({
  apiKey: process.env.SUPERMEMORY_API_KEY,
});

async function check() {
  console.log('Searching Supermemory for "Superwave"...\n');
  
  try {
    const results = await client.search.documents({
      q: 'Superwave company profile ICP',
      limit: 10,
    });
    
    console.log('Results:', JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

check();
