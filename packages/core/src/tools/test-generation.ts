/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Test generation types
 */
export enum TestType {
  UNIT = 'unit',
  INTEGRATION = 'integration',
  E2E = 'e2e',
  MOCK = 'mock',
  SNAPSHOT = 'snapshot',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
}

/**
 * Test framework types
 */
export enum TestFramework {
  JEST = 'jest',
  MOCHA = 'mocha',
  VITEST = 'vitest',
  CYPRESS = 'cypress',
  PLAYWRIGHT = 'playwright',
  PYTEST = 'pytest',
  JUNIT = 'junit',
  AUTO = 'auto',
}

/**
 * Source code analysis result
 */
export interface SourceAnalysis {
  fileName: string;
  functions: FunctionInfo[];
  classes: ClassInfo[];
  imports: string[];
  exports: string[];
  language: string;
}

export interface FunctionInfo {
  name: string;
  line: number;
  signature: string;
}

export interface ClassInfo {
  name: string;
  line: number;
}

/**
 * Parameters for the TestGeneration tool
 */
export interface TestGenerationToolParams {
  /**
   * Type of test to generate
   */
  test_type: TestType;

  /**
   * Source file or function to generate tests for
   */
  source_path: string;

  /**
   * Test framework to use
   */
  framework?: TestFramework;

  /**
   * Output directory for generated tests
   */
  output_dir?: string;

  /**
   * Include test data generation
   */
  include_test_data?: boolean;

  /**
   * Include mocking setup
   */
  include_mocks?: boolean;

  /**
   * Coverage target percentage
   */
  coverage_target?: number;

  /**
   * Generate edge case tests
   */
  include_edge_cases?: boolean;

  /**
   * Include assertion examples
   */
  include_assertions?: boolean;

  /**
   * Test naming convention
   */
  naming_convention?: 'describe' | 'it' | 'test' | 'should';

  /**
   * Generate test configuration files
   */
  include_config?: boolean;
}

/**
 * Test Generation Tool - Automated test creation and management
 */
export class TestGenerationTool extends BaseTool<TestGenerationToolParams, ToolResult> {
  private readonly config: Config;
  static readonly Name = 'test_generator';

  constructor(config: Config) {
    super(
      TestGenerationTool.Name,
      'Test Generator',
      'Automated test generation tool that creates unit tests, integration tests, mocks, and test data. Supports multiple testing frameworks and generates comprehensive test suites with edge cases and assertions.',
      {
        properties: {
          test_type: {
            type: Type.STRING,
            description: 'Type of test to generate',
            enum: Object.values(TestType),
          },
          source_path: {
            type: Type.STRING,
            description: 'Source file or function to generate tests for',
          },
          framework: {
            type: Type.STRING,
            description: 'Test framework to use (auto-detected if not specified)',
            enum: Object.values(TestFramework),
          },
          output_dir: {
            type: Type.STRING,
            description: 'Output directory for generated tests',
          },
          include_test_data: {
            type: Type.BOOLEAN,
            description: 'Include test data generation',
          },
          include_mocks: {
            type: Type.BOOLEAN,
            description: 'Include mocking setup',
          },
          coverage_target: {
            type: Type.NUMBER,
            description: 'Coverage target percentage (0-100)',
          },
          include_edge_cases: {
            type: Type.BOOLEAN,
            description: 'Generate edge case tests',
          },
          include_assertions: {
            type: Type.BOOLEAN,
            description: 'Include detailed assertion examples',
          },
          naming_convention: {
            type: Type.STRING,
            description: 'Test naming convention',
            enum: ['describe', 'it', 'test', 'should'],
          },
          include_config: {
            type: Type.BOOLEAN,
            description: 'Generate test configuration files',
          },
        },
        required: ['test_type', 'source_path'],
        type: Type.OBJECT,
      }
    );
    this.config = config;
  }

  validateToolParams(params: TestGenerationToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    // Validate source path
    const sourcePath = path.isAbsolute(params.source_path)
      ? params.source_path
      : path.join(this.config.getTargetDir(), params.source_path);

    if (!fs.existsSync(sourcePath)) {
      return `Source path does not exist: ${params.source_path}`;
    }

    // Validate coverage target
    if (params.coverage_target !== undefined) {
      if (params.coverage_target < 0 || params.coverage_target > 100) {
        return 'Coverage target must be between 0 and 100';
      }
    }

    return null;
  }

