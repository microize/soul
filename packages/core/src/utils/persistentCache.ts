/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { LruCache } from './LruCache.js';

/**
 * File metadata for change detection
 */
export interface FileMetadata {
  filePath: string;
  mtime: number;
  size: number;
  contentHash: string;
  lastAnalyzed: number;
}

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T> {
  data: T;
  metadata: FileMetadata;
  createdAt: number;
  accessedAt: number;
}

/**
 * Cache storage configuration
 */
export interface CacheConfig {
  cacheDir: string;
  maxMemoryEntries: number;
  maxFileAge: number; // in milliseconds
  enableFileHashing: boolean;
}

/**
 * Persistent cache manager with change detection
 */
export class PersistentCache<T> {
  private memoryCache: LruCache<string, CacheEntry<T>>;
  private readonly config: CacheConfig;
  private readonly cacheSubDir: string;
  private readonly metadataFile: string;
  private fileMetadataCache: Map<string, FileMetadata> = new Map();

  constructor(cacheSubDir: string, config: Partial<CacheConfig> = {}) {
    this.cacheSubDir = cacheSubDir;
    this.config = {
      cacheDir: config.cacheDir || '.soul-cache',
      maxMemoryEntries: config.maxMemoryEntries || 100,
      maxFileAge: config.maxFileAge || 24 * 60 * 60 * 1000, // 24 hours
      enableFileHashing: config.enableFileHashing ?? true,
      ...config,
    };

    this.memoryCache = new LruCache<string, CacheEntry<T>>(this.config.maxMemoryEntries);
    this.metadataFile = path.join(this.getCacheDir(), 'file-metadata.json');
    
    this.ensureCacheDir();
    this.loadFileMetadata();
  }

  /**
   * Gets the cache directory path
   */
  private getCacheDir(): string {
    return path.join(this.config.cacheDir, this.cacheSubDir);
  }

  /**
   * Ensures cache directory exists
   */
  private ensureCacheDir(): void {
    const cacheDir = this.getCacheDir();
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
  }

  /**
   * Generates cache key from file path
   */
  private getCacheKey(filePath: string): string {
    return crypto.createHash('md5').update(filePath).digest('hex');
  }

  /**
   * Gets cache file path for a given key
   */
  private getCacheFilePath(key: string): string {
    return path.join(this.getCacheDir(), `${key}.json`);
  }

  /**
   * Calculates file content hash
   */
  private calculateFileHash(filePath: string): string {
    if (!this.config.enableFileHashing) {
      return '';
    }

    try {
      const content = fs.readFileSync(filePath);
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch {
      return '';
    }
  }

  /**
   * Gets current file metadata
   */
  private getCurrentFileMetadata(filePath: string): FileMetadata | null {
    try {
      const stats = fs.statSync(filePath);
      return {
        filePath,
        mtime: stats.mtimeMs,
        size: stats.size,
        contentHash: this.calculateFileHash(filePath),
        lastAnalyzed: Date.now(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Checks if file has changed since last analysis
   */
  private hasFileChanged(filePath: string): boolean {
    const currentMetadata = this.getCurrentFileMetadata(filePath);
    if (!currentMetadata) {
      return true; // File doesn't exist or can't be read
    }

    const cachedMetadata = this.fileMetadataCache.get(filePath);
    if (!cachedMetadata) {
      return true; // No cached metadata, consider it changed
    }

    // Check modification time first (fast)
    if (currentMetadata.mtime > cachedMetadata.mtime) {
      return true;
    }

    // Check file size (fast)
    if (currentMetadata.size !== cachedMetadata.size) {
      return true;
    }

    // Check content hash if enabled (slower but more reliable)
    if (this.config.enableFileHashing && 
        currentMetadata.contentHash !== cachedMetadata.contentHash) {
      return true;
    }

    return false;
  }

  /**
   * Loads file metadata from disk
   */
  private loadFileMetadata(): void {
    try {
      if (fs.existsSync(this.metadataFile)) {
        const data = fs.readFileSync(this.metadataFile, 'utf8');
        const metadata = JSON.parse(data);
        
        this.fileMetadataCache = new Map(Object.entries(metadata));
      }
    } catch (_error) {
      // Failed to load metadata, start fresh
      this.fileMetadataCache = new Map();
    }
  }

  /**
   * Saves file metadata to disk
   */
  private saveFileMetadata(): void {
    try {
      const metadata = Object.fromEntries(this.fileMetadataCache);
      fs.writeFileSync(this.metadataFile, JSON.stringify(metadata, null, 2));
    } catch (_error) {
      // Failed to save metadata
    }
  }

  /**
   * Gets cached data for a file
   */
  async get(filePath: string): Promise<T | null> {
    const key = this.getCacheKey(filePath);
    
    // Check memory cache first
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry) {
      // Update access time
      memoryEntry.accessedAt = Date.now();
      
      // Check if file has changed
      if (!this.hasFileChanged(filePath)) {
        return memoryEntry.data;
      } else {
        // File changed, invalidate memory cache
        this.memoryCache.clear();
      }
    }

    // Check disk cache
    const cacheFile = this.getCacheFilePath(key);
    if (fs.existsSync(cacheFile)) {
      try {
        const cacheData = fs.readFileSync(cacheFile, 'utf8');
        const entry: CacheEntry<T> = JSON.parse(cacheData);
        
        // Check if cache entry is still valid
        if (!this.hasFileChanged(filePath) && 
            Date.now() - entry.createdAt < this.config.maxFileAge) {
          
          // Load into memory cache
          entry.accessedAt = Date.now();
          this.memoryCache.set(key, entry);
          
          return entry.data;
        } else {
          // Cache expired or file changed, remove it
          this.invalidate(filePath);
        }
      } catch (_error) {
        // Failed to parse cache file, remove it
        this.invalidate(filePath);
      }
    }

    return null;
  }

  /**
   * Stores data in cache
   */
  async set(filePath: string, data: T): Promise<void> {
    const key = this.getCacheKey(filePath);
    const metadata = this.getCurrentFileMetadata(filePath);
    
    if (!metadata) {
      return; // Can't cache if we can't get file metadata
    }

    const entry: CacheEntry<T> = {
      data,
      metadata,
      createdAt: Date.now(),
      accessedAt: Date.now(),
    };

    // Store in memory cache
    this.memoryCache.set(key, entry);
    
    // Store in disk cache
    const cacheFile = this.getCacheFilePath(key);
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(entry, null, 2));
    } catch (_error) {
      // Failed to write to disk cache
    }

    // Update file metadata
    this.fileMetadataCache.set(filePath, metadata);
    this.saveFileMetadata();
  }

  /**
   * Invalidates cache for a specific file
   */
  async invalidate(filePath: string): Promise<void> {
    const key = this.getCacheKey(filePath);
    
    // Remove from memory cache
    this.memoryCache.clear();
    
    // Remove disk cache file
    const cacheFile = this.getCacheFilePath(key);
    try {
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
      }
    } catch (_error) {
      // Failed to remove cache file
    }

    // Remove file metadata
    this.fileMetadataCache.delete(filePath);
    this.saveFileMetadata();
  }

  /**
   * Invalidates cache for multiple files
   */
  async invalidatePattern(pattern: RegExp): Promise<void> {
    const filesToInvalidate: string[] = [];
    
    for (const filePath of this.fileMetadataCache.keys()) {
      if (pattern.test(filePath)) {
        filesToInvalidate.push(filePath);
      }
    }

    for (const filePath of filesToInvalidate) {
      await this.invalidate(filePath);
    }
  }

  /**
   * Clears entire cache
   */
  async clear(): Promise<void> {
    // Clear memory cache
    this.memoryCache.clear();
    
    // Remove all disk cache files
    try {
      const cacheDir = this.getCacheDir();
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir);
        for (const file of files) {
          const filePath = path.join(cacheDir, file);
          if (fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
          }
        }
      }
    } catch (_error) {
      // Failed to clear cache directory
    }

