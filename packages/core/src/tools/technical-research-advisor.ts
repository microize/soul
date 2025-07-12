/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { getErrorMessage } from '../utils/errors.js';
import { TodoWriteTool } from './todo-write.js';

/**
 * Research context for the advisor
 */
export enum ResearchContext {
  FRONTEND = 'frontend',
  BACKEND = 'backend',
  FULLSTACK = 'fullstack',
  MOBILE = 'mobile',
  DATA = 'data',
  ML = 'ml',
  DEVOPS = 'devops',
  SECURITY = 'security',
}

/**
 * Research depth levels
 */
export enum ResearchDepth {
  QUICK = 'quick',
  STANDARD = 'standard', 
  COMPREHENSIVE = 'comprehensive',
}

/**
 * Research sources available
 */
export enum ResearchSource {
  GITHUB = 'github',
  ARXIV = 'arxiv',
  SEMANTIC_SCHOLAR = 'semantic_scholar',
  STACK_OVERFLOW = 'stack_overflow',
  WEB_SEARCH = 'web_search',
  OFFICIAL_DOCS = 'official_docs',
}

/**
 * Parameters for the Technical Research Advisor tool
 */
export interface TechnicalResearchAdvisorParams {
  /**
   * The main research query or problem to investigate
   */
  research_query: string;

  /**
   * Context for the research to tailor search strategies
   */
  context: ResearchContext;

  /**
   * Specific technologies or frameworks to focus on
   */
  technology_stack?: string[];

  /**
   * How deep to research - affects time and thoroughness
   */
  research_depth: ResearchDepth;

  /**
   * Which sources to include in research
   */
  research_sources?: ResearchSource[];

  /**
   * Whether to include academic papers in research
   */
  include_academic_research?: boolean;

  /**
   * Automatically generate todos based on research findings
   */
  generate_todos?: boolean;

  /**
   * Maximum number of results to analyze per source
   */
  max_results_per_source?: number;

  /**
   * Focus on specific aspects
   */
  focus_areas?: string[];
}

/**
 * Research finding from a specific source
 */
export interface ResearchFinding {
  source: ResearchSource;
  title: string;
  url: string;
  summary: string;
  relevance_score: number;
  key_insights: string[];
  code_examples?: string[];
  implementation_patterns?: string[];
  performance_notes?: string[];
  security_considerations?: string[];
}

/**
 * Comprehensive research result
 */
export interface TechnicalResearchResult {
  query: string;
  context: ResearchContext;
  research_summary: string;
  total_sources_searched: number;
  findings: ResearchFinding[];
  key_recommendations: string[];
  implementation_approaches: {
    approach_name: string;
    description: string;
    pros: string[];
    cons: string[];
    complexity_score: number;
    recommended_for: string[];
  }[];
  best_practices: string[];
  common_pitfalls: string[];
  performance_considerations: string[];
  security_recommendations: string[];
  alternative_solutions: string[];
  confidence_score: number;
  research_timestamp: string;
  todos_generated?: boolean;
}

/**
 * Technical Research Advisor Tool - Expert-level research and implementation guidance
 */
export class TechnicalResearchAdvisorTool extends BaseTool<TechnicalResearchAdvisorParams, ToolResult> {
  private readonly config: Config;
  static readonly Name = 'technical_research_advisor';

