/** Scope types for tool selection — determines what context a tool selection is bound to */
export type ToolScopeType = "chat_session" | "cron_job" | "app_run" | "service_run";

/** A single tool's selection state */
export interface ToolSelection {
  toolId: string;
  enabled: boolean;
}

/** Identifies the scope for a tool selection */
export interface ToolSelectionScope {
  scopeType: ToolScopeType;
  scopeKey: string;
}

/** Full scoped tool configuration with selections and metadata */
export interface ScopedToolConfig extends ToolSelectionScope {
  selectedTools: ToolSelection[];
  updatedAt: number;
}

