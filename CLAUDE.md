Soul CLI is an enterprise-grade AI coding workflow tool that builds on Google’s open-source Gemini CLI. 

DONT ADD EMOJIS.

## Key Learning

### Tool Implementation
- Tools are implemented in `/packages/core/src/tools/` as TypeScript classes extending `BaseTool`
- Each tool follows a consistent pattern with validation, confirmation, and execution methods
- Tools use `@google/genai` FunctionDeclaration schema format for parameter validation
- The NotebookEditTool has been implemented for editing Jupyter notebooks (.ipynb files)

### Notebook Edit Tool
- **Location**: `/packages/core/src/tools/notebook-edit.ts`
- **Operations**: Replace, insert, delete cells in Jupyter notebooks
- **Security**: Path validation, root directory bounds checking
- **Features**: Diff-based confirmation, telemetry tracking, comprehensive error handling
- **Registration**: Successfully registered in `/packages/core/src/config/config.ts`
- **Status**: ✅ Available in tool registry as `notebook_edit`

### Todo Write Tool
- **Location**: `/packages/core/src/tools/todo-write.ts`
- **Purpose**: Updates todo list with enhanced output format including checkbox states
- **Features**: JSON file storage, timestamp tracking, status summaries
- **Output**: Returns both user-friendly display and structured todo array with checkbox flags
- **Storage**: Saves todos to `.claude-todos.json` in target directory
- **Registration**: Successfully registered in `/packages/core/src/config/config.ts`
- **Status**: ✅ Available in tool registry as `todo_write`

### Plan Mode Tool
- **Location**: `/packages/core/src/tools/plan-mode.ts`
- **Purpose**: Enables thinking and ideation without making edits, supports read-only exploration
- **Features**: Structured planning sessions with findings, insights, and next steps
- **Phases**: Understanding, Exploration, Analysis, Strategy, Finalization
- **Plan Types**: Analysis, Feature Design, Bug Investigation, Refactoring, Architecture, Optimization, Testing
- **Output**: Markdown report with findings grouped by type, next steps with effort estimation
- **Types**: Comprehensive type definitions in `plan-mode-types.ts`
- **Registration**: Successfully registered in `/packages/core/src/config/config.ts`
- **Status**: ✅ Available in tool registry as `plan_mode`

### Multi Edit Tool
- **Location**: `/packages/core/src/tools/multi-edit.ts`
- **Purpose**: Batch editing operations across multiple files with atomic transaction support
- **Operations**: Multiple text replacements, file creation, cross-file edits with conflict detection
- **Features**: Atomic operations, rollback capability, consolidated diff preview, progress tracking
- **Conflict Detection**: Overlapping edits, multiple file creation, mixed operation prevention
- **Transaction Management**: Backup/restore system for atomic operations with intelligent rollback
- **Security**: Path validation, root directory bounds checking, comprehensive error handling
- **Output**: Structured results with success/failure counts, detailed edit outcomes, conflict reports
- **Testing**: Complete unit test suite with 26 tests covering all scenarios
- **Registration**: Successfully registered in `/packages/core/src/config/config.ts`
- **Status**: ✅ Available in tool registry as `multi_edit`

### Task Tool  
- **Location**: `/packages/core/src/tools/task.ts`
- **Purpose**: Creates separate agent processes with full tool access for complex autonomous task execution
- **Operations**: Agent spawning, tool registry isolation, bidirectional communication, resource management
- **Features**: Configurable timeouts, tool filtering, working directory isolation, progress tracking
- **Agent Architecture**: Separate Node.js process with isolated Soul CLI environment and complete tool access
- **Communication**: JSON-based stdin/stdout protocol with structured message types (command, progress, result, error, completion)
- **Resource Control**: Timeout handling (10min default, 30min max), iteration limits (50 default, 200 max), memory constraints
- **Security**: Path validation, tool allowlist/blocklist, confirmation dialogs, graceful process termination
- **Agent Implementation**: `/packages/core/src/tools/task-agent.ts` with config initialization and tool execution
- **Registration**: Successfully registered in `/packages/core/src/config/config.ts`
- **Status**: ✅ Available in tool registry as `task`

## New Phase 1 Tools (High Priority)

