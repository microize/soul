/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  GoogleGenAI,
} from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { Config } from '../config/config.js';
import { getEffectiveModel } from './modelCheck.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  CLOUD_SHELL = 'cloud-shell',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
};

/**
 * Validates and sanitizes environment variable values
 * SECURITY: Prevents injection attacks via environment variables
 */
function validateEnvironmentVariable(value: string | undefined, varName: string): string | undefined {
  if (!value) {
    return undefined;
  }

  // Basic validation - no control characters or null bytes
  if (/[\x00-\x1f\x7f]/.test(value)) {
    console.warn(`Environment variable ${varName} contains invalid characters and will be ignored`);
    return undefined;
  }

  // Validate specific patterns for known environment variables
  switch (varName) {
    case 'GEMINI_API_KEY':
    case 'GOOGLE_API_KEY':
      // API keys should be alphanumeric with specific patterns
      if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length < 10) {
        console.warn(`Environment variable ${varName} has invalid format and will be ignored`);
        return undefined;
      }
      break;
    case 'GOOGLE_CLOUD_PROJECT':
      // Project IDs have specific format requirements
      if (!/^[a-z0-9-]+$/.test(value) || value.length > 63) {
        console.warn(`Environment variable ${varName} has invalid format and will be ignored`);
        return undefined;
      }
      break;
    case 'GOOGLE_CLOUD_LOCATION':
      // Location should be a valid region format
      if (!/^[a-z0-9-]+$/.test(value)) {
        console.warn(`Environment variable ${varName} has invalid format and will be ignored`);
        return undefined;
      }
      break;
  }

  return value.trim();
}

export async function createContentGeneratorConfig(
  model: string | undefined,
  authType: AuthType | undefined,
): Promise<ContentGeneratorConfig> {
  const geminiApiKey = validateEnvironmentVariable(process.env.GEMINI_API_KEY, 'GEMINI_API_KEY');
  const googleApiKey = validateEnvironmentVariable(process.env.GOOGLE_API_KEY, 'GOOGLE_API_KEY');
  const googleCloudProject = validateEnvironmentVariable(process.env.GOOGLE_CLOUD_PROJECT, 'GOOGLE_CLOUD_PROJECT');
  const googleCloudLocation = validateEnvironmentVariable(process.env.GOOGLE_CLOUD_LOCATION, 'GOOGLE_CLOUD_LOCATION');

  // Use runtime model from config if available, otherwise fallback to parameter or default
  const effectiveModel = model || DEFAULT_GEMINI_MODEL;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
  };

  // If we are using Google auth or we are in Cloud Shell, there is nothing else to validate for now
  if (
    authType === AuthType.LOGIN_WITH_GOOGLE ||
    authType === AuthType.CLOUD_SHELL
  ) {
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.vertexai = false;
    contentGeneratorConfig.model = await getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
    );

    return contentGeneratorConfig;
  }

  if (
    authType === AuthType.USE_VERTEX_AI &&
    (googleApiKey || (googleCloudProject && googleCloudLocation))
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;

    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  const version = process.env.CLI_VERSION || process.version;
  const httpOptions = {
    headers: {
      'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };
  if (
    config.authType === AuthType.LOGIN_WITH_GOOGLE ||
    config.authType === AuthType.CLOUD_SHELL
  ) {
    return createCodeAssistContentGenerator(
      httpOptions,
      config.authType,
      gcConfig,
      sessionId,
    );
  }

  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config.vertexai,
      httpOptions,
    });

    return googleGenAI.models;
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
