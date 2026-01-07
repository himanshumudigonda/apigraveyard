/**
 * Database Module
 * JSON-based storage system for API key tracking
 * Stores data in ~/.apigraveyard.json
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * Database file path in user's home directory
 * @constant {string}
 */
const DB_FILE = path.join(os.homedir(), '.apigraveyard.json');

/**
 * Backup file path
 * @constant {string}
 */
const DB_BACKUP_FILE = path.join(os.homedir(), '.apigraveyard.backup.json');

/**
 * Current database schema version
 * @constant {string}
 */
const DB_VERSION = '1.0.0';

/**
 * Creates an empty database structure
 * 
 * @returns {Object} - Empty database object with default structure
 */
function createEmptyDatabase() {
  return {
    version: DB_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projects: [],
    bannedKeys: []
  };
}

/**
 * Generates a UUID v4 for project identification
 * 
 * @returns {string} - UUID string
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Normalizes a file path for consistent comparison
 * 
 * @param {string} filePath - Path to normalize
 * @returns {string} - Normalized path
 */
function normalizePath(filePath) {
  return path.resolve(filePath).toLowerCase();
}

/**
 * Reads and parses the database file
 * 
 * @returns {Promise<Object>} - Parsed database object
 * @throws {Error} - If file cannot be read or parsed
 */
async function readDatabase() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return empty database
      return null;
    }
    if (error instanceof SyntaxError) {
      // JSON parse error - try to recover from backup
      console.warn('⚠️  Database file corrupted, attempting to restore from backup...');
      try {
        const backupData = await fs.readFile(DB_BACKUP_FILE, 'utf-8');
        return JSON.parse(backupData);
      } catch {
        console.error('❌ Backup also corrupted or missing. Creating new database.');
        return null;
      }
    }
    throw error;
  }
}

/**
 * Writes the database to file atomically
 * Uses write-to-temp-then-rename strategy for safety
 * 
 * @param {Object} db - Database object to write
 * @returns {Promise<void>}
 * @throws {Error} - If file cannot be written
 */
