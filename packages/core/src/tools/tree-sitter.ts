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
import Parser from 'tree-sitter';

// Language imports with fallback handling
let TypeScript: any = null;
let JavaScript: any = null; 
let Python: any = null;

// Dynamic imports to handle optional dependencies
async function loadLanguageGrammars(): Promise<void> {
  try {
    const { typescript } = await import('tree-sitter-typescript');
    TypeScript = typescript;
  } catch {
    // TypeScript grammar not available
  }

  try {
    const jsGrammar = await import('tree-sitter-javascript');
    JavaScript = jsGrammar.default;
  } catch {
    // JavaScript grammar not available
  }

  try {
    const pyGrammar = await import('tree-sitter-python');
    Python = pyGrammar.default;
  } catch {
    // Python grammar not available
  }
}

/**
 * Supported programming languages for AST parsing
 */
export enum SupportedLanguage {
  TYPESCRIPT = 'typescript',
  JAVASCRIPT = 'javascript',
  PYTHON = 'python',
  AUTO = 'auto',
}

/**
 * Types of symbols that can be extracted from AST
 */
export enum SymbolType {
  FUNCTION = 'function',
  CLASS = 'class',
  INTERFACE = 'interface',
  TYPE = 'type',
  VARIABLE = 'variable',
  IMPORT = 'import',
  EXPORT = 'export',
  METHOD = 'method',
  PROPERTY = 'property',
  ENUM = 'enum',
}

/**
 * AST query operations
 */
export enum QueryOperation {
  FIND_SYMBOLS = 'find_symbols',
  FIND_DEFINITIONS = 'find_definitions',
  FIND_REFERENCES = 'find_references',
  GET_STRUCTURE = 'get_structure',
  EXTRACT_IMPORTS = 'extract_imports',
  FIND_FUNCTIONS = 'find_functions',
  FIND_CLASSES = 'find_classes',
}

/**
 * Symbol information extracted from AST
 */
export interface SymbolInfo {
  name: string;
  type: SymbolType;
  startPosition: Position;
  endPosition: Position;
  scope?: string;
  parent?: string;
  signature?: string;
  documentation?: string;
  modifiers?: string[];
  parameters?: ParameterInfo[];
  returnType?: string;
}

/**
 * Position information in source code
 */
export interface Position {
  line: number;
  column: number;
}

/**
 * Parameter information for functions and methods
 */
export interface ParameterInfo {
  name: string;
  type?: string;
  optional?: boolean;
  defaultValue?: string;
}

/**
 * File structure information
 */
export interface FileStructure {
  filePath: string;
  language: SupportedLanguage;
  symbols: SymbolInfo[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  errors: ParseError[];
}

/**
 * Import information
 */
export interface ImportInfo {
  moduleName: string;
  importedSymbols: string[];
  isDefault: boolean;
  alias?: string;
  position: Position;
}

/**
 * Export information
 */
export interface ExportInfo {
  symbolName: string;
  isDefault: boolean;
  type: SymbolType;
  position: Position;
}

/**
 * Parse error information
 */
export interface ParseError {
  message: string;
  position: Position;
  severity: 'error' | 'warning';
}

/**
 * Parameters for the TreeSitter tool
 */
export interface TreeSitterToolParams {
  /**
   * The operation to perform
   */
  operation: QueryOperation;

  /**
   * File path or glob pattern to analyze
   */
  file_path: string;

  /**
   * Programming language (auto-detected if not specified)
   */
  language?: SupportedLanguage;

  /**
   * Symbol types to include in results
   */
  symbol_types?: SymbolType[];

  /**
   * Symbol name to search for (for specific queries)
   */
  symbol_name?: string;

  /**
   * Include detailed symbol information
   */
  include_details?: boolean;

  /**
   * Maximum depth for nested symbols
   */
  max_depth?: number;

