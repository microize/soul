/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockEnsureCorrectEdit = vi.hoisted(() => vi.fn());
const mockGenerateJson = vi.hoisted(() => vi.fn());

vi.mock('../utils/editCorrector.js', () => ({
  ensureCorrectEdit: mockEnsureCorrectEdit,
}));

vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(() => ({
    generateJson: mockGenerateJson,
  })),
}));

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { MultiEditTool, MultiEditToolParams } from './multi-edit.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { ApprovalMode, Config } from '../config/config.js';

describe('MultiEditTool', () => {
  let tool: MultiEditTool;
  let tempDir: string;
  let rootDir: string;
  let mockConfig: Config;
  let geminiClient: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-edit-tool-test-'));
    rootDir = path.join(tempDir, 'root');
    fs.mkdirSync(rootDir);

    geminiClient = {
      generateJson: mockGenerateJson,
    };

    mockConfig = {
      getTargetDir: () => rootDir,
      getApprovalMode: vi.fn(() => ApprovalMode.DEFAULT),
      setApprovalMode: vi.fn(),
      getGeminiClient: () => geminiClient,
    } as any;

    tool = new MultiEditTool(mockConfig);

    // Reset mocks
    vi.clearAllMocks();
    mockEnsureCorrectEdit.mockImplementation((filePath, content, params) => ({
      params,
      occurrences: (content.match(new RegExp(params.old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('validateToolParams', () => {
    it('should validate correct parameters', () => {
      const params: MultiEditToolParams = {
        edits: [
          {
            file_path: path.join(rootDir, 'test.txt'),
            old_string: 'old',
            new_string: 'new',
          },
        ],
      };

      const result = tool.validateToolParams(params);
      expect(result).toBeNull();
    });

    it('should reject empty edits array', () => {
      const params: MultiEditToolParams = {
        edits: [],
      };

      const result = tool.validateToolParams(params);
      expect(result).toBe('At least one edit operation must be provided');
    });

    it('should reject too many edits', () => {
      const params: MultiEditToolParams = {
        edits: Array(101).fill({
          file_path: path.join(rootDir, 'test.txt'),
          old_string: 'old',
          new_string: 'new',
        }),
      };

      const result = tool.validateToolParams(params);
      expect(result).toBe('Too many edit operations. Maximum 100 edits per batch.');
    });

    it('should reject non-absolute paths', () => {
      const params: MultiEditToolParams = {
        edits: [
          {
            file_path: 'relative/path.txt',
            old_string: 'old',
            new_string: 'new',
          },
        ],
      };

      const result = tool.validateToolParams(params);
      expect(result).toContain('File path must be absolute');
    });

    it('should reject paths outside root directory', () => {
      const params: MultiEditToolParams = {
        edits: [
          {
            file_path: '/outside/root/test.txt',
            old_string: 'old',
            new_string: 'new',
          },
        ],
      };

      const result = tool.validateToolParams(params);
      expect(result).toContain('File path must be within root directory');
    });

    it('should reject invalid expected_replacements', () => {
      const params: MultiEditToolParams = {
        edits: [
          {
            file_path: path.join(rootDir, 'test.txt'),
            old_string: 'old',
            new_string: 'new',
            expected_replacements: 0,
          },
        ],
      };

      const result = tool.validateToolParams(params);
      expect(result).toContain('expected_replacements must be >= 1');
    });
  });

  describe('conflict detection', () => {
    it('should detect overlapping edits in same file', async () => {
      const testFile = path.join(rootDir, 'test.txt');
      fs.writeFileSync(testFile, 'function test() {\n  console.log("hello");\n}');

      const params: MultiEditToolParams = {
        edits: [
          {
            file_path: testFile,
            old_string: 'function test() {',
            new_string: 'function testFunc() {',
          },
          {
            file_path: testFile,
            old_string: 'test()',
            new_string: 'testFunc()',
          },
        ],
      };

      const result = await tool.execute(params, new AbortController().signal);
      expect(result.conflicts.hasConflicts).toBe(true);
      expect(result.conflicts.conflicts[0].reason).toBe('Overlapping edit operations detected');
    });

    it('should detect multiple file creation operations', async () => {
      const testFile = path.join(rootDir, 'new.txt');

      const params: MultiEditToolParams = {
        edits: [
          {
            file_path: testFile,
            old_string: '',
            new_string: 'content1',
          },
          {
            file_path: testFile,
            old_string: '',
            new_string: 'content2',
          },
        ],
      };

      const result = await tool.execute(params, new AbortController().signal);
      expect(result.conflicts.hasConflicts).toBe(true);
      expect(result.conflicts.conflicts[0].reason).toBe('Multiple file creation operations');
    });

    it('should detect file creation mixed with edit operations', async () => {
      const testFile = path.join(rootDir, 'test.txt');

      const params: MultiEditToolParams = {
        edits: [
          {
            file_path: testFile,
            old_string: '',
            new_string: 'new content',
          },
          {
            file_path: testFile,
            old_string: 'old',
            new_string: 'new',
          },
        ],
      };

      const result = await tool.execute(params, new AbortController().signal);
      expect(result.conflicts.hasConflicts).toBe(true);
      expect(result.conflicts.conflicts[0].reason).toBe('File creation mixed with edit operations');
    });
  });

  describe('single file operations', () => {
    it('should create a new file', async () => {
      const testFile = path.join(rootDir, 'new.txt');

      const params: MultiEditToolParams = {
        edits: [
          {
            file_path: testFile,
            old_string: '',
            new_string: 'Hello World',
          },
        ],
      };

      const result = await tool.execute(params, new AbortController().signal);
      
      expect(result.successfulEdits).toBe(1);
      expect(result.failedEdits).toBe(0);
      expect(fs.existsSync(testFile)).toBe(true);
      expect(fs.readFileSync(testFile, 'utf8')).toBe('Hello World');
    });

    it('should edit existing file', async () => {
      const testFile = path.join(rootDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello World');

      const params: MultiEditToolParams = {
        edits: [
          {
            file_path: testFile,
            old_string: 'World',
            new_string: 'Universe',
          },
        ],
      };

      const result = await tool.execute(params, new AbortController().signal);
      
      expect(result.successfulEdits).toBe(1);
      expect(result.failedEdits).toBe(0);
      expect(fs.readFileSync(testFile, 'utf8')).toBe('Hello Universe');
    });

    it('should handle multiple replacements', async () => {
      const testFile = path.join(rootDir, 'test.txt');
      fs.writeFileSync(testFile, 'foo bar foo');

      const params: MultiEditToolParams = {
        edits: [
          {
            file_path: testFile,
            old_string: 'foo',
            new_string: 'baz',
            expected_replacements: 2,
          },
        ],
      };

      const result = await tool.execute(params, new AbortController().signal);
      
      expect(result.successfulEdits).toBe(1);
      expect(result.failedEdits).toBe(0);
      expect(fs.readFileSync(testFile, 'utf8')).toBe('baz bar baz');
    });

    it('should fail when string not found', async () => {
      const testFile = path.join(rootDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello World');

      const params: MultiEditToolParams = {
        edits: [
          {
            file_path: testFile,
            old_string: 'nonexistent',
            new_string: 'replacement',
          },
        ],
      };

      const result = await tool.execute(params, new AbortController().signal);
      
      expect(result.successfulEdits).toBe(0);
      expect(result.failedEdits).toBe(1);
      expect(result.editResults[0].error).toBe('Failed to edit, could not find the string to replace.');
    });

    it('should fail when replacement count mismatch', async () => {
      const testFile = path.join(rootDir, 'test.txt');
      fs.writeFileSync(testFile, 'foo bar foo');

      const params: MultiEditToolParams = {
        edits: [
          {
            file_path: testFile,
            old_string: 'foo',
            new_string: 'baz',
            expected_replacements: 1, // expects 1 but finds 2
          },
        ],
      };

      const result = await tool.execute(params, new AbortController().signal);
      
      expect(result.successfulEdits).toBe(0);
      expect(result.failedEdits).toBe(1);
      expect(result.editResults[0].error).toContain('expected 1 occurrences but found 2');
    });
  });

  describe('multi-file operations', () => {
    it('should edit multiple files successfully', async () => {
      const testFile1 = path.join(rootDir, 'test1.txt');
      const testFile2 = path.join(rootDir, 'test2.txt');
      fs.writeFileSync(testFile1, 'Hello World');
      fs.writeFileSync(testFile2, 'Goodbye World');

      const params: MultiEditToolParams = {
        edits: [
          {
            file_path: testFile1,
            old_string: 'World',
            new_string: 'Universe',
          },
          {
            file_path: testFile2,
            old_string: 'Goodbye',
            new_string: 'Hello',
          },
        ],
      };

      const result = await tool.execute(params, new AbortController().signal);
      
      expect(result.successfulEdits).toBe(2);
      expect(result.failedEdits).toBe(0);
      expect(fs.readFileSync(testFile1, 'utf8')).toBe('Hello Universe');
      expect(fs.readFileSync(testFile2, 'utf8')).toBe('Hello World');
    });

    it('should handle mixed success and failure', async () => {
      const testFile1 = path.join(rootDir, 'test1.txt');
      const testFile2 = path.join(rootDir, 'test2.txt');
      fs.writeFileSync(testFile1, 'Hello World');
      fs.writeFileSync(testFile2, 'Goodbye World');

      const params: MultiEditToolParams = {
        edits: [
          {
            file_path: testFile1,
            old_string: 'World',
            new_string: 'Universe',
          },
          {
            file_path: testFile2,
            old_string: 'nonexistent',
            new_string: 'replacement',
          },
        ],
      };

      const result = await tool.execute(params, new AbortController().signal);
      
      expect(result.successfulEdits).toBe(1);
      expect(result.failedEdits).toBe(1);
      expect(fs.readFileSync(testFile1, 'utf8')).toBe('Hello Universe');
      expect(fs.readFileSync(testFile2, 'utf8')).toBe('Goodbye World'); // unchanged
    });
  });

  describe('atomic operations', () => {
    it('should rollback all changes when atomic operation fails', async () => {
      const testFile1 = path.join(rootDir, 'test1.txt');
      const testFile2 = path.join(rootDir, 'test2.txt');
      fs.writeFileSync(testFile1, 'Hello World');
      fs.writeFileSync(testFile2, 'Goodbye World');

      const params: MultiEditToolParams = {
        atomic: true,
        edits: [
          {
            file_path: testFile1,
            old_string: 'World',
            new_string: 'Universe',
          },
          {
            file_path: testFile2,
            old_string: 'nonexistent', // This will fail
            new_string: 'replacement',
          },
        ],
      };

      const result = await tool.execute(params, new AbortController().signal);
      
      expect(result.successfulEdits).toBe(0);
      expect(result.failedEdits).toBe(2);
      expect(fs.readFileSync(testFile1, 'utf8')).toBe('Hello World'); // rolled back
      expect(fs.readFileSync(testFile2, 'utf8')).toBe('Goodbye World'); // unchanged
    });

    it('should succeed all atomic operations when no failures', async () => {
      const testFile1 = path.join(rootDir, 'test1.txt');
      const testFile2 = path.join(rootDir, 'test2.txt');
      fs.writeFileSync(testFile1, 'Hello World');
      fs.writeFileSync(testFile2, 'Goodbye World');

      const params: MultiEditToolParams = {
        atomic: true,
        edits: [
          {
            file_path: testFile1,
            old_string: 'World',
            new_string: 'Universe',
          },
          {
            file_path: testFile2,
            old_string: 'Goodbye',
            new_string: 'Hello',
          },
        ],
      };

      const result = await tool.execute(params, new AbortController().signal);
      
      expect(result.successfulEdits).toBe(2);
      expect(result.failedEdits).toBe(0);
      expect(fs.readFileSync(testFile1, 'utf8')).toBe('Hello Universe');
      expect(fs.readFileSync(testFile2, 'utf8')).toBe('Hello World');
    });

    it('should rollback file creation in atomic operation', async () => {
      const testFile1 = path.join(rootDir, 'existing.txt');
      const testFile2 = path.join(rootDir, 'new.txt');
      fs.writeFileSync(testFile1, 'Hello World');

      const params: MultiEditToolParams = {
        atomic: true,
        edits: [
          {
            file_path: testFile2,
            old_string: '',
            new_string: 'New file content',
          },
          {
            file_path: testFile1,
            old_string: 'nonexistent', // This will fail
            new_string: 'replacement',
          },
        ],
      };

      const result = await tool.execute(params, new AbortController().signal);
      
      expect(result.successfulEdits).toBe(0);
      expect(result.failedEdits).toBe(2);
      expect(fs.existsSync(testFile2)).toBe(false); // rolled back - file removed
      expect(fs.readFileSync(testFile1, 'utf8')).toBe('Hello World'); // unchanged
    });
  });

  describe('getDescription', () => {
    it('should describe single file edit', () => {
      const params: MultiEditToolParams = {
        edits: [
          {
            file_path: path.join(rootDir, 'test.txt'),
            old_string: 'old',
            new_string: 'new',
          },
        ],
      };

      const description = tool.getDescription(params);
      expect(description).toContain('1 edits in test.txt');
    });

    it('should describe multi-file edit', () => {
      const params: MultiEditToolParams = {
        edits: [
          {
            file_path: path.join(rootDir, 'test1.txt'),
            old_string: 'old',
            new_string: 'new',
          },
          {
            file_path: path.join(rootDir, 'test2.txt'),
            old_string: 'old',
            new_string: 'new',
          },
        ],
      };

      const description = tool.getDescription(params);
      expect(description).toContain('2 edits across 2 files');
    });

    it('should indicate atomic operations', () => {
      const params: MultiEditToolParams = {
        atomic: true,
        edits: [
          {
            file_path: path.join(rootDir, 'test.txt'),
            old_string: 'old',
            new_string: 'new',
          },
        ],
      };

      const description = tool.getDescription(params);
      expect(description).toContain('(atomic)');
    });

    it('should handle empty edits', () => {
      const params: MultiEditToolParams = {
        edits: [],
      };

      const description = tool.getDescription(params);
      expect(description).toBe('Multi-edit: No edits provided');
    });
  });

  describe('shouldConfirmExecute', () => {
    it('should skip confirmation in AUTO_EDIT mode', async () => {
      (mockConfig.getApprovalMode as Mock).mockReturnValue(ApprovalMode.AUTO_EDIT);

      const params: MultiEditToolParams = {
        edits: [
          {
            file_path: path.join(rootDir, 'test.txt'),
            old_string: 'old',
            new_string: 'new',
          },
        ],
      };

      const result = await tool.shouldConfirmExecute(params, new AbortController().signal);
      expect(result).toBe(false);
    });

    it('should return false for invalid parameters', async () => {
      const params: MultiEditToolParams = {
        edits: [],
      };

      const result = await tool.shouldConfirmExecute(params, new AbortController().signal);
      expect(result).toBe(false);
    });

    it('should return false when conflicts detected', async () => {
      const testFile = path.join(rootDir, 'test.txt');

      const params: MultiEditToolParams = {
        edits: [
          {
            file_path: testFile,
            old_string: '',
            new_string: 'content1',
          },
          {
            file_path: testFile,
            old_string: '',
            new_string: 'content2',
          },
        ],
      };

      const result = await tool.shouldConfirmExecute(params, new AbortController().signal);
      expect(result).toBe(false);
    });
  });
});