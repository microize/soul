# Soul CLI Core: Advanced Tools API

The Soul CLI core (`packages/core`) features an enterprise-grade system for defining, registering, and executing 26+ specialized tools. These advanced tools enable autonomous agents, code intelligence, mathematical design optimization, and sophisticated workflow automation beyond traditional text generation.

## Core Concepts

- **Tool (`tools.ts`):** An interface and base class (`BaseTool`) that defines the contract for all tools. Each tool must have:
  - `name`: A unique internal name (used in API calls to Gemini).
  - `displayName`: A user-friendly name.
  - `description`: A clear explanation of what the tool does, which is provided to the Gemini model.
  - `parameterSchema`: A JSON schema defining the parameters the tool accepts. This is crucial for the Gemini model to understand how to call the tool correctly.
  - `validateToolParams()`: A method to validate incoming parameters.
  - `getDescription()`: A method to provide a human-readable description of what the tool will do with specific parameters before execution.
  - `shouldConfirmExecute()`: A method to determine if user confirmation is required before execution (e.g., for potentially destructive operations).
  - `execute()`: The core method that performs the tool's action and returns a `ToolResult`.

- **`ToolResult` (`tools.ts`):** An interface defining the structure of a tool's execution outcome:
  - `llmContent`: The factual string content to be included in the history sent back to the LLM for context.
  - `returnDisplay`: A user-friendly string (often Markdown) or a special object (like `FileDiff`) for display in the CLI.

- **Tool Registry (`tool-registry.ts`):** A class (`ToolRegistry`) responsible for:
  - **Registering Tools:** Holding a collection of all available built-in tools (e.g., `ReadFileTool`, `ShellTool`).
  - **Discovering Tools:** It can also discover tools dynamically:
    - **Command-based Discovery:** If `toolDiscoveryCommand` is configured in settings, this command is executed. It's expected to output JSON describing custom tools, which are then registered as `DiscoveredTool` instances.
    - **MCP-based Discovery:** If `mcpServerCommand` is configured, the registry can connect to a Model Context Protocol (MCP) server to list and register tools (`DiscoveredMCPTool`).
  - **Providing Schemas:** Exposing the `FunctionDeclaration` schemas of all registered tools to the Gemini model, so it knows what tools are available and how to use them.
  - **Retrieving Tools:** Allowing the core to get a specific tool by name for execution.

## Enterprise Tool Suite

Soul CLI includes 26+ specialized tools organized into enterprise categories:

### Code Intelligence Tools
- **TreeSitterTool** (`tree-sitter.ts`): AST-based code parsing and symbol extraction for multiple languages
- **CodeRAGTool** (`code-rag.ts`): Semantic code search with natural language queries and persistent caching
- **RepoMapTool** (`repo-map.ts`): Automated repository analysis with architecture pattern detection
- **CodeAnalysisTool** (`code-analysis.ts`): Deep code quality assessment with security and performance insights

### Autonomous Execution Tools
- **TaskTool** (`task.ts`): Deploys separate agent processes with full tool access for complex operations
- **TaskAgent** (`task-agent.ts`): Agent process implementation with isolated tool execution
- **PlanModeTool** (`plan-mode.ts`): Structured thinking phases for complex problem-solving
- **MultiEditTool** (`multi-edit.ts`): Atomic batch operations across multiple files with rollback

### Development Workflow Tools
- **GitOperationsTool** (`git-operations.ts`): Comprehensive Git workflow management with conflict detection
- **TestGenerationTool** (`test-generation.ts`): Automated test creation for multiple frameworks
- **NotebookEditTool** (`notebook-edit.ts`): Full Jupyter notebook editing capabilities
- **TodoWriteTool** (`todo-write.ts`) & **TodoReadTool** (`todo-read.ts`): Advanced task tracking with persistence

### Design & UX Tools
- **UIDesignMasterTool** (`ui-design-master.ts`): Mathematical design optimization using golden ratio principles
- **BehavioralScienceAnalyzerTool** (`behavioral-science-analyzer.ts`): UX optimization with psychological frameworks

### Research & Intelligence Tools
- **TechnicalResearchAdvisorTool** (`technical-research-advisor.ts`): Multi-source research across academic and industry sources

### Enhanced File System Tools
- **LSTool** (`ls.ts`): Directory listing with intelligent filtering
- **ReadFileTool** (`read-file.ts`): File reading with caching and change detection
- **WriteFileTool** (`write-file.ts`): File writing with transaction support
- **GrepTool** (`grep.ts`): Pattern searching with semantic understanding
- **GlobTool** (`glob.ts`): File pattern matching with performance optimization
- **EditTool** (`edit.ts`): In-place modifications with rollback capability
- **ReadManyFilesTool** (`read-many-files.ts`): Multi-file operations with caching

### Execution & Web Tools
- **ShellTool** (`shell.ts`): Shell command execution with enhanced security
- **WebFetchTool** (`web-fetch.ts`): Advanced web content retrieval with AI processing
- **WebSearchTool** (`web-search.ts`): Intelligent web search with result synthesis
- **MemoryTool** (`memoryTool.ts`): Cross-session information persistence

Each of these tools extends `BaseTool` and implements the required methods for its specific functionality.

## Tool Execution Flow

1.  **Model Request:** The Gemini model, based on the user's prompt and the provided tool schemas, decides to use a tool and returns a `FunctionCall` part in its response, specifying the tool name and arguments.
2.  **Core Receives Request:** The core parses this `FunctionCall`.
3.  **Tool Retrieval:** It looks up the requested tool in the `ToolRegistry`.
4.  **Parameter Validation:** The tool's `validateToolParams()` method is called.
5.  **Confirmation (if needed):**
    - The tool's `shouldConfirmExecute()` method is called.
    - If it returns details for confirmation, the core communicates this back to the CLI, which prompts the user.
    - The user's decision (e.g., proceed, cancel) is sent back to the core.
6.  **Execution:** If validated and confirmed (or if no confirmation is needed), the core calls the tool's `execute()` method with the provided arguments and an `AbortSignal` (for potential cancellation).
7.  **Result Processing:** The `ToolResult` from `execute()` is received by the core.
8.  **Response to Model:** The `llmContent` from the `ToolResult` is packaged as a `FunctionResponse` and sent back to the Gemini model so it can continue generating a user-facing response.
9.  **Display to User:** The `returnDisplay` from the `ToolResult` is sent to the CLI to show the user what the tool did.

## Extending with Custom Tools

While direct programmatic registration of new tools by users isn't explicitly detailed as a primary workflow in the provided files for typical end-users, the architecture supports extension through:

- **Command-based Discovery:** Advanced users or project administrators can define a `toolDiscoveryCommand` in `settings.json`. This command, when run by the Soul CLI core, should output a JSON array of `FunctionDeclaration` objects. The core will then make these available as `DiscoveredTool` instances. The corresponding `toolCallCommand` would then be responsible for actually executing these custom tools.
- **MCP Server(s):** For more complex scenarios, one or more MCP servers can be set up and configured via the `mcpServers` setting in `settings.json`. The Soul CLI core can then discover and use tools exposed by these servers. As mentioned, if you have multiple MCP servers, the tool names will be prefixed with the server name from your configuration (e.g., `serverAlias__actualToolName`).

This enterprise tool system provides sophisticated capabilities for autonomous agents, code intelligence, and mathematical design optimization, making Soul CLI an advanced enterprise development platform.
