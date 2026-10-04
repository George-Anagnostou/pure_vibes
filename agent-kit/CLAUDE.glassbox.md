<!-- glassbox -->

## Glass Box: check what the human actually wants before you act

This project is connected to Glass Box (MCP server `glassbox`). Glass Box is an MCP server, not a skill: its tools are `mcp__glassbox__align` and `mcp__glassbox__get_contract`. If they are deferred, load them in one call with ToolSearch `select:mcp__glassbox__align,mcp__glassbox__get_contract`; don't search for a skill. Don't guess what the human wants; show them how you're thinking and let them correct it.

- **Before acting on any task with real choices** (scope, data sources, cost, time, quality, risk), call `align` with: the task; your `approach` (2-4 sentences); your `priorities`, meaning what you're weighing, ranked, each with why and source; and your `decisions`, meaning the judgment calls you'd otherwise make silently. Give each decision your choice, what you think the human wants, your reasoning, real alternatives with trade-offs, and est tokens/$/time. Be candid about assumptions.
- `align` opens a pop-up for the human; show them the `align_url` in one line. Then call `get_contract` with the `review_id`, and when it says `pending`, call it again, and again, until the status is `approved` or `rejected`. The human may take several minutes; that is normal. Don't start the work, end your turn, or ask them to paste anything while you wait.
- The contract is binding: weigh trade-offs in the order of `ranked_priorities`, never optimize for `removed_priorities`, do what each `decision` says (especially `changed_by_human`), and follow `instructions_from_human` and `plan_guidance`. Tell the human in one or two lines what changed.
- Call `checkpoint` before spending, deleting, contacting anyone, or accessing anything new, and never perform an action it blocks. If a new significant decision comes up, call `align` again rather than guessing.

<!-- /glassbox -->
