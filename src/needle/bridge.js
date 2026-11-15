/**
 * Needle 3 ↔ Tool Adapter Bridge
 * Connects the Needle 3 agent to the tool adapter layer
 */

import { ToolAdapter } from '../adapter/index.js';
import { NeedleAgent } from './agent.js';
import { NEEDLE_3_TOOL_SCHEMAS } from './schemas.js';

let needleAgent = null;
let toolAdapter = null;
let bridgeInitialized = false;

/**
 * Initialize the bridge with tool adapter
 * @param {ToolAdapter} adapter - Tool adapter instance
 * @returns {Promise<NeedleAgent>} Initialized agent
 */
export async function initializeBridge(adapter) {
  toolAdapter = adapter;
  needleAgent = new NeedleAgent(toolAdapter);
  await needleAgent.initialize();
  bridgeInitialized = true;
  console.log('[Bridge] Needle 3 ↔ Tool Adapter bridge initialized');
  return needleAgent;
}

/**
 * Get the Needle 3 agent instance
 * @returns {NeedleAgent|null}
 */
export function getAgent() {
  return needleAgent;
}

/**
 * Process a user query through the full Needle 3 + adapter pipeline
 * @param {string} userInput - User's natural language query
 * @returns {Promise<{response: string, toolCalls: Array, toolResults: Array}>}
 */
export async function processQuery(userInput) {
  if (!bridgeInitialized || !needleAgent) {
    throw new Error('Bridge not initialized. Call initializeBridge() first.');
  }
  return needleAgent.processQuery(userInput);
}

/**
 * Get Needle 3 tool schemas for the model
 * @returns {Array} OpenAI-format tool schemas
 */
export function getToolSchemas() {
  return NEEDLE_3_TOOL_SCHEMAS;
}

/**
 * Check if bridge is ready
 * @returns {boolean}
 */
export function isReady() {
  return bridgeInitialized && needleAgent && needleAgent.isReady();
}

/**
 * Get bridge status
 * @returns {Object}
 */
export function getStatus() {
  return {
    initialized: bridgeInitialized,
    agentReady: needleAgent?.isReady() || false,
    adapterReady: toolAdapter !== null,
  };
}

/**
 * Reset bridge (for testing/recovery)
 */
export function reset() {
  needleAgent = null;
  toolAdapter = null;
  bridgeInitialized = false;
}

/**
 * Execute a tool call directly via adapter (bypassing model)
 * @param {string} toolName - Tool name
 * @param {Object} args - Tool arguments
 * @returns {Promise<any>} Tool result
 */
export async function executeToolDirect(toolName, args) {
  if (!toolAdapter) {
    throw new Error('Tool adapter not initialized');
  }

  const context = {
    source: 'model',
    timestamp: Date.now(),
  };

  return toolAdapter.execute(toolName, args, context);
}

/**
 * Get all available tool names
 * @returns {string[]}
 */
export function getToolNames() {
  return NEEDLE_3_TOOL_SCHEMAS.map(s => s.function.name);
}