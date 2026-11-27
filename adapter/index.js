(function attachNeedleToolAdapter(root, factory) {
  const dependencies = typeof module !== 'undefined' && module.exports
    ? {
        errors: require('./errors.js'),
        validation: require('./validation.js'),
        registry: require('./registry.js')
      }
    : {
        errors: root.NeedleAdapterErrors,
        validation: root.NeedleAdapterValidation,
        registry: root.NeedleAdapterRegistry
      };
  const api = factory(dependencies);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NeedleToolAdapter = api;
})(typeof self !== 'undefined' ? self : globalThis, function createAdapter(deps) {
  'use strict';

  const { AdapterError, normalizeError } = deps.errors;
  const { validateArguments } = deps.validation;
  const { createRegistry, TOOL_NAMES } = deps.registry;

  function createToolAdapter(options = {}) {
    const registry = createRegistry(options.appApi, { confirmAction: options.confirmAction });

    async function execute(toolName, inputArguments) {
      if (typeof toolName !== 'string' || !Object.prototype.hasOwnProperty.call(registry, toolName)) {
        return {
          success: false,
          tool: typeof toolName === 'string' ? toolName : null,
          error: normalizeError(new AdapterError('unknown_tool', 'This tool is not supported.'))
        };
      }

      try {
        const args = validateArguments(toolName, inputArguments);
        const result = await registry[toolName](args);
        return { success: true, tool: toolName, result };
      } catch (error) {
        return { success: false, tool: toolName, error: normalizeError(error) };
      }
    }

    async function executeCalls(calls) {
      if (!Array.isArray(calls)) {
        return [{
          success: false,
          tool: null,
          error: normalizeError(new AdapterError('invalid_calls', 'Tool calls must be supplied as an array.'))
        }];
      }
      const results = [];
      for (const call of calls) {
        if (!call || typeof call !== 'object' || Array.isArray(call)) {
          results.push({
            success: false,
            tool: null,
            error: normalizeError(new AdapterError('invalid_call', 'Each tool call must be an object.'))
          });
          continue;
        }
        // Sequential await is intentional: writes must complete in model order.
        results.push(await execute(call.name, call.arguments));
      }
      return results;
    }

    return Object.freeze({ execute, executeCalls });
  }

  return Object.freeze({ createToolAdapter, TOOL_NAMES });
});
