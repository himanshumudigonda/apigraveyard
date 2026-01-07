/**
 * Display Module
 * Terminal UI display functions for APIgraveyard
 * Handles colored output, tables, and formatted messages
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';

/**
 * Status emoji mappings
 * @constant {Object.<string, string>}
 */
const STATUS_EMOJI = {
  VALID: '✅',
  INVALID: '❌',
  EXPIRED: '⏰',
  RATE_LIMITED: '⚠️',
  ERROR: '💥',
  UNTESTED: '❓'
};

/**
 * Status color functions
 * @constant {Object.<string, Function>}
 */
const STATUS_COLORS = {
  VALID: chalk.green,
  INVALID: chalk.red,
  EXPIRED: chalk.red,
  RATE_LIMITED: chalk.yellow,
  ERROR: chalk.gray,
  UNTESTED: chalk.yellow
};

/**
 * Display the APIgraveyard ASCII banner
 * 
 * @example
 * showBanner();
 */
export function showBanner() {
  const banner = `
${chalk.gray('    ___    ____  ____                                                __')}
${chalk.gray('   /   |  / __ \\/  _/___ __________ __   _____  __  ______ __________/ /')}
${chalk.gray('  / /| | / /_/ // // __ `/ ___/ __ `/ | / / _ \\/ / / / __ `/ ___/ __  /')} 
${chalk.gray(' / ___ |/ ____// // /_/ / /  / /_/ /| |/ /  __/ /_/ / /_/ / /  / /_/ /')}  
${chalk.gray('/_/  |_/_/   /___/\\__, /_/   \\__,_/ |___/\\___/\\__, /\\__,_/_/   \\__,_/')}   
${chalk.gray('                 /____/                      /____/')}                     
${chalk.dim('                                                          🪦 RIP APIs 🪦')}
`;
  console.log(banner);
}

/**
 * Creates a loading spinner with custom text
 * 
 * @param {string} text - Text to display next to spinner
 * @returns {import('ora').Ora} - Ora spinner instance
 * 
 * @example
 * const spinner = createSpinner('Scanning files...');
 * spinner.start();
 * // ... do work
 * spinner.succeed('Scan complete!');
 */
export function createSpinner(text) {
  return ora({
    text,
    spinner: 'dots'
  });
}

/**
 * Formats a timestamp for display
 * 
 * @param {string|Date} timestamp - ISO timestamp or Date object
 * @returns {string} - Formatted date string
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return chalk.dim('Never');
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Gets colored status text with emoji
 * 
 * @param {string} status - Status string (VALID, INVALID, etc.)
 * @returns {string} - Colored status with emoji
 */
function getStatusDisplay(status) {
  const emoji = STATUS_EMOJI[status] || STATUS_EMOJI.UNTESTED;
  const colorFn = STATUS_COLORS[status] || STATUS_COLORS.UNTESTED;
  return `${emoji} ${colorFn(status || 'UNTESTED')}`;
}

/**
 * Truncates a string to specified length with ellipsis
 * 
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated string
 */
function truncate(str, maxLength) {
  if (!str || str.length <= maxLength) return str || '';
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Displays scan results in a formatted table
 * Shows all found API keys with their locations and status
 * 
 * @param {Object} scanResults - Results from scanner.scanDirectory()
 * @param {number} scanResults.totalFiles - Number of files scanned
 * @param {Array} scanResults.keysFound - Array of found keys
 * 
 * @example
 * const results = await scanDirectory('./src');
 * displayScanResults(results);
 */
export function displayScanResults(scanResults) {
  const { totalFiles, keysFound } = scanResults;

  console.log('\n' + chalk.bold.cyan('📊 Scan Results'));
  console.log(chalk.dim('─'.repeat(60)));

  if (keysFound.length === 0) {
    console.log(chalk.green('\n✅ No API keys found in the scanned files.\n'));
    console.log(chalk.dim(`Scanned ${totalFiles} files.`));
    return;
  }

  // Create table
  const table = new Table({
    head: [
      chalk.cyan.bold('Service'),
      chalk.cyan.bold('Key'),
      chalk.cyan.bold('File'),
      chalk.cyan.bold('Line'),
      chalk.cyan.bold('Status')
    ],
    colWidths: [15, 25, 30, 8, 15],
    style: {
      head: [],
      border: ['gray']
    },
    wordWrap: true
  });

  // Add rows
  keysFound.forEach(key => {
    const status = key.status || 'UNTESTED';
    table.push([
      chalk.white(key.service),
      chalk.yellow(key.key),
      chalk.dim(truncate(key.filePath, 28)),
      chalk.dim(key.lineNumber.toString()),
      getStatusDisplay(status)
    ]);
  });

  console.log(table.toString());

  // Summary section
  console.log('\n' + chalk.bold.cyan('📈 Summary'));
  console.log(chalk.dim('─'.repeat(60)));

  // Service breakdown
  const serviceCount = {};
  keysFound.forEach(key => {
    serviceCount[key.service] = (serviceCount[key.service] || 0) + 1;
  });

  console.log(chalk.bold(`\nTotal keys found: ${chalk.yellow(keysFound.length)}`));
  console.log(chalk.bold(`Files scanned: ${chalk.blue(totalFiles)}`));
  
  console.log(chalk.bold('\nBy service:'));
  Object.entries(serviceCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([service, count]) => {
      console.log(`  ${chalk.white(service)}: ${chalk.yellow(count)}`);
    });

  console.log('');
}

/**
 * Displays test results in a formatted table
 * Shows validation status for each tested key
 * 
 * @param {Array} testResults - Results from tester.testKeys()
 * 
 * @example
 * const results = await testKeys(keysFound);
 * displayTestResults(results);
 */
export function displayTestResults(testResults) {
  console.log('\n' + chalk.bold.cyan('🧪 Test Results'));
  console.log(chalk.dim('─'.repeat(70)));

  if (testResults.length === 0) {
    console.log(chalk.yellow('\n⚠️ No keys to test.\n'));
    return;
  }

  // Create table
  const table = new Table({
    head: [
      chalk.cyan.bold('Service'),
      chalk.cyan.bold('Key'),
      chalk.cyan.bold('Status'),
      chalk.cyan.bold('Details'),
      chalk.cyan.bold('Last Tested')
    ],
    colWidths: [15, 22, 18, 20, 20],
    style: {
      head: [],
      border: ['gray']
    },
    wordWrap: true
  });

  // Add rows
  testResults.forEach(result => {
    const quotaInfo = getQuotaDisplay(result.details);
    const testedAt = formatTimestamp(result.details?.testedAt);

    table.push([
      chalk.white(result.service),
      chalk.yellow(result.key),
      getStatusDisplay(result.status),
      chalk.dim(quotaInfo),
      chalk.dim(truncate(testedAt, 18))
    ]);
  });

  console.log(table.toString());

  // Summary
  const statusCounts = {};
  testResults.forEach(r => {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  });

  console.log('\n' + chalk.bold('Summary:'));
  Object.entries(statusCounts).forEach(([status, count]) => {
    const emoji = STATUS_EMOJI[status] || '❓';
    const colorFn = STATUS_COLORS[status] || chalk.white;
    console.log(`  ${emoji} ${colorFn(status)}: ${count}`);
  });

  console.log('');
}

/**
 * Gets quota/details display string from result details
 * 
 * @param {Object} details - Test result details
 * @returns {string} - Formatted quota info
 */
function getQuotaDisplay(details) {
  if (!details) return '-';

  if (details.modelsCount !== undefined) {
    return `${details.modelsCount} models`;
  }
  if (details.username) {
    return `@${details.username}`;
  }
  if (details.rateLimit?.remaining !== undefined) {
    return `Rate: ${details.rateLimit.remaining}`;
  }
  if (details.livemode !== undefined) {
    return details.livemode ? 'Live mode' : 'Test mode';
  }
  if (details.note) {
    return truncate(details.note, 18);
  }

  return '-';
}

/**
 * Displays a list of tracked projects
 * Shows project name, path, key count, and last scanned time
 * 
 * @param {Array} projects - Array of project objects from database
 * 
 * @example
 * const projects = await getAllProjects();
 * displayProjectList(projects);
 */
export function displayProjectList(projects) {
  console.log('\n' + chalk.bold.cyan('📁 Tracked Projects'));
  console.log(chalk.dim('─'.repeat(70)));

  if (projects.length === 0) {
    console.log(chalk.yellow('\n⚠️ No projects tracked yet.'));
    console.log(chalk.dim('Run "apigraveyard scan <directory>" to scan a project.\n'));
    return;
  }

  projects.forEach((project, index) => {
    const keyCount = project.keys?.length || 0;
    const validKeys = project.keys?.filter(k => k.status === 'VALID').length || 0;
    const scannedAt = formatTimestamp(project.scannedAt);

    console.log('');
    console.log(
      chalk.bold.white(`${index + 1}. ${project.name}`) +
      chalk.dim(` (${truncate(project.path, 40)})`)
    );
    console.log(
      chalk.dim('   ') +
      chalk.yellow(`🔑 ${keyCount} keys`) +
      (validKeys > 0 ? chalk.green(` (${validKeys} valid)`) : '') +
      chalk.dim(` • Last scanned: ${scannedAt}`)
    );
  });

  console.log('\n' + chalk.dim('─'.repeat(70)));
  console.log(chalk.dim(`Total: ${projects.length} project(s)\n`));
}

/**
 * Displays detailed information about a single API key
 * 
 * @param {Object} keyObject - Key object with details
 * @param {string} keyObject.service - Service name
 * @param {string} keyObject.key - Masked key
 * @param {string} keyObject.fullKey - Full key (will be masked in display)
 * @param {string} keyObject.status - Validation status
 * @param {string} keyObject.filePath - File where key was found
 * @param {number} keyObject.lineNumber - Line number in file
 * @param {string} keyObject.lastTested - Last test timestamp
 * @param {Object} keyObject.quotaInfo - Quota/rate limit info
 * 
 * @example
 * displayKeyDetails(project.keys[0]);
 */
export function displayKeyDetails(keyObject) {
  const status = keyObject.status || 'UNTESTED';
  const colorFn = STATUS_COLORS[status] || chalk.white;

  console.log('\n' + chalk.bold.cyan('🔑 Key Details'));
  console.log(chalk.dim('─'.repeat(50)));

  console.log(`
  ${chalk.bold('Service:')}     ${chalk.white(keyObject.service)}
  ${chalk.bold('Key:')}         ${chalk.yellow(keyObject.key)}
  ${chalk.bold('Status:')}      ${getStatusDisplay(status)}
  ${chalk.bold('File:')}        ${chalk.dim(keyObject.filePath)}
  ${chalk.bold('Line:')}        ${chalk.dim(keyObject.lineNumber)}:${chalk.dim(keyObject.column || 1)}
  ${chalk.bold('Last Tested:')} ${formatTimestamp(keyObject.lastTested)}
`);

  // Show quota info if available
  if (keyObject.quotaInfo && Object.keys(keyObject.quotaInfo).length > 0) {
    console.log(chalk.bold('  Quota/Details:'));
    const quota = keyObject.quotaInfo;
    
    if (quota.modelsCount !== undefined) {
      console.log(`    ${chalk.dim('Models available:')} ${quota.modelsCount}`);
    }
    if (quota.username) {
      console.log(`    ${chalk.dim('Username:')} @${quota.username}`);
    }
    if (quota.rateLimit) {
      console.log(`    ${chalk.dim('Rate limit remaining:')} ${quota.rateLimit.remaining}/${quota.rateLimit.limit}`);
    }
    if (quota.livemode !== undefined) {
      console.log(`    ${chalk.dim('Mode:')} ${quota.livemode ? 'Live' : 'Test'}`);
    }
    console.log('');
  }

  // Show error if present
  if (keyObject.lastError) {
    console.log(chalk.red(`  ❌ Error: ${keyObject.lastError}`));
    console.log('');
  }

  console.log(chalk.dim('─'.repeat(50)) + '\n');
}

/**
 * Displays a warning message with yellow styling and box
 * 
 * @param {string} message - Warning message to display
 * 
 * @example
 * showWarning('Some API keys may have been exposed!');
 */
export function showWarning(message) {
  const lines = message.split('\n');
  const maxLength = Math.max(...lines.map(l => l.length), 40);
  const border = '─'.repeat(maxLength + 4);

  console.log('');
  console.log(chalk.yellow(`┌${border}┐`));
  console.log(chalk.yellow(`│  ⚠️  ${chalk.bold('WARNING')}${' '.repeat(maxLength - 7)}  │`));
  console.log(chalk.yellow(`├${border}┤`));
  lines.forEach(line => {
    const padding = ' '.repeat(maxLength - line.length);
    console.log(chalk.yellow(`│  ${line}${padding}  │`));
  });
  console.log(chalk.yellow(`└${border}┘`));
  console.log('');
}

/**
 * Displays an error message with red styling and box
 * 
 * @param {string} message - Error message to display
 * 
 * @example
 * showError('Failed to read configuration file');
 */
export function showError(message) {
  const lines = message.split('\n');
  const maxLength = Math.max(...lines.map(l => l.length), 40);
  const border = '─'.repeat(maxLength + 4);

  console.log('');
  console.log(chalk.red(`┌${border}┐`));
  console.log(chalk.red(`│  ❌ ${chalk.bold('ERROR')}${' '.repeat(maxLength - 5)}  │`));
  console.log(chalk.red(`├${border}┤`));
  lines.forEach(line => {
    const padding = ' '.repeat(maxLength - line.length);
    console.log(chalk.red(`│  ${line}${padding}  │`));
  });
  console.log(chalk.red(`└${border}┘`));
  console.log('');
}

/**
 * Displays a success message with green styling
 * 
 * @param {string} message - Success message to display
 * 
 * @example
 * showSuccess('All keys validated successfully!');
 */
export function showSuccess(message) {
  console.log(chalk.green(`\n✅ ${message}\n`));
}

/**
 * Displays an info message with blue styling
 * 
 * @param {string} message - Info message to display
 * 
 * @example
 * showInfo('Scanning directory...');
 */
export function showInfo(message) {
  console.log(chalk.blue(`ℹ️  ${message}`));
}

/**
 * Displays database statistics
 * 
 * @param {Object} stats - Statistics from database.getDatabaseStats()
 * 
 * @example
 * const stats = await getDatabaseStats();
 * displayStats(stats);
 */
export function displayStats(stats) {
  console.log('\n' + chalk.bold.cyan('📊 Database Statistics'));
  console.log(chalk.dim('─'.repeat(40)));

  console.log(`
  ${chalk.bold('Database Version:')} ${chalk.white(stats.version)}
  ${chalk.bold('Database Path:')}    ${chalk.dim(stats.dbPath)}
  
  ${chalk.bold('Projects:')}         ${chalk.yellow(stats.totalProjects)}
  ${chalk.bold('Total Keys:')}       ${chalk.yellow(stats.totalKeys)}
  
  ${chalk.bold('Status Breakdown:')}
    ${chalk.green('✅ Valid:')}        ${stats.validKeys}
    ${chalk.red('❌ Invalid:')}      ${stats.invalidKeys}
    ${chalk.yellow('❓ Untested:')}     ${stats.untestedKeys}
    ${chalk.gray('🚫 Banned:')}       ${stats.bannedKeys}
  
  ${chalk.bold('Created:')}          ${formatTimestamp(stats.createdAt)}
  ${chalk.bold('Last Updated:')}     ${formatTimestamp(stats.updatedAt)}
`);

  console.log(chalk.dim('─'.repeat(40)) + '\n');
}

/**
 * Displays help for a specific command
 * 
 * @param {string} command - Command name
 * @param {string} description - Command description
 * @param {Array<{flag: string, desc: string}>} options - Command options
 * 
 * @example
 * displayHelp('scan', 'Scan directory for API keys', [
 *   { flag: '-r, --recursive', desc: 'Scan recursively' }
 * ]);
 */
export function displayHelp(command, description, options = []) {
  console.log('\n' + chalk.bold.cyan(`📖 Help: ${command}`));
  console.log(chalk.dim('─'.repeat(50)));
  console.log(`\n${description}\n`);

  if (options.length > 0) {
    console.log(chalk.bold('Options:'));
    options.forEach(opt => {
      console.log(`  ${chalk.yellow(opt.flag.padEnd(20))} ${chalk.dim(opt.desc)}`);
    });
    console.log('');
  }
}

export default {
  showBanner,
  createSpinner,
  displayScanResults,
  displayTestResults,
  displayProjectList,
  displayKeyDetails,
  showWarning,
  showError,
  showSuccess,
  showInfo,
  displayStats,
  displayHelp
};
