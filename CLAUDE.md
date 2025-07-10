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

## Tools Summary
- **Total Tools**: 17 (increased from 11)
- **New Tools Added**: 6 (NotebookEdit, PlanMode, TodoWrite, GitOperations, CodeAnalysis, TestGeneration)
- **Phase 1 Complete**: High-priority development tools implemented
- **System Impact**: Significant enhancement to developer productivity and code quality workflows

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
- **Phase 2 Tools**: Database operations, API testing, documentation generation
- **Framework Support**: Additional testing frameworks and languages
- **Enhanced Analysis**: More sophisticated code analysis patterns
- **Workflow Integration**: Better integration with CI/CD pipelines