  /**
   * Include position information
   */
  include_positions?: boolean;
}

/**
 * Tree-sitter Tool - AST-based code parsing and symbol extraction
 */
export class TreeSitterTool extends BaseTool<TreeSitterToolParams, ToolResult> {
  private readonly config: Config;
  private readonly parsers: Map<SupportedLanguage, Parser> = new Map();
  static readonly Name = 'tree_sitter';

  constructor(config: Config) {
    super(
      TreeSitterTool.Name,
      'Tree-sitter Parser',
      'AST-based code parsing and symbol extraction tool. Provides accurate symbol location, code structure analysis, and semantic understanding for large projects across multiple programming languages.',
      {
        properties: {
          operation: {
            type: Type.STRING,
            description: 'The AST operation to perform',
            enum: Object.values(QueryOperation),
          },
          file_path: {
            type: Type.STRING,
            description: 'File path or glob pattern to analyze',
          },
          language: {
            type: Type.STRING,
            description: 'Programming language (auto-detected if not specified)',
            enum: Object.values(SupportedLanguage),
          },
          symbol_types: {
            type: Type.ARRAY,
            description: 'Symbol types to include in results',
            items: {
              type: Type.STRING,
              enum: Object.values(SymbolType),
            },
          },
          symbol_name: {
            type: Type.STRING,
            description: 'Symbol name to search for (for specific queries)',
          },
          include_details: {
            type: Type.BOOLEAN,
            description: 'Include detailed symbol information',
          },
          max_depth: {
            type: Type.NUMBER,
            description: 'Maximum depth for nested symbols',
          },
          include_positions: {
            type: Type.BOOLEAN,
            description: 'Include position information',
          },
        },
        required: ['operation', 'file_path'],
        type: Type.OBJECT,
      }
    );
    this.config = config;
    // Initialize parsers asynchronously on first use
  }

  private async initializeParsers(): Promise<void> {
    await loadLanguageGrammars();

    if (TypeScript) {
      const tsParser = new Parser();
      tsParser.setLanguage(TypeScript);
      this.parsers.set(SupportedLanguage.TYPESCRIPT, tsParser);
    }

    if (JavaScript) {
      const jsParser = new Parser();
      jsParser.setLanguage(JavaScript);
      this.parsers.set(SupportedLanguage.JAVASCRIPT, jsParser);
    }

    if (Python) {
      const pyParser = new Parser();
      pyParser.setLanguage(Python);
      this.parsers.set(SupportedLanguage.PYTHON, pyParser);
    }
  }

  validateToolParams(params: TreeSitterToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    // Validate file path
    const filePath = path.isAbsolute(params.file_path)
      ? params.file_path
      : path.join(this.config.getTargetDir(), params.file_path);

    if (!fs.existsSync(filePath)) {
      return `File does not exist: ${params.file_path}`;
    }

    // Validate operation-specific parameters
    switch (params.operation) {
      case QueryOperation.FIND_REFERENCES:
      case QueryOperation.FIND_DEFINITIONS:
        if (!params.symbol_name) {
          return `Symbol name is required for ${params.operation} operation`;
        }
        break;
    }

    return null;
  }

  getDescription(params: TreeSitterToolParams): string {
    const operation = params.operation;
    const fileName = path.basename(params.file_path);
    const language = params.language || 'auto-detected';

    switch (operation) {
      case QueryOperation.FIND_SYMBOLS:
        return `Extract all symbols from ${fileName} (${language})`;
      case QueryOperation.FIND_DEFINITIONS:
        return `Find definition of '${params.symbol_name}' in ${fileName}`;
      case QueryOperation.FIND_REFERENCES:
        return `Find references to '${params.symbol_name}' in ${fileName}`;
      case QueryOperation.GET_STRUCTURE:
        return `Get code structure of ${fileName}`;
      case QueryOperation.EXTRACT_IMPORTS:
        return `Extract imports from ${fileName}`;
      case QueryOperation.FIND_FUNCTIONS:
        return `Find all functions in ${fileName}`;
      case QueryOperation.FIND_CLASSES:
        return `Find all classes in ${fileName}`;
      default:
        return `Perform ${operation} on ${fileName}`;
    }
  }

