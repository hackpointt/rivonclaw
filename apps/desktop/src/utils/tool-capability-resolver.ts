import type {
  CatalogTool,
  SurfaceAvailabilityResult,
  ToolCapabilityResult,
  GQL,
} from "@rivonclaw/core";
import { createLogger } from "@rivonclaw/logger";
import { OUR_PLUGIN_IDS } from "../generated/our-plugin-ids.js";

const log = createLogger("tool-capability-resolver");

/**
 * ToolCapabilityResolver — singleton that computes effectiveTools
 * using the four-layer model.
 *
 * Layer 1 (Entitlement): paid tools from backend, cached locally
 * Layer 2 (Surface): usage scenario boundary, desktop-managed
 * Layer 3 (RunProfile): per-run tool selection, desktop-managed
 * Layer 4 (Tool Execution): capability-manager before_tool_call enforcement
 *
 * This resolver handles Layers 1-3 computation. The capability-manager
 * plugin pulls effective tools via HTTP on demand for Layer 4 enforcement.
 */
export class ToolCapabilityResolver {
  private entitledToolIds: string[] = [];
  private systemToolIds: string[] = [];
  private customExtensionToolIds: string[] = [];
  private initialized = false;

  /**
   * Initialize with entitled tools from backend and tool catalog from gateway.
   * Call after gateway connects and entitlements are fetched.
   */
  init(entitledToolIds: string[], catalogTools: CatalogTool[]): void {
    this.entitledToolIds = entitledToolIds;
    this.systemToolIds = [];
    this.customExtensionToolIds = [];

    for (const tool of catalogTools) {
      if (tool.source === "core") {
        this.systemToolIds.push(tool.id);
      } else if (tool.source === "plugin") {
        if (tool.pluginId && OUR_PLUGIN_IDS.has(tool.pluginId)) {
          continue;
        }
        this.customExtensionToolIds.push(tool.id);
      }
    }

    this.initialized = true;
    log.info(
      `Initialized: ${this.entitledToolIds.length} entitled, ` +
      `${this.systemToolIds.length} system, ` +
      `${this.customExtensionToolIds.length} custom extension tools`,
    );
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /** All available tools = entitled ∪ system ∪ customExtension */
  getAllAvailableToolIds(): string[] {
    return [
      ...this.entitledToolIds,
      ...this.systemToolIds,
      ...this.customExtensionToolIds,
    ];
  }

  /**
   * Default tools when no RunProfile is selected.
   * Includes system tools (read, write, exec, etc.) and custom extension tools,
   * but NOT entitled tools (backend-unlocked tools require explicit selection).
   */
  getDefaultToolIds(): string[] {
    return [
      ...this.systemToolIds,
      ...this.customExtensionToolIds,
    ];
  }

  /**
   * Compute tool availability after Surface restriction (Layer 1 ∪ then ∩ Layer 2).
   * Returns the candidate tool set for RunProfile selection UI.
   */
  computeSurfaceAvailability(surface: GQL.Surface | null): SurfaceAvailabilityResult {
    const allAvailable = this.getAllAvailableToolIds();
    const surfaceUnrestricted = !surface || surface.allowedToolIds.length === 0;

    let availableToolIds: string[];
    if (surfaceUnrestricted) {
      availableToolIds = allAvailable;
    } else {
      const surfaceSet = new Set(surface!.allowedToolIds.map(id => id.toUpperCase()));
      availableToolIds = allAvailable.filter(toolId => {
        const upper = toolId.toUpperCase();
        return surfaceSet.has(upper) || surfaceSet.has(toolId);
      });
    }

    return {
      allAvailableToolIds: allAvailable,
      surfaceId: surface?.id ?? "",
      surfaceAllowedToolIds: surface?.allowedToolIds ?? [],
      availableToolIds,
    };
  }

  /**
   * Compute the final effective tool set (Layer 1 ∪ then ∩ Layer 2 ∩ Layer 3).
   *
   * When runProfile is null (no explicit selection), defaults to system + custom
   * extension tools only. Entitled tools (backend-unlocked) require explicit
   * selection via a RunProfile.
   */
  computeEffectiveTools(
    surface: GQL.Surface | null,
    runProfile: GQL.RunProfile | null,
  ): ToolCapabilityResult {
    const availability = this.computeSurfaceAvailability(surface);
    const availableSet = new Set(availability.availableToolIds);

    const selectedToolIds = runProfile?.selectedToolIds ?? this.getDefaultToolIds();
    const effectiveToolIds = selectedToolIds.filter(toolId => {
      const upper = toolId.toUpperCase();
      return availableSet.has(toolId) || availableSet.has(upper);
    });

    return {
      allAvailableToolIds: availability.allAvailableToolIds,
      entitledToolIds: this.entitledToolIds,
      systemToolIds: this.systemToolIds,
      customExtensionToolIds: this.customExtensionToolIds,
      surfaceId: availability.surfaceId,
      surfaceAllowedToolIds: availability.surfaceAllowedToolIds,
      runProfileSelectedToolIds: selectedToolIds,
      effectiveToolIds,
    };
  }

}

/** Singleton instance */
export const toolCapabilityResolver = new ToolCapabilityResolver();
