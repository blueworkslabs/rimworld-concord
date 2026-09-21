# Optional OpenClaw adapter — contract only

No plugin is installed or executable in this slice. Do not create a runtime manifest that implies otherwise.

Planned operator tools: start/stop lab, status/activity, inspect recorded events, create/restore paired checkpoints, run acceptance fixtures, retrieve chronicles. Observer tools must be separate from character-facing proposals/decisions. A potential model backend must supply isolated per-character context, narrow tools and supported authentication; it must not inherit operator/admin access.

The standalone coordinator owns game state and lifetime. A Gateway restart must not erase character history. An OpenClaw tool plugin is sufficient initially; the experimental low-level OpenClaw "agent harness" SDK is a different abstraction and not required merely to operate this game.
