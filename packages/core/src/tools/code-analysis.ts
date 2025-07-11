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
 * Code analysis types
 */
export enum AnalysisType {
  COMPLEXITY = 'complexity',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  MAINTAINABILITY = 'maintainability',
  DEPENDENCIES = 'dependencies',
  CODE_SMELLS = 'code_smells',
  METRICS = 'metrics',
  DUPLICATES = 'duplicates',
  DOCUMENTATION = 'documentation',
  TYPES = 'types',
}

/**
 * Language types for analysis
 */
export enum LanguageType {
  TYPESCRIPT = 'typescript',
  JAVASCRIPT = 'javascript',
  PYTHON = 'python',
  JAVA = 'java',
  CPP = 'cpp',
  CSHARP = 'csharp',
  GO = 'go',
  RUST = 'rust',
  AUTO = 'auto',
}

/**
 * Parameters for the CodeAnalysis tool
 */
export interface CodeAnalysisToolParams {
  /**
   * Type of analysis to perform
   */
  analysis_type: AnalysisType;

  /**
   * File or directory path to analyze
   */
  target_path?: string;

  /**
   * Programming language (auto-detected if not specified)
   */
  language?: LanguageType;

  /**
   * Include subdirectories in analysis
   */
  recursive?: boolean;

  /**
   * File patterns to include (glob patterns)
   */
  include_patterns?: string[];

  /**
   * File patterns to exclude (glob patterns)
   */
  exclude_patterns?: string[];

  /**
   * Minimum threshold for reporting issues
   */
  threshold?: 'low' | 'medium' | 'high';

  /**
   * Maximum number of results to return
   */
  max_results?: number;

  /**
   * Include detailed explanations
   */
  detailed?: boolean;
}

/**
 * Code analysis result
 */
export interface CodeAnalysisResult {
  file_path: string;
  line_number?: number;
  column_number?: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: string;
  message: string;
  suggestion?: string;
  code_snippet?: string;
  metrics?: Record<string, number>;
}

/**
 * Code Analysis Tool - Deep code analysis and quality assessment
 */
export class CodeAnalysisTool extends BaseTool<CodeAnalysisToolParams, ToolResult> {
  private readonly config: Config;
  static readonly Name = 'code_analysis';

