/**
 * Needle 3 Agent
 * Handles the inference loop: user query -> tool calls -> results -> final response
 */

import { NEEDLE_CONFIG, NEEDLE_TOOL_NAMES } from './config.js';
import { NEEDLE_3_TOOL_SCHEMAS } from './schemas.js';
import { initializeNeedle, runWithTools, runFreeform, getConfidence, isReady } from './index.js';

class NeedleAgent {
  constructor(toolAdapter) {
    this.toolAdapter = toolAdapter;
    this.conversationHistory = [];
    this.maxHistoryLength = 10; // Keep last 10 exchanges
    this.systemPrompt = null;
  }

  /**
   * Initialize the agent (loads model if needed)
   */
  async initialize() {
    await initializeNeedle();
    this.systemPrompt = this.buildSystemPrompt();
    console.log('[NeedleAgent] Initialized');
  }

  /**
   * Process a user query through the full inference loop
   * @param {string} userInput - User's natural language query
   * @returns {Promise<{response: string, toolCalls: Array, toolResults: Array}>}
   */
  async processQuery(userInput) {
    if (!isReady()) {
      await this.initialize();
    }

    // Add to conversation history
    this.addToHistory('user', userInput);

    // Build prompt with conversation history
    const prompt = this.buildPrompt(userInput);

    try {
      // Step 1: Get tool calls from model
      const toolCallsJson = await runWithTools(prompt, NEEDLE_3_TOOL_SCHEMAS);
      let toolCalls = [];

      try {
        const parsedResponse = JSON.parse(toolCallsJson);
        // Extract function_calls array from the model's response
        if (parsedResponse.function_calls && Array.isArray(parsedResponse.function_calls)) {
          toolCalls = parsedResponse.function_calls;
        } else if (Array.isArray(parsedResponse)) {
          // Fallback: if response is directly an array
          toolCalls = parsedResponse;
        } else {
          // Fallback: wrap single object in array
          toolCalls = [parsedResponse];
        }
      } catch (parseError) {
        // Model didn't return valid JSON tool calls, treat as free-form response
        console.log('[NeedleAgent] No valid tool calls, treating as free-form response');
        const response = await runFreeform(prompt);
        this.addToHistory('assistant', response);
        return { response, toolCalls: [], toolResults: [] };
      }

      // Limit tool calls per turn
      if (toolCalls.length > NEEDLE_CONFIG.maxToolCallsPerTurn) {
        toolCalls = toolCalls.slice(0, NEEDLE_CONFIG.maxToolCallsPerTurn);
      }

      // Step 2: Execute each tool call via adapter
      const toolResults = [];
      for (const call of toolCalls) {
        const result = await this.executeToolCall(call);
        toolResults.push({ call, result });

        // Add tool result to conversation context
        this.addToHistory('tool', JSON.stringify({ call, result }));
      }

      // Step 3: Check confidence for clarification
      if (toolCalls.length > 0) {
        const completion = toolCallsJson;
        const confidence = await getConfidence(prompt, NEEDLE_3_TOOL_SCHEMAS, completion);
        if (confidence < NEEDLE_CONFIG.confidenceThreshold) {
          const clarification = `I'm not confident about that (confidence: ${(confidence * 100).toFixed(0)}%). Could you clarify what you'd like me to do?`;
          this.addToHistory('assistant', clarification);
          return { response: clarification, toolCalls, toolResults };
        }
      }

      // Step 4: Build follow-up prompt with tool results and get final response
      const followUpPrompt = this.buildFollowUpPrompt(prompt, toolCalls, toolResults);
      const finalResponse = await runFreeform(followUpPrompt);

      this.addToHistory('assistant', finalResponse);

      return { response: finalResponse, toolCalls, toolResults };
    } catch (error) {
      console.error('[NeedleAgent] Query processing failed:', error);
      const errorResponse = `Error processing query: ${error.message}`;
      this.addToHistory('assistant', errorResponse);
      return { response: errorResponse, toolCalls: [], toolResults: [] };
    }
  }

