/**
 * 核心异常类型定义
 */

export class PluginNameRequiredError extends Error {
  constructor(pluginName?: string) {
    super(
      `Plugin name is required${pluginName ? ` (plugin: ${pluginName})` : ""}`
    );
    this.name = "PluginNameRequiredError";
  }
}

export class ModuleConfigValidationError extends Error {
  constructor(moduleName: string, pluginName: string, message: string) {
    super(
      `[ModuleConfigError] Module ${moduleName} (plugin ${pluginName}): ${message}`
    );
    this.name = "ModuleConfigValidationError";
  }
}

export class DuplicateModuleError extends Error {
  constructor(moduleName: string) {
    super(`Module ${moduleName} is already registered`);
    this.name = "DuplicateModuleError";
  }
}