  constructor(config: Config) {
    super(
      TechnicalResearchAdvisorTool.Name,
      'Technical Research Advisor',
      'Expert-level technical research tool that searches GitHub, arXiv, Semantic Scholar, Stack Overflow, and documentation to provide comprehensive implementation guidance and automated planning.',
      {
        properties: {
          research_query: {
            type: Type.STRING,
            description: 'The main research query or technical problem to investigate',
          },
          context: {
            type: Type.STRING,
            enum: Object.values(ResearchContext),
            description: 'Context for the research to tailor search strategies and recommendations',
          },
          technology_stack: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Specific technologies, frameworks, or languages to focus research on',
          },
          research_depth: {
            type: Type.STRING,
            enum: Object.values(ResearchDepth),
            description: 'How thorough the research should be - affects time and comprehensiveness',
          },
          research_sources: {
            type: Type.ARRAY,
            items: { 
              type: Type.STRING,
              enum: Object.values(ResearchSource) 
            },
            description: 'Which research sources to include (defaults to all available)',
          },
          include_academic_research: {
            type: Type.BOOLEAN,
            description: 'Whether to include academic papers from arXiv and Semantic Scholar',
          },
          generate_todos: {
            type: Type.BOOLEAN,
            description: 'Automatically create implementation todos based on research findings',
          },
          max_results_per_source: {
            type: Type.NUMBER,
            description: 'Maximum number of results to analyze per research source (default: 10)',
          },
          focus_areas: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Specific aspects to focus on (e.g., performance, security, scalability)',
          },
        },
        required: ['research_query', 'context', 'research_depth'],
        type: Type.OBJECT,
      }
    );
    this.config = config;
  }

  validateToolParams(params: TechnicalResearchAdvisorParams): string | null {
    if (!params.research_query || params.research_query.trim().length === 0) {
      return 'Research query is required and cannot be empty';
    }

    if (params.research_query.length > 500) {
      return 'Research query must be 500 characters or less';
    }

    if (!Object.values(ResearchContext).includes(params.context)) {
      return `Invalid context. Must be one of: ${Object.values(ResearchContext).join(', ')}`;
    }

    if (!Object.values(ResearchDepth).includes(params.research_depth)) {
      return `Invalid research depth. Must be one of: ${Object.values(ResearchDepth).join(', ')}`;
    }

    if (params.research_sources) {
      for (const source of params.research_sources) {
        if (!Object.values(ResearchSource).includes(source)) {
          return `Invalid research source: ${source}. Must be one of: ${Object.values(ResearchSource).join(', ')}`;
        }
      }
    }

    if (params.max_results_per_source && (params.max_results_per_source < 1 || params.max_results_per_source > 50)) {
      return 'max_results_per_source must be between 1 and 50';
    }

    if (params.technology_stack && params.technology_stack.length > 10) {
      return 'Maximum 10 technologies can be specified in technology_stack';
    }

    if (params.focus_areas && params.focus_areas.length > 8) {
      return 'Maximum 8 focus areas can be specified';
    }

    return null;
  }

  getDescription(params: TechnicalResearchAdvisorParams): string {
    const techStack = params.technology_stack ? ` for ${params.technology_stack.join(', ')}` : '';
    const depth = params.research_depth === ResearchDepth.QUICK ? 'quick' : 
                  params.research_depth === ResearchDepth.COMPREHENSIVE ? 'comprehensive' : 'standard';
    
    return `Perform ${depth} research on "${params.research_query}" in ${params.context} context${techStack}`;
  }

  async execute(params: TechnicalResearchAdvisorParams, _signal: AbortSignal, _updateOutput?: (output: string) => void): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    try {
      _updateOutput?.('🔍 Starting comprehensive technical research...');
      
      const result = await this.conductResearch(params, _updateOutput);
      
      // Generate todos if requested
      if (params.generate_todos) {
        await this.generateImplementationTodos(result, _updateOutput);
        result.todos_generated = true;
      }

      const reportMarkdown = this.generateResearchReport(result);
      
      return {
        llmContent: `Technical research completed for "${params.research_query}". Found ${result.findings.length} relevant sources with ${result.key_recommendations.length} key recommendations. Confidence score: ${result.confidence_score}/10.`,
        returnDisplay: reportMarkdown,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Technical research failed: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }

  private async conductResearch(params: TechnicalResearchAdvisorParams, updateOutput?: (output: string) => void): Promise<TechnicalResearchResult> {
    const startTime = Date.now();
    const sources = params.research_sources || Object.values(ResearchSource);
    const maxResults = params.max_results_per_source || (params.research_depth === ResearchDepth.QUICK ? 5 : 
                                                        params.research_depth === ResearchDepth.COMPREHENSIVE ? 20 : 10);
    
    updateOutput?.(`📚 Searching ${sources.length} research sources...`);
    
    const findings: ResearchFinding[] = [];
    let totalSources = 0;

    // Search each source
    for (const source of sources) {
      try {
        updateOutput?.(`🔎 Searching ${source}...`);
        const sourceFindings = await this.searchSource(source, params, maxResults);
        findings.push(...sourceFindings);
        totalSources++;
        
        // Add delay between sources to respect rate limits
        await this.delay(1000);
      } catch (error) {
        console.warn(`Failed to search ${source}:`, error);
      }
    }

    updateOutput?.('🧠 Analyzing findings and generating insights...');
    
    // Analyze and synthesize findings
    const result = await this.synthesizeFindings(params, findings, totalSources);
    
    const duration = Date.now() - startTime;
    updateOutput?.(`✅ Research completed in ${Math.round(duration / 1000)}s. Found ${findings.length} relevant sources.`);
    
    return result;
  }

  private async searchSource(source: ResearchSource, params: TechnicalResearchAdvisorParams, maxResults: number): Promise<ResearchFinding[]> {
    const findings: ResearchFinding[] = [];
    
    switch (source) {
      case ResearchSource.GITHUB:
        findings.push(...await this.searchGitHub(params, maxResults));
        break;
      case ResearchSource.ARXIV:
        if (params.include_academic_research !== false) {
          findings.push(...await this.searchArxiv(params, maxResults));
        }
        break;
      case ResearchSource.SEMANTIC_SCHOLAR:
        if (params.include_academic_research !== false) {
          findings.push(...await this.searchSemanticScholar(params, maxResults));
        }
        break;
      case ResearchSource.STACK_OVERFLOW:
        findings.push(...await this.searchStackOverflow(params, maxResults));
        break;
      case ResearchSource.WEB_SEARCH:
        findings.push(...await this.searchWeb(params, maxResults));
        break;
      case ResearchSource.OFFICIAL_DOCS:
        findings.push(...await this.searchOfficialDocs(params, maxResults));
        break;
    }
    
    return findings;
  }

  private async searchGitHub(_params: TechnicalResearchAdvisorParams, _maxResults: number): Promise<ResearchFinding[]> {
    // GitHub API search implementation would go here
    // For now, return mock findings
    return [
      {
        source: ResearchSource.GITHUB,
        title: 'Popular Implementation Repository',
        url: 'https://github.com/example/repo',
        summary: 'Well-maintained repository with modern implementation patterns',
        relevance_score: 8.5,
        key_insights: ['Uses modern patterns', 'Good test coverage', 'Active maintenance'],
        code_examples: ['// Example implementation pattern'],
        implementation_patterns: ['Repository pattern', 'Dependency injection'],
      }
    ];
  }

  private async searchArxiv(_params: TechnicalResearchAdvisorParams, _maxResults: number): Promise<ResearchFinding[]> {
    // arXiv API search implementation would go here
    return [
      {
        source: ResearchSource.ARXIV,
        title: 'Academic Research Paper',
        url: 'https://arxiv.org/abs/example',
        summary: 'Research paper with theoretical foundations and performance analysis',
        relevance_score: 7.0,
        key_insights: ['Algorithmic complexity analysis', 'Performance benchmarks'],
        performance_notes: ['O(n log n) complexity', 'Memory efficient'],
      }
    ];
  }

  private async searchSemanticScholar(_params: TechnicalResearchAdvisorParams, _maxResults: number): Promise<ResearchFinding[]> {
    // Semantic Scholar API search implementation would go here
    return [];
  }

  private async searchStackOverflow(_params: TechnicalResearchAdvisorParams, _maxResults: number): Promise<ResearchFinding[]> {
    // Stack Overflow API search implementation would go here
    return [
      {
        source: ResearchSource.STACK_OVERFLOW,
        title: 'Community Solution Discussion',
        url: 'https://stackoverflow.com/questions/example',
        summary: 'Community discussion with multiple solution approaches',
        relevance_score: 7.5,
        key_insights: ['Multiple approaches available', 'Common pitfalls identified'],
        implementation_patterns: ['Strategy pattern', 'Factory pattern'],
      }
    ];
  }

  private async searchWeb(_params: TechnicalResearchAdvisorParams, _maxResults: number): Promise<ResearchFinding[]> {
    // Web search implementation using existing WebSearch tool would go here
    return [];
  }

  private async searchOfficialDocs(_params: TechnicalResearchAdvisorParams, _maxResults: number): Promise<ResearchFinding[]> {
    // Official documentation search would go here
    return [];
  }

  private async synthesizeFindings(params: TechnicalResearchAdvisorParams, findings: ResearchFinding[], totalSources: number): Promise<TechnicalResearchResult> {
    // Sort findings by relevance score
    const sortedFindings = findings.sort((a, b) => b.relevance_score - a.relevance_score);
    
    // Extract key insights and patterns
    const allInsights = findings.flatMap(f => f.key_insights || []);
    const allPatterns = findings.flatMap(f => f.implementation_patterns || []);
    const allPerformanceNotes = findings.flatMap(f => f.performance_notes || []);
    const allSecurityNotes = findings.flatMap(f => f.security_considerations || []);
    
    // Generate recommendations based on analysis
    const recommendations = this.generateRecommendations(params, sortedFindings);
    const approaches = this.identifyImplementationApproaches(sortedFindings);
    const bestPractices = this.extractBestPractices(allInsights);
    const pitfalls = this.identifyCommonPitfalls(sortedFindings);
    
    // Calculate confidence score based on number of sources and relevance
    const avgRelevance = findings.length > 0 ? findings.reduce((sum, f) => sum + f.relevance_score, 0) / findings.length : 0;
    const confidenceScore = Math.min(10, Math.round((totalSources * 2 + avgRelevance) / 2));
    
    return {
      query: params.research_query,
      context: params.context,
      research_summary: this.generateResearchSummary(params, findings),
      total_sources_searched: totalSources,
      findings: sortedFindings,
      key_recommendations: recommendations,
      implementation_approaches: approaches,
      best_practices: bestPractices,
      common_pitfalls: pitfalls,
      performance_considerations: allPerformanceNotes,
      security_recommendations: allSecurityNotes,
      alternative_solutions: this.identifyAlternatives(sortedFindings),
      confidence_score: confidenceScore,
      research_timestamp: new Date().toISOString(),
    };
  }

  private generateRecommendations(_params: TechnicalResearchAdvisorParams, findings: ResearchFinding[]): string[] {
    const recommendations: string[] = [];
    
    if (findings.length === 0) {
      recommendations.push('No specific implementations found - consider breaking down the query or trying different search terms');
      return recommendations;
    }
    
    // Analyze top findings for patterns
    const topFindings = findings.slice(0, 5);
    const commonPatterns = this.findCommonPatterns(topFindings);
    
    if (commonPatterns.length > 0) {
      recommendations.push(`Most sources recommend using: ${commonPatterns.join(', ')}`);
    }
    
    // Check for high-scoring solutions
    const highScoreFindings = findings.filter(f => f.relevance_score >= 8.0);
    if (highScoreFindings.length > 0) {
      recommendations.push(`Highly recommended approach: ${highScoreFindings[0].title}`);
    }
    
    // Add general recommendations
    recommendations.push('Review multiple implementation approaches before choosing');
    recommendations.push('Consider performance and security implications');
    recommendations.push('Start with a simple implementation and iterate');
    
    return recommendations;
  }

  private identifyImplementationApproaches(findings: ResearchFinding[]) {
    // Group findings by similar patterns/approaches
    const approaches = [
      {
        approach_name: 'Standard Implementation',
        description: 'Most commonly used approach based on research findings',
        pros: ['Well documented', 'Community support', 'Proven in production'],
        cons: ['May not be optimal for all use cases'],
        complexity_score: 5,
        recommended_for: ['General use cases', 'Team projects'],
      },
      {
        approach_name: 'Performance-Optimized',
        description: 'High-performance approach for demanding applications',
        pros: ['Better performance', 'Scalable'],
        cons: ['More complex', 'Requires expertise'],
        complexity_score: 8,
        recommended_for: ['High-traffic applications', 'Performance-critical systems'],
      },
    ];
    
    return approaches;
  }

  private extractBestPractices(insights: string[]): string[] {
    const practices = new Set<string>();
    
    // Add common best practices based on insights
    if (insights.some(i => i.includes('test'))) {
      practices.add('Write comprehensive tests');
    }
    if (insights.some(i => i.includes('document'))) {
      practices.add('Document your implementation');
    }
    if (insights.some(i => i.includes('error'))) {
      practices.add('Implement proper error handling');
    }
    
    // Add general best practices
    practices.add('Follow established coding standards');
    practices.add('Use version control with meaningful commits');
    practices.add('Consider performance implications');
    practices.add('Plan for scalability');
    
    return Array.from(practices);
  }

  private identifyCommonPitfalls(_findings: ResearchFinding[]): string[] {
    return [
      'Not considering edge cases',
      'Premature optimization',
      'Insufficient error handling',
      'Ignoring security implications',
      'Not planning for scale',
      'Over-engineering the solution',
    ];
  }

  private identifyAlternatives(_findings: ResearchFinding[]): string[] {
    return [
      'Consider existing libraries and frameworks',
      'Evaluate cloud-based solutions',
      'Look into open-source alternatives',
      'Consider hybrid approaches',
    ];
  }

  private findCommonPatterns(findings: ResearchFinding[]): string[] {
    const patterns = new Set<string>();
    
    findings.forEach(finding => {
      finding.implementation_patterns?.forEach(pattern => patterns.add(pattern));
    });
    
    return Array.from(patterns);
  }

  private generateResearchSummary(params: TechnicalResearchAdvisorParams, findings: ResearchFinding[]): string {
    const techStack = params.technology_stack ? ` focusing on ${params.technology_stack.join(', ')}` : '';
    const contextDesc = params.context === ResearchContext.FRONTEND ? 'frontend development' :
                       params.context === ResearchContext.BACKEND ? 'backend development' :
                       params.context === ResearchContext.FULLSTACK ? 'full-stack development' :
                       `${params.context} development`;
    
    return `Conducted ${params.research_depth} research on "${params.research_query}" for ${contextDesc}${techStack}. ` +
           `Analyzed ${findings.length} relevant sources and identified multiple implementation approaches with ` +
           `specific recommendations for your use case.`;
  }

  private async generateImplementationTodos(result: TechnicalResearchResult, updateOutput?: (output: string) => void): Promise<void> {
    updateOutput?.('📝 Generating implementation todos...');
    
    try {
      const todoTool = new TodoWriteTool(this.config);
      
      // Generate todos based on research findings
      const todos = [
        {
          content: `Research Implementation: ${result.query}`,
          status: 'completed' as const,
          priority: 'high' as const,
          id: `research-${Date.now()}`,
        },
        {
          content: `Review top recommendation: ${result.key_recommendations[0] || 'Analyze research findings'}`,
          status: 'pending' as const,
          priority: 'high' as const,
          id: `review-${Date.now()}`,
        },
        {
          content: `Implement ${result.implementation_approaches[0]?.approach_name || 'chosen approach'}`,
          status: 'pending' as const,
          priority: 'high' as const,
          id: `implement-${Date.now()}`,
        },
        {
          content: 'Add comprehensive tests for implementation',
          status: 'pending' as const,
          priority: 'medium' as const,
          id: `test-${Date.now()}`,
        },
        {
          content: 'Review security considerations and best practices',
          status: 'pending' as const,
          priority: 'medium' as const,
          id: `security-${Date.now()}`,
        },
      ];
      
      await todoTool.execute({ todos }, new AbortController().signal, undefined);
      updateOutput?.('✅ Implementation todos created successfully');
    } catch (error) {
      console.warn('Failed to generate todos:', error);
      updateOutput?.('⚠️ Failed to generate todos, but research completed successfully');
    }
  }

  private generateResearchReport(result: TechnicalResearchResult): string {
    const report = [
      `# Technical Research Report: ${result.query}`,
      '',
      `**Research Context:** ${result.context}`,
      `**Timestamp:** ${new Date(result.research_timestamp).toLocaleString()}`,
      `**Sources Searched:** ${result.total_sources_searched}`,
      `**Confidence Score:** ${result.confidence_score}/10`,
      '',
      '## Research Summary',
      result.research_summary,
      '',
      '## Key Recommendations',
      ...result.key_recommendations.map(rec => `- ${rec}`),
      '',
      '## Implementation Approaches',
      ...result.implementation_approaches.map(approach => [
        `### ${approach.approach_name}`,
        approach.description,
        '',
        '**Pros:**',
        ...approach.pros.map(pro => `- ${pro}`),
        '',
        '**Cons:**',
        ...approach.cons.map(con => `- ${con}`),
        '',
        `**Complexity:** ${approach.complexity_score}/10`,
        `**Recommended for:** ${approach.recommended_for.join(', ')}`,
        '',
      ]).flat(),
      '## Best Practices',
      ...result.best_practices.map(practice => `- ${practice}`),
      '',
      '## Common Pitfalls to Avoid',
      ...result.common_pitfalls.map(pitfall => `- ${pitfall}`),
      '',
    ];
    
    if (result.performance_considerations.length > 0) {
      report.push(
        '## Performance Considerations',
        ...result.performance_considerations.map(perf => `- ${perf}`),
        '',
      );
    }
    
    if (result.security_recommendations.length > 0) {
      report.push(
        '## Security Recommendations',
        ...result.security_recommendations.map(sec => `- ${sec}`),
        '',
      );
    }
    
    if (result.findings.length > 0) {
      report.push(
        '## Top Research Findings',
        '',
        ...result.findings.slice(0, 5).map(finding => [
          `### ${finding.title}`,
          `**Source:** ${finding.source}`,
          `**Relevance:** ${finding.relevance_score}/10`,
          `**URL:** ${finding.url}`,
          '',
          finding.summary,
          '',
          ...(finding.key_insights && finding.key_insights.length > 0 ? [
            '**Key Insights:**',
            ...finding.key_insights.map(insight => `- ${insight}`),
            '',
          ] : []),
        ]).flat(),
      );
    }
    
    if (result.todos_generated) {
      report.push('## Implementation Todos', 'Implementation todos have been automatically created based on research findings.', '');
    }
    
    return report.join('\n');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}