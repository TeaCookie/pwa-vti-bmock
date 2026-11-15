/**
 * Error Normalization for Tool Adapter
 * Maps internal errors to contract error codes
 */

import { ERROR_CODES } from './validation.js';

export const ERROR_MESSAGES = {
  [ERROR_CODES.INVALID_ARGS]: 'Argument validation failed',
  [ERROR_CODES.INVALID_COLUMN]: 'Column must be blue, yellow, or red',
  [ERROR_CODES.INVALID_LIGHT]: 'Light must be blue-left, blue-right, yellow, or red',
  [ERROR_CODES.INVALID_DATA_SCHEMA]: 'Data doesn\'t match column schema',
  [ERROR_CODES.INVALID_TIME_FORMAT]: 'Time must be HH:MM format',
  [ERROR_CODES.INVALID_TIME_VALUE]: 'Time values out of range',
  [ERROR_CODES.INVALID_BOUNDS]: 'minMs/maxMs out of bounds or min >= max',
  [ERROR_CODES.INVALID_FORMAT]: 'Format must be json or csv',
  [ERROR_CODES.INVALID_MODE]: 'Mode must be replace or merge',
  [ERROR_CODES.INVALID_DATA_STRUCTURE]: 'Import data must have blue, yellow, red arrays',
  [ERROR_CODES.ENTRY_NOT_FOUND]: 'Log entry not found',
  [ERROR_CODES.CONFIRMATION_REQUIRED]: 'Operation requires explicit confirmation',
  [ERROR_CODES.DRY_RUN_ONLY]: 'Preview only - no changes made',
  [ERROR_CODES.RATE_LIMITED]: 'Too many requests',
  [ERROR_CODES.INTERNAL_ERROR]: 'Application error',
  [ERROR_CODES.STORAGE_ERROR]: 'localStorage operation failed',
};

export const RETRYABLE_ERRORS = new Set([
  ERROR_CODES.RATE_LIMITED,
  ERROR_CODES.INTERNAL_ERROR,
  ERROR_CODES.STORAGE_ERROR,
]);

/**
 * Normalized Tool Error
 */
export class ToolError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.details = details;
    this.retryable = RETRYABLE_ERRORS.has(code);
    this.timestamp = Date.now();
  }

  toJSON() {
    return {
      error: true,
      code: this.code,
      message: this.message,
      details: this.details,
      retryable: this.retryable,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Create a tool error from an unknown error
 */
export function normalizeError(error, context = {}) {
  // Already a ToolError
  if (error instanceof ToolError) {
    return error;
  }

  // ValidationError from our validation
  if (error instanceof ValidationError) {
    return new ToolError(error.code, error.message, error.details);
  }

  // ZodError (if using Zod)
  if (error.name === 'ZodError') {
    return new ToolError(
      ERROR_CODES.INVALID_ARGS,
      'Validation failed',
      { zodErrors: error.errors }
    );
  }

  // localStorage quota exceeded
  if (error.name === 'QuotaExceededError' || error.code === 22) {
    return new ToolError(
      ERROR_CODES.STORAGE_ERROR,
      'Storage quota exceeded',
      { originalError: error.message }
    );
  }

  // Network/timeout errors
  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return new ToolError(
      ERROR_CODES.INTERNAL_ERROR,
      'Operation timed out',
      { originalError: error.message, retryable: true }
    );
  }

  // Generic error
  return new ToolError(
    ERROR_CODES.INTERNAL_ERROR,
    error.message || 'Unknown error',
    { originalError: error.message, ...context }
  );
}

/**
 * ValidationError class (re-exported for use in other modules)
 */
export class ValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Check if an error is retryable
 */
export function isRetryable(error) {
  if (error instanceof ToolError) {
    return error.retryable;
  }
  // Default to retryable for unknown errors
  return true;
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error) {
  if (error instanceof ToolError) {
    return error.message;
  }
  return error.message || 'An error occurred';
}

/**
 * Wrap a promise to normalize errors
 */
export async function withErrorNormalization(promise, context = {}) {
  try {
    return await promise;
  } catch (error) {
    throw normalizeError(error, context);
  }
}