  getDescription(params: TestGenerationToolParams): string {
    const testType = params.test_type;
    const framework = params.framework || 'auto-detected framework';
    const sourcePath = path.basename(params.source_path);

    return `Generate ${testType} tests for ${sourcePath} using ${framework}`;
  }

  async execute(params: TestGenerationToolParams): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    try {
      const sourcePath = path.isAbsolute(params.source_path)
        ? params.source_path
        : path.join(this.config.getTargetDir(), params.source_path);

      const framework = params.framework || await this.detectFramework();
      const outputDir = params.output_dir || this.getDefaultOutputDir(framework);

      const testContent = await this.generateTests(sourcePath, params, framework);
      const testFilePath = await this.writeTestFile(sourcePath, testContent, outputDir, framework);

      // Generate additional files if requested
      const additionalFiles: string[] = [];

      if (params.include_config) {
        const configFile = await this.generateTestConfig(framework, outputDir);
        if (configFile) additionalFiles.push(configFile);
      }

      if (params.include_test_data) {
        const dataFile = await this.generateTestData(sourcePath, outputDir);
        if (dataFile) additionalFiles.push(dataFile);
      }

      return this.formatResult(testFilePath, additionalFiles, params);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Test generation failed: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }

  private async detectFramework(): Promise<TestFramework> {
    const packageJsonPath = path.join(this.config.getTargetDir(), 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

      if (dependencies.vitest) return TestFramework.VITEST;
      if (dependencies.jest) return TestFramework.JEST;
      if (dependencies.mocha) return TestFramework.MOCHA;
      if (dependencies.cypress) return TestFramework.CYPRESS;
      if (dependencies.playwright) return TestFramework.PLAYWRIGHT;
    }

    // Check for Python
    if (fs.existsSync(path.join(this.config.getTargetDir(), 'requirements.txt')) ||
        fs.existsSync(path.join(this.config.getTargetDir(), 'pyproject.toml'))) {
      return TestFramework.PYTEST;
    }

    // Default to Jest for JavaScript/TypeScript projects
    return TestFramework.JEST;
  }

  private getDefaultOutputDir(framework: TestFramework): string {
    const baseDir = this.config.getTargetDir();
    
    switch (framework) {
      case TestFramework.CYPRESS:
        return path.join(baseDir, 'cypress', 'e2e');
      case TestFramework.PLAYWRIGHT:
        return path.join(baseDir, 'tests');
      case TestFramework.PYTEST:
        return path.join(baseDir, 'tests');
      default:
        return path.join(baseDir, '__tests__');
    }
  }

  private async generateTests(sourcePath: string, params: TestGenerationToolParams, framework: TestFramework): Promise<string> {
    const sourceContent = fs.readFileSync(sourcePath, 'utf8');
    
    const analysis = this.analyzeSourceCode(sourceContent, sourcePath);
    
    switch (params.test_type) {
      case TestType.UNIT:
        return this.generateUnitTests(analysis, params, framework);
      case TestType.INTEGRATION:
        return this.generateIntegrationTests(analysis, params, framework);
      case TestType.E2E:
        return this.generateE2ETests(analysis, params, framework);
      case TestType.MOCK:
        return this.generateMockTests(analysis, params, framework);
      case TestType.SNAPSHOT:
        return this.generateSnapshotTests(analysis, params, framework);
      case TestType.PERFORMANCE:
        return this.generatePerformanceTests(analysis, params, framework);
      case TestType.SECURITY:
        return this.generateSecurityTests(analysis, params, framework);
      default:
        throw new Error(`Unsupported test type: ${params.test_type}`);
    }
  }

