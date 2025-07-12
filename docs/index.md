# Welcome to Soul CLI documentation

This documentation provides a comprehensive guide to installing, using, and developing Soul CLI. This enterprise-grade AI coding workflow tool builds on Google's open-source Gemini CLI with advanced autonomous capabilities, code intelligence, and mathematical design optimization.

## Overview

Soul CLI brings enterprise-grade AI capabilities to your terminal with advanced autonomous features. Soul CLI consists of a client-side application (`packages/cli`) that communicates with a local server (`packages/core`), which manages requests to the Gemini API and provides 26+ specialized tools including AST-based parsing, semantic search, autonomous agents, and mathematical design optimization.

## Navigating the documentation

This documentation is organized into the following sections:

- **[Execution and Deployment](./deployment.md):** Information for running Soul CLI.
- **[Architecture Overview](./architecture.md):** Understand the high-level design of Soul CLI, including its components and how they interact.
- **CLI Usage:** Documentation for `packages/cli`.
  - **[CLI Introduction](./cli/index.md):** Overview of the command-line interface.
  - **[Commands](./cli/commands.md):** Description of available CLI commands.
  - **[Configuration](./cli/configuration.md):** Information on configuring the CLI.
  - **[Checkpointing](./checkpointing.md):** Documentation for the checkpointing feature.
  - **[Extensions](./extension.md):** How to extend the CLI with new functionality.
  - **[Telemetry](./telemetry.md):** Overview of telemetry in the CLI.
- **Core Details:** Documentation for `packages/core`.
  - **[Core Introduction](./core/index.md):** Overview of the core component.
  - **[Tools API](./core/tools-api.md):** Information on how the core manages and exposes tools.
- **Enterprise Tools (26+ Available):**
  - **[Tools Overview](./tools/index.md):** Complete overview of Soul CLI's 26+ enterprise tools.
  - **Code Intelligence:** TreeSitter AST parsing, semantic search, repository mapping, code analysis
  - **Autonomous Execution:** Task agents, plan mode, multi-file atomic operations
  - **Design & UX:** Mathematical design optimization, behavioral science analysis
  - **Research & Intelligence:** Technical research advisor, persistent caching, memory management
  - **Enhanced Core Tools:**
    - **[File System Tools](./tools/file-system.md):** Advanced file operations with caching and change detection
    - **[Multi-File Operations](./tools/multi-file.md):** Atomic batch editing with rollback capabilities  
    - **[Shell Tool](./tools/shell.md):** Enhanced shell execution with security and sandboxing
    - **[Web Tools](./tools/web-fetch.md):** Intelligent web content retrieval and search synthesis
    - **[Memory Tool](./tools/memory.md):** Cross-session persistent information management
- **[Contributing & Development Guide](../CONTRIBUTING.md):** Information for contributors and developers, including setup, building, testing, and coding conventions.
- **[NPM Workspaces and Publishing](./npm.md):** Details on how the project's packages are managed and published.
- **[Troubleshooting Guide](./troubleshooting.md):** Find solutions to common problems and FAQs.
- **[Terms of Service and Privacy Notice](./tos-privacy.md):** Information on the terms of service and privacy notices applicable to your use of Soul CLI.

We hope this documentation helps you make the most of Soul CLI's enterprise-grade features!
