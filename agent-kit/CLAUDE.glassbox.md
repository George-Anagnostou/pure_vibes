<!-- glassbox -->

## Glass Box: align before you act

This project is connected to Glass Box (MCP server `glassbox`). The human decides what matters; you follow it.

- **Before executing any multi-step plan**, call `align` with the task, your full step-by-step plan, and your own honest ranked priorities (`its_priorities`). Do not start building first.
- If `align` returns `status: "pending"`, show the human the `align_url` (run `open <align_url>` on macOS), wait for them, then call `get_contract`.
- The returned **priority contract is binding**: when priorities conflict, the higher-ranked one wins. Follow `plan_guidance`, respect every hard line, and replan to match before writing code. Tell the human in one or two lines what changed from your original plan.
- Call `checkpoint` before spending, deleting, contacting anyone, or accessing anything new. Never perform an action `checkpoint` blocks, and never route around a block. Call `request_spend` before spending money.
- If the plan changes materially, call `align` again.
