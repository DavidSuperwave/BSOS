import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, 'ui/.env.local') });

async function test() {
  console.log('Testing Perplexity API...');
  console.log('API Key:', process.env.PERPLEXITY_API_KEY?.slice(0, 10) + '...');
  
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        { role: 'user', content: 'What are the top 3 B2B cold email trends in 2026? Keep it brief.' }
      ],
    }),
  });
  
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Response:', JSON.stringify(data, null, 2));
}

test().catch(console.error);