  private analyzeSourceCode(content: string, filePath: string): SourceAnalysis {
    const lines = content.split('\n');
    const analysis = {
      fileName: path.basename(filePath),
      functions: [] as FunctionInfo[],
      classes: [] as ClassInfo[],
      imports: [] as string[],
      exports: [] as string[],
      language: this.detectLanguage(filePath),
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Extract functions
      const functionMatch = line.match(/(?:function|const|let|var)\s+(\w+).*?\(/);
      if (functionMatch) {
        analysis.functions.push({
          name: functionMatch[1],
          line: i + 1,
          signature: line,
        });
      }

      // Extract classes
      const classMatch = line.match(/class\s+(\w+)/);
      if (classMatch) {
        analysis.classes.push({
          name: classMatch[1],
          line: i + 1,
        });
      }

      // Extract imports
      const importMatch = line.match(/import.*from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        analysis.imports.push(importMatch[1]);
      }

      // Extract exports
      if (line.includes('export')) {
        const exportMatch = line.match(/export.*?(\w+)/);
        if (exportMatch) {
          analysis.exports.push(exportMatch[1]);
        }
      }
    }

    return analysis;
  }

  private detectLanguage(filePath: string): string {
    const extension = path.extname(filePath);
    switch (extension) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
        return 'javascript';
      case '.py':
        return 'python';
      default:
        return 'javascript';
    }
  }

  private generateUnitTests(analysis: SourceAnalysis, params: TestGenerationToolParams, framework: TestFramework): string {
    const testLines: string[] = [];
    
    // Add imports
    testLines.push(...this.generateImports(analysis, framework));
    testLines.push('');

    // Add describe block
    const convention = params.naming_convention || 'describe';
    testLines.push(`${convention}('${analysis.fileName}', () => {`);

    // Generate tests for each function
    for (const func of analysis.functions) {
      testLines.push(`  ${convention}('${func.name}', () => {`);
      
      // Basic test
      testLines.push(`    it('should work correctly', () => {`);
      testLines.push(`      // TODO: Implement test for ${func.name}`);
      testLines.push(`      expect(${func.name}).toBeDefined();`);
      testLines.push(`    });`);

      // Edge cases
      if (params.include_edge_cases) {
        testLines.push('');
        testLines.push(`    it('should handle edge cases', () => {`);
        testLines.push(`      // TODO: Test edge cases for ${func.name}`);
        testLines.push(`      // Test with null, undefined, empty values`);
        testLines.push(`    });`);
      }

      // Error cases
      testLines.push('');
      testLines.push(`    it('should handle errors gracefully', () => {`);
      testLines.push(`      // TODO: Test error handling for ${func.name}`);
      testLines.push(`    });`);

      testLines.push(`  });`);
      testLines.push('');
    }

    testLines.push('});');

    return testLines.join('\n');
  }

  private generateIntegrationTests(analysis: SourceAnalysis, params: TestGenerationToolParams, framework: TestFramework): string {
    const testLines: string[] = [];
    
    testLines.push(...this.generateImports(analysis, framework));
    testLines.push('');

    testLines.push(`describe('${analysis.fileName} Integration Tests', () => {`);
    testLines.push(`  beforeEach(() => {`);
    testLines.push(`    // Setup integration test environment`);
    testLines.push(`  });`);
    testLines.push('');

    testLines.push(`  afterEach(() => {`);
    testLines.push(`    // Cleanup after integration tests`);
    testLines.push(`  });`);
    testLines.push('');

    testLines.push(`  it('should integrate with external dependencies', () => {`);
    testLines.push(`    // TODO: Test integration with external services/modules`);
    testLines.push(`  });`);
    testLines.push('');

    testLines.push(`  it('should handle data flow correctly', () => {`);
    testLines.push(`    // TODO: Test data flow through the system`);
    testLines.push(`  });`);

    testLines.push('});');

    return testLines.join('\n');
  }

  private generateE2ETests(analysis: SourceAnalysis, params: TestGenerationToolParams, framework: TestFramework): string {
    const testLines: string[] = [];

    if (framework === TestFramework.CYPRESS) {
      testLines.push(`describe('${analysis.fileName} E2E Tests', () => {`);
      testLines.push(`  beforeEach(() => {`);
      testLines.push(`    cy.visit('/');`);
      testLines.push(`  });`);
      testLines.push('');

      testLines.push(`  it('should complete user workflow', () => {`);
      testLines.push(`    // TODO: Implement end-to-end user workflow test`);
      testLines.push(`    cy.get('[data-testid="submit"]').click();`);
      testLines.push(`  });`);

      testLines.push('});');
    } else if (framework === TestFramework.PLAYWRIGHT) {
      testLines.push(`import { test, expect } from '@playwright/test';`);
      testLines.push('');

      testLines.push(`test.describe('${analysis.fileName} E2E Tests', () => {`);
      testLines.push(`  test('should complete user workflow', async ({ page }) => {`);
      testLines.push(`    await page.goto('/');`);
      testLines.push(`    // TODO: Implement end-to-end user workflow test`);
      testLines.push(`  });`);
      testLines.push('});');
    }

    return testLines.join('\n');
  }

