# Soul CLI

[![Soul CLI CI](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml)

![Soul CLI Screenshot](./docs/assets/gemini-screenshot.png)

Soul CLI is an enterprise-grade AI coding workflow tool that builds on Google's open-source Gemini CLI. This advanced command-line AI workflow tool connects to your tools, understands your code, and accelerates your workflows with powerful autonomous capabilities.

With Soul CLI you can:

- **Advanced Code Intelligence**: Query and edit large codebases with AST-based parsing, semantic search, and persistent caching
- **Autonomous Task Execution**: Deploy separate agent processes with full tool access for complex multi-step operations
- **Mathematical Design Excellence**: Create beautiful interfaces using golden ratio principles and minimalist design guidelines
- **Comprehensive Code Analysis**: Deep code quality assessment, security analysis, and automated test generation
- **Multi-File Operations**: Atomic batch editing across multiple files with conflict detection and rollback capability
- **Behavioral Science Integration**: User experience optimization using psychological frameworks and behavioral modeling
- **Expert Technical Research**: Multi-source research combining GitHub, arXiv, Semantic Scholar, and Stack Overflow
- **Repository Intelligence**: Automatic codebase mapping with TreeSitter AST analysis and change detection
- **Persistent Caching**: 10x+ performance improvements through intelligent file-based caching with change detection
- Use tools and MCP servers to connect new capabilities, including [media generation with Imagen,
  Veo or Lyria](https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/tree/main/experiments/mcp-genmedia)
- Ground your queries with the [Google Search](https://ai.google.dev/gemini-api/docs/grounding)
  tool, built in to Gemini.

## Quickstart

1. **Prerequisites:** Ensure you have [Node.js version 20](https://nodejs.org/en/download) or higher installed.
2. **Run Soul CLI:** Execute the following command in your terminal:

   ```bash
   npx https://github.com/google-gemini/gemini-cli
   ```

   Or install it with:

   ```bash
   npm install -g @google/gemini-cli
   soul
   ```

3. **Pick a color theme**
4. **Authenticate:** When prompted, sign in with your personal Google account. This will grant you up to 60 model requests per minute and 1,000 model requests per day using Gemini.

You are now ready to use Soul CLI with its advanced enterprise features!

### Use a Gemini API key:

The Gemini API provides a free tier with [100 requests per day](https://ai.google.dev/gemini-api/docs/rate-limits#free-tier) using Gemini 2.5 Pro, control over which model you use, and access to higher rate limits (with a paid plan):

1. Generate a key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Set it as an environment variable in your terminal. Replace `YOUR_API_KEY` with your generated key.

   ```bash
   export GEMINI_API_KEY="YOUR_API_KEY"
   ```

3. (Optionally) Upgrade your Gemini API project to a paid plan on the API key page (will automatically unlock [Tier 1 rate limits](https://ai.google.dev/gemini-api/docs/rate-limits#tier-1))

### Use a Vertex AI API key:

The Vertex AI provides [free tier](https://cloud.google.com/vertex-ai/generative-ai/docs/start/express-mode/overview) using express mode for Gemini 2.5 Pro, control over which model you use, and access to higher rate limits with a billing account:

1. Generate a key from [Google Cloud](https://cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys).
2. Set it as an environment variable in your terminal. Replace `YOUR_API_KEY` with your generated key and set GOOGLE_GENAI_USE_VERTEXAI to true

   ```bash
   export GOOGLE_API_KEY="YOUR_API_KEY"
   export GOOGLE_GENAI_USE_VERTEXAI=true
   ```

3. (Optionally) Add a billing account on your project to get access to [higher usage limits](https://cloud.google.com/vertex-ai/generative-ai/docs/quotas)

For other authentication methods, including Google Workspace accounts, see the [authentication](./docs/cli/authentication.md) guide.

## Examples

Once Soul CLI is running, you can start leveraging its advanced capabilities from your shell.

**Enterprise-grade code analysis:**

```sh
cd your-project/
soul
> Analyze this codebase architecture and suggest performance improvements using the code analysis tool
```

**Autonomous task execution:**

```sh
cd complex-project/
soul
> Use the task agent to refactor this entire module to use TypeScript strict mode, run tests, and fix any issues
```

**Mathematical design optimization:**

```sh
cd frontend-project/
soul
> Apply golden ratio principles to optimize the visual hierarchy of our dashboard components
```

**Advanced repository intelligence:**

```sh
git clone https://github.com/your-org/large-codebase
cd large-codebase
soul
> Map this repository structure and identify the main architectural patterns with semantic analysis
```

## Advanced Features

Soul CLI includes 26+ specialized tools for enterprise development workflows:

### Code Intelligence Tools
- **TreeSitter Parser**: AST-based code parsing and symbol extraction
- **Code RAG Search**: Semantic code search with persistent caching  
- **Repository Map**: Automated codebase analysis and architecture detection
- **Code Analysis**: Deep quality assessment with security and performance insights

### Development Workflow Tools
- **Multi Edit**: Atomic batch operations across multiple files with rollback
- **Git Operations**: Comprehensive Git workflow management with conflict detection
- **Test Generation**: Automated test creation for multiple frameworks
- **Task Agent**: Autonomous processes for complex multi-step operations

### Design & UX Tools
- **UI Design Master**: Mathematical design optimization using golden ratio principles
- **Behavioral Science Analyzer**: UX optimization with psychological frameworks

### Research & Planning Tools
- **Technical Research Advisor**: Multi-source research across GitHub, arXiv, Semantic Scholar
- **Plan Mode**: Structured thinking and ideation without making edits
- **Todo Management**: Advanced task tracking with persistent storage

### Performance & Intelligence
- **Persistent Caching**: 10x+ performance improvements with intelligent change detection
- **Notebook Operations**: Full Jupyter notebook editing capabilities
- **Memory Management**: Cross-session information persistence

### Next steps

- Learn how to [contribute to or build from the source](./CONTRIBUTING.md).
- Explore the available **[CLI Commands](./docs/cli/commands.md)**.
- If you encounter any issues, review the **[Troubleshooting guide](./docs/troubleshooting.md)**.
- For more comprehensive documentation, see the [full documentation](./docs/index.md).
- Take a look at some [popular tasks](#popular-tasks) for more inspiration.

### Troubleshooting

Head over to the [troubleshooting](docs/troubleshooting.md) guide if you're
having issues.

## Popular tasks

### Enterprise Code Intelligence

Start by `cd`ing into an existing or newly-cloned repository and running `soul`.

```text
> Use the repository map tool to analyze this codebase architecture and identify key patterns.
```

```text
> Perform a comprehensive security analysis using the code analysis tool and identify vulnerabilities.
```

```text
> Use semantic search to find all authentication-related code across this large codebase.
```

### Advanced Development Workflows

```text
> Use the task agent to implement GitHub issue #123 with full testing and documentation.
```

```text
> Create a migration plan using plan mode, then use multi-edit to update all files atomically.
```

```text
> Generate comprehensive test suites for this module using the test generation tool.
```

### Mathematical Design Optimization

```text
> Apply golden ratio principles to optimize the visual hierarchy of this dashboard.
```

```text
> Analyze the current design using behavioral science principles and suggest UX improvements.
```

### Autonomous System Operations

Use the task agent for complex multi-step operations:

```text
> Use the task agent to refactor this entire module, run tests, fix issues, and commit changes.
```

```text
> Research best practices for React performance optimization across multiple sources.
```

### Enterprise Data Analysis

```text
> Use behavioral science analysis to optimize our user onboarding flow.
```

```text
> Research and implement advanced caching strategies using the technical research advisor.
```

### Uninstall

Head over to the [Uninstall](docs/Uninstall.md) guide for uninstallation instructions.

## Terms of Service and Privacy Notice

For details on the terms of service and privacy notice applicable to your use of Gemini CLI, see the [Terms of Service and Privacy Notice](./docs/tos-privacy.md).
