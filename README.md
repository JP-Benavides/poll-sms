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
FIRST_NAME=your-first-name
LAST_NAME=your-last-name
PASSWORD=your-password
POLL_EV_LINK=https://pollev.com/your-presenter
BOT_TOKEN=your-bot-token
CHANNEL_ID=your-server-channel-id
USER_ID=your-discord-user-id
```

For incoming messages, install your bot in the server and give it View Channel and Send Messages permissions in the configured channel (Send Messages in Threads as well if using a thread). Enable **Message Content Intent** under **Bot → Privileged Gateway Intents** in the Discord Developer Portal. `CHANNEL_ID` is a server channel, not a DM. Use Discord Developer Mode to copy channel and user IDs.

## Run

```sh
bun start
```

Approve Duo on your phone when prompted. The visible browser remains open until you close it. After login, the watcher observes `#active_tab_content` with a 300 ms debounce. A visible `.component-response-header__title` means open; no visible question heading means closed. When open, it calls the existing multiple-choice parser. Startup and page loads also trigger checks. Delivery is attempted once per distinct poll instance, question, and ordered answer set per run; reopening an unchanged poll does not send it again.

Answer handling starts disabled. Each newly parsed poll starts a local Codex CLI call using your existing Codex login. Install Codex and sign in before running; if the solver is unavailable, fails, or exceeds its 60-second deadline, the app requests a manual answer instead.

The bot posts the question, numbered choices, and the suggested answer with a brief explanation. Use Discord **Reply** on that proposal:

- Reply `yes` to approve the suggestion and submit it through the existing Playwright browser.
- Reply `no` to reject the suggestion, then reply to the same proposal with your choice number to submit your own answer.
- If no suggestion is available, reply with a choice number directly.

Only replies from `USER_ID` in `CHANNEL_ID` referencing the current proposal are accepted. The same bot sends proposals and status updates to that channel. `DISCORD_URL` is no longer used; `src/discord_webhook.ts` is retained only as historical code. Other messages are ignored. A changed or closed poll cancels pending solver work and invalidates approval. Duplicate approvals cannot submit twice. There is no always-enabled testing override.

Before submission, Playwright checks that the poll and ordered choices still match. It supports a unique button per choice or radio choices with a separate Submit control. It waits up to three seconds for a new, explicit submission acknowledgement within the unchanged poll. Missing confirmation, navigation, or cancellation after interaction is reported as uncertain; check the browser before taking further action. Submissions are never retried automatically.

Discord delivery errors are logged and are not retried automatically. A poll parsing failure is retried by a later check. Messages longer than 2000 characters are rejected locally.

On macOS, prevent idle sleep while running with `caffeinate -i bun start`. Closing the laptop lid can still put it to sleep.

```sh
bun run typecheck
bun test ./test
```

## Current limitations

Sessions are not saved between runs. Detection uses the two-state waiting/question layout inspected on Poll Everywhere. It does not use disabled buttons or status text. There is no periodic polling; parsing failures retry only after another DOM change. The watcher expects `#active_tab_content` to remain in place while its contents change. Tests use local browser fixtures and mocked agent/Discord calls; they do not establish live site compatibility. Live Poll Everywhere controls and confirmation messages still require verification. Only text-based single-choice polls are supported. Restarting the process resets deduplication and may send the current poll again. A failed delivery is not retried for that same poll content during the run.
