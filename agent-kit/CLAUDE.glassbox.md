<!-- glassbox -->

## Glass Box: show the human how before you act

This project is connected to Glass Box (MCP server `glassbox`). The human approves how you work, not just what you produce.

- **Before acting on any task with real choices, data, cost or consequences**, call `align` with the task and your approach as 5-15 concrete steps. For each step give the method (`how`), the data sources, APIs and tools it uses (`uses`), your honest `est_tokens` and `est_cost_usd`, `why`, and its `source`.
- A pop-up opens for the human. Call `get_contract` until it is approved.
- The returned `approved_steps` are binding: do exactly those steps, in that order, the way each describes. Human-added steps are required; never do anything in `removed_by_human`; don't add data sources or steps that weren't approved. Tell the human in one or two lines what changed.
- Call `checkpoint` before spending, deleting, contacting anyone, or accessing anything new, and never perform an action it blocks. If your approach changes, call `align` again.

<!-- /glassbox -->
