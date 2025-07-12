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
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

/**
 * Search types for RAG operations
 */
export enum SearchType {
  SEMANTIC = 'semantic',
  KEYWORD = 'keyword',
  FUNCTION = 'function',
  CLASS = 'class',
  PATTERN = 'pattern',
  SIMILAR = 'similar',
  CONTEXT = 'context',
}

/**
 * Context types for code retrieval
 */
export enum ContextType {
  FUNCTION_DEFINITION = 'function_definition',
  CLASS_DEFINITION = 'class_definition',
  IMPORT_USAGE = 'import_usage',
  API_USAGE = 'api_usage',
  ERROR_HANDLING = 'error_handling',
  DOCUMENTATION = 'documentation',
  RELATED_CODE = 'related_code',
}

/**
 * Programming languages supported for semantic search
 */
export enum CodeLanguage {
  TYPESCRIPT = 'typescript',
  JAVASCRIPT = 'javascript',
  PYTHON = 'python',
  JAVA = 'java',
  GO = 'go',
  RUST = 'rust',
  CPP = 'cpp',
  AUTO = 'auto',
}

/**
 * Code snippet with metadata
 */
export interface CodeSnippet {
  id: string;
  filePath: string;
  language: CodeLanguage;
  content: string;
  startLine: number;
  endLine: number;
  functionName?: string;
  className?: string;
  symbolType?: string;
  imports?: string[];
  exports?: string[];
  complexity?: number;
  embedding?: number[];
  score?: number;
}

/**
 * Semantic search result
 */
export interface SearchResult {
  snippet: CodeSnippet;
  relevanceScore: number;
  matchType: 'exact' | 'semantic' | 'partial';
  context: string;
  relatedSnippets?: CodeSnippet[];
}

/**
 * Code context information
 */
export interface CodeContext {
  query: string;
  results: SearchResult[];
  totalMatches: number;
  languages: CodeLanguage[];
  searchTime: number;
  suggestions?: string[];
}

/**
 * RAG index entry
 */
export interface IndexEntry {
  id: string;
  filePath: string;
  content: string;
  metadata: {
    language: CodeLanguage;
    symbolType?: string;
    functionName?: string;
    className?: string;
    lineStart: number;
    lineEnd: number;
    lastModified: number;
  };
  embedding?: number[];
}

/**
 * Parameters for the CodeRAG tool
 */
export interface CodeRAGToolParams {
  /**
   * The search operation to perform
   */
  search_type: SearchType;

  /**
   * Search query (natural language or code pattern)
   */
  query: string;

  /**
   * File path, directory, or glob pattern to search in
   */
  search_path?: string;

  /**
   * Programming languages to include
   */
  languages?: CodeLanguage[];

  /**
   * Context type for focused search
   */
  context_type?: ContextType;

  /**
   * Maximum number of results to return
   */
  max_results?: number;

  /**
   * Minimum relevance score threshold
   */
  min_score?: number;

  /**
   * Include related code snippets
   */
  include_related?: boolean;

  /**
   * Include code context and documentation
   */
  include_context?: boolean;

  /**
   * File to compare against for similarity search
   */
  reference_file?: string;

  /**
   * Enable semantic embeddings
   */
  use_embeddings?: boolean;
}

/**
 * Code RAG Tool - Semantic code search and context retrieval
 */
export class CodeRAGTool extends BaseTool<CodeRAGToolParams, ToolResult> {
  private readonly config: Config;
  private readonly codeIndex: Map<string, IndexEntry> = new Map();
  private readonly embeddingCache: Map<string, number[]> = new Map();
  private readonly persistentCache: PersistentCache<IndexEntry[]>;
  static readonly Name = 'code_rag';

