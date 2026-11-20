# usage-left

A Claude Code mod that shows how much of your Claude usage limits you've used, as a small glass pill with a green ring, just above the message box. The pill matches the message box colour and is only as wide as the numbers.

- **Outer ring:** your current session (the 5-hour limit). **Inner ring:** this week.
- Green, then amber at 80% used, red at 95%.
- Hover the ring for the reset times.
- A **Reset** link opens your usage page on claude.ai, where you can use a full limit reset if you have one.
- A pop-up warns you once when a limit passes 80% and 95%.
- `/usage-left` prints the numbers.

The numbers come with Claude's replies, so the row appears after the first reply of a session, and only on a Claude subscription (Pro or Max).

## Install

At the prompt of a terminal session:

```
/plugin install usage-left --marketplace slop-projects/usage-box
```

From a shell:

```bash
claude plugin install usage-left --marketplace slop-projects/usage-box
```

Answer `y` to add the marketplace, then pick the user scope so it loads in every session.

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `slop-projects/usage-box`, then **Add plugin**.

## License

MIT
