# AuthCord Node.js SDK

> [AuthCord](https://authcord.dev) - Sell, authenticate, and manage your software. All in one place. Replace your auth system, payment platform, and Discord bots with a single dashboard.

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

## Real-time Session Kick (Heartbeat)

After `validate()` succeeds, run a background heartbeat so an admin clicking **Terminate** in the dashboard takes effect within ~10 seconds instead of waiting for the user's next manual validate.

```ts
const handle = client.startHeartbeat({
  app_id: 'your_app_id',
  discord_id: '123456789',
  hwid: 'HWID-ABC',
  onTerminated: (hb) => {
    console.error(`Session ended: ${hb.reason}`); // "terminated", "banned", "expired", ...
    // Tear down: close the app, redirect to login, clear in-memory secrets, etc.
    process.exit(0);
  },
  // onError: (err) => ...        // optional; loop keeps running on transient errors
  // intervalSeconds: 10,         // optional; otherwise the server controls cadence
});

// ... your app does its thing ...
handle.stop();  // clean shutdown on normal sign-out
```

For a DeviceSession-based flow, pass `session_token` instead of `discord_id` + `hwid`. Full runnable example in `examples/heartbeat-realtime.ts`.

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
