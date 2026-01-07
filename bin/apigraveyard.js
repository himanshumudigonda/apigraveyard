#!/usr/bin/env node

/**
 * APIgraveyard CLI Entry Point
 * Find the dead APIs haunting your codebase
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createInterface } from 'readline';

// Import modules
import { scanDirectory } from '../src/scanner.js';
import { testKeys, KeyStatus } from '../src/tester.js';
import {
  initDatabase,
  saveProject,
  getProject,
  getAllProjects,
  updateKeysStatus,
  deleteProject,
  addBannedKey,
  isBanned,
  getDatabaseStats
} from '../src/database.js';
import {
  showBanner,
  displayScanResults,
  displayTestResults,
  displayProjectList,
  displayKeyDetails,
  showWarning,
  showError,
  showSuccess,
  showInfo,
  displayStats,
  createSpinner
} from '../src/display.js';

/**
 * Log file path
 * @constant {string}
 */
const LOG_FILE = path.join(os.homedir(), '.apigraveyard.log');

/**
 * Exit codes
 * @enum {number}
 */
const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  INVALID_ARGS: 2
};

/**
 * Logs an error to the log file
 * 
 * @param {Error} error - Error to log
 * @param {string} context - Context where error occurred
 */
async function logError(error, context = '') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${context}\n${error.stack || error.message}\n\n`;
  
  try {
    await fs.appendFile(LOG_FILE, logEntry);
  } catch {
    // Silently fail if we can't write to log
  }
}

/**
 * Prompts user for confirmation
 * 
 * @param {string} question - Question to ask
 * @returns {Promise<boolean>} - User's response
 */
async function confirm(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(chalk.yellow(`${question} (y/N): `), (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Validates that a directory exists
 * 
 * @param {string} dirPath - Directory path to validate
 * @returns {Promise<boolean>} - True if valid directory
 */
async function validateDirectory(dirPath) {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Handles graceful shutdown
 */
function setupGracefulShutdown() {
  let isShuttingDown = false;

  const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(chalk.dim(`\n\nReceived ${signal}. Cleaning up...`));
    
    // Give time for any pending database writes
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log(chalk.dim('Goodbye! 🪦'));
    process.exit(EXIT_CODES.SUCCESS);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

/**
 * Creates the CLI program
 * 
 * @returns {Command} - Commander program instance
 */
function createProgram() {
  const program = new Command();

  program
    .name('apigraveyard')
    .description('🪦 Find the dead APIs haunting your codebase')
    .version('1.0.0')
    .hook('preAction', () => {
      // Show banner before each command
      showBanner();
    });

  // ============================================
  // SCAN COMMAND
  // ============================================
  program
    .command('scan <directory>')
    .description('Scan a project directory for exposed API keys')
    .option('-r, --recursive', 'Scan directories recursively', true)
    .option('-t, --test', 'Test keys after scanning', false)
    .option('-i, --ignore <patterns...>', 'Additional patterns to ignore')
    .action(async (directory, options) => {
      try {
        const dirPath = path.resolve(directory);

        // Validate directory
        if (!await validateDirectory(dirPath)) {
          showError(`Directory not found: ${dirPath}`);
          process.exit(EXIT_CODES.INVALID_ARGS);
        }

        showInfo(`Scanning directory: ${chalk.cyan(dirPath)}`);

        // Start scanning
        const spinner = createSpinner('Scanning files for API keys...').start();

        const scanResults = await scanDirectory(dirPath, {
          recursive: options.recursive,
          ignorePatterns: options.ignore || []
        });

        spinner.succeed(`Scanned ${scanResults.totalFiles} files`);

        // Display results
        displayScanResults(scanResults);

        // Check for banned keys
        for (const key of scanResults.keysFound) {
          if (await isBanned(key.fullKey)) {
            showWarning(`Found banned key: ${key.key} in ${key.filePath}`);
          }
        }

        // Save to database
        if (scanResults.keysFound.length > 0) {
          await saveProject(dirPath, scanResults);
          showSuccess(`Project saved to database`);

          // Test keys if flag is set
          if (options.test) {
            console.log('');
            showInfo('Testing found keys...');
            
            const testResults = await testKeys(scanResults.keysFound, { showSpinner: true });
            
            // Update database with test results
            await updateKeysStatus(dirPath, testResults);
            
            // Display test results
            displayTestResults(testResults);
          }
        }

        process.exit(EXIT_CODES.SUCCESS);
      } catch (error) {
        await logError(error, 'scan command');
        showError(`Scan failed: ${error.message}`);
        process.exit(EXIT_CODES.ERROR);
      }
    });

  // ============================================
  // TEST COMMAND
  // ============================================
  program
    .command('test [project-path]')
    .description('Test validity of stored API keys')
    .option('-a, --all', 'Test all projects', false)
    .action(async (projectPath, options) => {
      try {
        await initDatabase();

        let projectsToTest = [];

        if (projectPath) {
          const project = await getProject(path.resolve(projectPath));
          if (!project) {
            showError(`Project not found in database: ${projectPath}`);
            showInfo('Run "apigraveyard scan <directory>" first');
            process.exit(EXIT_CODES.INVALID_ARGS);
          }
          projectsToTest = [project];
        } else {
          projectsToTest = await getAllProjects();
          if (projectsToTest.length === 0) {
            showWarning('No projects in database');
            showInfo('Run "apigraveyard scan <directory>" to scan a project');
            process.exit(EXIT_CODES.SUCCESS);
          }
        }

        showInfo(`Testing keys from ${projectsToTest.length} project(s)...`);

        for (const project of projectsToTest) {
          console.log(`\n${chalk.bold.cyan(`📁 ${project.name}`)} ${chalk.dim(project.path)}`);

          if (!project.keys || project.keys.length === 0) {
            showInfo('No keys to test in this project');
            continue;
          }

          const testResults = await testKeys(project.keys, { showSpinner: true });

          // Update database
          await updateKeysStatus(project.path, testResults);

          // Display results
          displayTestResults(testResults);
        }

        showSuccess('Testing complete');
        process.exit(EXIT_CODES.SUCCESS);
      } catch (error) {
        await logError(error, 'test command');
        showError(`Test failed: ${error.message}`);
        process.exit(EXIT_CODES.ERROR);
      }
    });

  // ============================================
  // LIST COMMAND
  // ============================================
  program
    .command('list')
    .description('List all scanned projects')
    .option('-s, --stats', 'Show database statistics', false)
    .action(async (options) => {
      try {
        await initDatabase();

        if (options.stats) {
          const stats = await getDatabaseStats();
          displayStats(stats);
        }

        const projects = await getAllProjects();
        displayProjectList(projects);

        process.exit(EXIT_CODES.SUCCESS);
      } catch (error) {
        await logError(error, 'list command');
        showError(`List failed: ${error.message}`);
        process.exit(EXIT_CODES.ERROR);
      }
    });

  // ============================================
  // SHOW COMMAND
  // ============================================
  program
    .command('show <project-path>')
    .description('Show details for a specific project')
    .option('-k, --key <index>', 'Show details for specific key by index')
    .action(async (projectPath, options) => {
      try {
        await initDatabase();

        const project = await getProject(path.resolve(projectPath));

        if (!project) {
          showError(`Project not found: ${projectPath}`);
          showInfo('Run "apigraveyard list" to see all projects');
          process.exit(EXIT_CODES.INVALID_ARGS);
        }

        console.log(`\n${chalk.bold.cyan(`📁 Project: ${project.name}`)}`);
        console.log(chalk.dim(`Path: ${project.path}`));
        console.log(chalk.dim(`Scanned: ${new Date(project.scannedAt).toLocaleString()}`));
        console.log(chalk.dim(`Total files: ${project.totalFiles}`));
        console.log(chalk.dim('─'.repeat(50)));

        if (!project.keys || project.keys.length === 0) {
          showInfo('No keys found in this project');
          process.exit(EXIT_CODES.SUCCESS);
        }

        if (options.key !== undefined) {
          const keyIndex = parseInt(options.key, 10);
          if (keyIndex < 0 || keyIndex >= project.keys.length) {
            showError(`Invalid key index. Valid range: 0-${project.keys.length - 1}`);
            process.exit(EXIT_CODES.INVALID_ARGS);
          }
          displayKeyDetails(project.keys[keyIndex]);
        } else {
          console.log(`\n${chalk.bold('Found Keys:')}\n`);
          project.keys.forEach((key, index) => {
            console.log(`  ${chalk.dim(`[${index}]`)} ${chalk.white(key.service.padEnd(15))} ${chalk.yellow(key.key)}`);
            console.log(`       ${chalk.dim(`${key.filePath}:${key.lineNumber}`)} ${key.status ? `[${key.status}]` : ''}`);
          });
          console.log('');
          showInfo('Use --key <index> to see full details for a specific key');
        }

        process.exit(EXIT_CODES.SUCCESS);
      } catch (error) {
        await logError(error, 'show command');
        showError(`Show failed: ${error.message}`);
        process.exit(EXIT_CODES.ERROR);
      }
    });

  // ============================================
  // CLEAN COMMAND
  // ============================================
  program
    .command('clean')
    .description('Remove invalid/expired keys from database')
    .option('-f, --force', 'Skip confirmation prompt', false)
    .action(async (options) => {
      try {
        await initDatabase();

        const projects = await getAllProjects();

        if (projects.length === 0) {
          showInfo('No projects in database');
          process.exit(EXIT_CODES.SUCCESS);
        }

        // Count keys to remove
        let totalToRemove = 0;
        const keysToRemove = [];

        for (const project of projects) {
          if (!project.keys) continue;
          
          for (const key of project.keys) {
            if (key.status === KeyStatus.INVALID || key.status === KeyStatus.EXPIRED) {
              totalToRemove++;
              keysToRemove.push({
                project: project.name,
                service: key.service,
                key: key.key,
                status: key.status
              });
            }
          }
        }

        if (totalToRemove === 0) {
          showSuccess('No invalid or expired keys found');
          process.exit(EXIT_CODES.SUCCESS);
        }

        console.log(`\n${chalk.bold('Keys to remove:')}\n`);
        keysToRemove.forEach(k => {
          const statusColor = k.status === KeyStatus.INVALID ? chalk.red : chalk.yellow;
          console.log(`  ${chalk.dim(k.project)} / ${k.service}: ${chalk.yellow(k.key)} ${statusColor(`[${k.status}]`)}`);
        });
        console.log('');

        // Confirm unless --force
        if (!options.force) {
          const confirmed = await confirm(`Remove ${totalToRemove} key(s) from database?`);
          if (!confirmed) {
            showInfo('Cancelled');
            process.exit(EXIT_CODES.SUCCESS);
          }
        }

        // Remove keys
        let removedCount = 0;
        for (const project of projects) {
          if (!project.keys) continue;

          const originalCount = project.keys.length;
          project.keys = project.keys.filter(
            k => k.status !== KeyStatus.INVALID && k.status !== KeyStatus.EXPIRED
          );
          removedCount += originalCount - project.keys.length;

          // Re-save project
          await saveProject(project.path, {
            totalFiles: project.totalFiles,
            keysFound: project.keys
          });
        }

        showSuccess(`Removed ${removedCount} invalid/expired key(s) from database`);
        process.exit(EXIT_CODES.SUCCESS);
      } catch (error) {
        await logError(error, 'clean command');
        showError(`Clean failed: ${error.message}`);
        process.exit(EXIT_CODES.ERROR);
      }
    });

  // ============================================
  // EXPORT COMMAND
  // ============================================
  program
    .command('export')
    .description('Export all keys to a file')
    .option('-f, --format <format>', 'Output format (json|csv)', 'json')
    .option('-o, --output <file>', 'Output file path')
    .option('--include-full-keys', 'Include unmasked keys (dangerous!)', false)
    .action(async (options) => {
      try {
        await initDatabase();

        const projects = await getAllProjects();

        if (projects.length === 0) {
          showWarning('No projects to export');
          process.exit(EXIT_CODES.SUCCESS);
        }

        const format = options.format.toLowerCase();
        if (format !== 'json' && format !== 'csv') {
          showError('Invalid format. Use "json" or "csv"');
          process.exit(EXIT_CODES.INVALID_ARGS);
        }

        // Warn about including full keys
        if (options.includeFullKeys) {
          showWarning('You are about to export unmasked API keys!');
          const confirmed = await confirm('Are you sure you want to include full keys?');
          if (!confirmed) {
            showInfo('Export cancelled');
            process.exit(EXIT_CODES.SUCCESS);
          }
        }

        const outputFile = options.output || `apigraveyard-export.${format}`;
        let content = '';

        if (format === 'json') {
          const exportData = {
            exportedAt: new Date().toISOString(),
            projects: projects.map(p => ({
              ...p,
              keys: p.keys?.map(k => ({
                ...k,
                fullKey: options.includeFullKeys ? k.fullKey : undefined
              }))
            }))
          };
          content = JSON.stringify(exportData, null, 2);
        } else {
          // CSV format
          const headers = ['Project', 'Service', 'Key', 'Status', 'File', 'Line', 'Last Tested'];
          if (options.includeFullKeys) headers.push('Full Key');

          const rows = [headers.join(',')];

          for (const project of projects) {
            if (!project.keys) continue;
            for (const key of project.keys) {
              const row = [
                `"${project.name}"`,
                `"${key.service}"`,
                `"${key.key}"`,
                `"${key.status || 'UNTESTED'}"`,
                `"${key.filePath}"`,
                key.lineNumber,
                `"${key.lastTested || ''}"`
              ];
              if (options.includeFullKeys) {
                row.push(`"${key.fullKey}"`);
              }
              rows.push(row.join(','));
            }
          }

          content = rows.join('\n');
        }

        await fs.writeFile(outputFile, content, 'utf-8');
        showSuccess(`Exported to ${chalk.cyan(outputFile)}`);

        process.exit(EXIT_CODES.SUCCESS);
      } catch (error) {
        await logError(error, 'export command');
        showError(`Export failed: ${error.message}`);
        process.exit(EXIT_CODES.ERROR);
      }
    });

  // ============================================
  // BAN COMMAND
  // ============================================
  program
    .command('ban <key>')
    .description('Ban an API key (mark as compromised)')
    .option('-d, --delete', 'Offer to delete from all files', false)
    .action(async (keyValue, options) => {
      try {
        await initDatabase();

        // Add to banned list
        const added = await addBannedKey(keyValue);

        if (added) {
          showSuccess(`Key has been banned: ${chalk.yellow(keyValue.substring(0, 10) + '...')}`);
        } else {
          showInfo('Key is already banned');
        }

        // Find occurrences in projects
        const projects = await getAllProjects();
        const occurrences = [];

        for (const project of projects) {
          if (!project.keys) continue;
          for (const key of project.keys) {
            if (key.fullKey === keyValue) {
              occurrences.push({
                project: project.name,
                projectPath: project.path,
                filePath: key.filePath,
                lineNumber: key.lineNumber
              });
            }
          }
        }

        if (occurrences.length > 0) {
          console.log(`\n${chalk.bold('Key found in these locations:')}\n`);
          occurrences.forEach((occ, idx) => {
            console.log(`  ${idx + 1}. ${chalk.dim(occ.project)} / ${occ.filePath}:${occ.lineNumber}`);
          });
          console.log('');

          if (options.delete) {
            showWarning('File deletion is not yet implemented');
            showInfo('Please manually remove the key from the listed files');
          } else {
            showInfo('Use --delete flag to remove key from files');
          }
        }

        showWarning('Remember to rotate this key with your service provider!');

        process.exit(EXIT_CODES.SUCCESS);
      } catch (error) {
        await logError(error, 'ban command');
        showError(`Ban failed: ${error.message}`);
        process.exit(EXIT_CODES.ERROR);
      }
    });

  // ============================================
  // DELETE COMMAND
  // ============================================
  program
    .command('delete <project-path>')
    .description('Remove a project from tracking')
    .option('-f, --force', 'Skip confirmation prompt', false)
    .action(async (projectPath, options) => {
      try {
        await initDatabase();

        const resolvedPath = path.resolve(projectPath);
        const project = await getProject(resolvedPath);

        if (!project) {
          showError(`Project not found: ${projectPath}`);
          process.exit(EXIT_CODES.INVALID_ARGS);
        }

        if (!options.force) {
          const confirmed = await confirm(`Remove project "${project.name}" from database?`);
          if (!confirmed) {
            showInfo('Cancelled');
            process.exit(EXIT_CODES.SUCCESS);
          }
        }

        const deleted = await deleteProject(resolvedPath);

        if (deleted) {
          showSuccess(`Project "${project.name}" removed from database`);
        } else {
          showError('Failed to delete project');
        }

        process.exit(EXIT_CODES.SUCCESS);
      } catch (error) {
        await logError(error, 'delete command');
        showError(`Delete failed: ${error.message}`);
        process.exit(EXIT_CODES.ERROR);
      }
    });

  // ============================================
  // STATS COMMAND
  // ============================================
  program
    .command('stats')
    .description('Show database statistics')
    .action(async () => {
      try {
        await initDatabase();
        const stats = await getDatabaseStats();
        displayStats(stats);
        process.exit(EXIT_CODES.SUCCESS);
      } catch (error) {
        await logError(error, 'stats command');
        showError(`Stats failed: ${error.message}`);
        process.exit(EXIT_CODES.ERROR);
      }
    });

  return program;
}

/**
 * Main entry point
 */
async function main() {
  // Setup graceful shutdown handlers
  setupGracefulShutdown();

  const program = createProgram();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    await logError(error, 'main');
    showError(`An unexpected error occurred: ${error.message}`);
    console.log(chalk.dim(`See ${LOG_FILE} for details`));
    process.exit(EXIT_CODES.ERROR);
  }
}

// Run the CLI
main();