  constructor(config: Config) {
    super(
      CodeAnalysisTool.Name,
      'Code Analysis',
      'Performs deep code analysis including complexity analysis, security scanning, performance assessment, and code quality metrics. Detects code smells, duplicates, and provides maintainability insights.',
      {
        properties: {
          analysis_type: {
            type: Type.STRING,
            description: 'Type of analysis to perform',
            enum: Object.values(AnalysisType),
          },
          target_path: {
            type: Type.STRING,
            description: 'File or directory path to analyze (defaults to current directory)',
          },
          language: {
            type: Type.STRING,
            description: 'Programming language (auto-detected if not specified)',
            enum: Object.values(LanguageType),
          },
          recursive: {
            type: Type.BOOLEAN,
            description: 'Include subdirectories in analysis',
          },
          include_patterns: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'File patterns to include (glob patterns)',
          },
          exclude_patterns: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'File patterns to exclude (glob patterns)',
          },
          threshold: {
            type: Type.STRING,
            description: 'Minimum threshold for reporting issues',
            enum: ['low', 'medium', 'high'],
          },
          max_results: {
            type: Type.NUMBER,
            description: 'Maximum number of results to return',
          },
          detailed: {
            type: Type.BOOLEAN,
            description: 'Include detailed explanations and suggestions',
          },
        },
        required: ['analysis_type'],
        type: Type.OBJECT,
      }
    );
    this.config = config;
  }

  validateToolParams(params: CodeAnalysisToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    // Validate target path if provided
    if (params.target_path) {
      const targetPath = path.isAbsolute(params.target_path) 
        ? params.target_path 
        : path.join(this.config.getTargetDir(), params.target_path);

      if (!fs.existsSync(targetPath)) {
        return `Target path does not exist: ${params.target_path}`;
      }
    }

    // Validate max_results
    if (params.max_results && params.max_results < 1) {
      return 'max_results must be greater than 0';
    }

    return null;
  }

  getDescription(params: CodeAnalysisToolParams): string {
    const analysisType = params.analysis_type;
    const targetPath = params.target_path || 'current directory';
    const language = params.language || 'auto-detected';

    return `Perform ${analysisType} analysis on ${targetPath} (${language})`;
  }

  async execute(params: CodeAnalysisToolParams): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    try {
      const targetPath = params.target_path 
        ? (path.isAbsolute(params.target_path) 
          ? params.target_path 
          : path.join(this.config.getTargetDir(), params.target_path))
        : this.config.getTargetDir();

      const results = await this.performAnalysis(targetPath, params);
      
      return this.formatResults(results, params);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Code analysis failed: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }

  private async performAnalysis(targetPath: string, params: CodeAnalysisToolParams): Promise<CodeAnalysisResult[]> {
    const results: CodeAnalysisResult[] = [];
    
    // Get files to analyze
    const files = await this.getFilesToAnalyze(targetPath, params);
    
    for (const filePath of files) {
      const fileResults = await this.analyzeFile(filePath, params);
      results.push(...fileResults);
    }

    // Sort by severity and limit results
    const sortedResults = this.sortResultsBySeverity(results);
    const maxResults = params.max_results || 50;
    
    return sortedResults.slice(0, maxResults);
  }

  private async getFilesToAnalyze(targetPath: string, params: CodeAnalysisToolParams): Promise<string[]> {
    const files: string[] = [];
    
    if (fs.statSync(targetPath).isFile()) {
      return [targetPath];
    }

    const entries = fs.readdirSync(targetPath);
    
    for (const entry of entries) {
      const fullPath = path.join(targetPath, entry);
      const stat = fs.statSync(fullPath);
      
      if (stat.isFile()) {
        if (this.shouldAnalyzeFile(fullPath, params)) {
          files.push(fullPath);
        }
      } else if (stat.isDirectory() && params.recursive !== false) {
        const subFiles = await this.getFilesToAnalyze(fullPath, params);
        files.push(...subFiles);
      }
    }

    return files;
  }

  private shouldAnalyzeFile(filePath: string, params: CodeAnalysisToolParams): boolean {
    const fileName = path.basename(filePath);
    const extension = path.extname(filePath);

    // Check exclude patterns
    if (params.exclude_patterns) {
      for (const pattern of params.exclude_patterns) {
        if (fileName.includes(pattern) || filePath.includes(pattern)) {
          return false;
        }
      }
    }

    // Check include patterns
    if (params.include_patterns) {
      for (const pattern of params.include_patterns) {
        if (fileName.includes(pattern) || filePath.includes(pattern)) {
          return true;
        }
      }
      return false;
    }

    // Default: analyze common code file extensions
    const codeExtensions = ['.ts', '.js', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs', '.jsx', '.tsx'];
    return codeExtensions.includes(extension);
  }

  private async analyzeFile(filePath: string, params: CodeAnalysisToolParams): Promise<CodeAnalysisResult[]> {
    const content = fs.readFileSync(filePath, 'utf8');
    const language = params.language || this.detectLanguage(filePath);
    const results: CodeAnalysisResult[] = [];

    switch (params.analysis_type) {
      case AnalysisType.COMPLEXITY:
        results.push(...this.analyzeComplexity(filePath, content, language));
        break;
      case AnalysisType.SECURITY:
        results.push(...this.analyzeSecurity(filePath, content, language));
        break;
      case AnalysisType.PERFORMANCE:
        results.push(...this.analyzePerformance(filePath, content, language));
        break;
      case AnalysisType.MAINTAINABILITY:
        results.push(...this.analyzeMaintainability(filePath, content, language));
        break;
      case AnalysisType.DEPENDENCIES:
        results.push(...this.analyzeDependencies(filePath, content, language));
        break;
      case AnalysisType.CODE_SMELLS:
        results.push(...this.analyzeCodeSmells(filePath, content, language));
        break;
      case AnalysisType.METRICS:
        results.push(...this.analyzeMetrics(filePath, content, language));
        break;
      case AnalysisType.DUPLICATES:
        results.push(...this.analyzeDuplicates(filePath, content, language));
        break;
      case AnalysisType.DOCUMENTATION:
        results.push(...this.analyzeDocumentation(filePath, content, language));
        break;
      case AnalysisType.TYPES:
        results.push(...this.analyzeTypes(filePath, content, language));
        break;
      default:
        throw new Error(`Unsupported analysis type: ${params.analysis_type}`);
    }

    return results;
  }

  private detectLanguage(filePath: string): LanguageType {
    const extension = path.extname(filePath).toLowerCase();
    
    switch (extension) {
      case '.ts':
      case '.tsx':
        return LanguageType.TYPESCRIPT;
      case '.js':
      case '.jsx':
        return LanguageType.JAVASCRIPT;
      case '.py':
        return LanguageType.PYTHON;
      case '.java':
        return LanguageType.JAVA;
      case '.cpp':
      case '.cc':
      case '.cxx':
        return LanguageType.CPP;
      case '.cs':
        return LanguageType.CSHARP;
      case '.go':
        return LanguageType.GO;
      case '.rs':
        return LanguageType.RUST;
      default:
        return LanguageType.AUTO;
    }
  }

  private analyzeComplexity(filePath: string, content: string, _language: LanguageType): CodeAnalysisResult[] {
    const results: CodeAnalysisResult[] = [];
    const lines = content.split('\n');
    
    // Simple cyclomatic complexity analysis
    let complexityScore = 1; // Base complexity
    let functionComplexity = 0;
    let currentFunction = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Count complexity-adding keywords
      const complexityPatterns = [
        /\bif\b/, /\belse\b/, /\bfor\b/, /\bwhile\b/, /\bdo\b/,
        /\bcase\b/, /\bcatch\b/, /\btry\b/, /\b\?\s*:/, /\b&&\b/, /\b\|\|\b/
      ];
      
      for (const pattern of complexityPatterns) {
        if (pattern.test(line)) {
          complexityScore++;
          functionComplexity++;
        }
      }
      
      // Check for function definitions
      if (this.isFunctionDefinition(line, _language)) {
        if (currentFunction && functionComplexity > 10) {
          results.push({
            file_path: filePath,
            line_number: i + 1,
            severity: functionComplexity > 20 ? 'error' : 'warning',
            category: 'complexity',
            message: `Function has high cyclomatic complexity: ${functionComplexity}`,
            suggestion: 'Consider breaking this function into smaller, more focused functions',
            code_snippet: line,
            metrics: { complexity: functionComplexity },
          });
        }
        currentFunction = line;
        functionComplexity = 1;
      }
    }
    
    // Overall file complexity
    if (complexityScore > 50) {
      results.push({
        file_path: filePath,
        severity: complexityScore > 100 ? 'error' : 'warning',
        category: 'complexity',
        message: `File has high overall complexity: ${complexityScore}`,
        suggestion: 'Consider refactoring this file into smaller modules',
        metrics: { total_complexity: complexityScore },
      });
    }
    
    return results;
  }

  private analyzeSecurity(filePath: string, content: string, _language: LanguageType): CodeAnalysisResult[] {
    const results: CodeAnalysisResult[] = [];
    const lines = content.split('\n');
    
    // Security vulnerability patterns
    const securityPatterns = [
      {
        pattern: /eval\s*\(/,
        message: 'Use of eval() can lead to code injection vulnerabilities',
        severity: 'error' as const,
      },
      {
        pattern: /innerHTML\s*=/,
        message: 'Direct innerHTML assignment can lead to XSS vulnerabilities',
        severity: 'warning' as const,
      },
      {
        pattern: /document\.write\s*\(/,
        message: 'Use of document.write() can be dangerous',
        severity: 'warning' as const,
      },
      {
        pattern: /password\s*=\s*['"]/,
        message: 'Hardcoded password detected',
        severity: 'critical' as const,
      },
      {
        pattern: /api[_-]?key\s*=\s*['"]/,
        message: 'Hardcoded API key detected',
        severity: 'critical' as const,
      },
      {
        pattern: /localStorage\.|sessionStorage\./,
        message: 'Storage of sensitive data in local/session storage',
        severity: 'info' as const,
      },
    ];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const { pattern, message, severity } of securityPatterns) {
        if (pattern.test(line)) {
          results.push({
            file_path: filePath,
            line_number: i + 1,
            severity,
            category: 'security',
            message,
            suggestion: 'Review this code for security implications',
            code_snippet: line.trim(),
          });
        }
      }
    }
    
    return results;
  }

  private analyzePerformance(filePath: string, content: string, _language: LanguageType): CodeAnalysisResult[] {
    const results: CodeAnalysisResult[] = [];
    const lines = content.split('\n');
    
    // Performance issue patterns
    const performancePatterns = [
      {
        pattern: /for\s*\(.*\.length.*\)/,
        message: 'Loop condition evaluates length in each iteration',
        severity: 'warning' as const,
        suggestion: 'Cache the length value before the loop',
      },
      {
        pattern: /console\.log\s*\(/,
        message: 'Console.log statement found (may impact performance in production)',
        severity: 'info' as const,
        suggestion: 'Remove console.log statements from production code',
      },
      {
        pattern: /setTimeout\s*\(\s*.*\s*,\s*0\s*\)/,
        message: 'setTimeout with 0 delay - consider using requestAnimationFrame',
        severity: 'info' as const,
        suggestion: 'Use requestAnimationFrame for DOM updates',
      },
    ];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const { pattern, message, severity, suggestion } of performancePatterns) {
        if (pattern.test(line)) {
          results.push({
            file_path: filePath,
            line_number: i + 1,
            severity,
            category: 'performance',
            message,
            suggestion,
            code_snippet: line.trim(),
          });
        }
      }
    }
    
    return results;
  }

  private analyzeMaintainability(filePath: string, content: string, _language: LanguageType): CodeAnalysisResult[] {
    const results: CodeAnalysisResult[] = [];
    const lines = content.split('\n');
    
    // Check for long functions
    let functionStart = -1;
    let braceCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (this.isFunctionDefinition(line, _language)) {
        functionStart = i;
        braceCount = 0;
      }
      
      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;
      
      if (functionStart !== -1 && braceCount === 0) {
        const functionLength = i - functionStart + 1;
        if (functionLength > 50) {
          results.push({
            file_path: filePath,
            line_number: functionStart + 1,
            severity: functionLength > 100 ? 'error' : 'warning',
            category: 'maintainability',
            message: `Function is too long: ${functionLength} lines`,
            suggestion: 'Break this function into smaller, more focused functions',
            metrics: { function_length: functionLength },
          });
        }
        functionStart = -1;
      }
    }
    
    // Check for deeply nested code
    let maxIndentation = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const indentation = line.length - line.trimStart().length;
      
      if (indentation > maxIndentation) {
        maxIndentation = indentation;
      }
      
      if (indentation > 32) { // More than 8 levels of nesting (assuming 4 spaces per level)
        results.push({
          file_path: filePath,
          line_number: i + 1,
          severity: 'warning',
          category: 'maintainability',
          message: 'Deeply nested code detected',
          suggestion: 'Consider extracting nested logic into separate functions',
          code_snippet: line.trim(),
        });
      }
    }
    
    return results;
  }

  private analyzeDependencies(filePath: string, content: string, _language: LanguageType): CodeAnalysisResult[] {
    const results: CodeAnalysisResult[] = [];
    const lines = content.split('\n');
    
    // Analyze imports/requires
    const imports = new Set<string>();
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // TypeScript/JavaScript imports
      const importMatch = line.match(/import.*from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        imports.add(importMatch[1]);
      }
      
      // CommonJS requires
      const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (requireMatch) {
        imports.add(requireMatch[1]);
      }
    }
    
    if (imports.size > 20) {
      results.push({
        file_path: filePath,
        severity: 'warning',
        category: 'dependencies',
        message: `High number of dependencies: ${imports.size}`,
        suggestion: 'Consider reducing dependencies or splitting the module',
        metrics: { dependency_count: imports.size },
      });
    }
    
    return results;
  }

  private analyzeCodeSmells(filePath: string, content: string, _language: LanguageType): CodeAnalysisResult[] {
    const results: CodeAnalysisResult[] = [];
    const lines = content.split('\n');
    
    // Various code smell patterns
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Long parameter lists
      const paramMatch = line.match(/\([^)]*,.*,.*,.*,.*,.*\)/);
      if (paramMatch) {
        results.push({
          file_path: filePath,
          line_number: i + 1,
          severity: 'warning',
          category: 'code_smell',
          message: 'Long parameter list detected',
          suggestion: 'Consider using an object parameter or builder pattern',
          code_snippet: line,
        });
      }
      
      // Magic numbers
      const magicNumberMatch = line.match(/\b(?!0|1|2|10|100|1000)\d{3,}\b/);
      if (magicNumberMatch) {
        results.push({
          file_path: filePath,
          line_number: i + 1,
          severity: 'info',
          category: 'code_smell',
          message: 'Magic number detected',
          suggestion: 'Consider using a named constant',
          code_snippet: line,
        });
      }
      
      // TODO/FIXME comments
      if (line.includes('TODO') || line.includes('FIXME')) {
        results.push({
          file_path: filePath,
          line_number: i + 1,
          severity: 'info',
          category: 'code_smell',
          message: 'TODO/FIXME comment found',
          suggestion: 'Address this technical debt',
          code_snippet: line,
        });
      }
    }
    
    return results;
  }

  private analyzeMetrics(filePath: string, content: string, _language: LanguageType): CodeAnalysisResult[] {
    const lines = content.split('\n');
    const metrics = {
      lines_of_code: lines.length,
      blank_lines: lines.filter(line => line.trim() === '').length,
      comment_lines: lines.filter(line => line.trim().startsWith('//') || line.trim().startsWith('/*')).length,
      function_count: 0,
      class_count: 0,
    };
    
    for (const line of lines) {
      if (this.isFunctionDefinition(line, _language)) {
        metrics.function_count++;
      }
      if (this.isClassDefinition(line, _language)) {
        metrics.class_count++;
      }
    }
    
    return [{
      file_path: filePath,
      severity: 'info',
      category: 'metrics',
      message: 'Code metrics analysis',
      metrics,
    }];
  }

  private analyzeDuplicates(filePath: string, content: string, _language: LanguageType): CodeAnalysisResult[] {
    const results: CodeAnalysisResult[] = [];
    const lines = content.split('\n');
    const lineMap = new Map<string, number[]>();
    
    // Find duplicate lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length > 20) { // Only check meaningful lines
        if (!lineMap.has(line)) {
          lineMap.set(line, []);
        }
        lineMap.get(line)!.push(i + 1);
      }
    }
    
    // Report duplicates
    for (const [line, lineNumbers] of lineMap) {
      if (lineNumbers.length > 1) {
        results.push({
          file_path: filePath,
          line_number: lineNumbers[0],
          severity: 'info',
          category: 'duplicates',
          message: `Duplicate line found in ${lineNumbers.length} locations`,
          suggestion: 'Consider extracting common code into a function',
          code_snippet: line,
        });
      }
    }
    
    return results;
  }

  private analyzeDocumentation(filePath: string, content: string, _language: LanguageType): CodeAnalysisResult[] {
    const results: CodeAnalysisResult[] = [];
    const lines = content.split('\n');
    
    let publicFunctions = 0;
    let documentedFunctions = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (this.isFunctionDefinition(line, _language)) {
        publicFunctions++;
        
        // Check if previous lines contain documentation
        let hasDocumentation = false;
        for (let j = i - 1; j >= 0; j--) {
          const prevLine = lines[j].trim();
          if (prevLine.startsWith('/**') || prevLine.startsWith('//')) {
            hasDocumentation = true;
            break;
          }
          if (prevLine !== '' && !prevLine.startsWith('*')) {
            break;
          }
        }
        
        if (hasDocumentation) {
          documentedFunctions++;
        } else {
          results.push({
            file_path: filePath,
            line_number: i + 1,
            severity: 'warning',
            category: 'documentation',
            message: 'Public function lacks documentation',
            suggestion: 'Add JSDoc or similar documentation',
            code_snippet: line,
          });
        }
      }
    }
    
    const documentationRatio = publicFunctions > 0 ? documentedFunctions / publicFunctions : 1;
    if (documentationRatio < 0.5) {
      results.push({
        file_path: filePath,
        severity: 'warning',
        category: 'documentation',
        message: `Low documentation coverage: ${Math.round(documentationRatio * 100)}%`,
        suggestion: 'Improve documentation coverage',
        metrics: { documentation_ratio: documentationRatio },
      });
    }
    
    return results;
  }

  private analyzeTypes(filePath: string, content: string, _language: LanguageType): CodeAnalysisResult[] {
    const results: CodeAnalysisResult[] = [];
    
    if (_language !== LanguageType.TYPESCRIPT) {
      return results;
    }
    
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check for 'any' type usage
      if (line.includes(': any') || line.includes('<any>')) {
        results.push({
          file_path: filePath,
          line_number: i + 1,
          severity: 'warning',
          category: 'types',
          message: 'Use of "any" type detected',
          suggestion: 'Consider using more specific types',
          code_snippet: line,
        });
      }
      
      // Check for untyped function parameters
      const functionMatch = line.match(/function\s+\w+\s*\(([^)]*)\)/);
      if (functionMatch) {
        const params = functionMatch[1];
        if (params && !params.includes(':')) {
          results.push({
            file_path: filePath,
            line_number: i + 1,
            severity: 'info',
            category: 'types',
            message: 'Untyped function parameters',
            suggestion: 'Add type annotations to function parameters',
            code_snippet: line,
          });
        }
      }
    }
    
    return results;
  }

  private isFunctionDefinition(line: string, _language: LanguageType): boolean {
    const patterns = [
      /function\s+\w+/,
      /\w+\s*\(/,
      /=>\s*{/,
      /def\s+\w+/,
      /public\s+\w+.*\(/,
      /private\s+\w+.*\(/,
    ];
    
    return patterns.some(pattern => pattern.test(line));
  }

  private isClassDefinition(line: string, _language: LanguageType): boolean {
    const patterns = [
      /class\s+\w+/,
      /interface\s+\w+/,
      /enum\s+\w+/,
    ];
    
    return patterns.some(pattern => pattern.test(line));
  }

  private sortResultsBySeverity(results: CodeAnalysisResult[]): CodeAnalysisResult[] {
    const severityOrder = { critical: 0, error: 1, warning: 2, info: 3 };
    
    return results.sort((a, b) => {
      const aOrder = severityOrder[a.severity];
      const bOrder = severityOrder[b.severity];
      
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      
      return a.file_path.localeCompare(b.file_path);
    });
  }

  private formatResults(results: CodeAnalysisResult[], params: CodeAnalysisToolParams): ToolResult {
    if (results.length === 0) {
      return {
        llmContent: 'No issues found in the code analysis.',
        returnDisplay: 'No issues found in the code analysis.',
      };
    }

    const summary = this.generateSummary(results);
    const detailed = params.detailed ? this.generateDetailedReport(results) : this.generateBasicReport(results);
    
    const fullReport = `${summary}\n\n${detailed}`;
    
    return {
      llmContent: fullReport,
      returnDisplay: fullReport,
    };
  }

  private generateSummary(results: CodeAnalysisResult[]): string {
    const severityCounts = results.reduce((acc, result) => {
      acc[result.severity] = (acc[result.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const summaryLines = [
      `## Code Analysis Summary`,
      `Total issues found: ${results.length}`,
      ``,
    ];

    if (severityCounts.critical) summaryLines.push(`Critical: ${severityCounts.critical}`);
    if (severityCounts.error) summaryLines.push(`Errors: ${severityCounts.error}`);
    if (severityCounts.warning) summaryLines.push(`Warnings: ${severityCounts.warning}`);
    if (severityCounts.info) summaryLines.push(`Info: ${severityCounts.info}`);

    return summaryLines.join('\n');
  }

  private generateBasicReport(results: CodeAnalysisResult[]): string {
    const reportLines = ['## Issues Found', ''];
    
    for (const result of results) {
      const severity = result.severity.toUpperCase();
      const location = result.line_number ? `${result.file_path}:${result.line_number}` : result.file_path;
      
      reportLines.push(`**${severity}** - ${location}`);
      reportLines.push(`${result.message}`);
      if (result.suggestion) {
        reportLines.push(`*Suggestion: ${result.suggestion}*`);
      }
      reportLines.push('');
    }
    
    return reportLines.join('\n');
  }

  private generateDetailedReport(results: CodeAnalysisResult[]): string {
    const reportLines = ['## Detailed Analysis Report', ''];
    
    for (const result of results) {
      const severity = result.severity.toUpperCase();
      const location = result.line_number ? `${result.file_path}:${result.line_number}` : result.file_path;
      
      reportLines.push(`### ${severity} - ${result.category}`);
      reportLines.push(`**Location:** ${location}`);
      reportLines.push(`**Message:** ${result.message}`);
      
      if (result.suggestion) {
        reportLines.push(`**Suggestion:** ${result.suggestion}`);
      }
      
      if (result.code_snippet) {
        reportLines.push(`**Code:**`);
        reportLines.push('```');
        reportLines.push(result.code_snippet);
        reportLines.push('```');
      }
      
      if (result.metrics) {
        reportLines.push(`**Metrics:** ${JSON.stringify(result.metrics)}`);
      }
      
      reportLines.push('---');
      reportLines.push('');
    }
    
    return reportLines.join('\n');
  }
}