  private generateMockTests(analysis: SourceAnalysis, params: TestGenerationToolParams, framework: TestFramework): string {
    const testLines: string[] = [];
    
    testLines.push(...this.generateImports(analysis, framework));
    
    if (framework === TestFramework.JEST || framework === TestFramework.VITEST) {
      testLines.push('');
      testLines.push('// Mock external dependencies');
      for (const importPath of analysis.imports) {
        testLines.push(`jest.mock('${importPath}');`);
      }
    }

    testLines.push('');
    testLines.push(`describe('${analysis.fileName} with Mocks', () => {`);
    testLines.push(`  beforeEach(() => {`);
    testLines.push(`    jest.clearAllMocks();`);
    testLines.push(`  });`);
    testLines.push('');

    for (const func of analysis.functions) {
      testLines.push(`  it('should mock dependencies for ${func.name}', () => {`);
      testLines.push(`    // TODO: Setup mocks for ${func.name} dependencies`);
      testLines.push(`    const mockFn = jest.fn().mockReturnValue('mocked result');`);
      testLines.push(`    // Test with mocked dependencies`);
      testLines.push(`  });`);
      testLines.push('');
    }

    testLines.push('});');

    return testLines.join('\n');
  }

  private generateSnapshotTests(analysis: SourceAnalysis, params: TestGenerationToolParams, framework: TestFramework): string {
    const testLines: string[] = [];
    
    testLines.push(...this.generateImports(analysis, framework));
    testLines.push('');

    testLines.push(`describe('${analysis.fileName} Snapshots', () => {`);
    
    for (const func of analysis.functions) {
      testLines.push(`  it('should match snapshot for ${func.name}', () => {`);
      testLines.push(`    const result = ${func.name}(/* test input */);`);
      testLines.push(`    expect(result).toMatchSnapshot();`);
      testLines.push(`  });`);
      testLines.push('');
    }

    testLines.push('});');

    return testLines.join('\n');
  }

  private generatePerformanceTests(analysis: SourceAnalysis, params: TestGenerationToolParams, framework: TestFramework): string {
    const testLines: string[] = [];
    
    testLines.push(...this.generateImports(analysis, framework));
    testLines.push('');

    testLines.push(`describe('${analysis.fileName} Performance Tests', () => {`);
    
    for (const func of analysis.functions) {
      testLines.push(`  it('should perform ${func.name} within acceptable time', () => {`);
      testLines.push(`    const start = performance.now();`);
      testLines.push(`    ${func.name}(/* large test input */);`);
      testLines.push(`    const end = performance.now();`);
      testLines.push(`    expect(end - start).toBeLessThan(1000); // 1 second`);
      testLines.push(`  });`);
      testLines.push('');
    }

    testLines.push('});');

    return testLines.join('\n');
  }

  private generateSecurityTests(analysis: SourceAnalysis, params: TestGenerationToolParams, framework: TestFramework): string {
    const testLines: string[] = [];
    
    testLines.push(...this.generateImports(analysis, framework));
    testLines.push('');

    testLines.push(`describe('${analysis.fileName} Security Tests', () => {`);
    
    testLines.push(`  it('should sanitize inputs', () => {`);
    testLines.push(`    // TODO: Test input sanitization`);
    testLines.push(`    const maliciousInput = '<script>alert("xss")</script>';`);
    testLines.push(`    // Test that malicious input is properly handled`);
    testLines.push(`  });`);
    testLines.push('');

    testLines.push(`  it('should validate authentication', () => {`);
    testLines.push(`    // TODO: Test authentication requirements`);
    testLines.push(`  });`);
    testLines.push('');

    testLines.push(`  it('should prevent injection attacks', () => {`);
    testLines.push(`    // TODO: Test SQL/NoSQL injection prevention`);
    testLines.push(`  });`);

    testLines.push('});');

    return testLines.join('\n');
  }