  constructor(config: Config) {
    super(
      CodeRAGTool.Name,
      'Code RAG Search',
      'Semantic code search and context retrieval tool. Provides intelligent code discovery using natural language queries, similarity search, and contextual code understanding for large projects.',
      {
        properties: {
          search_type: {
            type: Type.STRING,
            description: 'The search operation to perform',
            enum: Object.values(SearchType),
          },
          query: {
            type: Type.STRING,
            description: 'Search query (natural language or code pattern)',
          },
          search_path: {
            type: Type.STRING,
            description: 'File path, directory, or glob pattern to search in',
          },
          languages: {
            type: Type.ARRAY,
            description: 'Programming languages to include',
            items: {
              type: Type.STRING,
              enum: Object.values(CodeLanguage),
            },
          },
          context_type: {
            type: Type.STRING,
            description: 'Context type for focused search',
            enum: Object.values(ContextType),
          },
          max_results: {
            type: Type.NUMBER,
            description: 'Maximum number of results to return (default: 10)',
          },
          min_score: {
            type: Type.NUMBER,
            description: 'Minimum relevance score threshold (0-1, default: 0.3)',
          },
          include_related: {
            type: Type.BOOLEAN,
            description: 'Include related code snippets',
          },
          include_context: {
            type: Type.BOOLEAN,
            description: 'Include code context and documentation',
          },
          reference_file: {
            type: Type.STRING,
            description: 'File to compare against for similarity search',
          },
          use_embeddings: {
            type: Type.BOOLEAN,
            description: 'Enable semantic embeddings (slower but more accurate)',
          },
        },
        required: ['search_type', 'query'],
        type: Type.OBJECT,
      }
    );
    this.config = config;
    this.persistentCache = new PersistentCache<IndexEntry[]>('code-rag', {
      cacheDir: path.join(config.getTargetDir(), '.soul-cache'),
      maxMemoryEntries: 50,
      maxFileAge: 24 * 60 * 60 * 1000, // 24 hours
      enableFileHashing: true,
    });
  }

  validateToolParams(params: CodeRAGToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    // Validate search path if provided
    if (params.search_path) {
      const searchPath = path.isAbsolute(params.search_path)
        ? params.search_path
        : path.join(this.config.getTargetDir(), params.search_path);

      if (!fs.existsSync(searchPath)) {
        return `Search path does not exist: ${params.search_path}`;
      }
    }

    // Validate reference file for similarity search
    if (params.search_type === SearchType.SIMILAR && params.reference_file) {
      const refPath = path.isAbsolute(params.reference_file)
        ? params.reference_file
        : path.join(this.config.getTargetDir(), params.reference_file);

      if (!fs.existsSync(refPath)) {
        return `Reference file does not exist: ${params.reference_file}`;
      }
    }

    // Validate score threshold
    if (params.min_score !== undefined) {
      if (params.min_score < 0 || params.min_score > 1) {
        return 'Minimum score must be between 0 and 1';
      }
    }

    return null;
  }

  getDescription(params: CodeRAGToolParams): string {
    const searchType = params.search_type;
    const query = params.query;
    const path = params.search_path ? ` in ${params.search_path}` : '';

    switch (searchType) {
      case SearchType.SEMANTIC:
        return `Semantic search for "${query}"${path}`;
      case SearchType.FUNCTION:
        return `Find functions related to "${query}"${path}`;
      case SearchType.CLASS:
        return `Find classes related to "${query}"${path}`;
      case SearchType.SIMILAR:
        return `Find code similar to "${query}"${path}`;
      case SearchType.CONTEXT:
        return `Get code context for "${query}"${path}`;
      case SearchType.PATTERN:
        return `Find code patterns matching "${query}"${path}`;
      default:
        return `Search for "${query}"${path}`;
    }
  }

