# AuthCord Node.js SDK

Official AuthCord SDK for Node.js 18+. Zero dependencies.

## Installation

```bash
npm install @authcord/sdk
```

## Usage

```ts
import { AuthCordClient } from '@authcord/sdk';

const client = new AuthCordClient('dax_your_api_key');

// Validate a user
const result = await client.validate({
  discord_id: '123456789',
  app_id: 'your_app_id',
  hwid: 'HWID-ABC',
});

if (result.valid) {
  console.log(`Welcome ${result.user?.username}!`);
  for (const product of result.products ?? []) {
    console.log(`  Product: ${product.name} (lifetime: ${product.is_lifetime})`);
  }
} else {
  console.log(`Access denied: ${result.reason}`);
}

// Session-based validation
const session = await client.createSession({
  discord_id: '123456789',
  app_id: 'your_app_id',
  hwid: 'HWID-ABC',
  device_name: 'Work PC',
});
```

## Email-Based Validation

AuthCord supports validating users by Discord ID, user ID, or email:

```ts
// Validate by email
const result = await client.validate({
  email: 'user@example.com',
  app_id: 'your_app_id',
  hwid: 'HWID-ABC',
});

// Validate by custom user ID
const result2 = await client.validate({
  user_id: 'user123',
  app_id: 'your_app_id',
});

// Create a session with email
const session = await client.createSession({
  email: 'user@example.com',
  app_id: 'your_app_id',
  hwid: 'HWID-ABC',
});

// Get offline token with email
const token = await client.getOfflineToken(null, 'your_app_id', {
  email: 'user@example.com',
});
```

## Error Handling

```ts
import { AuthenticationError, RateLimitError, ApiError } from '@authcord/sdk';

try {
  const result = await client.validate({ discord_id: '123', app_id: 'abc' });
} catch (err) {
  if (err instanceof AuthenticationError) {
    console.log('Invalid API key');
  } else if (err instanceof RateLimitError) {
    console.log(`Rate limited. Retry after: ${err.retryAfter}s`);
  } else if (err instanceof ApiError) {
    console.log(`API error (${err.statusCode}): ${err.message}`);
  }
}
```
