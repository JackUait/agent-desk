const PREFIX = "mcp__agent_desk__";

type Args = Record<string, unknown>;

type Handler = (args: Args) => string;

const handlers: Record<string, Handler> = {
  set_status: (a) => `Status → ${String(a.column ?? "?")}`,
  set_title: (a) => `Title: ${String(a.title ?? "")}`,
  set_description: () => "Description updated",
  set_summary: (a) => `Summary: ${String(a.summary ?? "")}`,
  set_complexity: (a) => `Complexity → ${String(a.complexity ?? "?")}`,
  set_progress: (a) =>
    `Progress: ${String(a.step ?? "?")}/${String(a.totalSteps ?? "?")} ${String(a.currentStep ?? "")}`.trim(),
  clear_progress: () => "Progress cleared",
  set_blocked: (a) => `Blocked: ${String(a.reason ?? "")}`,
  clear_blocked: () => "Unblocked",
  add_label: (a) => `+Label ${String(a.label ?? "")}`,
  remove_label: (a) => `−Label ${String(a.label ?? "")}`,
  add_acceptance_criterion: (a) => `+AC ${String(a.text ?? "")}`,
  remove_acceptance_criterion: (a) => `−AC [${String(a.index ?? "?")}]`,
  set_acceptance_criteria: (a) =>
    `AC list replaced (${Array.isArray(a.items) ? a.items.length : 0})`,
  set_relevant_files: (a) =>
    `Files replaced (${Array.isArray(a.paths) ? a.paths.length : 0})`,
  get_card: () => "Read card state",
};

export function labelForAgentDeskTool(toolName: string, args: Args): string | null {
  if (!toolName.startsWith(PREFIX)) return null;
  const shortName = toolName.slice(PREFIX.length);
  const fn = handlers[shortName];
  if (!fn) return shortName;
  return fn(args);
}
