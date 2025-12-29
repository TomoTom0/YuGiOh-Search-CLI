import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findDocs, showDoc, listDocs, findDocByName, type DocEntry } from '../../src/lib/cli-docs.js';
import fs from 'fs/promises';

// fs/promises のモック
vi.mock('fs/promises', () => ({
  default: {
    readdir: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn()
  }
}));

describe('cli-docs', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('findDocs', () => {
    it('should find all markdown files and categorize them', async () => {
      const mockFiles = [
        'functions/searchCards.md',
        'interfaces/Card.md',
        'type-aliases/CardType.md',
        'README.md'
      ];

      (fs.readdir as any).mockResolvedValue(mockFiles as any);
      (fs.stat as any).mockResolvedValue({ isFile: () => true } as any);

      const entries = await findDocs('/test/docs');

      expect(entries).toHaveLength(4);
      expect(entries[0]).toMatchObject({
        name: 'searchCards',
        type: 'function'
      });
      expect(entries[1]).toMatchObject({
        name: 'Card',
        type: 'interface'
      });
      expect(entries[2]).toMatchObject({
        name: 'CardType',
        type: 'type'
      });
      expect(entries[3]).toMatchObject({
        name: 'README',
        type: 'module'
      });
    });

    it('should return empty array when directory does not exist', async () => {
      (fs.readdir as any).mockRejectedValue(new Error('ENOENT'));

      const entries = await findDocs('/nonexistent');

      expect(entries).toEqual([]);
    });

    it('should ignore non-markdown files', async () => {
      const mockFiles = [
        'functions/searchCards.md',
        'functions/searchCards.js',
        'interfaces/Card.d.ts'
      ];

      (fs.readdir as any).mockResolvedValue(mockFiles as any);
      (fs.stat as any).mockResolvedValue({ isFile: () => true } as any);

      const entries = await findDocs('/test/docs');

      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('searchCards');
    });

    it('should ignore directories', async () => {
      const mockFiles = ['functions/searchCards.md', 'functions'];

      (fs.readdir as any).mockResolvedValue(mockFiles as any);

      let callCount = 0;
      (fs.stat as any).mockImplementation(async () => {
        callCount++;
        return { isFile: () => callCount === 1 } as any;
      });

      const entries = await findDocs('/test/docs');

      expect(entries).toHaveLength(1);
    });
  });

  describe('showDoc', () => {
    it('should read and display documentation content', async () => {
      const mockContent = '# Function: searchCards\n\nSearch cards by filter.';
      (fs.readFile as any).mockResolvedValue(mockContent);

      await showDoc('/path/to/doc.md');

      expect(fs.readFile).toHaveBeenCalledWith('/path/to/doc.md', 'utf-8');
      expect(consoleLogSpy).toHaveBeenCalledWith(mockContent);
    });

    it('should throw error when file cannot be read', async () => {
      (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));

      await expect(showDoc('/nonexistent.md')).rejects.toThrow('Could not read document');
    });
  });

  describe('listDocs', () => {
    it('should list documentation grouped by type', async () => {
      const mockEntries: DocEntry[] = [
        { name: 'searchCards', path: '/docs/functions/searchCards.md', type: 'function' },
        { name: 'seekCards', path: '/docs/functions/seekCards.md', type: 'function' },
        { name: 'Card', path: '/docs/interfaces/Card.md', type: 'interface' },
        { name: 'CardType', path: '/docs/types/CardType.md', type: 'type' }
      ];

      await listDocs(mockEntries);

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');

      expect(output).toContain('Functions:');
      expect(output).toContain('searchCards');
      expect(output).toContain('seekCards');
      expect(output).toContain('Interfaces:');
      expect(output).toContain('Card');
      expect(output).toContain('Types:');
      expect(output).toContain('CardType');
    });

    it('should sort entries alphabetically within each type', async () => {
      const mockEntries: DocEntry[] = [
        { name: 'seekCards', path: '/docs/functions/seekCards.md', type: 'function' },
        { name: 'searchCards', path: '/docs/functions/searchCards.md', type: 'function' },
        { name: 'convertCards', path: '/docs/functions/convertCards.md', type: 'function' }
      ];

      await listDocs(mockEntries);

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const functionIndex = calls.findIndex(c => c === 'Functions:');
      const functionNames = calls.slice(functionIndex + 1, functionIndex + 4);

      expect(functionNames).toEqual([
        '  - convertCards',
        '  - searchCards',
        '  - seekCards'
      ]);
    });

    it('should show message when no documentation found', async () => {
      await listDocs([]);

      expect(consoleLogSpy).toHaveBeenCalledWith('No documentation found. Please run: bun run docs');
    });
  });

  describe('findDocByName', () => {
    const mockEntries: DocEntry[] = [
      { name: 'searchCards', path: '/docs/functions/searchCards.md', type: 'function' },
      { name: 'Card', path: '/docs/interfaces/Card.md', type: 'interface' },
      { name: 'CardType', path: '/docs/types/CardType.md', type: 'type' }
    ];

    it('should find documentation by exact name', () => {
      const result = findDocByName(mockEntries, 'searchCards');

      expect(result).toBeDefined();
      expect(result?.name).toBe('searchCards');
      expect(result?.type).toBe('function');
    });

    it('should find documentation case-insensitively', () => {
      const result = findDocByName(mockEntries, 'SEARCHCARDS');

      expect(result).toBeDefined();
      expect(result?.name).toBe('searchCards');
    });

    it('should return undefined when documentation not found', () => {
      const result = findDocByName(mockEntries, 'nonexistent');

      expect(result).toBeUndefined();
    });
  });
});
