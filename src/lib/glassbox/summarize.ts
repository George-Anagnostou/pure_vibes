// Headline voice from DESIGN.md: "Here is how i will approach [prompt summary]."
// The summary is the task's first sentence, quoted, so imperatives read naturally.
// Long sentences are cut at a word boundary (never mid-word) with an ellipsis.
export function summarize(task: string, max = 90) {
  const trimmed = task.trim();
  const first = (trimmed.split(/(?<=[.!?])\s/)[0] ?? trimmed).replace(
    /[.!?]$/,
    "",
  );
  if (first.length <= max) return first;
  const cut = first.slice(0, max); // leave room for the ellipsis below
  const space = cut.lastIndexOf(" ");
  // A single enormous word has no boundary to use; cut it rather than show nothing.
  const head = space > 0 ? cut.slice(0, space) : cut.slice(0, max - 1);
  return `${head.replace(/[\s,;:–—-]+$/, "")}…`;
}
