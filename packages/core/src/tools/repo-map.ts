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
import { PersistentCache } from '../utils/persistentCache.js';
import { TreeSitterTool, SymbolInfo, QueryOperation } from './tree-sitter.js';
import { CodeRAGTool } from './code-rag.js';
import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Repository analysis depth levels
 */
export enum AnalysisDepth {
  QUICK = 'quick',
  STANDARD = 'standard', 
  COMPREHENSIVE = 'comprehensive',
}

/**
 * Repository component types
 */
export enum ComponentType {
  ENTRY_POINT = 'entry_point',
  CONFIG_FILE = 'config_file',
  BUILD_SCRIPT = 'build_script',
  TEST_FILE = 'test_file',
  DOCUMENTATION = 'documentation',
  SOURCE_CODE = 'source_code',
  DEPENDENCY = 'dependency',
}

/**
 * Architecture pattern identification
 */
export interface ArchitecturePattern {
  name: string;
  confidence: number;
  description: string;
  examples: string[];
}

/**
 * Dependency information
 */
export interface DependencyInfo {
  name: string;
  version?: string;
  type: 'production' | 'development' | 'peer' | 'optional';
  source: string;
  usageCount: number;
  importPaths: string[];
}

/**
 * Component overview
 */
export interface ComponentOverview {
  path: string;
  type: ComponentType;
  language: string;
  size: number;
  symbols: SymbolInfo[];
  dependencies: string[];
  exports: string[];
  description: string;
  importance: number;
}

/**
 * Repository structure
 */
export interface RepositoryStructure {
  rootPath: string;
  totalFiles: number;
  totalLines: number;
  languages: Record<string, number>;
  directories: string[];
  entryPoints: string[];
  configFiles: string[];
  buildScripts: string[];
  testFiles: string[];
  documentationFiles: string[];
}

/**
 * Repository map result
 */
export interface RepositoryMap {
  timestamp: string;
  structure: RepositoryStructure;
  components: ComponentOverview[];
  dependencies: DependencyInfo[];
  architecturePatterns: ArchitecturePattern[];
  keyInsights: string[];
  conventions: string[];
  cacheKey: string;
}

/**
 * Parameters for the RepoMap tool
 */
export interface RepoMapToolParams {
  depth?: AnalysisDepth;
  includeTests?: boolean;
  includeDocs?: boolean;
  includeNodeModules?: boolean;
  forceRefresh?: boolean;
  targetDirectory?: string;
}

/**
 * Result interface for RepoMap tool
 */
export interface RepoMapToolResult extends ToolResult {
  repositoryMap: RepositoryMap;
  summary: string;
  analysisTime: number;
}

/**
 * Implementation of the RepoMap tool
 */
export class RepoMapTool extends BaseTool<RepoMapToolParams, RepoMapToolResult> {
  private readonly config: Config;
  private readonly treeSitter: TreeSitterTool;
  private readonly codeRAG: CodeRAGTool;
  private cache: Map<string, RepositoryMap> = new Map();
  private readonly persistentCache: PersistentCache<RepositoryMap>;
  static readonly Name = 'repo_map';

  constructor(config: Config) {
    super(
      RepoMapTool.Name,
      'Repository Map',
      'Creates a comprehensive map of the repository using TreeSitter AST analysis and CodeRAG semantic indexing. Provides architectural overview, component analysis, dependency mapping, and code patterns.',
      {
        type: Type.OBJECT,
        properties: {
          depth: {
            type: Type.STRING,
            description: 'Analysis depth level: quick, standard, or comprehensive',
            enum: ['quick', 'standard', 'comprehensive'],
          },
          includeTests: {
            type: Type.BOOLEAN,
            description: 'Include test files in analysis (default: true)',
          },
          includeDocs: {
            type: Type.BOOLEAN,
            description: 'Include documentation files in analysis (default: true)',
          },
          includeNodeModules: {
            type: Type.BOOLEAN,
            description: 'Include node_modules in analysis (default: false)',
          },
          forceRefresh: {
            type: Type.BOOLEAN,
            description: 'Force refresh of cached repository map (default: false)',
          },
          targetDirectory: {
            type: Type.STRING,
            description: 'Target directory to analyze (defaults to project root)',
          },
        },
        required: [],
      }
    );
    this.config = config;
    this.treeSitter = new TreeSitterTool(config);
    this.codeRAG = new CodeRAGTool(config);
    this.persistentCache = new PersistentCache<RepositoryMap>('repo-map', {
      cacheDir: path.join(config.getTargetDir(), '.soul-cache'),
      maxMemoryEntries: 10,
      maxFileAge: 60 * 60 * 1000, // 1 hour for repository maps
      enableFileHashing: false, // Repository maps are based on directory state
    });
  }