async function writeDatabase(db) {
  // Update timestamp
  db.updatedAt = new Date().toISOString();

  const tempFile = `${DB_FILE}.tmp`;
  const jsonData = JSON.stringify(db, null, 2);

  try {
    // Backup existing database before writing
    try {
      await fs.access(DB_FILE);
      await fs.copyFile(DB_FILE, DB_BACKUP_FILE);
    } catch {
      // No existing file to backup, that's OK
    }

    // Write to temp file first
    await fs.writeFile(tempFile, jsonData, 'utf-8');

    // Rename temp file to actual file (atomic operation)
    await fs.rename(tempFile, DB_FILE);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.unlink(tempFile);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Initializes the database
 * Creates the database file if it doesn't exist
 * 
 * @returns {Promise<Object>} - The database object
 * 
 * @example
 * const db = await initDatabase();
 * console.log(`Database version: ${db.version}`);
 */
export async function initDatabase() {
  let db = await readDatabase();

  if (!db) {
    db = createEmptyDatabase();
    await writeDatabase(db);
    console.log('✓ Created new APIgraveyard database at', DB_FILE);
  }

  // Handle version migrations if needed
  if (db.version !== DB_VERSION) {
    console.log(`📦 Migrating database from v${db.version} to v${DB_VERSION}`);
    db.version = DB_VERSION;
    await writeDatabase(db);
  }

  return db;
}

/**
 * Saves a project with scan results to the database
 * Updates existing project if path already exists
 * 
 * @param {string} projectPath - Full path to the project directory
 * @param {Object} scanResults - Results from scanner.scanDirectory()
 * @param {number} scanResults.totalFiles - Number of files scanned
 * @param {Array} scanResults.keysFound - Array of found keys
 * @returns {Promise<Object>} - The saved project object
 * 
 * @example
 * const results = await scanDirectory('./myproject');
 * const project = await saveProject('./myproject', results);
 * console.log(`Saved project: ${project.id}`);
 */
export async function saveProject(projectPath, scanResults) {
  const db = await initDatabase();
  const normalizedPath = normalizePath(projectPath);
  const projectName = path.basename(projectPath);

  // Check if project already exists
  const existingIndex = db.projects.findIndex(
    p => normalizePath(p.path) === normalizedPath
  );

  const project = {
    id: existingIndex >= 0 ? db.projects[existingIndex].id : generateUUID(),
    name: projectName,
    path: path.resolve(projectPath),
    scannedAt: new Date().toISOString(),
    totalFiles: scanResults.totalFiles,
    keys: scanResults.keysFound.map(key => ({
      service: key.service,
      key: key.key,
      fullKey: key.fullKey,
      status: null,
      filePath: key.filePath,
      lineNumber: key.lineNumber,
      column: key.column,
      lastTested: null,
      quotaInfo: {}
    }))
  };

  if (existingIndex >= 0) {
    // Update existing project
    db.projects[existingIndex] = project;
  } else {
    // Add new project
    db.projects.push(project);
  }

  await writeDatabase(db);
  return project;
}

/**
 * Retrieves a project by its path
 * 
 * @param {string} projectPath - Path to the project
 * @returns {Promise<Object|null>} - Project object or null if not found
 * 
 * @example
 * const project = await getProject('./myproject');
 * if (project) {
 *   console.log(`Found ${project.keys.length} keys`);
 * }
 */
export async function getProject(projectPath) {
  const db = await initDatabase();
  const normalizedPath = normalizePath(projectPath);

  const project = db.projects.find(
    p => normalizePath(p.path) === normalizedPath
  );

  return project || null;
}

/**
 * Retrieves all projects from the database
 * 
 * @returns {Promise<Array>} - Array of all project objects
 * 
 * @example
 * const projects = await getAllProjects();
 * projects.forEach(p => console.log(p.name));
 */
export async function getAllProjects() {
  const db = await initDatabase();
  return db.projects;
}

/**
 * Updates the status of a specific key in a project
 * 
 * @param {string} projectPath - Path to the project
 * @param {string} keyValue - The full key value to update
 * @param {Object} testResult - Test result from tester.js
 * @param {string} testResult.status - Key status (VALID, INVALID, etc.)
 * @param {Object} testResult.details - Additional details from testing
 * @returns {Promise<boolean>} - True if updated, false if not found
 * 
 * @example
 * await updateKeyStatus('./myproject', 'sk-xxx...', {
 *   status: 'VALID',
 *   details: { modelsCount: 15 }
 * });
 */
export async function updateKeyStatus(projectPath, keyValue, testResult) {
  const db = await initDatabase();
  const normalizedPath = normalizePath(projectPath);

  const project = db.projects.find(
    p => normalizePath(p.path) === normalizedPath
  );

  if (!project) {
    return false;
  }

  const key = project.keys.find(k => k.fullKey === keyValue);

  if (!key) {
    return false;
  }

  key.status = testResult.status;
  key.lastTested = new Date().toISOString();
  key.quotaInfo = testResult.details || {};

  if (testResult.error) {
    key.lastError = testResult.error;
  }

  await writeDatabase(db);
  return true;
}

/**
 * Updates multiple keys in a project with test results
 * 
 * @param {string} projectPath - Path to the project
 * @param {Array} testResults - Array of test results from testKeys()
 * @returns {Promise<number>} - Number of keys updated
 * 
 * @example
 * const results = await testKeys(keysFound);
 * const count = await updateKeysStatus('./myproject', results);
 * console.log(`Updated ${count} keys`);
 */
export async function updateKeysStatus(projectPath, testResults) {
  const db = await initDatabase();
  const normalizedPath = normalizePath(projectPath);

  const project = db.projects.find(
    p => normalizePath(p.path) === normalizedPath
  );

  if (!project) {
    return 0;
  }

  let updatedCount = 0;

  for (const result of testResults) {
    const key = project.keys.find(k => k.fullKey === result.fullKey);
    if (key) {
      key.status = result.status;
      key.lastTested = new Date().toISOString();
      key.quotaInfo = result.details || {};
      if (result.error) {
        key.lastError = result.error;
      }
      updatedCount++;
    }
  }

  await writeDatabase(db);
  return updatedCount;
}

/**
 * Deletes a project from the database
 * 
 * @param {string} projectPath - Path to the project to delete
 * @returns {Promise<boolean>} - True if deleted, false if not found
 * 
 * @example
 * const deleted = await deleteProject('./myproject');
 * if (deleted) {
 *   console.log('Project removed from tracking');
 * }
 */
export async function deleteProject(projectPath) {
  const db = await initDatabase();
  const normalizedPath = normalizePath(projectPath);

  const initialLength = db.projects.length;
  db.projects = db.projects.filter(
    p => normalizePath(p.path) !== normalizedPath
  );

  if (db.projects.length < initialLength) {
    await writeDatabase(db);
    return true;
  }

  return false;
}

/**
 * Adds a key to the banned keys list
 * Banned keys will be flagged in future scans
 * 
 * @param {string} keyValue - The full key value to ban
 * @returns {Promise<boolean>} - True if added, false if already banned
 * 
 * @example
 * await addBannedKey('sk-compromised-key-here');
 */
export async function addBannedKey(keyValue) {
  const db = await initDatabase();

  // Check if already banned
  if (db.bannedKeys.includes(keyValue)) {
    return false;
  }

  db.bannedKeys.push(keyValue);
  await writeDatabase(db);
  return true;
}

/**
 * Removes a key from the banned keys list
 * 
 * @param {string} keyValue - The full key value to unban
 * @returns {Promise<boolean>} - True if removed, false if not found
 */
export async function removeBannedKey(keyValue) {
  const db = await initDatabase();

  const initialLength = db.bannedKeys.length;
  db.bannedKeys = db.bannedKeys.filter(k => k !== keyValue);

  if (db.bannedKeys.length < initialLength) {
    await writeDatabase(db);
    return true;
  }

  return false;
}

/**
 * Checks if a key is in the banned keys list
 * 
 * @param {string} keyValue - The full key value to check
 * @returns {Promise<boolean>} - True if banned, false otherwise
 * 
 * @example
 * if (await isBanned(key.fullKey)) {
 *   console.log('⚠️ This key has been marked as compromised!');
 * }
 */
export async function isBanned(keyValue) {
  const db = await initDatabase();
  return db.bannedKeys.includes(keyValue);
}

/**
 * Gets all banned keys
 * 
 * @returns {Promise<string[]>} - Array of banned key values
 */
export async function getBannedKeys() {
  const db = await initDatabase();
  return db.bannedKeys;
}

/**
 * Gets database statistics
 * 
 * @returns {Promise<Object>} - Statistics about the database
 * 
 * @example
 * const stats = await getDatabaseStats();
 * console.log(`Tracking ${stats.totalProjects} projects with ${stats.totalKeys} keys`);
 */
export async function getDatabaseStats() {
  const db = await initDatabase();

  const totalKeys = db.projects.reduce((sum, p) => sum + p.keys.length, 0);
  const validKeys = db.projects.reduce(
    (sum, p) => sum + p.keys.filter(k => k.status === 'VALID').length,
    0
  );
  const invalidKeys = db.projects.reduce(
    (sum, p) => sum + p.keys.filter(k => k.status === 'INVALID').length,
    0
  );
  const untestedKeys = db.projects.reduce(
    (sum, p) => sum + p.keys.filter(k => k.status === null).length,
    0
  );

  return {
    version: db.version,
    totalProjects: db.projects.length,
    totalKeys,
    validKeys,
    invalidKeys,
    untestedKeys,
    bannedKeys: db.bannedKeys.length,
    createdAt: db.createdAt,
    updatedAt: db.updatedAt,
    dbPath: DB_FILE
  };
}

/**
 * Gets the database file path
 * 
 * @returns {string} - Path to the database file
 */
export function getDatabasePath() {
  return DB_FILE;
}

/**
 * Clears all data from the database
 * Creates a fresh empty database
 * 
 * @returns {Promise<void>}
 */
export async function clearDatabase() {
  const db = createEmptyDatabase();
  await writeDatabase(db);
}

export default {
  initDatabase,
  saveProject,
  getProject,
  getAllProjects,
  updateKeyStatus,
  updateKeysStatus,
  deleteProject,
  addBannedKey,
  removeBannedKey,
  isBanned,
  getBannedKeys,
  getDatabaseStats,
  getDatabasePath,
  clearDatabase
};
