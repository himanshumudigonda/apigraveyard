/**
 * Scanner Module
 * Comprehensive API key scanning system for detecting exposed secrets in codebases
 */

import { glob } from 'glob';
import fs from 'fs/promises';
import path from 'path';

/**
 * API key patterns for various services
 * Each pattern includes the service name and regex to match
 * @type {Array<{service: string, pattern: RegExp}>}
 */
const API_KEY_PATTERNS = [
  { service: 'OpenAI', pattern: /sk-[A-Za-z0-9]{48}/g },
  { service: 'Groq', pattern: /gsk_[A-Za-z0-9]{52}/g },
  { service: 'GitHub', pattern: /gh[ps]_[A-Za-z0-9]{36}/g },
  { service: 'Stripe', pattern: /sk_(live|test)_[A-Za-z0-9]{24}/g },
  { service: 'Google/Firebase', pattern: /AIza[A-Za-z0-9_-]{35}/g },
  { service: 'AWS', pattern: /AKIA[A-Z0-9]{16}/g },
  { service: 'Anthropic', pattern: /sk-ant-[A-Za-z0-9-_]{95}/g },
  { service: 'Hugging Face', pattern: /hf_[A-Za-z0-9]{34}/g }
];

/**
 * Default directories to ignore during scanning
 * @type {string[]}
 */
const DEFAULT_IGNORE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'venv'
];

/**
 * Default files to ignore during scanning
 * @type {string[]}
 */
const DEFAULT_IGNORE_FILES = [
  'package-lock.json',
  'yarn.lock',
  '.env.example',
  '.env.sample'
];

/**
 * Masks an API key for safe display
 * Shows first 4 and last 4 characters, replaces middle with asterisks
 * 
 * @param {string} key - The full API key to mask
 * @returns {string} - Masked key (e.g., "sk-ab***...***xyz")
 * 
 * @example
 * maskKey('sk-abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGH')
 * // Returns: 'sk-a***...***EFGH'
 */
export function maskKey(key) {
  if (key.length <= 8) {
    return '*'.repeat(key.length);
  }
  const first = key.substring(0, 4);
  const last = key.substring(key.length - 4);
  return `${first}***...***${last}`;
}

/**
 * Finds the line number and column position of a match in text
 * 
 * @param {string} content - The full file content
 * @param {number} matchIndex - The character index where the match starts
 * @returns {{lineNumber: number, column: number}} - 1-indexed line and column
 * 
 * @example
 * getLineAndColumn('hello\nworld\ntest', 6)
 * // Returns: { lineNumber: 2, column: 1 }
 */
export function getLineAndColumn(content, matchIndex) {
  const lines = content.substring(0, matchIndex).split('\n');
  const lineNumber = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { lineNumber, column };
}

/**
 * Scans a single file for API key patterns
 * 
 * @param {string} filePath - Absolute path to the file
 * @param {string} basePath - Base directory for relative path calculation
 * @returns {Promise<Array<{service: string, key: string, fullKey: string, filePath: string, lineNumber: number, column: number}>>}
 *          Array of found API keys with their locations
 * 
 * @throws {Error} If file cannot be read (permissions, binary, etc.)
 */
async function scanFile(filePath, basePath) {
  const results = [];
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative(basePath, filePath).replace(/\\/g, '/');
    
    for (const { service, pattern } of API_KEY_PATTERNS) {
      // Reset regex lastIndex for each file
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      
      while ((match = regex.exec(content)) !== null) {
        const { lineNumber, column } = getLineAndColumn(content, match.index);
        
        results.push({
          service,
          key: maskKey(match[0]),
          fullKey: match[0],
          filePath: relativePath,
          lineNumber,
          column
        });
      }
    }
  } catch (error) {
    // Check if it's a binary file or permission error
    if (error.code === 'ENOENT') {
      console.warn(`⚠️  File not found: ${filePath}`);
    } else if (error.code === 'EACCES') {
      console.warn(`⚠️  Permission denied: ${filePath}`);
    } else if (error.message.includes('encoding')) {
      // Binary file, skip silently
    } else {
      console.warn(`⚠️  Could not read file: ${filePath} (${error.message})`);
    }
  }
  
  return results;
}

/**
 * Checks if a file should be ignored based on ignore patterns
 * 
 * @param {string} filePath - Path to check
 * @param {string[]} ignorePatterns - Array of patterns/names to ignore
 * @returns {boolean} - True if file should be ignored
 */
