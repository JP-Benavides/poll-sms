# poll-sms

Track and Answer your PollEv's 

## Setup

```sh
bun install
bunx playwright install chromium
```

Keep your credentials in the root `.env` (excluded from Git):

```dotenv
USERNAME=your-netid@nyu.edu
PASSWORD=your-password
POLL_EV_LINK=https://pollev.com/your-presenter
DISCORD_URL=https://discord.com/api/webhooks/your-webhook-id/your-webhook-token
BOT_TOKEN=your-bot-token
CHANNEL_ID=your-server-channel-id
USER_ID=your-discord-user-id
```

For incoming messages, install your bot in the server and give it access to view the configured channel. Enable **Message Content Intent** under **Bot → Privileged Gateway Intents** in the Discord Developer Portal. `CHANNEL_ID` is a server channel, not a DM. Use Discord Developer Mode to copy channel and user IDs.

## Run

```sh
bun start
```

Approve Duo on your phone when prompted. The visible browser remains open until you close it. After login, the watcher observes `#active_tab_content` with a 300 ms debounce. A visible `.component-response-header__title` means open; no visible question heading means closed. When open, it calls the existing multiple-choice parser. Startup and page loads also trigger checks. Delivery is attempted once per distinct poll instance, question, and ordered answer set per run; reopening an unchanged poll does not send it again.

The bot logs new messages from `USER_ID` in `CHANNEL_ID` to the terminal. Bot/webhook messages and messages from other users or channels are ignored. It does not submit answers or reply in Discord. The existing webhook still sends outgoing questions.

Discord delivery errors are logged and are not retried automatically. A poll parsing failure is retried by a later check. Messages longer than 2000 characters are rejected locally.

On macOS, prevent idle sleep while running with `caffeinate -i bun start`. Closing the laptop lid can still put it to sleep.

```sh
bun run typecheck
bun test ./test
```

## Current limitations

Sessions are not saved between runs. Detection uses the two-state waiting/question layout inspected on Poll Everywhere. It does not use disabled buttons or status text. There is no periodic polling; parsing failures retry only after another DOM change. The watcher expects `#active_tab_content` to remain in place while its contents change. The local Playwright fixture tests use mocked callbacks; they do not establish live site compatibility. Restarting the process resets deduplication and may send the current poll again. A failed delivery is not retried for that same poll content during the run.