### Git Operations Tool
- **Location**: `/packages/core/src/tools/git-operations.ts`
- **Purpose**: Comprehensive Git repository management with intelligent workflow assistance
- **Operations**: Status, branch management, commits, push/pull, merge, stash, reset, revert, cherry-pick
- **Features**: Conflict detection, branch analysis, commit history, remote management, blame analysis
- **Security**: Confirmation required for destructive operations, path validation
- **Registration**: Successfully registered in `/packages/core/src/config/config.ts`
- **Status**: ✅ Available in tool registry as `git_ops`

### Code Analysis Tool
- **Location**: `/packages/core/src/tools/code-analysis.ts`
- **Purpose**: Deep code analysis and quality assessment for multiple programming languages
- **Analysis Types**: Complexity, security, performance, maintainability, dependencies, code smells, metrics, duplicates, documentation, types
- **Languages**: TypeScript, JavaScript, Python, Java, C++, C#, Go, Rust, auto-detection
- **Features**: Severity-based reporting, detailed explanations, improvement suggestions, metrics collection
- **Output**: Structured analysis reports with categorized findings and actionable insights
- **Registration**: Successfully registered in `/packages/core/src/config/config.ts`
- **Status**: ✅ Available in tool registry as `code_analysis`

### Test Generation Tool
- **Location**: `/packages/core/src/tools/test-generation.ts`
- **Purpose**: Automated test creation and management for multiple testing frameworks
- **Test Types**: Unit, integration, E2E, mock, snapshot, performance, security tests
- **Frameworks**: Jest, Vitest, Mocha, Cypress, Playwright, Pytest, JUnit, auto-detection
- **Features**: Test data generation, mock setup, edge case testing, configuration file generation
- **Output**: Complete test files with TODO placeholders, test data, and configuration
- **Registration**: Successfully registered in `/packages/core/src/config/config.ts`
- **Status**: ✅ Available in tool registry as `test_generator`

## New Phase 2 Tools (Advanced Code Intelligence)

### Tree-sitter Parser Tool
- **Location**: `/packages/core/src/tools/tree-sitter.ts`
- **Purpose**: AST-based code parsing and symbol extraction for accurate code analysis
- **Languages**: TypeScript, JavaScript, Python with auto-detection and fallback handling
- **Operations**: Find symbols, definitions, references, code structure, imports, functions, classes
- **Features**: Precise symbol location, scope analysis, hierarchical symbol mapping, position tracking
- **Output**: Detailed symbol information with line/column positions, signatures, and relationships
- **Dependencies**: tree-sitter, tree-sitter-typescript, tree-sitter-javascript, tree-sitter-python
- **Registration**: Successfully registered in `/packages/core/src/config/config.ts`
- **Status**: ✅ Available in tool registry as `tree_sitter`

### Code RAG Search Tool
- **Location**: `/packages/core/src/tools/code-rag.ts`
- **Purpose**: Semantic code search and context retrieval for intelligent code discovery
- **Search Types**: Semantic, keyword, function, class, pattern, similarity, context search
- **Features**: Natural language queries, code indexing, similarity search, context-aware results
- **Languages**: TypeScript, JavaScript, Python, Java, Go, Rust, C++ with auto-detection
- **Output**: Ranked search results with relevance scores, code snippets, and contextual information
- **Caching**: LRU cache for embeddings and incremental index updates
- **Registration**: Successfully registered in `/packages/core/src/config/config.ts`
- **Status**: ✅ Available in tool registry as `code_rag`

## Tools Summary
- **Total Tools**: 21 (increased from 20)
- **Phase 1 Tools Added**: 6 (NotebookEdit, PlanMode, TodoWrite, GitOperations, CodeAnalysis, TestGeneration)
- **Phase 2 Tools Added**: 2 (TreeSitter, CodeRAG)
- **Phase 3 Tools Added**: 2 (MultiEdit, Task)
- **All Phases Complete**: Comprehensive development, code intelligence, batch editing, and autonomous agent tools implemented
- **System Impact**: Major enhancement to developer productivity, code quality, intelligent navigation, efficient multi-file operations, and autonomous task execution

## Development & Testing Instructions

### Build and Test Verification Process
When implementing new tools, always follow this verification sequence:

1. **Full Project Build**: Run `npm run build` to verify compilation
2. **Test Suite**: Run `npm run test:ci` to ensure no regressions
3. **Linting**: Run `npm run lint` to check code quality
4. **Type Checking**: Run `npm run typecheck` to verify TypeScript compliance

### Tool Implementation Best Practices