  private generateImports(analysis: SourceAnalysis, framework: TestFramework): string[] {
    const imports: string[] = [];

    switch (framework) {
      case TestFramework.JEST:
        imports.push(`import { jest } from '@jest/globals';`);
        break;
      case TestFramework.VITEST:
        imports.push(`import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';`);
        break;
      case TestFramework.MOCHA:
        imports.push(`import { describe, it, beforeEach, afterEach } from 'mocha';`);
        imports.push(`import { expect } from 'chai';`);
        break;
      case TestFramework.PYTEST:
        return [`import pytest`];
      default:
        // Default to Jest-like imports
        break;
    }

    // Import the module being tested
    const moduleName = analysis.fileName.replace(/\.[^/.]+$/, '');
    imports.push(`import { ${analysis.exports.join(', ')} } from './${moduleName}';`);

    return imports;
  }

  private async writeTestFile(sourcePath: string, testContent: string, outputDir: string, framework: TestFramework): Promise<string> {
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate test file name
    const sourceFileName = path.basename(sourcePath, path.extname(sourcePath));
    const extension = framework === TestFramework.PYTEST ? '.py' : 
                     sourcePath.endsWith('.ts') ? '.ts' : '.js';
    
    const testFileName = `${sourceFileName}.test${extension}`;
    const testFilePath = path.join(outputDir, testFileName);

    // Write test file
    fs.writeFileSync(testFilePath, testContent, 'utf8');

    return testFilePath;
  }

  private async generateTestConfig(framework: TestFramework, outputDir: string): Promise<string | null> {
    let configContent = '';
    let configFileName = '';

    switch (framework) {
      case TestFramework.JEST:
        configFileName = 'jest.config.js';
        configContent = `module.exports = {
  testEnvironment: 'node',
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: ['**/__tests__/**/*.test.js', '**/*.test.js'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
};`;
        break;

      case TestFramework.VITEST:
        configFileName = 'vitest.config.ts';
        configContent = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});`;
        break;

      case TestFramework.PLAYWRIGHT:
        configFileName = 'playwright.config.ts';
        configContent = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});`;
        break;

      default:
        return null;
    }

    const configPath = path.join(path.dirname(outputDir), configFileName);
    fs.writeFileSync(configPath, configContent, 'utf8');
    return configPath;
  }

  private async generateTestData(sourcePath: string, outputDir: string): Promise<string | null> {
    const testDataContent = `// Test data for ${path.basename(sourcePath)}
export const testData = {
  validInputs: [
    // TODO: Add valid test inputs
  ],
  invalidInputs: [
    // TODO: Add invalid test inputs
  ],
  edgeCases: [
    null,
    undefined,
    '',
    0,
    -1,
    Infinity,
    NaN,
  ],
  mockResponses: {
    // TODO: Add mock API responses
  },
};

export const fixtures = {
  // TODO: Add test fixtures
};`;

    const dataFileName = 'testData.js';
    const dataFilePath = path.join(outputDir, dataFileName);
    fs.writeFileSync(dataFilePath, testDataContent, 'utf8');
    return dataFilePath;
  }

  private formatResult(testFilePath: string, additionalFiles: string[], params: TestGenerationToolParams): ToolResult {
    const relativePath = path.relative(this.config.getTargetDir(), testFilePath);
    const additionalPaths = additionalFiles.map(file => path.relative(this.config.getTargetDir(), file));

    const resultLines = [
      `## Test Generation Complete`,
      '',
      `**Test Type:** ${params.test_type}`,
      `**Framework:** ${params.framework || 'auto-detected'}`,
      `**Generated Test File:** ${relativePath}`,
    ];

    if (additionalPaths.length > 0) {
      resultLines.push(`**Additional Files:**`);
      additionalPaths.forEach(filePath => {
        resultLines.push(`  - ${filePath}`);
      });
    }

    resultLines.push('');
    resultLines.push('## Next Steps');
    resultLines.push('1. Review the generated test file and implement the TODO items');
    resultLines.push('2. Add specific test cases for your use cases');
    resultLines.push('3. Run the tests to ensure they pass');
    
    if (params.coverage_target) {
      resultLines.push(`4. Verify test coverage meets the target of ${params.coverage_target}%`);
    }

    const result = resultLines.join('\n');

    return {
      llmContent: result,
      returnDisplay: result,
    };
  }
}