function shouldIgnoreFile(filePath, ignorePatterns) {
  const fileName = path.basename(filePath);
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  for (const pattern of ignorePatterns) {
    // Check if pattern matches filename directly
    if (fileName === pattern) {
      return true;
    }
    // Check if pattern appears in path (for directory patterns)
    if (normalizedPath.includes(`/${pattern}/`) || normalizedPath.includes(`${pattern}/`)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Removes duplicate API keys from results
 * Keys are considered duplicates if they have the same fullKey value
 * 
 * @param {Array<{service: string, key: string, fullKey: string, filePath: string, lineNumber: number, column: number}>} keys
 *        Array of found keys with possible duplicates
 * @returns {Array} - Deduplicated array (keeps first occurrence)
 */
function deduplicateKeys(keys) {
  const seen = new Set();
  return keys.filter(keyInfo => {
    if (seen.has(keyInfo.fullKey)) {
      return false;
    }
    seen.add(keyInfo.fullKey);
    return true;
  });
}

/**
 * Scans a directory for exposed API keys in source files
 * 
 * Recursively searches through all files in the specified directory,
 * applying regex patterns to detect API keys from various services
 * (OpenAI, GitHub, Stripe, AWS, etc.)
 * 
 * @param {string} dirPath - Root directory to scan (absolute or relative path)
 * @param {Object} [options={}] - Scanning options
 * @param {boolean} [options.recursive=true] - Whether to scan subdirectories
 * @param {string[]} [options.ignorePatterns=[]] - Additional patterns to ignore
 * 
 * @returns {Promise<{totalFiles: number, keysFound: Array<{service: string, key: string, fullKey: string, filePath: string, lineNumber: number, column: number}>}>}
 *          Scan results with total files scanned and array of found keys
 * 
 * @example
 * const results = await scanDirectory('./src', { recursive: true });
 * console.log(`Found ${results.keysFound.length} keys in ${results.totalFiles} files`);
 * 
 * @example
 * // With custom ignore patterns
 * const results = await scanDirectory('./project', {
 *   recursive: true,
 *   ignorePatterns: ['*.test.js', 'fixtures']
 * });
 */
export async function scanDirectory(dirPath, options = {}) {
  const {
    recursive = true,
    ignorePatterns = []
  } = options;

  // Combine default and custom ignore patterns
  const allIgnorePatterns = [
    ...DEFAULT_IGNORE_DIRS,
    ...DEFAULT_IGNORE_FILES,
    ...ignorePatterns
  ];

  // Build glob pattern
  const globPattern = recursive 
    ? path.join(dirPath, '**', '*').replace(/\\/g, '/')
    : path.join(dirPath, '*').replace(/\\/g, '/');

  // Build ignore patterns for glob
  const globIgnore = DEFAULT_IGNORE_DIRS.map(dir => `**/${dir}/**`);

  let files = [];
  let totalFiles = 0;
  const allKeys = [];

  try {
    // Find all files matching pattern
    files = await glob(globPattern, {
      nodir: true,
      ignore: globIgnore,
      dot: true // Include dotfiles
    });

    // Filter out ignored files
    files = files.filter(file => !shouldIgnoreFile(file, allIgnorePatterns));
    totalFiles = files.length;

    // Scan each file in parallel with concurrency limit
    const BATCH_SIZE = 50;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(file => scanFile(file, dirPath))
      );
      
      for (const results of batchResults) {
        allKeys.push(...results);
      }
    }

  } catch (error) {
    console.error(`❌ Error scanning directory: ${error.message}`);
    // Return partial results
    return {
      totalFiles,
      keysFound: deduplicateKeys(allKeys),
      error: error.message
    };
  }

  // Remove duplicates and return
  return {
    totalFiles,
    keysFound: deduplicateKeys(allKeys)
  };
}

/**
 * Gets the list of supported API key patterns
 * Useful for documentation or UI display
 * 
 * @returns {Array<{service: string, pattern: string}>} - Array of service names and their patterns
 */
export function getSupportedPatterns() {
  return API_KEY_PATTERNS.map(({ service, pattern }) => ({
    service,
    pattern: pattern.source
  }));
}

export default {
  scanDirectory,
  maskKey,
  getLineAndColumn,
  getSupportedPatterns
};
