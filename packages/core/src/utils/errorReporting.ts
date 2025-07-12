/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Content } from '@google/genai';

interface ErrorReportData {
  error: { message: string; stack?: string } | { message: string };
  context?: unknown;
  additionalInfo?: Record<string, unknown>;
}

/**
 * Sanitizes context data to prevent sensitive information disclosure
 * @param context The context data to sanitize
 * @returns Sanitized context data
 */
function sanitizeContext(context: unknown): unknown {
  if (context === null || context === undefined) {
    return context;
  }
  
  if (typeof context === 'string') {
    // Redact potential sensitive patterns
    return context
      .replace(/([a-zA-Z0-9_-]+)(@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '[EMAIL_REDACTED]')
      .replace(/\b[A-Za-z0-9]{20,}\b/g, '[TOKEN_REDACTED]')
      .replace(/\b(?:password|token|secret|key|auth)[\s=:]*[\w\-]{8,}\b/gi, '[CREDENTIAL_REDACTED]')
      .replace(/\b(?:sk|pk)_[a-zA-Z0-9]{20,}\b/g, '[API_KEY_REDACTED]');
  }
  
  if (Array.isArray(context)) {
    return context.map(item => sanitizeContext(item));
  }
  
  if (typeof context === 'object' && context !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(context)) {
      // Redact sensitive keys
      if (/^(password|token|secret|key|auth|credential|api_key)$/i.test(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeContext(value);
      }
    }
    return sanitized;
  }
  
  return context;
}

/**
 * Generates an error report, writes it to a temporary file, and logs information to console.error.
 * @param error The error object.
 * @param context The relevant context (e.g., chat history, request contents).
 * @param type A string to identify the type of error (e.g., 'startChat', 'generateJson-api').
 * @param baseMessage The initial message to log to console.error before the report path.
 */
export async function reportError(
  error: Error | unknown,
  baseMessage: string,
  context?: Content[] | Record<string, unknown> | unknown[],
  type = 'general',
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFileName = `gemini-client-error-${type}-${timestamp}.json`;
  const reportPath = path.join(os.tmpdir(), reportFileName);

  let errorToReport: { message: string; stack?: string };
  if (error instanceof Error) {
    errorToReport = { 
      message: error.message, 
      stack: error.stack ? sanitizeContext(error.stack) as string : undefined
    };
  } else if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error
  ) {
    errorToReport = {
      message: String((error as { message: unknown }).message),
    };
  } else {
    errorToReport = { message: String(error) };
  }

  const reportContent: ErrorReportData = { error: errorToReport };

  if (context) {
    reportContent.context = sanitizeContext(context);
  }

  let stringifiedReportContent: string;
  try {
    stringifiedReportContent = JSON.stringify(reportContent, null, 2);
  } catch (stringifyError) {
    // This can happen if context contains something like BigInt
    console.error(
      `${baseMessage} Could not stringify report content (likely due to context):`,
      stringifyError,
    );
    console.error('Original error that triggered report generation:', error);
    if (context) {
      console.error(
        'Original context could not be stringified or included in report.',
      );
    }
    // Fallback: try to report only the error if context was the issue
    try {
      const minimalReportContent = { error: errorToReport };
      stringifiedReportContent = JSON.stringify(minimalReportContent, null, 2);
      // Still try to write the minimal report
      await fs.writeFile(reportPath, stringifiedReportContent);
      console.error(
        `${baseMessage} Partial report (excluding context) available at: ${reportPath}`,
      );
    } catch (minimalWriteError) {
      console.error(
        `${baseMessage} Failed to write even a minimal error report:`,
        minimalWriteError,
      );
    }
    return;
  }

  try {
    await fs.writeFile(reportPath, stringifiedReportContent);
    console.error(`${baseMessage} Full report available at: ${reportPath}`);
  } catch (writeError) {
    console.error(
      `${baseMessage} Additionally, failed to write detailed error report:`,
      writeError,
    );
    // Log the original error as a fallback if report writing fails
    console.error('Original error that triggered report generation:', error);
    if (context) {
      // Context was stringifiable, but writing the file failed.
      // We already have stringifiedReportContent, but it might be too large for console.
      // So, we try to log the original context object, and if that fails, its stringified version (truncated).
      try {
        console.error('Original context:', context);
      } catch {
        try {
          console.error(
            'Original context (stringified, truncated):',
            JSON.stringify(context).substring(0, 1000),
          );
        } catch {
          console.error('Original context could not be logged or stringified.');
        }
      }
    }
  }
}