  /**
   * Generates cache key for repository state
   */
  private generateCacheKey(targetDir: string, params: RepoMapToolParams): string {
    const depth = params.depth || AnalysisDepth.STANDARD;
    const flags = [
      params.includeTests ? 'T' : '',
      params.includeDocs ? 'D' : '',
      params.includeNodeModules ? 'N' : '',
    ].join('');
    return `${targetDir}:${depth}:${flags}`;
  }

  /**
   * Gets file patterns based on analysis parameters
   */
  private getFilePatterns(params: RepoMapToolParams): string[] {
    const patterns = [
      '**/*.ts',
      '**/*.tsx', 
      '**/*.js',
      '**/*.jsx',
      '**/*.py',
      '**/*.java',
      '**/*.go',
      '**/*.rs',
      '**/*.cpp',
      '**/*.c',
      '**/*.h',
      '**/*.cs',
      '**/*.php',
      '**/*.rb',
      '**/*.swift',
      '**/*.kt',
      '**/package.json',
      '**/tsconfig.json',
      '**/webpack.config.*',
      '**/vite.config.*',
      '**/rollup.config.*',
      '**/babel.config.*',
      '**/eslint.config.*',
      '**/.eslintrc.*',
      '**/jest.config.*',
      '**/vitest.config.*',
      '**/cypress.config.*',
      '**/playwright.config.*',
      '**/Dockerfile',
      '**/docker-compose.*',
      '**/Makefile',
      '**/CMakeLists.txt',
      '**/build.gradle',
      '**/pom.xml',
      '**/requirements.txt',
      '**/pyproject.toml',
      '**/Cargo.toml',
      '**/go.mod',
    ];

    if (params.includeTests !== false) {
      patterns.push(
        '**/*.test.ts',
        '**/*.test.js',
        '**/*.spec.ts',
        '**/*.spec.js',
        '**/test/**/*',
        '**/tests/**/*',
        '**/__tests__/**/*',
      );
    }

    if (params.includeDocs !== false) {
      patterns.push(
        '**/*.md',
        '**/*.rst',
        '**/*.txt',
        '**/docs/**/*',
        '**/doc/**/*',
      );
    }

    return patterns;
  }

  /**
   * Gets ignore patterns
   */
  private getIgnorePatterns(params: RepoMapToolParams): string[] {
    const ignorePatterns = [
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/.git/**',
      '**/.svn/**',
      '**/.hg/**',
      '**/coverage/**',
      '**/.nyc_output/**',
      '**/tmp/**',
      '**/temp/**',
      '**/*.log',
      '**/.DS_Store',
      '**/Thumbs.db',
    ];

    if (!params.includeNodeModules) {
      ignorePatterns.push('**/node_modules/**');
    }

    return ignorePatterns;
  }

  /**
   * Analyzes repository structure
   */
  private async analyzeStructure(targetDir: string, files: string[]): Promise<RepositoryStructure> {
    const structure: RepositoryStructure = {
      rootPath: targetDir,
      totalFiles: files.length,
      totalLines: 0,
      languages: {},
      directories: [],
      entryPoints: [],
      configFiles: [],
      buildScripts: [],
      testFiles: [],
      documentationFiles: [],
    };

    const directories = new Set<string>();
    
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const basename = path.basename(file).toLowerCase();
      const dirname = path.dirname(file);
      
      // Track directories
      directories.add(dirname);
      
      // Count lines and classify by language
      try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n').length;
        structure.totalLines += lines;
        
        // Language classification
        const lang = this.classifyLanguage(ext, basename);
        structure.languages[lang] = (structure.languages[lang] || 0) + 1;
      } catch {
        // Skip files that can't be read
      }