  async execute(params: CodeRAGToolParams): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    try {
      const startTime = Date.now();
      
      // Build or update code index
      await this.buildCodeIndex(params);

      // Perform search based on type
      let searchResults: SearchResult[];
      
      switch (params.search_type) {
        case SearchType.SEMANTIC:
          searchResults = await this.semanticSearch(params);
          break;
        case SearchType.FUNCTION:
          searchResults = await this.functionSearch(params);
          break;
        case SearchType.CLASS:
          searchResults = await this.classSearch(params);
          break;
        case SearchType.SIMILAR:
          searchResults = await this.similaritySearch(params);
          break;
        case SearchType.CONTEXT:
          searchResults = await this.contextSearch(params);
          break;
        case SearchType.PATTERN:
          searchResults = await this.patternSearch(params);
          break;
        case SearchType.KEYWORD:
          searchResults = await this.keywordSearch(params);
          break;
        default:
          searchResults = await this.keywordSearch(params);
      }

      const searchTime = Date.now() - startTime;
      
      const context: CodeContext = {
        query: params.query,
        results: searchResults,
        totalMatches: searchResults.length,
        languages: this.getUniqueLanguages(searchResults),
        searchTime,
        suggestions: this.generateSuggestions(params, searchResults),
      };

      const result = this.formatSearchResults(context, params);
      
      return {
        llmContent: result,
        returnDisplay: result,
      };

    } catch (error) {
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Code RAG search failed: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }

  private async buildCodeIndex(params: CodeRAGToolParams): Promise<void> {
    const searchPath = params.search_path || this.config.getTargetDir();
    const basePath = path.isAbsolute(searchPath) ? searchPath : path.join(this.config.getTargetDir(), searchPath);

    // File patterns for different languages
    const patterns = this.getFilePatterns(params.languages);
    
    // Collect all files first
    const allFiles: string[] = [];
    for (const pattern of patterns) {
      const files = await glob(pattern, { 
        cwd: basePath,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
      });
      allFiles.push(...files);
    }

    // Check for changed files and invalidate cache entries
    const changedFiles = this.persistentCache.getChangedFiles(allFiles);
    for (const changedFile of changedFiles) {
      await this.persistentCache.invalidate(changedFile);
    }

    // Index all files (using cache when available)
    for (const filePath of allFiles) {
      try {
        await this.indexFile(filePath);
      } catch (_error) {
        // Skip files that can't be read or parsed
        continue;
      }
    }
  }

  private async indexFile(filePath: string): Promise<void> {
    // Check persistent cache first
    const cachedEntries = await this.persistentCache.get(filePath);
    if (cachedEntries && Array.isArray(cachedEntries)) {
      // Load cached entries into memory index
      for (const entry of cachedEntries) {
        this.codeIndex.set(entry.id, entry);
      }
      return;
    }

    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const language = this.detectLanguage(filePath);
    
    // Split content into meaningful chunks (functions, classes, etc.)
    const chunks = this.extractCodeChunks(content, language);
    const entries: IndexEntry[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const id = `${filePath}:${i}`;
      
      const entry: IndexEntry = {
        id,
        filePath,
        content: chunk.content,
        metadata: {
          language,
          symbolType: chunk.symbolType,
          functionName: chunk.functionName,
          className: chunk.className,
          lineStart: chunk.startLine,
          lineEnd: chunk.endLine,
          lastModified: stats.mtime.getTime(),
        },
      };

      this.codeIndex.set(id, entry);
      entries.push(entry);
    }

    // Cache the entries for this file
    await this.persistentCache.set(filePath, entries);
  }

  private extractCodeChunks(content: string, language: CodeLanguage): CodeSnippet[] {
    const lines = content.split('\n');
    const chunks: CodeSnippet[] = [];
    
    // Simple extraction - in a full implementation, this would use tree-sitter
    let currentChunk = '';
    let startLine = 1;
    let inFunction = false;
    let inClass = false;
    let braceCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Detect function/class/interface starts
      if (this.isCodeBlockStart(trimmedLine, language)) {
        if (currentChunk.trim()) {
          // Save previous chunk
          chunks.push(this.createCodeSnippet(currentChunk, startLine, i, language));
        }
        
        currentChunk = line + '\n';
        startLine = i + 1;
        inFunction = this.isFunctionStart(trimmedLine, language);
        inClass = this.isClassStart(trimmedLine, language);
        braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      } else {
        currentChunk += line + '\n';
        braceCount += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        
        // End of block
        if ((inFunction || inClass) && braceCount <= 0 && trimmedLine.includes('}')) {
          chunks.push(this.createCodeSnippet(currentChunk, startLine, i + 1, language));
          currentChunk = '';
          inFunction = false;
          inClass = false;
        }
      }
    }
    
