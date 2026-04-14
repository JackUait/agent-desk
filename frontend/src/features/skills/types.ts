export type SkillKind = "skill" | "command";
export type SkillSource = "user" | "plugin";

export interface SkillItem {
  id: string;
  kind: SkillKind;
  name: string;
  description: string;
  source: SkillSource;
  pluginName?: string;
  readOnly: boolean;
  path: string;
}

export interface SkillContent {
  path: string;
  body: string;
  frontmatter: Record<string, string>;
}

export type SkillScope =
  | { kind: "global" }
  | { kind: "project"; projectId: string };

export function scopeQuery(scope: SkillScope): string {
  if (scope.kind === "global") return "scope=global";
  return `scope=project&projectId=${encodeURIComponent(scope.projectId)}`;
}