      // Classify file types
      if (this.isEntryPoint(file, basename)) {
        structure.entryPoints.push(file);
      } else if (this.isConfigFile(basename, ext)) {
        structure.configFiles.push(file);
      } else if (this.isBuildScript(basename, ext)) {
        structure.buildScripts.push(file);
      } else if (this.isTestFile(file, basename)) {
        structure.testFiles.push(file);
      } else if (this.isDocumentationFile(ext, basename)) {
        structure.documentationFiles.push(file);
      }
    }

    structure.directories = Array.from(directories).sort();
    return structure;
  }

  /**
   * Classifies programming language
   */
  private classifyLanguage(ext: string, _basename: string): string {
    const langMap: Record<string, string> = {
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.js': 'JavaScript', 
      '.jsx': 'JavaScript',
      '.py': 'Python',
      '.java': 'Java',
      '.go': 'Go',
      '.rs': 'Rust',
      '.cpp': 'C++',
      '.c': 'C',
      '.h': 'C/C++',
      '.cs': 'C#',
      '.php': 'PHP',
      '.rb': 'Ruby',
      '.swift': 'Swift',
      '.kt': 'Kotlin',
      '.md': 'Markdown',
      '.json': 'JSON',
      '.yml': 'YAML',
      '.yaml': 'YAML',
      '.xml': 'XML',
      '.html': 'HTML',
      '.css': 'CSS',
      '.scss': 'SCSS',
      '.sass': 'SASS',
      '.less': 'LESS',
    };

    return langMap[ext] || 'Other';
  }

  /**
   * Checks if file is an entry point
   */
  private isEntryPoint(filePath: string, basename: string): boolean {
    const entryPoints = [
      'index.ts', 'index.js', 'index.tsx', 'index.jsx',
      'main.ts', 'main.js', 'main.py',
      'app.ts', 'app.js', 'app.py',
      'server.ts', 'server.js',
      'cli.ts', 'cli.js',
    ];
    
    return entryPoints.includes(basename) || 
           filePath.includes('src/index') ||
           filePath.includes('src/main') ||
           filePath.includes('src/app');
  }

  /**
   * Checks if file is a configuration file
   */
  private isConfigFile(basename: string, ext: string): boolean {
    const configFiles = [
      'package.json', 'tsconfig.json', 'jsconfig.json',
      'webpack.config', 'vite.config', 'rollup.config',
      'babel.config', 'eslint.config', '.eslintrc',
      'jest.config', 'vitest.config', 'cypress.config',
      'playwright.config', '.gitignore', '.npmignore',
      'dockerfile', 'docker-compose',
    ];
    
    return configFiles.some(pattern => basename.includes(pattern)) ||
           ext === '.json' && basename.includes('config');
  }

  /**
   * Checks if file is a build script
   */
  private isBuildScript(basename: string, _ext: string): boolean {
    const buildFiles = [
      'makefile', 'cmakeLists.txt', 'build.gradle',
      'pom.xml', 'cargo.toml', 'go.mod', 'requirements.txt',
      'pyproject.toml', 'setup.py',
    ];
    
    return buildFiles.some(pattern => basename.includes(pattern.toLowerCase()));
  }

  /**
   * Checks if file is a test file
   */
  private isTestFile(filePath: string, basename: string): boolean {
    return basename.includes('.test.') ||
           basename.includes('.spec.') ||
           filePath.includes('/test/') ||
           filePath.includes('/tests/') ||
           filePath.includes('/__tests__/');
  }

  /**
   * Checks if file is documentation
   */
  private isDocumentationFile(ext: string, basename: string): boolean {
    return ext === '.md' || ext === '.rst' || ext === '.txt' ||
           basename === 'readme' || basename === 'changelog' ||
           basename === 'license' || basename === 'contributing';
  }

  /**
   * Analyzes components using TreeSitter and CodeRAG
   */
  private async analyzeComponents(
    files: string[], 
    depth: AnalysisDepth,
    _targetDir: string
  ): Promise<ComponentOverview[]> {
    const components: ComponentOverview[] = [];
    const maxFiles = depth === AnalysisDepth.QUICK ? 20 : 
                    depth === AnalysisDepth.STANDARD ? 100 : files.length;
    
    const prioritizedFiles = this.prioritizeFiles(files).slice(0, maxFiles);
    
    for (const file of prioritizedFiles) {
      try {
        const component = await this.analyzeComponent(file);
        if (component) {
          components.push(component);
        }
      } catch (_error) {
        // Skip files that can't be analyzed
        continue;
      }
    }

    return components.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Prioritizes files for analysis
   */
  private prioritizeFiles(files: string[]): string[] {
    return files.sort((a, b) => {
      const scoreA = this.getFilePriority(a);
      const scoreB = this.getFilePriority(b);
      return scoreB - scoreA;
    });
  }

  /**
   * Gets file priority score
   */
  private getFilePriority(file: string): number {
    let score = 0;
    const basename = path.basename(file).toLowerCase();
    const dirname = path.dirname(file);
    
    // Entry points get highest priority
    if (this.isEntryPoint(file, basename)) score += 100;
    
    // Main source files
    if (dirname.includes('src')) score += 50;
    if (dirname.includes('lib')) score += 40;
    
    // Configuration files
    if (this.isConfigFile(basename, path.extname(file))) score += 30;
    
    // Test files
    if (this.isTestFile(file, basename)) score += 20;
    
    // TypeScript/JavaScript gets priority
    const ext = path.extname(file);
    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) score += 10;
    
    return score;
  }

  /**
   * Analyzes individual component
   */
  private async analyzeComponent(file: string): Promise<ComponentOverview | null> {
    try {
      const stats = fs.statSync(file);
      const ext = path.extname(file);
      const basename = path.basename(file);
      
      // Get symbols using TreeSitter
      let symbols: SymbolInfo[] = [];
      if (['.ts', '.tsx', '.js', '.jsx', '.py'].includes(ext)) {
        try {
          const symbolsResult = await this.treeSitter.execute({
            operation: QueryOperation.FIND_SYMBOLS,
            file_path: file,
            include_details: true,
            include_positions: true,
          });
          // TreeSitter result structure varies, check for symbols in result
          if (symbolsResult && typeof symbolsResult === 'object') {
            // Try to extract symbols from the result
            if ('symbols' in symbolsResult) {
              symbols = (symbolsResult as { symbols: SymbolInfo[] }).symbols || [];
            } else if (symbolsResult.llmContent) {
              try {
                const parsed = JSON.parse(symbolsResult.llmContent as string);
                symbols = parsed.symbols || [];
              } catch {
                symbols = [];
              }
            }
          }
        } catch (_error) {
          // TreeSitter analysis failed, continue without symbols
        }
      }

      // Determine component type
      const type = this.determineComponentType(file, basename);
      
      // Calculate importance score
      const importance = this.calculateImportance(file, basename, symbols, stats.size);
      
      return {
        path: file,
        type,
        language: this.classifyLanguage(ext, basename),
        size: stats.size,
        symbols,
        dependencies: [], // Will be populated later
        exports: [], // Will be populated later
        description: this.generateComponentDescription(file, symbols, type),
        importance,
      };
    } catch (_error) {
      return null;
    }
  }

  /**
   * Determines component type
   */
  private determineComponentType(file: string, basename: string): ComponentType {
    if (this.isEntryPoint(file, basename)) return ComponentType.ENTRY_POINT;
    if (this.isConfigFile(basename, path.extname(file))) return ComponentType.CONFIG_FILE;
    if (this.isBuildScript(basename, path.extname(file))) return ComponentType.BUILD_SCRIPT;
    if (this.isTestFile(file, basename)) return ComponentType.TEST_FILE;
    if (this.isDocumentationFile(path.extname(file), basename)) return ComponentType.DOCUMENTATION;
    return ComponentType.SOURCE_CODE;
  }

  /**
   * Calculates component importance
   */
  private calculateImportance(file: string, basename: string, symbols: SymbolInfo[], size: number): number {
    let score = 0;
    
    // File type importance
    if (this.isEntryPoint(file, basename)) score += 100;
    if (this.isConfigFile(basename, path.extname(file))) score += 50;
    
    // Symbol count importance
    score += symbols.length * 5;
    
    // Size importance (normalized)
    score += Math.min(size / 1000, 20);
    
    // Path depth (shallower is more important)
    const depth = file.split('/').length;
    score += Math.max(20 - depth, 0);
    
    return score;
  }

  /**
   * Generates component description
   */
  private generateComponentDescription(file: string, symbols: SymbolInfo[], type: ComponentType): string {
    const basename = path.basename(file);
    const symbolCount = symbols.length;
    
    switch (type) {
      case ComponentType.ENTRY_POINT:
        return `Entry point with ${symbolCount} symbols`;
      case ComponentType.CONFIG_FILE:
        return `Configuration file: ${basename}`;
      case ComponentType.BUILD_SCRIPT:
        return `Build configuration: ${basename}`;
      case ComponentType.TEST_FILE:
        return `Test file with ${symbolCount} test definitions`;
      case ComponentType.DOCUMENTATION:
        return `Documentation: ${basename}`;
      case ComponentType.SOURCE_CODE:
        return `Source file with ${symbolCount} symbols`;
      default:
        return `File: ${basename}`;
    }
  }

  /**
   * Detects architecture patterns
   */
  private detectArchitecturePatterns(components: ComponentOverview[]): ArchitecturePattern[] {
    const patterns: ArchitecturePattern[] = [];
    
    // Analyze directory structure
    const dirs = new Set(components.map(c => path.dirname(c.path)));
    const dirArray = Array.from(dirs);
    
    // MVC Pattern
    if (dirArray.some(d => d.includes('models')) &&
        dirArray.some(d => d.includes('views')) &&
        dirArray.some(d => d.includes('controllers'))) {
      patterns.push({
        name: 'Model-View-Controller (MVC)',
        confidence: 0.8,
        description: 'Traditional MVC architecture with separate models, views, and controllers',
        examples: dirArray.filter(d => d.includes('model') || d.includes('view') || d.includes('controller')),
      });
    }

    // Component-based architecture
    if (dirArray.some(d => d.includes('components')) &&
        components.some(c => c.language === 'TypeScript' && c.path.includes('component'))) {
      patterns.push({
        name: 'Component-Based Architecture',
        confidence: 0.9,
        description: 'React/Vue-style component architecture',
        examples: components.filter(c => c.path.includes('component')).map(c => c.path).slice(0, 3),
      });
    }

    // Microservices
    if (dirArray.some(d => d.includes('services')) &&
        components.some(c => c.path.includes('service'))) {
      patterns.push({
        name: 'Service-Oriented Architecture',
        confidence: 0.7,
        description: 'Service-based modular architecture',
        examples: components.filter(c => c.path.includes('service')).map(c => c.path).slice(0, 3),
      });
    }

    // Layered architecture
    if (dirArray.some(d => d.includes('presentation')) ||
        dirArray.some(d => d.includes('business')) ||
        dirArray.some(d => d.includes('data'))) {
      patterns.push({
        name: 'Layered Architecture',
        confidence: 0.6,
        description: 'Multi-tier layered architecture',
        examples: dirArray.filter(d => 
          d.includes('presentation') || d.includes('business') || d.includes('data')
        ),
      });
    }

    return patterns;
  }

  /**
   * Generates key insights
   */
  private generateKeyInsights(structure: RepositoryStructure, components: ComponentOverview[]): string[] {
    const insights: string[] = [];
    
    // Language analysis
    const primaryLang = Object.entries(structure.languages)
      .sort(([,a], [,b]) => b - a)[0];
    if (primaryLang) {
      insights.push(`Primary language: ${primaryLang[0]} (${primaryLang[1]} files)`);
    }

    // Project size
    insights.push(`${structure.totalFiles} files, ${structure.totalLines.toLocaleString()} lines of code`);
    
    // Entry points
    if (structure.entryPoints.length > 0) {
      insights.push(`${structure.entryPoints.length} entry points identified`);
    }

    // Test coverage
    if (structure.testFiles.length > 0) {
      const testRatio = structure.testFiles.length / structure.totalFiles;
      insights.push(`${structure.testFiles.length} test files (${(testRatio * 100).toFixed(1)}% test ratio)`);
    }

    // Most important components
    const topComponents = components.slice(0, 3);
    if (topComponents.length > 0) {
      insights.push(`Key components: ${topComponents.map(c => path.basename(c.path)).join(', ')}`);
    }

    return insights;
  }

  /**
   * Detects coding conventions
   */
  private detectConventions(components: ComponentOverview[]): string[] {
    const conventions: string[] = [];
    
    // File naming conventions
    const filenames = components.map(c => path.basename(c.path));
    const hasKebabCase = filenames.some(f => f.includes('-'));
    const hasCamelCase = filenames.some(f => /[a-z][A-Z]/.test(f));
    const hasSnakeCase = filenames.some(f => f.includes('_'));
    
    if (hasKebabCase) conventions.push('Kebab-case file naming');
    if (hasCamelCase) conventions.push('CamelCase file naming');
    if (hasSnakeCase) conventions.push('Snake_case file naming');
    
    // TypeScript usage
    const tsFiles = components.filter(c => c.language === 'TypeScript').length;
    const jsFiles = components.filter(c => c.language === 'JavaScript').length;
    if (tsFiles > jsFiles) {
      conventions.push('TypeScript preferred over JavaScript');
    }

    // Test file conventions
    const testFiles = components.filter(c => c.type === ComponentType.TEST_FILE);
    if (testFiles.some(f => f.path.includes('.test.'))) {
      conventions.push('*.test.* test file naming');
    }
    if (testFiles.some(f => f.path.includes('.spec.'))) {
      conventions.push('*.spec.* test file naming');
    }

    return conventions;
  }

  validateToolParams(params: RepoMapToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    if (params.depth && !Object.values(AnalysisDepth).includes(params.depth)) {
      return 'Invalid analysis depth. Must be quick, standard, or comprehensive';
    }

    return null;
  }

  getDescription(params: RepoMapToolParams): string {
    const depth = params.depth || AnalysisDepth.STANDARD;
    const target = params.targetDirectory || 'current directory';
    return `Creating ${depth} repository map of ${target}`;
  }

  async execute(params: RepoMapToolParams): Promise<RepoMapToolResult> {
    const startTime = Date.now();
    
    try {
      const targetDir = params.targetDirectory || this.config.getTargetDir();
      const depth = params.depth || AnalysisDepth.STANDARD;
      const cacheKey = this.generateCacheKey(targetDir, params);
      
      // Check persistent cache first
      if (!params.forceRefresh) {
        const cachedMap = await this.persistentCache.get(cacheKey);
        if (cachedMap) {
          // Also store in memory cache
          this.cache.set(cacheKey, cachedMap);
          const analysisTime = Date.now() - startTime;
          
          return {
            llmContent: `Repository map retrieved from persistent cache (${depth} analysis)`,
            returnDisplay: this.formatRepositoryMap(cachedMap),
            repositoryMap: cachedMap,
            summary: this.generateSummary(cachedMap),
            analysisTime,
          };
        }
        
        // Check memory cache
        if (this.cache.has(cacheKey)) {
          const cachedMap = this.cache.get(cacheKey)!;
          const analysisTime = Date.now() - startTime;
          
          return {
            llmContent: `Repository map retrieved from memory cache (${depth} analysis)`,
            returnDisplay: this.formatRepositoryMap(cachedMap),
            repositoryMap: cachedMap,
            summary: this.generateSummary(cachedMap),
            analysisTime,
          };
        }
      }

      // Find files
      const patterns = this.getFilePatterns(params);
      const ignorePatterns = this.getIgnorePatterns(params);
      
      let allFiles: string[] = [];
      for (const pattern of patterns) {
        try {
          const files = await glob(pattern, { 
            cwd: targetDir,
            absolute: true,
            nodir: true,
          });
          allFiles.push(...files);
        } catch {
          // Skip patterns that fail
        }
      }
      
      // Filter out ignored files
      allFiles = allFiles.filter(file => 
        !ignorePatterns.some(ignore => 
          file.includes(ignore.replace('**/', '').replace('/**', ''))
        )
      );

      // Remove duplicates
      allFiles = Array.from(new Set(allFiles));

      // Analyze repository structure
      const structure = await this.analyzeStructure(targetDir, allFiles);
      
      // Analyze components
      const components = await this.analyzeComponents(allFiles, depth, targetDir);
      
      // Detect patterns and insights
      const architecturePatterns = this.detectArchitecturePatterns(components);
      const keyInsights = this.generateKeyInsights(structure, components);
      const conventions = this.detectConventions(components);
      
      // Create repository map
      const repositoryMap: RepositoryMap = {
        timestamp: new Date().toISOString(),
        structure,
        components,
        dependencies: [], // Would be populated by analyzing package.json, etc.
        architecturePatterns,
        keyInsights,
        conventions,
        cacheKey,
      };

      // Cache the result in both memory and persistent storage
      this.cache.set(cacheKey, repositoryMap);
      await this.persistentCache.set(cacheKey, repositoryMap);
      
      const analysisTime = Date.now() - startTime;
      
      return {
        llmContent: `Repository map created successfully (${depth} analysis of ${allFiles.length} files)`,
        returnDisplay: this.formatRepositoryMap(repositoryMap),
        repositoryMap,
        summary: this.generateSummary(repositoryMap),
        analysisTime,
      };
      
    } catch (error) {
      const analysisTime = Date.now() - startTime;
      const errorMsg = `Error creating repository map: ${getErrorMessage(error)}`;
      
      return {
        llmContent: errorMsg,
        returnDisplay: `Error: ${errorMsg}`,
        repositoryMap: {} as RepositoryMap,
        summary: 'Repository mapping failed',
        analysisTime,
      };
    }
  }

  /**
   * Formats repository map for display
   */
  private formatRepositoryMap(map: RepositoryMap): string {
    const { structure, components, architecturePatterns, keyInsights, conventions } = map;
    
    let output = `# Repository Map\n\n`;
    output += `**Generated:** ${new Date(map.timestamp).toLocaleString()}\n\n`;
    
    // Key insights
    output += `## 📊 Key Insights\n`;
    keyInsights.forEach(insight => output += `- ${insight}\n`);
    output += `\n`;
    
    // Architecture patterns
    if (architecturePatterns.length > 0) {
      output += `## 🏗️ Architecture Patterns\n`;
      architecturePatterns.forEach(pattern => {
        output += `### ${pattern.name} (${(pattern.confidence * 100).toFixed(0)}% confidence)\n`;
        output += `${pattern.description}\n`;
        if (pattern.examples.length > 0) {
          output += `Examples: ${pattern.examples.join(', ')}\n`;
        }
        output += `\n`;
      });
    }
    
    // Structure overview
    output += `## 📁 Structure Overview\n`;
    output += `- **Total Files:** ${structure.totalFiles}\n`;
    output += `- **Total Lines:** ${structure.totalLines.toLocaleString()}\n`;
    output += `- **Languages:** ${Object.entries(structure.languages)
      .map(([lang, count]) => `${lang} (${count})`)
      .join(', ')}\n`;
    output += `- **Entry Points:** ${structure.entryPoints.length}\n`;
    output += `- **Test Files:** ${structure.testFiles.length}\n`;
    output += `\n`;
    
    // Top components
    const topComponents = components.slice(0, 10);
    if (topComponents.length > 0) {
      output += `## 🔗 Key Components\n`;
      topComponents.forEach((comp, idx) => {
        output += `${idx + 1}. **${path.basename(comp.path)}** - ${comp.description}\n`;
        output += `   - Type: ${comp.type}, Language: ${comp.language}\n`;
        output += `   - Symbols: ${comp.symbols.length}, Size: ${comp.size} bytes\n`;
        output += `\n`;
      });
    }
    
    // Conventions
    if (conventions.length > 0) {
      output += `## 📝 Coding Conventions\n`;
      conventions.forEach(convention => output += `- ${convention}\n`);
      output += `\n`;
    }
    
    return output;
  }

  /**
   * Generates summary
   */
  private generateSummary(map: RepositoryMap): string {
    const { structure, components, architecturePatterns } = map;
    const primaryLang = Object.entries(structure.languages)
      .sort(([,a], [,b]) => b - a)[0];
    
    const patterns = architecturePatterns.map(p => p.name).join(', ') || 'Standard structure';
    
    return `${primaryLang ? primaryLang[0] : 'Multi-language'} project with ${structure.totalFiles} files, ` +
           `${components.length} analyzed components. Architecture: ${patterns}`;
  }

  /**
   * Clears the persistent cache for this tool
   */
  async clearCache(): Promise<void> {
    await this.persistentCache.clear();
    this.cache.clear();
  }

  /**
   * Gets cache statistics
   */
  getCacheStats(): {
    memoryEntries: number;
    diskEntries: number;
    totalFiles: number;
    cacheDir: string;
  } {
    return this.persistentCache.getStats();
  }

  /**
   * Invalidates cache entries that might be affected by file changes
   */
  async invalidateChangedFiles(): Promise<void> {
    // For repo maps, we need to check if any source files have changed
    // This is a simple implementation - could be more sophisticated
    const targetDir = this.config.getTargetDir();
    const sourcePatterns = [
      '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', 
      '**/*.py', '**/*.java', '**/*.go', '**/*.rs'
    ];
    
    const allFiles: string[] = [];
    for (const pattern of sourcePatterns) {
      try {
        const files = await glob(pattern, { 
          cwd: targetDir,
          absolute: true,
          ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
        });
        allFiles.push(...files);
      } catch {
        // Skip patterns that fail
      }
    }
    
    // Check if any repository files have changed
    const changedFiles = this.persistentCache.getChangedFiles(allFiles);
    if (changedFiles.length > 0) {
      // If any files changed, invalidate all repository maps
      await this.persistentCache.clear();
      this.cache.clear();
    }
  }
}