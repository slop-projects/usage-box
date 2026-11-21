# usage-left

A Claude Code mod that shows how much of your Claude usage limits you've used, in the row just above the message box.

- **Left:** a ring for your current session (the 5-hour limit), its % used and when it resets.
- **Right:** a ring for this week, its % used and when it resets. A **Reset** link appears once a limit is 80% or more used.
- Rings go green, then amber, then red as you use more, with a soft glow.
- **Reset** opens your usage page on claude.ai, where you can use a full limit reset if you have one.
- The numbers refresh every 30 seconds from Claude's usage service (the same one `/usage` reads), and every session on your computer shares the latest reading, so they all show the same numbers.
- A pop-up warns you once when a limit passes 80% and 95%.
- `/usage-left` prints the numbers.

Works on a Claude subscription (Pro or Max). If the usage service can't be reached, it falls back to the numbers from Claude's last reply.

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
