import { Permit } from './build/index.mjs';

console.log('Testing ES Module import...');
console.log('Permit class imported successfully:', typeof Permit);
console.log('Permit constructor:', Permit.name);

// Test creating a Permit instance
try {
  const permit = new Permit({
    token: 'test-token',
    pdp: 'http://localhost:7766',
  });
  console.log('✅ ES Module import and instantiation successful');
  console.log('Permit instance created:', permit);
} catch (error) {
  console.error('❌ ES Module import failed:', error.message);
}
