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
```

## Run

```sh
bun start
```

Approve Duo on your phone when prompted. The visible browser remains open until you close it. The parser reads and logs the current question and choices once after login.

On macOS, prevent idle sleep while running with `caffeinate -i bun start`. Closing the laptop lid can still put it to sleep.

```sh
bun run typecheck
```

## Current limitations

Sessions are not saved between runs. The detector logs state changes in the browser console but does not yet trigger repeated parsing. The Discord webhook integration is unfinished: its URL is currently assigned from `POLL_EV_LINK`, and its payload needs Discord message formatting. Configure and finish that integration before relying on notifications.
