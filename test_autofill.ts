import { getPayload } from 'payload';
import config from './src/payload.config.js';

async function main() {
  console.log('Connecting to Payload...');
  const payload = await getPayload({ config });
  
  console.log('Fetching users to verify database...');
  const users = await payload.find({ collection: 'users' });
  console.log(`Found ${users.totalDocs} users.`);
  
  if (users.totalDocs === 0) {
    console.log('Database is empty. Please run the seed script.');
    process.exit(1);
  }
  
  console.log('Fetching tenants...');
  const tenants = await payload.find({ collection: 'tenants' });
  const tenantId = tenants.docs[0].id;
  
  console.log('Creating a SchedulingRun to trigger Auto-Fill...');
  
  // We can call the auto-fill endpoint natively by making a request, but since we have Payload we can just mock a request to the endpoint.
  // Actually, the endpoint is a standard Next.js Route Handler.
  // We can just invoke it over HTTP.
  
  // First, we need a token. We can log in as admin.
  console.log('Logging in...');
  const loginRes = await fetch('http://localhost:3000/api/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@apex.com', password: 'password123' })
  });
  
  const loginData = await loginRes.json();
  const token = loginData.token;
  
  console.log('Calling Auto-Fill...');
  const start = new Date();
  start.setHours(0,0,0,0);
  const diff = start.getDate() - start.getDay();
  const weekStart = new Date(start.setDate(diff));
  
  const end = new Date(weekStart);
  end.setDate(weekStart.getDate() + 20);
  
  const autofillRes = await fetch('http://localhost:3000/api/auto-fill', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `JWT ${token}`
    },
    body: JSON.stringify({
      startDate: weekStart.toISOString(),
      endDate: end.toISOString(),
      timezoneOffset: new Date().getTimezoneOffset()
    })
  });
  
  const result = await autofillRes.json();
  console.log('Auto-Fill Triggered:', result);
}

main().catch(console.error);