    // Clear file metadata
    this.fileMetadataCache.clear();
    this.saveFileMetadata();
  }

  /**
   * Gets cache statistics
   */
  getStats(): {
    memoryEntries: number;
    diskEntries: number;
    totalFiles: number;
    cacheDir: string;
  } {
    let diskEntries = 0;
    try {
      const cacheDir = this.getCacheDir();
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir);
        diskEntries = files.filter(f => f.endsWith('.json') && f !== 'file-metadata.json').length;
      }
    } catch (_error) {
      // Failed to read cache directory
    }

    return {
      memoryEntries: this.memoryCache['cache'].size,
      diskEntries,
      totalFiles: this.fileMetadataCache.size,
      cacheDir: this.getCacheDir(),
    };
  }

  /**
   * Performs cache maintenance (removes expired entries)
   */
  async maintenance(): Promise<void> {
    const now = Date.now();
    const expiredFiles: string[] = [];

    // Find expired entries
    for (const [filePath, metadata] of this.fileMetadataCache) {
      if (now - metadata.lastAnalyzed > this.config.maxFileAge) {
        expiredFiles.push(filePath);
      }
    }

    // Remove expired entries
    for (const filePath of expiredFiles) {
      await this.invalidate(filePath);
    }
  }

  /**
   * Checks if file is in cache and valid
   */
  has(filePath: string): boolean {
    const key = this.getCacheKey(filePath);
    
    // Check memory cache first
    if (this.memoryCache.get(key)) {
      return !this.hasFileChanged(filePath);
    }

    // Check disk cache
    const cacheFile = this.getCacheFilePath(key);
    return fs.existsSync(cacheFile) && !this.hasFileChanged(filePath);
  }

  /**
   * Gets all cached file paths
   */
  getCachedFiles(): string[] {
    return Array.from(this.fileMetadataCache.keys());
  }

  /**
   * Bulk operation: check which files need re-analysis
   */
  getChangedFiles(filePaths: string[]): string[] {
    return filePaths.filter(filePath => this.hasFileChanged(filePath));
  }

  /**
   * Bulk operation: get multiple cached entries
   */
  async getMultiple(filePaths: string[]): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();
    
    for (const filePath of filePaths) {
      const data = await this.get(filePath);
      results.set(filePath, data);
    }

    return results;
  }

  /**
   * Bulk operation: set multiple entries
   */
  async setMultiple(entries: Map<string, T>): Promise<void> {
    for (const [filePath, data] of entries) {
      await this.set(filePath, data);
    }
  }
}