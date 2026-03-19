import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { AvailableTool, ToolSelection } from "../../api/tool-registry.js";
import {
  fetchAvailableTools,
  fetchToolSelections,
  saveToolSelections,
  fetchSurfaceAvailability,
} from "../../api/tool-registry.js";

interface ToolSelectorProps {
  scopeType: string;
  scopeKey: string;
  /** Render as a collapsible dropdown instead of inline checkboxes. */
  dropdown?: boolean;
}

/** Only manage/update/create/delete/archive suffixes count as write tools. */
const WRITE_SUFFIXES = ["_manage", "_update", "_create", "_delete", "_archive", "_MANAGE", "_UPDATE", "_CREATE", "_DELETE", "_ARCHIVE"];

function isWriteTool(toolId: string): boolean {
  return WRITE_SUFFIXES.some(s => toolId.endsWith(s));
}

function categoryToI18nKey(category: string): string {
  // Handle both old format (browser-profiles) and new uppercase format (BROWSER_PROFILES)
  return category
    .toLowerCase()
    .replace(/[_-]([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function ToolSelector({ scopeType, scopeKey, dropdown }: ToolSelectorProps) {
  const { t } = useTranslation();
  const [tools, setTools] = useState<AvailableTool[]>([]);
  const [selections, setSelections] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingSelectionsRef = useRef<Map<string, boolean> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [availableTools, currentSelections, surfaceAvailability] = await Promise.all([
      fetchAvailableTools(),
      fetchToolSelections(scopeType, scopeKey),
      fetchSurfaceAvailability(),
    ]);
    // Filter to only show tools that are surface-available
    const surfaceSet = new Set(surfaceAvailability);
    const filteredTools = surfaceSet.size > 0
      ? availableTools.filter(t => surfaceSet.has(t.id) || surfaceSet.has(t.id.toUpperCase()))
      : availableTools; // empty surfaceAvailability = no surface, show all
    setTools(filteredTools);
    const map = new Map<string, boolean>();
    for (const s of currentSelections) {
      map.set(s.toolId, s.enabled);
    }
    setSelections(map);
    setLoading(false);
  }, [scopeType, scopeKey]);

  useEffect(() => {
    load();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [load]);

  const debouncedSave = useCallback(
    (nextSelections: Map<string, boolean>) => {
      pendingSelectionsRef.current = nextSelections;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const pending = pendingSelectionsRef.current;
        if (!pending) return;
        const arr: ToolSelection[] = [];
        for (const [toolId, enabled] of pending) {
          arr.push({ toolId, enabled });
        }
        saveToolSelections(scopeType, scopeKey, arr);
        pendingSelectionsRef.current = null;
      }, 500);
    },
    [scopeType, scopeKey],
  );

  const handleGroupToggle = useCallback(
    (toolIds: string[], enable: boolean) => {
      setSelections((prev) => {
        const next = new Map(prev);
        for (const id of toolIds) {
          next.set(id, enable);
        }
        debouncedSave(next);
        return next;
      });
    },
    [debouncedSave],
  );

  // Group tools by category → read/write
  const grouped = useMemo(() => {
    const map = new Map<string, { read: AvailableTool[]; write: AvailableTool[] }>();
    for (const tool of tools) {
      const cat = tool.category || "other";
      const entry = map.get(cat) ?? { read: [], write: [] };
      if (isWriteTool(tool.id)) {
        entry.write.push(tool);
      } else {
        entry.read.push(tool);
      }
      map.set(cat, entry);
    }
    return map;
  }, [tools]);

  if (loading) {
    return (
      <div className="tool-selector-loading">
        {t("common.loading")}
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <div className="tool-selector-empty">
        {t("tools.selector.noTools")}
      </div>
    );
  }

  function renderGroupCheckbox(
    label: string,
    groupTools: AvailableTool[],
    description: string,
  ) {
    if (groupTools.length === 0) return null;
    const allDisabled = groupTools.every(t => !t.allowed);
    const ids = groupTools.map(t => t.id);
    const allChecked = ids.every(id => selections.get(id));
    const denialReason = allDisabled
      ? (groupTools.find(t => t.denialReason)?.denialReason ?? t("tools.selector.locked"))
      : undefined;

    return (
      <label
        className={`tool-selector-item${allDisabled ? " tool-selector-item-disabled" : ""}`}
        title={denialReason ?? description}
      >
        <input
          type="checkbox"
          className="tool-selector-checkbox"
          checked={allChecked}
          disabled={allDisabled}
          onChange={() => handleGroupToggle(ids, !allChecked)}
        />
        <span className="tool-selector-name">{label}</span>
        {allDisabled && (
          <span className="badge tool-selector-locked-badge">
            {t("tools.selector.locked")}
          </span>
        )}
      </label>
    );
  }

  // Build summary text for dropdown mode
  function buildSummary(): string {
    const enabledGroups: string[] = [];
    for (const [category, { read, write }] of grouped) {
      const catLabel = t(`tools.selector.category.${categoryToI18nKey(category)}`, { defaultValue: category });
      const readIds = read.map(tool => tool.id);
      const writeIds = write.map(tool => tool.id);
      const readAll = readIds.length > 0 && readIds.every(id => selections.get(id));
      const writeAll = writeIds.length > 0 && writeIds.every(id => selections.get(id));
      if (readAll && writeAll) {
        enabledGroups.push(`${catLabel}: ${t("tools.selector.groupRead")} + ${t("tools.selector.groupWrite")}`);
      } else if (readAll) {
        enabledGroups.push(`${catLabel}: ${t("tools.selector.groupRead")}`);
      } else if (writeAll) {
        enabledGroups.push(`${catLabel}: ${t("tools.selector.groupWrite")}`);
      }
    }
    return enabledGroups.length > 0
      ? enabledGroups.join("; ")
      : t("tools.selector.noneSelected");
  }

  const content = (
    <div className="tool-selector">
      {Array.from(grouped.entries()).map(([category, { read, write }]) => {
        const catLabel = t(`tools.selector.category.${categoryToI18nKey(category)}`, { defaultValue: category });
        return (
          <div key={category} className="tool-selector-list">
            {renderGroupCheckbox(
              `${catLabel} — ${t("tools.selector.groupRead")}`,
              read,
              read.map(tool => tool.displayName).join(", "),
            )}
            {renderGroupCheckbox(
              `${catLabel} — ${t("tools.selector.groupWrite")}`,
              write,
              write.map(tool => tool.displayName).join(", "),
            )}
          </div>
        );
      })}
    </div>
  );

  if (!dropdown) return content;

  return (
    <details className="tool-selector-dropdown">
      <summary className="tool-selector-dropdown-summary">
        {buildSummary()}
      </summary>
      {content}
    </details>
  );
}
