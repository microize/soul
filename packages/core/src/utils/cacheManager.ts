/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PersistentCache } from './persistentCache.js';
import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Cache manager for coordinating cache operations across tools
 */
export class CacheManager {
  private readonly cacheDir: string;
  private readonly caches: Map<string, PersistentCache<unknown>> = new Map();

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
  }

  /**
   * Registers a cache instance
   */
  registerCache<T>(name: string, cache: PersistentCache<T>): void {
    this.caches.set(name, cache);
  }

  /**
   * Gets overall cache statistics
   */
  getGlobalStats(): {
    cacheDir: string;
    totalCaches: number;
    totalMemoryEntries: number;
    totalDiskEntries: number;
    totalFiles: number;
    cacheSizes: Record<string, { memoryEntries: number; diskEntries: number; totalFiles: number }>;
  } {
    let totalMemoryEntries = 0;
    let totalDiskEntries = 0;
    let totalFiles = 0;
    const cacheSizes: Record<string, { memoryEntries: number; diskEntries: number; totalFiles: number }> = {};

    for (const [name, cache] of this.caches) {
      const stats = cache.getStats();
      totalMemoryEntries += stats.memoryEntries;
      totalDiskEntries += stats.diskEntries;
      totalFiles += stats.totalFiles;
      
      cacheSizes[name] = {
        memoryEntries: stats.memoryEntries,
        diskEntries: stats.diskEntries,
        totalFiles: stats.totalFiles,
      };
    }

    return {
      cacheDir: this.cacheDir,
      totalCaches: this.caches.size,
      totalMemoryEntries,
      totalDiskEntries,
      totalFiles,
      cacheSizes,
    };
  }

  /**
   * Clears all caches
   */
  async clearAll(): Promise<void> {
    for (const cache of this.caches.values()) {
      await cache.clear();
    }
  }

  /**
   * Performs maintenance on all caches
   */
  async maintenance(): Promise<void> {
    for (const cache of this.caches.values()) {
      await cache.maintenance();
    }
  }

  /**
   * Invalidates cache entries based on file patterns
   */
  async invalidateByPattern(pattern: RegExp): Promise<void> {
    for (const cache of this.caches.values()) {
      await cache.invalidatePattern(pattern);
    }
  }

  /**
   * Gets cache directory size
   */
  async getCacheDirectorySize(): Promise<number> {
    let totalSize = 0;
    
    try {
      if (!fs.existsSync(this.cacheDir)) {
        return 0;
      }

      const files = await glob('**/*', { 
        cwd: this.cacheDir,
        absolute: true,
        nodir: true,
      });

      for (const file of files) {
        try {
          const stats = fs.statSync(file);
          totalSize += stats.size;
        } catch {
          // Skip files that can't be accessed
        }
      }
    } catch {
      // Failed to read cache directory
    }

    return totalSize;
  }

  /**
   * Cleans up old cache files
   */
  async cleanup(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> { // 7 days default
    let cleanedFiles = 0;
    const now = Date.now();

    try {
      if (!fs.existsSync(this.cacheDir)) {
        return 0;
      }

      const files = await glob('**/*', { 
        cwd: this.cacheDir,
        absolute: true,
        nodir: true,
      });

      for (const file of files) {
        try {
          const stats = fs.statSync(file);
          if (now - stats.mtime.getTime() > maxAge) {
            fs.unlinkSync(file);
            cleanedFiles++;
          }
        } catch {
          // Skip files that can't be accessed
        }
      }

      // Remove empty directories
      const dirs = await glob('**/', { 
        cwd: this.cacheDir,
        absolute: true,
      });

      for (const dir of dirs.reverse()) { // Start with deepest directories
        try {
          const dirContents = fs.readdirSync(dir);
          if (dirContents.length === 0) {
            fs.rmdirSync(dir);
          }
        } catch {
          // Skip directories that can't be accessed
        }
      }
    } catch {
      // Failed to clean cache directory
    }

    return cleanedFiles;
  }

  /**
   * Analyzes cache usage patterns
   */
  async analyzeCacheUsage(): Promise<{
    oldestFile: string | null;
    newestFile: string | null;
    largestFile: { path: string; size: number } | null;
    filesByAge: Array<{ path: string; age: number; size: number }>;
    totalSize: number;
    totalFiles: number;
  }> {
    const analysis = {
      oldestFile: null as string | null,
      newestFile: null as string | null,
      largestFile: null as { path: string; size: number } | null,
      filesByAge: [] as Array<{ path: string; age: number; size: number }>,
      totalSize: 0,
      totalFiles: 0,
    };

    try {
      if (!fs.existsSync(this.cacheDir)) {
        return analysis;
      }

      const files = await glob('**/*', { 
        cwd: this.cacheDir,
        absolute: true,
        nodir: true,
      });

      const now = Date.now();
      let oldestTime = now;
      let newestTime = 0;

      for (const file of files) {
        try {
          const stats = fs.statSync(file);
          const age = now - stats.mtime.getTime();
          
          analysis.totalSize += stats.size;
          analysis.totalFiles++;
          
          analysis.filesByAge.push({
            path: path.relative(this.cacheDir, file),
            age,
            size: stats.size,
          });

          if (stats.mtime.getTime() < oldestTime) {
            oldestTime = stats.mtime.getTime();
            analysis.oldestFile = path.relative(this.cacheDir, file);
          }

          if (stats.mtime.getTime() > newestTime) {
            newestTime = stats.mtime.getTime();
            analysis.newestFile = path.relative(this.cacheDir, file);
          }

          if (!analysis.largestFile || stats.size > analysis.largestFile.size) {
            analysis.largestFile = {
              path: path.relative(this.cacheDir, file),
              size: stats.size,
            };
          }
        } catch {
          // Skip files that can't be accessed
        }
      }

      // Sort files by age (oldest first)
      analysis.filesByAge.sort((a, b) => b.age - a.age);
    } catch {
      // Failed to analyze cache directory
    }

    return analysis;
  }

  /**
   * Formats cache statistics for display
   */
  formatStats(stats: ReturnType<CacheManager['getGlobalStats']>): string {
    const lines: string[] = [
      '## 🗂️ Cache Statistics',
      '',
      `**Cache Directory:** ${stats.cacheDir}`,
      `**Total Caches:** ${stats.totalCaches}`,
      `**Memory Entries:** ${stats.totalMemoryEntries}`,
      `**Disk Entries:** ${stats.totalDiskEntries}`,
      `**Total Files Tracked:** ${stats.totalFiles}`,
      '',
    ];

    if (Object.keys(stats.cacheSizes).length > 0) {
      lines.push('### Cache Breakdown');
      for (const [name, size] of Object.entries(stats.cacheSizes)) {
        lines.push(`- **${name}**: ${size.memoryEntries} memory, ${size.diskEntries} disk, ${size.totalFiles} files`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

/**
 * Global cache manager instance
 */
let globalCacheManager: CacheManager | null = null;

/**
 * Gets or creates the global cache manager
 */
export function getGlobalCacheManager(cacheDir?: string): CacheManager {
  if (!globalCacheManager) {
    globalCacheManager = new CacheManager(cacheDir || '.soul-cache');
  }
  return globalCacheManager;
}