  async execute(params: TreeSitterToolParams): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    try {
      // Initialize parsers if not already done
      if (this.parsers.size === 0) {
        await this.initializeParsers();
      }

      const filePath = path.isAbsolute(params.file_path)
        ? params.file_path
        : path.join(this.config.getTargetDir(), params.file_path);

      const language = params.language || this.detectLanguage(filePath);
      const parser = this.parsers.get(language);

      if (!parser) {
        return {
          llmContent: `Language ${language} is not supported or parser not available`,
          returnDisplay: `Error: Language ${language} not supported`,
        };
      }

      const sourceCode = fs.readFileSync(filePath, 'utf8');
      const tree = parser.parse(sourceCode);

      switch (params.operation) {
        case QueryOperation.FIND_SYMBOLS:
          return this.findSymbols(tree, sourceCode, filePath, params);
        case QueryOperation.FIND_DEFINITIONS:
          return this.findDefinitions(tree, sourceCode, params);
        case QueryOperation.FIND_REFERENCES:
          return this.findReferences(tree, sourceCode, params);
        case QueryOperation.GET_STRUCTURE:
          return this.getStructure(tree, sourceCode, filePath, language);
        case QueryOperation.EXTRACT_IMPORTS:
          return this.extractImports(tree, sourceCode);
        case QueryOperation.FIND_FUNCTIONS:
          return this.findFunctions(tree, sourceCode, params);
        case QueryOperation.FIND_CLASSES:
          return this.findClasses(tree, sourceCode, params);
        default:
          return {
            llmContent: `Operation ${params.operation} not implemented`,
            returnDisplay: `Error: Operation not implemented`,
          };
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Tree-sitter parsing failed: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }

  private detectLanguage(filePath: string): SupportedLanguage {
    const extension = path.extname(filePath).toLowerCase();
    
    switch (extension) {
      case '.ts':
      case '.tsx':
        return SupportedLanguage.TYPESCRIPT;
      case '.js':
      case '.jsx':
      case '.mjs':
        return SupportedLanguage.JAVASCRIPT;
      case '.py':
        return SupportedLanguage.PYTHON;
      default:
        return SupportedLanguage.JAVASCRIPT; // Default fallback
    }
  }

  private findSymbols(tree: Parser.Tree, sourceCode: string, filePath: string, params: TreeSitterToolParams): ToolResult {
    const symbols: SymbolInfo[] = [];
    const lines = sourceCode.split('\n');
    
    const traverse = (node: Parser.SyntaxNode, parent?: string): void => {
      const symbolInfo = this.extractSymbolInfo(node, lines, parent);
      
      if (symbolInfo && this.shouldIncludeSymbol(symbolInfo, params.symbol_types)) {
        symbols.push(symbolInfo);
      }

      for (const child of node.children) {
        traverse(child, symbolInfo?.name || parent);
      }
    };

    traverse(tree.rootNode);

    const result = this.formatSymbolResults(symbols, filePath, params);
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private findDefinitions(tree: Parser.Tree, sourceCode: string, params: TreeSitterToolParams): ToolResult {
    const definitions: SymbolInfo[] = [];
    const lines = sourceCode.split('\n');
    const targetName = params.symbol_name!;

    const traverse = (node: Parser.SyntaxNode): void => {
      if (this.isDefinitionNode(node) && this.getNodeName(node, lines) === targetName) {
        const symbolInfo = this.extractSymbolInfo(node, lines);
        if (symbolInfo) {
          definitions.push(symbolInfo);
        }
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(tree.rootNode);

    const result = definitions.length > 0 
      ? this.formatSymbolResults(definitions, params.file_path, params)
      : `No definitions found for '${targetName}'`;

    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private findReferences(tree: Parser.Tree, sourceCode: string, params: TreeSitterToolParams): ToolResult {
    const references: SymbolInfo[] = [];
    const lines = sourceCode.split('\n');
    const targetName = params.symbol_name!;

    const traverse = (node: Parser.SyntaxNode): void => {
      // Look for identifier nodes that match the target name
      if (node.type === 'identifier' || node.type === 'property_identifier') {
        const nodeName = this.getNodeText(node, lines);
        if (nodeName === targetName) {
          // Check if this is not a definition (basic heuristic)
          const parent = node.parent;
          if (parent && !this.isDefinitionNode(parent)) {
            const symbolInfo = this.extractSymbolInfo(node, lines);
            if (symbolInfo) {
              references.push(symbolInfo);
            }
          }
        }
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(tree.rootNode);

    const result = references.length > 0 
      ? this.formatSymbolResults(references, params.file_path, params)
      : `No references found for '${targetName}'`;

    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private getStructure(tree: Parser.Tree, sourceCode: string, filePath: string, language: SupportedLanguage): ToolResult {
    const structure: FileStructure = {
      filePath,
      language,
      symbols: [],
      imports: [],
      exports: [],
      errors: [],
    };

    const lines = sourceCode.split('\n');

    const traverse = (node: Parser.SyntaxNode): void => {
      const symbolInfo = this.extractSymbolInfo(node, lines);
      if (symbolInfo) {
        structure.symbols.push(symbolInfo);
      }

      // Extract imports and exports
      if (node.type === 'import_statement' || node.type === 'import_declaration') {
        const importInfo = this.extractImportInfo(node, lines);
        if (importInfo) {
          structure.imports.push(importInfo);
        }
      }

      if (node.type === 'export_statement' || node.type === 'export_declaration') {
        const exportInfo = this.extractExportInfo(node, lines);
        if (exportInfo) {
          structure.exports.push(exportInfo);
        }
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(tree.rootNode);

    const result = this.formatStructureResult(structure);
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private extractImports(tree: Parser.Tree, sourceCode: string): ToolResult {
    const imports: ImportInfo[] = [];
    const lines = sourceCode.split('\n');

    const traverse = (node: Parser.SyntaxNode): void => {
      if (node.type === 'import_statement' || node.type === 'import_declaration') {
        const importInfo = this.extractImportInfo(node, lines);
        if (importInfo) {
          imports.push(importInfo);
        }
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(tree.rootNode);

    const result = this.formatImportsResult(imports);
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private findFunctions(tree: Parser.Tree, sourceCode: string, params: TreeSitterToolParams): ToolResult {
    const functions: SymbolInfo[] = [];
    const lines = sourceCode.split('\n');

    const traverse = (node: Parser.SyntaxNode): void => {
      if (this.isFunctionNode(node)) {
        const symbolInfo = this.extractSymbolInfo(node, lines);
        if (symbolInfo) {
          functions.push(symbolInfo);
        }
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(tree.rootNode);

    const result = this.formatSymbolResults(functions, params.file_path, params);
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private findClasses(tree: Parser.Tree, sourceCode: string, params: TreeSitterToolParams): ToolResult {
    const classes: SymbolInfo[] = [];
    const lines = sourceCode.split('\n');

    const traverse = (node: Parser.SyntaxNode): void => {
      if (this.isClassNode(node)) {
        const symbolInfo = this.extractSymbolInfo(node, lines);
        if (symbolInfo) {
          classes.push(symbolInfo);
        }
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(tree.rootNode);

    const result = this.formatSymbolResults(classes, params.file_path, params);
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private extractSymbolInfo(node: Parser.SyntaxNode, lines: string[], parent?: string): SymbolInfo | null {
    const symbolType = this.getSymbolType(node);
    if (!symbolType) return null;

    const name = this.getNodeName(node, lines);
    if (!name) return null;

    const startPos: Position = {
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
    };

    const endPos: Position = {
      line: node.endPosition.row + 1,
      column: node.endPosition.column + 1,
    };

    return {
      name,
      type: symbolType,
      startPosition: startPos,
      endPosition: endPos,
      parent,
      signature: this.getNodeSignature(node, lines),
    };
  }

  private getSymbolType(node: Parser.SyntaxNode): SymbolType | null {
    switch (node.type) {
      case 'function_declaration':
      case 'function_expression':
      case 'arrow_function':
      case 'function_definition':
        return SymbolType.FUNCTION;
      case 'class_declaration':
      case 'class_definition':
        return SymbolType.CLASS;
      case 'interface_declaration':
        return SymbolType.INTERFACE;
      case 'type_alias_declaration':
        return SymbolType.TYPE;
      case 'variable_declaration':
      case 'lexical_declaration':
        return SymbolType.VARIABLE;
      case 'method_definition':
        return SymbolType.METHOD;
      case 'property_definition':
        return SymbolType.PROPERTY;
      case 'enum_declaration':
        return SymbolType.ENUM;
      default:
        return null;
    }
  }

  private getNodeName(node: Parser.SyntaxNode, lines: string[]): string | null {
    // Try to find identifier child
    for (const child of node.children) {
      if (child.type === 'identifier' || child.type === 'property_identifier') {
        return this.getNodeText(child, lines);
      }
    }
    return null;
  }

  private getNodeText(node: Parser.SyntaxNode, lines: string[]): string {
    const startRow = node.startPosition.row;
    const endRow = node.endPosition.row;
    const startCol = node.startPosition.column;
    const endCol = node.endPosition.column;

    if (startRow === endRow) {
      return lines[startRow]?.substring(startCol, endCol) || '';
    }

    let text = lines[startRow]?.substring(startCol) || '';
    for (let i = startRow + 1; i < endRow; i++) {
      text += '\n' + (lines[i] || '');
    }
    text += '\n' + (lines[endRow]?.substring(0, endCol) || '');
    
    return text;
  }

  private getNodeSignature(node: Parser.SyntaxNode, lines: string[]): string {
    // Get first line of the node as signature
    const firstLine = lines[node.startPosition.row] || '';
    const startCol = node.startPosition.column;
    return firstLine.substring(startCol).trim();
  }

  private shouldIncludeSymbol(symbol: SymbolInfo, symbolTypes?: SymbolType[]): boolean {
    if (!symbolTypes || symbolTypes.length === 0) {
      return true;
    }
    return symbolTypes.includes(symbol.type);
  }

  private isDefinitionNode(node: Parser.SyntaxNode): boolean {
    const definitionTypes = [
      'function_declaration',
      'class_declaration',
      'interface_declaration',
      'type_alias_declaration',
      'variable_declaration',
      'lexical_declaration',
    ];
    return definitionTypes.includes(node.type);
  }

  private isFunctionNode(node: Parser.SyntaxNode): boolean {
    const functionTypes = [
      'function_declaration',
      'function_expression',
      'arrow_function',
      'method_definition',
      'function_definition',
    ];
    return functionTypes.includes(node.type);
  }

  private isClassNode(node: Parser.SyntaxNode): boolean {
    const classTypes = [
      'class_declaration',
      'class_definition',
    ];
    return classTypes.includes(node.type);
  }

  private extractImportInfo(node: Parser.SyntaxNode, lines: string[]): ImportInfo | null {
    const text = this.getNodeText(node, lines);
    
    // Match different import patterns
    const fromMatch = text.match(/import\s+(.*?)\s+from\s+['"]([^'"]+)['"]/);
    const requireMatch = text.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    
    if (fromMatch) {
      const [, importClause, moduleName] = fromMatch;
      const symbols: string[] = [];
      let isDefault = false;
      
      // Parse import clause for symbols
      if (importClause.includes('{')) {
        // Named imports: import { a, b, c } from 'module'
        const namedMatch = importClause.match(/\{([^}]+)\}/);
        if (namedMatch) {
          symbols.push(...namedMatch[1].split(',').map(s => s.trim()));
        }
      } else if (importClause.trim() && !importClause.includes('*')) {
        // Default import: import Something from 'module'
        symbols.push(importClause.trim());
        isDefault = true;
      }
      
      return {
        moduleName,
        importedSymbols: symbols,
        isDefault,
        position: {
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
        },
      };
    }
    
    if (requireMatch) {
      return {
        moduleName: requireMatch[1],
        importedSymbols: [],
        isDefault: false,
        position: {
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
        },
      };
    }
    
    return null;
  }

  private extractExportInfo(node: Parser.SyntaxNode, lines: string[]): ExportInfo | null {
    const text = this.getNodeText(node, lines);
    
    // Check for different export patterns
    if (text.includes('export default')) {
      const name = this.getNodeName(node, lines) || 'default';
      return {
        symbolName: name,
        isDefault: true,
        type: this.getSymbolType(node) || SymbolType.EXPORT,
        position: {
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
        },
      };
    }
    
    if (text.startsWith('export')) {
      const name = this.getNodeName(node, lines);
      if (name) {
        return {
          symbolName: name,
          isDefault: false,
          type: this.getSymbolType(node) || SymbolType.EXPORT,
          position: {
            line: node.startPosition.row + 1,
            column: node.startPosition.column + 1,
          },
        };
      }
    }
    
    return null;
  }

  private formatSymbolResults(symbols: SymbolInfo[], filePath: string, params: TreeSitterToolParams): string {
    if (symbols.length === 0) {
      return `No symbols found in ${path.basename(filePath)}`;
    }

    const lines: string[] = [
      `## Symbols in ${path.basename(filePath)}`,
      `Found ${symbols.length} symbols:`,
      '',
    ];

    for (const symbol of symbols) {
      lines.push(`**${symbol.name}** (${symbol.type})`);
      
      if (params.include_positions) {
        lines.push(`  - Location: Line ${symbol.startPosition.line}, Column ${symbol.startPosition.column}`);
      }
      
      if (params.include_details && symbol.signature) {
        lines.push(`  - Signature: \`${symbol.signature}\``);
      }
      
      if (symbol.parent) {
        lines.push(`  - Parent: ${symbol.parent}`);
      }
      
      lines.push('');
    }

    return lines.join('\n');
  }

  private formatStructureResult(structure: FileStructure): string {
    const lines: string[] = [
      `## Code Structure: ${path.basename(structure.filePath)}`,
      `Language: ${structure.language}`,
      '',
    ];

    if (structure.imports.length > 0) {
      lines.push(`### Imports (${structure.imports.length})`);
      for (const imp of structure.imports) {
        lines.push(`- ${imp.moduleName}`);
      }
      lines.push('');
    }

    if (structure.symbols.length > 0) {
      lines.push(`### Symbols (${structure.symbols.length})`);
      const symbolsByType = this.groupSymbolsByType(structure.symbols);
      
      for (const [type, symbols] of symbolsByType) {
        lines.push(`#### ${type}s`);
        for (const symbol of symbols) {
          lines.push(`- ${symbol.name} (Line ${symbol.startPosition.line})`);
        }
        lines.push('');
      }
    }

    if (structure.exports.length > 0) {
      lines.push(`### Exports (${structure.exports.length})`);
      for (const exp of structure.exports) {
        lines.push(`- ${exp.symbolName} (${exp.type})`);
      }
    }

    return lines.join('\n');
  }

  private formatImportsResult(imports: ImportInfo[]): string {
    if (imports.length === 0) {
      return 'No imports found';
    }

    const lines: string[] = [
      `## Imports (${imports.length})`,
      '',
    ];

    for (const imp of imports) {
      lines.push(`**${imp.moduleName}**`);
      lines.push(`  - Line: ${imp.position.line}`);
      if (imp.alias) {
        lines.push(`  - Alias: ${imp.alias}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private groupSymbolsByType(symbols: SymbolInfo[]): Map<string, SymbolInfo[]> {
    const groups = new Map<string, SymbolInfo[]>();
    
    for (const symbol of symbols) {
      const type = symbol.type;
      if (!groups.has(type)) {
        groups.set(type, []);
      }
      groups.get(type)!.push(symbol);
    }
    
    return groups;
  }
}