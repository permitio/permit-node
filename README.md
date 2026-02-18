![Node.png](imgs/Node.png)

# Permit.io client for Node.js

Node.js client library for the Permit.io full-stack permissions platform.

## Installation

```
npm install permitio
```

## Release

1. Update the version in `package.json`
2. Execute `yarn run build`
3. Execute `yarn docs ; git add docs/ ; git commit -m "update tsdoc"` to update the auto generated docs
4. Execute `yarn publish --access public`

## Retry Configuration

The SDK includes built-in retry support for transient failures. By default, retries are **enabled** with the following settings:

- **3 retry attempts** with exponential backoff
- Retries on network errors and status codes: `408`, `429`, `500`, `502`, `503`, `504`
- Respects `Retry-After` headers for rate limiting (429)

### Customizing Retry Behavior

```typescript
import { Permit } from 'permitio';

// Use defaults (retry enabled)
const permit = new Permit({ token: 'your-api-key' });

// Custom retry configuration
const permit = new Permit({
  token: 'your-api-key',
  retry: {
    maxRetries: 5,
    retryDelay: 500,        // Initial delay in ms
    backoffMultiplier: 2,   // Exponential backoff multiplier
    maxDelay: 30000,        // Maximum delay cap
  },
});

// Disable retry entirely
const permit = new Permit({
  token: 'your-api-key',
  retry: false,
});

// Different config for PDP vs REST API
const permit = new Permit({
  token: 'your-api-key',
  retry: { maxRetries: 3 },
  pdpRetry: { maxRetries: 5 },
});
```

## Documentation

[Read the documentation at Permit.io website](https://docs.permit.io/sdk/nodejs/quickstart-nodejs#add-the-sdk-to-your-js-code)

## API Reference

[Check out the tsdoc reference here.](https://permitio.github.io/permit-node/classes/Permit.html)