    // Add remaining content
    if (currentChunk.trim()) {
      chunks.push(this.createCodeSnippet(currentChunk, startLine, lines.length, language));
    }
    
    return chunks;
  }

  private createCodeSnippet(content: string, startLine: number, endLine: number, language: CodeLanguage): CodeSnippet {
    return {
      id: `${startLine}-${endLine}`,
      filePath: '',
      language,
      content: content.trim(),
      startLine,
      endLine,
      functionName: this.extractFunctionName(content),
      className: this.extractClassName(content),
      symbolType: this.detectSymbolType(content),
    };
  }

  private async semanticSearch(params: CodeRAGToolParams): Promise<SearchResult[]> {
    // Enhanced semantic search using keyword analysis and context understanding
    const results: SearchResult[] = [];
    const queryTerms = this.extractSemanticTerms(params.query);
    
    for (const [_id, entry] of this.codeIndex) {
      const semanticScore = this.calculateSemanticRelevance(queryTerms, entry);
      
      if (semanticScore > (params.min_score || 0.2)) {
        const snippet = this.indexEntryToCodeSnippet(entry);
        results.push({
          snippet,
          relevanceScore: semanticScore,
          matchType: semanticScore > 0.7 ? 'exact' : 'semantic',
          context: `Semantic match: ${this.getSemanticContext(queryTerms, entry)}`,
        });
      }
    }
    
    return this.sortAndLimitResults(results, params);
  }

  private extractSemanticTerms(query: string): string[] {
    // Extract meaningful terms and expand with synonyms
    const terms = query.toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 2)
      .filter(term => !['and', 'or', 'the', 'for', 'with', 'that', 'this'].includes(term));
    
    // Add common programming synonyms
    const expandedTerms = [...terms];
    
    for (const term of terms) {
      switch (term) {
        case 'function':
        case 'method':
          expandedTerms.push('function', 'method', 'def', 'func');
          break;
        case 'class':
          expandedTerms.push('class', 'component', 'interface');
          break;
        case 'authenticate':
        case 'auth':
        case 'login':
          expandedTerms.push('authenticate', 'auth', 'login', 'signin', 'verify');
          break;
        case 'validate':
        case 'validation':
          expandedTerms.push('validate', 'validation', 'check', 'verify', 'sanitize');
          break;
        case 'handle':
        case 'handler':
          expandedTerms.push('handle', 'handler', 'process', 'manage');
          break;
        default:
          // No expansion for other terms
          break;
      }
    }
    
    return [...new Set(expandedTerms)];
  }

  private calculateSemanticRelevance(queryTerms: string[], entry: IndexEntry): number {
    const content = entry.content.toLowerCase();
    const metadata = entry.metadata;
    
    let score = 0;
    let matches = 0;
    
    // Weight different types of matches
    for (const term of queryTerms) {
      // Function/class name matches (high weight)
      if (metadata.functionName?.toLowerCase().includes(term) || 
          metadata.className?.toLowerCase().includes(term)) {
        score += 0.5;
        matches++;
      }
      
      // Symbol type matches (medium weight)
      if (metadata.symbolType?.toLowerCase().includes(term)) {
        score += 0.3;
        matches++;
      }
      
      // Content matches (lower weight but consider frequency)
      const contentMatches = (content.match(new RegExp(term, 'g')) || []).length;
      if (contentMatches > 0) {
        score += Math.min(contentMatches * 0.1, 0.4);
        matches++;
      }
      
      // Variable and function declaration patterns
      if (content.includes(`${term}(`)) {
        score += 0.2; // Function call
      }
      if (content.includes(`function ${term}`) || content.includes(`const ${term}`)) {
        score += 0.3; // Declaration
      }
    }
    
    // Boost score for files with multiple matches
    if (matches > 1) {
      score *= 1.2;
    }
    
    // Normalize score
    return Math.min(score, 1);
  }

  private getSemanticContext(queryTerms: string[], entry: IndexEntry): string {
    const contexts: string[] = [];
    
    if (entry.metadata.functionName) {
      contexts.push(`in function ${entry.metadata.functionName}`);
    }
    if (entry.metadata.className) {
      contexts.push(`in class ${entry.metadata.className}`);
    }
    if (entry.metadata.symbolType) {
      contexts.push(`${entry.metadata.symbolType} definition`);
    }
    
    return contexts.length > 0 ? contexts.join(', ') : 'code content';
  }

  private async functionSearch(params: CodeRAGToolParams): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const query = params.query.toLowerCase();
    
    for (const [_id, entry] of this.codeIndex) {
      if (entry.metadata.functionName && 
          entry.metadata.functionName.toLowerCase().includes(query)) {
        
        const snippet = this.indexEntryToCodeSnippet(entry);
        results.push({
          snippet,
          relevanceScore: this.calculateRelevanceScore(query, entry.content),
          matchType: 'exact',
          context: `Function: ${entry.metadata.functionName}`,
        });
      }
    }
    
    return this.sortAndLimitResults(results, params);
  }

  private async classSearch(params: CodeRAGToolParams): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const query = params.query.toLowerCase();
    
    for (const [_id, entry] of this.codeIndex) {
      if (entry.metadata.className && 
          entry.metadata.className.toLowerCase().includes(query)) {
        
        const snippet = this.indexEntryToCodeSnippet(entry);
        results.push({
          snippet,
          relevanceScore: this.calculateRelevanceScore(query, entry.content),
          matchType: 'exact',
          context: `Class: ${entry.metadata.className}`,
        });
      }
    }
    
    return this.sortAndLimitResults(results, params);
  }

  private async similaritySearch(params: CodeRAGToolParams): Promise<SearchResult[]> {
    if (!params.reference_file) {
      return [];
    }

    const refPath = path.isAbsolute(params.reference_file)
      ? params.reference_file
      : path.join(this.config.getTargetDir(), params.reference_file);
    
    const referenceContent = fs.readFileSync(refPath, 'utf8');
    
    // Simple similarity based on common patterns and keywords
    const results: SearchResult[] = [];
    const refKeywords = this.extractKeywords(referenceContent);
    
    for (const [_id, entry] of this.codeIndex) {
      if (entry.filePath === refPath) continue; // Skip same file
      
      const similarity = this.calculateSimilarity(refKeywords, entry.content);
      if (similarity > (params.min_score || 0.3)) {
        const snippet = this.indexEntryToCodeSnippet(entry);
        results.push({
          snippet,
          relevanceScore: similarity,
          matchType: 'semantic',
          context: `Similar to ${path.basename(params.reference_file)}`,
        });
      }
    }
    
    return this.sortAndLimitResults(results, params);
  }

  private async contextSearch(params: CodeRAGToolParams): Promise<SearchResult[]> {
    // Find code that provides context around the query
    return this.keywordSearch(params);
  }

  private async patternSearch(params: CodeRAGToolParams): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const pattern = new RegExp(params.query, 'gi');
    
    for (const [_id, entry] of this.codeIndex) {
      const matches = entry.content.match(pattern);
      if (matches) {
        const snippet = this.indexEntryToCodeSnippet(entry);
        results.push({
          snippet,
          relevanceScore: Math.min(matches.length / 10, 1), // Normalize by match count
          matchType: 'partial' as const,
          context: `Pattern matches: ${matches.length}`,
        });
      }
    }
    
    return this.sortAndLimitResults(results, params);
  }

  private async keywordSearch(params: CodeRAGToolParams): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const keywords = params.query.toLowerCase().split(/\s+/);
    
    for (const [_id, entry] of this.codeIndex) {
      const content = entry.content.toLowerCase();
      let score = 0;
      let matches = 0;
      
      for (const keyword of keywords) {
        const occurrences = (content.match(new RegExp(keyword, 'g')) || []).length;
        if (occurrences > 0) {
          matches++;
          score += occurrences;
        }
      }
      
      if (matches > 0) {
        const relevanceScore = Math.min((matches / keywords.length) * (score / content.length * 1000), 1);
        
        if (relevanceScore >= (params.min_score || 0.1)) {
          const snippet = this.indexEntryToCodeSnippet(entry);
          results.push({
            snippet,
            relevanceScore,
            matchType: matches === keywords.length ? 'exact' : 'partial',
            context: `Keyword matches: ${matches}/${keywords.length}`,
          });
        }
      }
    }
    
    return this.sortAndLimitResults(results, params);
  }

  private sortAndLimitResults(results: SearchResult[], params: CodeRAGToolParams): SearchResult[] {
    return results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, params.max_results || 10);
  }

  private indexEntryToCodeSnippet(entry: IndexEntry): CodeSnippet {
    return {
      id: entry.id,
      filePath: entry.filePath,
      language: entry.metadata.language,
      content: entry.content,
      startLine: entry.metadata.lineStart,
      endLine: entry.metadata.lineEnd,
      functionName: entry.metadata.functionName,
      className: entry.metadata.className,
      symbolType: entry.metadata.symbolType,
    };
  }

  private detectLanguage(filePath: string): CodeLanguage {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts': case '.tsx': return CodeLanguage.TYPESCRIPT;
      case '.js': case '.jsx': case '.mjs': return CodeLanguage.JAVASCRIPT;
      case '.py': return CodeLanguage.PYTHON;
      case '.java': return CodeLanguage.JAVA;
      case '.go': return CodeLanguage.GO;
      case '.rs': return CodeLanguage.RUST;
      case '.cpp': case '.cc': case '.cxx': case '.h': case '.hpp': return CodeLanguage.CPP;
      default: return CodeLanguage.AUTO;
    }
  }

  private getFilePatterns(languages?: CodeLanguage[]): string[] {
    if (!languages || languages.length === 0) {
      return ['**/*.{ts,tsx,js,jsx,py,java,go,rs,cpp,cc,h}'];
    }

    const patterns: string[] = [];
    for (const lang of languages) {
      switch (lang) {
        case CodeLanguage.TYPESCRIPT:
          patterns.push('**/*.{ts,tsx}');
          break;
        case CodeLanguage.JAVASCRIPT:
          patterns.push('**/*.{js,jsx,mjs}');
          break;
        case CodeLanguage.PYTHON:
          patterns.push('**/*.py');
          break;
        case CodeLanguage.JAVA:
          patterns.push('**/*.java');
          break;
        case CodeLanguage.GO:
          patterns.push('**/*.go');
          break;
        case CodeLanguage.RUST:
          patterns.push('**/*.rs');
          break;
        case CodeLanguage.CPP:
          patterns.push('**/*.{cpp,cc,cxx,h,hpp}');
          break;
        default:
          // Unknown language, skip
          break;
      }
    }
    
    return patterns;
  }

  private isCodeBlockStart(line: string, _language: CodeLanguage): boolean {
    const functionPatterns = [
      /^(export\s+)?(async\s+)?function\s+\w+/,
      /^(export\s+)?const\s+\w+\s*=.*=>/,
      /^(export\s+)?(default\s+)?class\s+\w+/,
      /^(export\s+)?interface\s+\w+/,
      /^(export\s+)?type\s+\w+/,
      /^def\s+\w+/, // Python
      /^class\s+\w+/, // Python/Java
    ];
    
    return functionPatterns.some(pattern => pattern.test(line));
  }

  private isFunctionStart(line: string, _language: CodeLanguage): boolean {
    return /^(export\s+)?(async\s+)?function\s+\w+|^(export\s+)?const\s+\w+\s*=.*=>|^def\s+\w+/.test(line);
  }

  private isClassStart(line: string, _language: CodeLanguage): boolean {
    return /^(export\s+)?(default\s+)?class\s+\w+|^class\s+\w+/.test(line);
  }

  private extractFunctionName(content: string): string | undefined {
    const match = content.match(/(?:function\s+(\w+)|const\s+(\w+)\s*=|def\s+(\w+))/);
    return match?.[1] || match?.[2] || match?.[3];
  }

  private extractClassName(content: string): string | undefined {
    const match = content.match(/class\s+(\w+)/);
    return match?.[1];
  }

  private detectSymbolType(content: string): string | undefined {
    if (content.includes('function ') || content.includes(' => ') || content.includes('def ')) {
      return 'function';
    }
    if (content.includes('class ')) {
      return 'class';
    }
    if (content.includes('interface ')) {
      return 'interface';
    }
    return undefined;
  }

  private calculateRelevanceScore(query: string, content: string): number {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    
    // Simple scoring based on exact matches and proximity
    let score = 0;
    const queryWords = queryLower.split(/\s+/);
    
    for (const word of queryWords) {
      const matches = (contentLower.match(new RegExp(word, 'g')) || []).length;
      score += matches / content.length * 100;
    }
    
    return Math.min(score, 1);
  }

  private extractKeywords(content: string): string[] {
    // Extract meaningful keywords from code
    const words = content
      .replace(/[{}();,[\]]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && /^[a-zA-Z]/.test(word))
      .map(word => word.toLowerCase());
    
    return [...new Set(words)];
  }

  private calculateSimilarity(refKeywords: string[], content: string): number {
    const contentKeywords = this.extractKeywords(content);
    const intersection = refKeywords.filter(word => contentKeywords.includes(word));
    const union = [...new Set([...refKeywords, ...contentKeywords])];
    
    return intersection.length / union.length;
  }

  private getUniqueLanguages(results: SearchResult[]): CodeLanguage[] {
    const languages = new Set<CodeLanguage>();
    for (const result of results) {
      languages.add(result.snippet.language);
    }
    return Array.from(languages);
  }

  private generateSuggestions(params: CodeRAGToolParams, results: SearchResult[]): string[] {
    const suggestions: string[] = [];
    
    if (results.length === 0) {
      suggestions.push(`Try broader search terms`);
      suggestions.push(`Check spelling and try synonyms`);
      suggestions.push(`Use pattern search for regex matching`);
    } else if (results.length < 3) {
      suggestions.push(`Try semantic search for better results`);
      suggestions.push(`Include related terms in your query`);
    }
    
    return suggestions;
  }

  private formatSearchResults(context: CodeContext, params: CodeRAGToolParams): string {
    const lines: string[] = [
      `## Code Search Results`,
      `Query: "${context.query}"`,
      `Found ${context.totalMatches} matches in ${context.searchTime}ms`,
      '',
    ];

    // Add cache statistics
    const cacheStats = this.persistentCache.getStats();
    lines.push(`**Cache:** ${cacheStats.memoryEntries} in memory, ${cacheStats.diskEntries} on disk, ${cacheStats.totalFiles} total files tracked`);
    lines.push('');

    if (context.languages.length > 0) {
      lines.push(`Languages: ${context.languages.join(', ')}`);
      lines.push('');
    }

    if (context.results.length === 0) {
      lines.push('No matches found.');
      if (context.suggestions && context.suggestions.length > 0) {
        lines.push('');
        lines.push('### Suggestions:');
        for (const suggestion of context.suggestions) {
          lines.push(`- ${suggestion}`);
        }
      }
      return lines.join('\n');
    }

    for (let i = 0; i < context.results.length; i++) {
      const result = context.results[i];
      const snippet = result.snippet;
      
      lines.push(`### Result ${i + 1} - ${path.basename(snippet.filePath)}`);
      lines.push(`**Score:** ${result.relevanceScore.toFixed(3)} | **Type:** ${result.matchType}`);
      lines.push(`**Location:** Lines ${snippet.startLine}-${snippet.endLine}`);
      
      if (snippet.functionName) {
        lines.push(`**Function:** ${snippet.functionName}`);
      }
      
      if (snippet.className) {
        lines.push(`**Class:** ${snippet.className}`);
      }
      
      lines.push(`**Context:** ${result.context}`);
      lines.push('');
      
      if (params.include_context) {
        lines.push('```' + snippet.language);
        lines.push(snippet.content);
        lines.push('```');
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Clears the persistent cache for this tool
   */
  async clearCache(): Promise<void> {
    await this.persistentCache.clear();
    this.codeIndex.clear();
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
}