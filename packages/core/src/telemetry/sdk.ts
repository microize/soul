/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { CompressionAlgorithm } from '@opentelemetry/otlp-exporter-base';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { Resource } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
} from '@opentelemetry/sdk-trace-node';
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
} from '@opentelemetry/sdk-logs';
import {
  ConsoleMetricExporter,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { Config } from '../config/config.js';
import { SERVICE_NAME } from './constants.js';
import { initializeMetrics } from './metrics.js';
import { ClearcutLogger } from './clearcut-logger/clearcut-logger.js';

// For troubleshooting, set the log level to DiagLogLevel.DEBUG
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

let sdk: NodeSDK | undefined;
let telemetryInitialized = false;

export function isTelemetrySdkInitialized(): boolean {
  return telemetryInitialized;
}

/**
 * Validates if hostname is in private IP range
 * SECURITY: Prevents telemetry data exfiltration to private networks
 */
function isPrivateIP(hostname: string): boolean {
  // Check for IPv4 private ranges
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv4Match = hostname.match(ipv4Regex);
  
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map(Number);
    
    // 10.0.0.0/8
    if (octets[0] === 10) return true;
    
    // 172.16.0.0/12
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
    
    // 192.168.0.0/16
    if (octets[0] === 192 && octets[1] === 168) return true;
    
    // 169.254.0.0/16 (Link-local)
    if (octets[0] === 169 && octets[1] === 254) return true;
  }
  
  // Check for IPv6 private ranges (simplified)
  if (hostname.includes(':')) {
    const lowerHostname = hostname.toLowerCase();
    // fc00::/7 (Unique local addresses)
    if (lowerHostname.startsWith('fc') || lowerHostname.startsWith('fd')) return true;
    // fe80::/10 (Link-local)
    if (lowerHostname.startsWith('fe8') || lowerHostname.startsWith('fe9') || 
        lowerHostname.startsWith('fea') || lowerHostname.startsWith('feb')) return true;
  }
  
  return false;
}

/**
 * Validates telemetry endpoint for security
 * SECURITY: Prevents malicious telemetry endpoints and data exfiltration
 */
function isValidTelemetryEndpoint(url: URL): boolean {
  // Only allow https and http protocols
  if (!['http:', 'https:'].includes(url.protocol)) {
    return false;
  }
  
  // Validate hostname is not empty
  if (!url.hostname) {
    return false;
  }
  
  const hostname = url.hostname.toLowerCase();
  
  // Block localhost for security (telemetry should go to external endpoints)
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return false;
  }
  
  // Block private IP ranges for security
  if (isPrivateIP(hostname)) {
    return false;
  }
  
  // Validate port if specified
  if (url.port) {
    const port = parseInt(url.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return false;
    }
  }
  
  // Allowlist trusted telemetry domains for added security
  const trustedDomains = [
    'googleapis.com',
    'google.com',
    'otel.io',
    'opentelemetry.io',
    'jaegertracing.io',
    'honeycomb.io',
    'datadoghq.com',
    'newrelic.com'
  ];
  
  const isFromTrustedDomain = trustedDomains.some(domain => 
    hostname === domain || hostname.endsWith('.' + domain)
  );
  
  if (!isFromTrustedDomain) {
    diag.warn(`Telemetry endpoint not in trusted domain list: ${hostname}`);
    // Allow but warn for custom endpoints
  }
  
  return true;
}

function parseGrpcEndpoint(
  otlpEndpointSetting: string | undefined,
): string | undefined {
  if (!otlpEndpointSetting) {
    return undefined;
  }
  // Trim leading/trailing quotes that might come from env variables
  const trimmedEndpoint = otlpEndpointSetting.replace(/^["']|["']$/g, '');

  try {
    const url = new URL(trimmedEndpoint);
    
    // SECURITY: Validate telemetry endpoint for security
    if (!isValidTelemetryEndpoint(url)) {
      diag.error('Telemetry endpoint failed security validation:', trimmedEndpoint);
      return undefined;
    }
    
    // OTLP gRPC exporters expect an endpoint in the format scheme://host:port
    // The `origin` property provides this, stripping any path, query, or hash.
    return url.origin;
  } catch (error) {
    diag.error('Invalid OTLP endpoint URL provided:', trimmedEndpoint, error);
    return undefined;
  }
}

export function initializeTelemetry(config: Config): void {
  if (telemetryInitialized || !config.getTelemetryEnabled()) {
    return;
  }

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_VERSION]: process.version,
    'session.id': config.getSessionId(),
  });

  const otlpEndpoint = config.getTelemetryOtlpEndpoint();
  const grpcParsedEndpoint = parseGrpcEndpoint(otlpEndpoint);
  const useOtlp = !!grpcParsedEndpoint;

  const spanExporter = useOtlp
    ? new OTLPTraceExporter({
        url: grpcParsedEndpoint,
        compression: CompressionAlgorithm.GZIP,
      })
    : new ConsoleSpanExporter();
  const logExporter = useOtlp
    ? new OTLPLogExporter({
        url: grpcParsedEndpoint,
        compression: CompressionAlgorithm.GZIP,
      })
    : new ConsoleLogRecordExporter();
  const metricReader = useOtlp
    ? new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: grpcParsedEndpoint,
          compression: CompressionAlgorithm.GZIP,
        }),
        exportIntervalMillis: 10000,
      })
    : new PeriodicExportingMetricReader({
        exporter: new ConsoleMetricExporter(),
        exportIntervalMillis: 10000,
      });

  sdk = new NodeSDK({
    resource,
    spanProcessors: [new BatchSpanProcessor(spanExporter)],
    logRecordProcessor: new BatchLogRecordProcessor(logExporter),
    metricReader,
    instrumentations: [new HttpInstrumentation()],
  });

  try {
    sdk.start();
    console.log('OpenTelemetry SDK started successfully.');
    telemetryInitialized = true;
    initializeMetrics(config);
  } catch (error) {
    console.error('Error starting OpenTelemetry SDK:', error);
  }

  process.on('SIGTERM', shutdownTelemetry);
  process.on('SIGINT', shutdownTelemetry);
}

export async function shutdownTelemetry(): Promise<void> {
  if (!telemetryInitialized || !sdk) {
    return;
  }
  try {
    ClearcutLogger.getInstance()?.shutdown();
    await sdk.shutdown();
    console.log('OpenTelemetry SDK shut down successfully.');
  } catch (error) {
    console.error('Error shutting down SDK:', error);
  } finally {
    telemetryInitialized = false;
  }
}
