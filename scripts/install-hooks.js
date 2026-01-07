#!/usr/bin/env node

/**
 * APIgraveyard Hook Installer
 * Installs git hooks for API key detection
 * 
 * Usage:
 *   npm run install-hooks
 *   node scripts/install-hooks.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

/**
 * Logs a message with color
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Finds the git root directory
 */
function findGitRoot() {
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', { 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return gitRoot;
  } catch {
    return null;
  }
}

/**
 * Main installation function
 */
function installHooks() {
  log('\n🪦 APIgraveyard Hook Installer\n', 'cyan');

  // Find git root
  const gitRoot = findGitRoot();
  
  if (!gitRoot) {
    log('⚠️  Not a git repository. Skipping hook installation.', 'yellow');
    log('   Run "git init" first, then "npm run install-hooks"\n', 'dim');
    return;
  }

  const hooksDir = path.join(gitRoot, '.git', 'hooks');
  const sourceHook = path.join(__dirname, '..', 'hooks', 'pre-commit');
  const targetHook = path.join(hooksDir, 'pre-commit');

  // Check if source hook exists
  if (!fs.existsSync(sourceHook)) {
    log('❌ Source hook not found: ' + sourceHook, 'red');
    process.exit(1);
  }

  // Ensure hooks directory exists
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
    log('📁 Created hooks directory', 'dim');
  }

  // Check if hook already exists
  if (fs.existsSync(targetHook)) {
    // Read existing hook to check if it's ours
    const existingContent = fs.readFileSync(targetHook, 'utf-8');
    
    if (existingContent.includes('APIgraveyard')) {
      log('✓ Pre-commit hook already installed', 'green');
      
      // Update it anyway in case of changes
      const sourceContent = fs.readFileSync(sourceHook, 'utf-8');
      fs.writeFileSync(targetHook, sourceContent, { mode: 0o755 });
      log('  Updated to latest version', 'dim');
    } else {
      // There's an existing hook that's not ours
      log('⚠️  Existing pre-commit hook found', 'yellow');
      log('   Backing up to pre-commit.backup', 'dim');
      
      // Backup existing hook
      fs.copyFileSync(targetHook, targetHook + '.backup');
      
      // Install our hook
      const sourceContent = fs.readFileSync(sourceHook, 'utf-8');
      fs.writeFileSync(targetHook, sourceContent, { mode: 0o755 });
      log('✓ Pre-commit hook installed', 'green');
      log('  Your old hook was saved to pre-commit.backup', 'dim');
    }
  } else {
    // No existing hook, just copy
    const sourceContent = fs.readFileSync(sourceHook, 'utf-8');
    fs.writeFileSync(targetHook, sourceContent, { mode: 0o755 });
    log('✓ Pre-commit hook installed', 'green');
  }

  // Make executable on Unix systems
  try {
    if (process.platform !== 'win32') {
      fs.chmodSync(targetHook, 0o755);
      log('  Made hook executable', 'dim');
    }
  } catch (err) {
    log('⚠️  Could not set executable permission: ' + err.message, 'yellow');
  }

  log('\n📍 Hook installed at: ' + targetHook, 'dim');
  log('\n✅ APIgraveyard will now scan for API keys before each commit!\n', 'green');
  
  // Show how to bypass
  log('To bypass the check (not recommended):', 'dim');
  log('  git commit --no-verify\n', 'dim');
}

/**
 * Uninstall function
 */
function uninstallHooks() {
  log('\n🪦 APIgraveyard Hook Uninstaller\n', 'cyan');

  const gitRoot = findGitRoot();
  
  if (!gitRoot) {
    log('⚠️  Not a git repository.', 'yellow');
    return;
  }

  const targetHook = path.join(gitRoot, '.git', 'hooks', 'pre-commit');
  const backupHook = targetHook + '.backup';

  if (!fs.existsSync(targetHook)) {
    log('ℹ️  No pre-commit hook installed', 'dim');
    return;
  }

  const content = fs.readFileSync(targetHook, 'utf-8');
  
  if (!content.includes('APIgraveyard')) {
    log('⚠️  Pre-commit hook is not from APIgraveyard', 'yellow');
    return;
  }

  // Remove our hook
  fs.unlinkSync(targetHook);
  log('✓ Pre-commit hook removed', 'green');

  // Restore backup if exists
  if (fs.existsSync(backupHook)) {
    fs.renameSync(backupHook, targetHook);
    log('  Restored previous hook from backup', 'dim');
  }

  log('\n✅ APIgraveyard hooks uninstalled\n', 'green');
}

// Check command line arguments
const args = process.argv.slice(2);

if (args.includes('--uninstall') || args.includes('-u')) {
  uninstallHooks();
} else {
  installHooks();
}
