# Soul CLI tools

Soul CLI includes 26+ enterprise-grade tools that the AI model uses to interact with your local environment, perform advanced code analysis, and execute autonomous tasks. These tools enable enterprise-level capabilities including AST-based parsing, semantic search, mathematical design optimization, and autonomous agents.

## Overview of Soul CLI tools

In the context of Soul CLI, tools are sophisticated functions that enable enterprise-grade capabilities. For example, if you ask Soul to "Analyze this codebase architecture," it will use the repository map tool combined with TreeSitter AST parsing and semantic search to provide comprehensive analysis.

The core component (`packages/core`) manages these advanced tools, presents their schemas to the AI model, and orchestrates complex multi-tool workflows for autonomous task execution.

These advanced tools provide enterprise-grade capabilities:

- **Code Intelligence:** AST-based parsing, semantic search, repository mapping, and automated code analysis
- **Autonomous Execution:** Deploy separate agent processes for complex multi-step operations with full tool access
- **Mathematical Design:** Apply golden ratio principles and behavioral science for optimal UX design
- **Advanced Analytics:** Deep code quality assessment, security analysis, and performance optimization
- **Multi-File Operations:** Atomic batch editing with conflict detection, rollback, and transaction management
- **Persistent Intelligence:** Caching systems providing 10x+ performance improvements with change detection
- **Research Capabilities:** Multi-source research across GitHub, arXiv, Semantic Scholar, and Stack Overflow
- **Enterprise Workflows:** Git operations, test generation, notebook editing, and comprehensive project management

## How to use Soul CLI tools

To leverage Soul CLI's advanced tools, provide natural language prompts describing complex tasks. The process involves sophisticated orchestration:

1.  You provide a high-level prompt to Soul CLI (e.g., "Optimize this codebase architecture")
2.  The CLI sends the prompt to the core with access to all 26+ enterprise tools
3.  The core sends tool schemas to the AI model, enabling intelligent tool selection and orchestration
4.  The AI model creates execution plans, potentially using multiple tools in sequence (repository mapping, AST parsing, semantic search, code analysis)
5.  The core validates and executes tools, with autonomous agents handling complex multi-step operations
6.  Advanced tools coordinate through persistent caching and intelligent change detection
7.  Results are synthesized into comprehensive reports with actionable insights

Soul CLI provides real-time feedback for tool execution, progress tracking for autonomous agents, and detailed reporting for complex analyses.

## Security and confirmation

Many tools, especially those that can modify your file system or execute commands (`write_file`, `edit`, `run_shell_command`), are designed with safety in mind. The Soul CLI will typically:

- **Require confirmation:** Prompt you before executing potentially sensitive operations, showing you what action is about to be taken.
- **Utilize sandboxing:** All tools are subject to restrictions enforced by sandboxing (see [Sandboxing in the Soul CLI](../sandbox.md)). This means that when operating in a sandbox, any tools (including MCP servers) you wish to use must be available _inside_ the sandbox environment. For example, to run an MCP server through `npx`, the `npx` executable must be installed within the sandbox's Docker image or be available in the `sandbox-exec` environment.

It's important to always review confirmation prompts carefully before allowing a tool to proceed.

## Learn more about Soul CLI's enterprise tools

Soul CLI's 26+ enterprise tools are organized into specialized categories:

### Code Intelligence Tools
- **TreeSitter Parser** (`tree_sitter`): AST-based code parsing and symbol extraction for TypeScript, JavaScript, Python
- **Code RAG Search** (`code_rag`): Semantic code search with natural language queries and persistent caching
- **Repository Map** (`repo_map`): Automated codebase analysis with architecture pattern detection
- **Code Analysis** (`code_analysis`): Deep quality assessment with security, performance, and maintainability insights

### Development Workflow Tools
- **Multi Edit** (`multi_edit`): Atomic batch operations across multiple files with conflict detection and rollback
- **Git Operations** (`git_ops`): Comprehensive Git workflow management with intelligent conflict detection
- **Test Generation** (`test_generator`): Automated test creation for Jest, Vitest, Cypress, Playwright, and more
- **Notebook Edit** (`notebook_edit`): Full Jupyter notebook editing with cell operations and metadata management

### Autonomous Execution Tools
- **Task Agent** (`task`): Deploy separate agent processes with full tool access for complex multi-step operations
- **Plan Mode** (`plan_mode`): Structured thinking and ideation phases for complex problem-solving
- **Todo Management** (`todo_write`, `todo_read`): Advanced task tracking with persistent storage and progress monitoring

### Design & UX Tools
- **UI Design Master** (`ui_design_master`): Mathematical design optimization using golden ratio principles and minimalist aesthetics
- **Behavioral Science Analyzer** (`behavioral_science_analyzer`): UX optimization using psychological frameworks and behavioral modeling

### Research & Intelligence Tools
- **Technical Research Advisor** (`technical_research_advisor`): Multi-source research across GitHub, arXiv, Semantic Scholar, Stack Overflow
- **[File System Tools](./file-system.md):** Enhanced file operations with intelligent caching and change detection
- **[Web Fetch Tool](./web-fetch.md) (`web_fetch`):** Advanced web content retrieval with AI processing
- **[Web Search Tool](./web-search.md) (`web_search`):** Intelligent web search with result synthesis
- **[Memory Tool](./memory.md) (`save_memory`):** Cross-session information persistence with intelligent retrieval

Additionally, these tools incorporate:

- **[MCP servers](./mcp-server.md)**: MCP servers act as a bridge between the Gemini model and your local environment or other services like APIs.
- **[Sandboxing](../sandbox.md)**: Sandboxing isolates the model and its changes from your environment to reduce potential risk.
