/**
 * Real-time session kick via the heartbeat loop.
 *
 * When an admin clicks Terminate in the AuthCord dashboard, the user's
 * client app should disconnect within ~10 seconds. This is done by
 * starting a background heartbeat after the initial validate call.
 */

import { AuthCordClient, HeartbeatResult } from '@authcord/sdk';

const client = new AuthCordClient('dax_your_api_key_here');

const APP_ID = 'your_app_id';
const DISCORD_ID = '123456789012345678';
const HWID = 'PC-12345';

async function main() {
  // Step 1: standard validate at startup.
  const result = await client.validate({
    app_id: APP_ID,
    discord_id: DISCORD_ID,
    hwid: HWID,
  });

  if (!result.valid) {
    console.error(`Access denied: ${result.reason}`);
    process.exit(1);
  }

  console.log(`Access granted for ${result.user?.username}`);

  // Step 2: hook into termination. onTerminated fires exactly once when
  // the server returns valid=false (admin clicked Terminate, user
  // banned, product expired, ...) and then the loop stops on its own.
  const handle = client.startHeartbeat({
    app_id: APP_ID,
    discord_id: DISCORD_ID,
    hwid: HWID,
    onTerminated: (hb: HeartbeatResult) => {
      console.error(`\nSession ended by AuthCord: ${hb.reason}`);
      // Tear down whatever your app is doing — close windows, clear
      // secrets in memory, redirect to login, etc.
      process.exit(0);
    },
    onError: (err) => {
      // Network errors are non-fatal — the loop keeps polling.
      console.error('[heartbeat] transient error:', err);
    },
  });

  // ... your actual app does its thing here ...
  console.log('App running. The heartbeat will kick us off if an admin terminates the session.');

  // On normal exit (user signs out, app closes), stop the loop cleanly:
  process.on('SIGINT', () => {
    handle.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