  /**
   * Execute a single tool call via the adapter
   * @param {Object} call - Tool call object {name, arguments}
   * @returns {Promise<any>} Tool result
   */
  async executeToolCall(call) {
    if (!this.toolAdapter) {
      throw new Error('Tool adapter not configured');
    }

    const context = {
      source: 'model',
      timestamp: Date.now(),
      sessionId: this.getSessionId(),
    };

    try {
      return await this.toolAdapter.execute(call.name, call.arguments, context);
    } catch (error) {
      // Return normalized error for model to handle
      return {
        error: true,
        code: error.code || 'internal_error',
        message: error.message || 'Tool execution failed',
        retryable: error.retryable || false,
      };
    }
  }

  /**
   * Build the initial prompt with system instructions
   */
  buildPrompt(userInput) {
    const historyStr = this.conversationHistory
      .slice(-this.maxHistoryLength)
      .map(h => `${h.role}: ${h.content}`)
      .join('\n');

    return `${this.systemPrompt}\n\nConversation:\n${historyStr}\n\nUser: ${userInput}\n\nAssistant:`;
  }

  /**
   * Build follow-up prompt with tool results
   */
  buildFollowUpPrompt(originalPrompt, toolCalls, toolResults) {
    const resultsStr = toolResults.map(({ call, result }) => {
      const status = result.error ? 'ERROR' : 'OK';
      return `Tool: ${call.name}(${JSON.stringify(call.arguments)}) -> ${status}: ${JSON.stringify(result)}`;
    }).join('\n');

    return `${this.systemPrompt}\n\nUser: ${originalPrompt}\n\nTool Results:\n${resultsStr}\n\nBased on the tool results above, provide a concise response to the user.\n\nAssistant:`;
  }

  /**
   * Build system prompt with tool descriptions
   */
  buildSystemPrompt() {
    const toolDescriptions = NEEDLE_3_TOOL_SCHEMAS.map(t => {
      const fn = t.function;
      const params = fn.parameters.properties;
      const paramStr = Object.entries(params).map(([name, schema]) => {
        const req = fn.parameters.required?.includes(name) ? ' (required)' : ' (optional)';
        return `  ${name}: ${schema.type}${req} - ${schema.description || ''}`;
      }).join('\n');

      return `${fn.name}:\n  ${fn.description}\n${paramStr}`;
    }).join('\n\n');

    return `You are an AI assistant controlling an Indicator Lights PWA with:
- Three lights: Blue (split left/right), Yellow (auto-toggles), Red (manual toggle)
- Digital clock (HH:MM format)
- Manual logging system with 3 columns (Blue, Yellow, Red) - each has different data schema
- Command terminal with history

AVAILABLE TOOLS:
${toolDescriptions}

RULES:
- For light control: ALWAYS use explicit state (true/false), never "toggle" without state
- Blue light: use "blue-left" or "blue-right" for toggle_light
- Logging: each column has different schema:
  * Blue: {left: boolean, right: boolean}
  * Yellow: {on: boolean}
  * Red: {transition: "on-to-off" | "off-to-on"}
- Time format: HH:MM (24-hour)
- Confirm destructive ops: clear_logs and import_logs require confirm: true
- You can call multiple tools in sequence
- If unsure, ask for clarification`;
  }

  /**
   * Add entry to conversation history
   */
  addToHistory(role, content) {
    this.conversationHistory.push({ role, content, timestamp: Date.now() });
    if (this.conversationHistory.length > this.maxHistoryLength * 2) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength * 2);
    }
  }

  /**
   * Get or generate session ID
   */
  getSessionId() {
    let sessionId = sessionStorage.getItem('needle_session_id');
    if (!sessionId) {
      sessionId = 'session_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('needle_session_id', sessionId);
    }
    return sessionId;
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Get conversation history
   */
  getHistory() {
    return [...this.conversationHistory];
  }

  /**
   * Check if agent is ready
   */
  isReady() {
    return isReady();
  }
}

export { NeedleAgent };