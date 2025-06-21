const { Permit } = require('./build/index.js');

console.log('Testing CommonJS import...');
console.log('Permit class imported successfully:', typeof Permit);
console.log('Permit constructor:', Permit.name);

// Test creating a Permit instance
try {
  const permit = new Permit({
    token: 'test-token',
    pdp: 'http://localhost:7766',
  });
  console.log('✅ CommonJS import and instantiation successful');
  console.log('Permit instance created:', permit);
} catch (error) {
  console.error('❌ CommonJS import failed:', error.message);
}