#### Architecture Pattern
- Extend `BaseTool<TParams, TResult>` from `/packages/core/src/tools/tools.ts`
- Use `@google/genai` Type enum for parameter schema validation
- Implement required methods: `validateToolParams`, `getDescription`, `execute`
- Add optional `shouldConfirmExecute` for destructive operations

#### Code Quality Standards
- **No `any` types**: Use proper TypeScript interfaces and types
- **Unused parameters**: Prefix with `_` (e.g., `_language`, `_abortSignal`)
- **Switch statements**: Always include `default` case
- **Imports**: Remove unused imports to avoid linting errors
- **Error handling**: Use `getErrorMessage` utility for consistent error formatting

#### Tool Registration
- Import tool class in `/packages/core/src/config/config.ts`
- Add `registerCoreTool(ToolClass, this)` call in `createToolRegistry()`
- Ensure tool has static `Name` property for identification

### Testing Guidelines
- **Unit Tests**: Cover all tool methods and edge cases
- **Integration Tests**: Verify tool registration and discovery
- **Security Tests**: Validate path traversal protection and input sanitization
- **Performance Tests**: Ensure tools handle large files and complex operations

### Documentation Requirements
- **JSDoc comments**: Document all public methods and interfaces
- **Type definitions**: Export interfaces for external consumption
- **Usage examples**: Include in tool descriptions and comments
- **Error messages**: Provide clear, actionable error descriptions

### Security Considerations
- **Path validation**: Always validate file paths within project boundaries
- **Input sanitization**: Validate all user inputs before processing
- **Confirmation dialogs**: Require confirmation for destructive operations
- **Permission checks**: Verify file system permissions before operations

### Performance Optimization
- **Lazy loading**: Load dependencies only when needed
- **Async operations**: Use async/await for I/O operations
- **Memory management**: Handle large files efficiently
- **Caching**: Cache results when appropriate

### Common Pitfalls to Avoid
- **Unused imports**: Simple-git StatusResult, BranchSummary, LogResult
- **Missing default cases**: Always add default to switch statements
- **Improper error handling**: Don't ignore caught errors, use `_error` if unused
- **Type issues**: Avoid `any` types, use proper interfaces
- **Path issues**: Use absolute paths, validate boundaries
- **Async issues**: Handle Promise rejections properly

### Integration Verification
After implementing new tools, verify:
- Tool appears in registry via `config.getToolRegistry().getTools()`
- Tool can be instantiated without errors
- Tool validation works correctly
- Tool execution produces expected results
- No TypeScript compilation errors
- No linting violations
- All tests pass

### Future Development Notes
- **Phase 3 Tools**: Database operations, API testing, documentation generation
- **Framework Support**: Additional testing frameworks and languages
- **Enhanced Analysis**: More sophisticated code analysis patterns
- **Workflow Integration**: Better integration with CI/CD pipelines

## Tool Usage Examples

### Tree-sitter Parser Tool Examples
```json
// Find all functions in a file
{
  "operation": "find_functions",
  "file_path": "src/components/UserProfile.tsx",
  "include_details": true,
  "include_positions": true
}

// Get complete code structure
{
  "operation": "get_structure", 
  "file_path": "src/services/authService.ts",
  "language": "typescript"
}

// Find specific symbol definition
{
  "operation": "find_definitions",
  "file_path": "src/utils/helpers.js",
  "symbol_name": "validateEmail"
}
```

### Code RAG Search Tool Examples
```json
// Semantic search for authentication code
{
  "search_type": "semantic",
  "query": "user authentication and login validation",
  "search_path": "src/",
  "max_results": 5,
  "include_context": true
}

// Find functions by name pattern
{
  "search_type": "function",
  "query": "handle",
  "languages": ["typescript", "javascript"],
  "min_score": 0.5
}

// Similarity search based on reference file
{
  "search_type": "similar",
  "query": "find similar components",
  "reference_file": "src/components/Button.tsx",
  "include_related": true
}

// Pattern-based search using regex
{
  "search_type": "pattern", 
  "query": "useEffect\\(.*\\[\\]\\)",
  "search_path": "src/hooks/",
  "max_results": 10
}
```

### Integration with Existing Tools
- **GrepTool**: Text-based search for exact matches
- **TreeSitterTool**: AST-based symbol extraction and analysis  
- **CodeRAGTool**: Semantic search and context retrieval
- **CodeAnalysisTool**: Code quality and complexity analysis
- **GlobTool**: File pattern discovery for large codebases

These tools work together to provide comprehensive code understanding from text search to semantic analysis.