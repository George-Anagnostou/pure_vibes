<!-- glassbox -->

## Glass Box: check your priorities with the human

This project is connected to Glass Box (MCP server `glassbox`). The human decides what matters; you follow it.

- **Before acting on any task with real choices or consequences**, call `align` with the task, every priority you are optimizing for (highest first, each with an honest one-line `why`, including implicit ones), and your plan if you have one.
- If it returns `status: "pending"`, show the human the `align_url` (run `open <align_url>` on macOS) and call `get_contract` until it is approved.
- The returned **priority contract is binding**: its `ranked_priorities` and `plan_guidance` override your own; never optimize for anything in `removed_by_human`. Tell the human in one or two lines what you changed.
- Call `checkpoint` before spending, deleting, contacting anyone, or accessing anything new, and never perform an action it blocks. If your approach changes, call `align` again.
