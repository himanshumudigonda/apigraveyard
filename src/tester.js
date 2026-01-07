/**
 * Tester Module
 * API key validation and testing system
 * Tests keys against their respective service endpoints
 */

import axios from 'axios';
import ora from 'ora';

/**
 * Request timeout in milliseconds
 * @constant {number}
 */
const REQUEST_TIMEOUT = 10000;

/**
 * Delay between API calls in milliseconds
 * @constant {number}
 */
const RATE_LIMIT_DELAY = 500;

/**
 * Maximum retry attempts for rate-limited requests
 * @constant {number}
 */
const MAX_RETRIES = 3;

/**
 * Key validation status constants
 * @enum {string}
 */
export const KeyStatus = {
  VALID: 'VALID',
  INVALID: 'INVALID',
  EXPIRED: 'EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  ERROR: 'ERROR'
};

/**
 * Creates a delay promise for rate limiting
 * 
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculates exponential backoff delay
 * 
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {number} - Delay in milliseconds
 */
const getBackoffDelay = (attempt, baseDelay = 1000) => {
  return baseDelay * Math.pow(2, attempt);
};

/**
 * Determines key status from HTTP response status code
 * 
 * @param {number} statusCode - HTTP status code
 * @returns {string} - Key status constant
 */
function getStatusFromCode(statusCode) {
  if (statusCode === 200) return KeyStatus.VALID;
  if (statusCode === 401) return KeyStatus.INVALID;
  if (statusCode === 403) return KeyStatus.EXPIRED;
  if (statusCode === 429) return KeyStatus.RATE_LIMITED;
  return KeyStatus.ERROR;
}

/**
 * Makes an HTTP request with retry logic for rate limiting
 * 
 * @param {Object} config - Axios request configuration
 * @param {number} [retries=0] - Current retry count
 * @returns {Promise<import('axios').AxiosResponse>} - Axios response
 */
async function requestWithRetry(config, retries = 0) {
  try {
    const response = await axios({
      ...config,
      timeout: REQUEST_TIMEOUT,
      validateStatus: () => true // Accept any status to handle manually
    });

    // Handle rate limiting with exponential backoff
    if (response.status === 429 && retries < MAX_RETRIES) {
      const backoffDelay = getBackoffDelay(retries);
      await delay(backoffDelay);
      return requestWithRetry(config, retries + 1);
    }

    return response;
  } catch (error) {
    if (retries < MAX_RETRIES && error.code === 'ECONNRESET') {
      const backoffDelay = getBackoffDelay(retries);
      await delay(backoffDelay);
      return requestWithRetry(config, retries + 1);
    }
    throw error;
  }
}

/**
 * Tests an OpenAI API key for validity
 * 
 * @param {string} key - The OpenAI API key to test
 * @returns {Promise<Object>} - Test result with status and details
 * 
 * @example
 * const result = await testOpenAIKey('sk-...');
 * // { status: 'VALID', details: { modelsCount: 15, testedAt: '...' } }
 */
export async function testOpenAIKey(key) {
  const result = {
    status: KeyStatus.ERROR,
    details: { testedAt: new Date().toISOString() },
    error: null
  };

  try {
    const response = await requestWithRetry({
      method: 'GET',
      url: 'https://api.openai.com/v1/models',
      headers: {
        'Authorization': `Bearer ${key}`
      }
    });

    result.status = getStatusFromCode(response.status);

    if (response.status === 200 && response.data) {
      result.details.modelsCount = response.data.data?.length || 0;
      result.details.models = response.data.data?.slice(0, 5).map(m => m.id) || [];
    }

    // Try to get usage/quota information
    if (response.status === 200) {
      try {
        const usageResponse = await requestWithRetry({
          method: 'GET',
          url: 'https://api.openai.com/v1/usage',
          headers: { 'Authorization': `Bearer ${key}` }
        });
        if (usageResponse.status === 200 && usageResponse.data) {
          result.details.usage = usageResponse.data;
        }
      } catch {
        // Usage endpoint may not be available, ignore
      }
    }

  } catch (error) {
    result.status = KeyStatus.ERROR;
    result.error = error.message;
  }

  return result;
}

/**
 * Tests a Groq API key for validity
 * 
 * @param {string} key - The Groq API key to test
 * @returns {Promise<Object>} - Test result with status and details
 * 
 * @example
 * const result = await testGroqKey('gsk_...');
 * // { status: 'VALID', details: { modelsCount: 5, testedAt: '...' } }
 */
export async function testGroqKey(key) {
  const result = {
    status: KeyStatus.ERROR,
    details: { testedAt: new Date().toISOString() },
    error: null
  };

  try {
    const response = await requestWithRetry({
      method: 'GET',
      url: 'https://api.groq.com/openai/v1/models',
      headers: {
        'Authorization': `Bearer ${key}`
      }
    });

    result.status = getStatusFromCode(response.status);

    if (response.status === 200 && response.data) {
      result.details.modelsCount = response.data.data?.length || 0;
      result.details.models = response.data.data?.map(m => m.id) || [];
    }

  } catch (error) {
    result.status = KeyStatus.ERROR;
    result.error = error.message;
  }

  return result;
}

/**
 * Tests a GitHub API key (Personal Access Token) for validity
 * 
 * @param {string} key - The GitHub token to test
 * @returns {Promise<Object>} - Test result with status and details
 * 
 * @example
 * const result = await testGitHubKey('ghp_...');
 * // { status: 'VALID', details: { username: 'user', rateLimit: 4999, testedAt: '...' } }
 */
export async function testGitHubKey(key) {
  const result = {
    status: KeyStatus.ERROR,
    details: { testedAt: new Date().toISOString() },
    error: null
  };

  try {
    const response = await requestWithRetry({
      method: 'GET',
      url: 'https://api.github.com/user',
      headers: {
        'Authorization': `token ${key}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'APIgraveyard-Scanner'
      }
    });

    result.status = getStatusFromCode(response.status);

    if (response.status === 200 && response.data) {
      result.details.username = response.data.login;
      result.details.name = response.data.name;
      result.details.email = response.data.email;
      result.details.publicRepos = response.data.public_repos;
    }

    // Extract rate limit info from headers
    if (response.headers) {
      result.details.rateLimit = {
        limit: parseInt(response.headers['x-ratelimit-limit'] || '0'),
        remaining: parseInt(response.headers['x-ratelimit-remaining'] || '0'),
        reset: response.headers['x-ratelimit-reset']
      };
    }

  } catch (error) {
    result.status = KeyStatus.ERROR;
    result.error = error.message;
  }

  return result;
}

/**
 * Tests a Stripe API key for validity
 * 
 * @param {string} key - The Stripe API key to test
 * @returns {Promise<Object>} - Test result with status and details
 * 
 * @example
 * const result = await testStripeKey('sk_test_...');
 * // { status: 'VALID', details: { livemode: false, testedAt: '...' } }
 */
export async function testStripeKey(key) {
  const result = {
    status: KeyStatus.ERROR,
    details: { testedAt: new Date().toISOString() },
    error: null
  };

  try {
    const response = await requestWithRetry({
      method: 'GET',
      url: 'https://api.stripe.com/v1/balance',
      headers: {
        'Authorization': `Bearer ${key}`
      }
    });

    result.status = getStatusFromCode(response.status);

    if (response.status === 200 && response.data) {
      result.details.livemode = response.data.livemode;
      result.details.available = response.data.available;
      result.details.pending = response.data.pending;
    }

  } catch (error) {
    result.status = KeyStatus.ERROR;
    result.error = error.message;
  }

  return result;
}

/**
 * Tests a Google API key for validity
 * 
 * @param {string} key - The Google API key to test
 * @returns {Promise<Object>} - Test result with status and details
 * 
 * @example
 * const result = await testGoogleKey('AIza...');
 * // { status: 'VALID', details: { testedAt: '...' } }
 */
export async function testGoogleKey(key) {
  const result = {
    status: KeyStatus.ERROR,
    details: { testedAt: new Date().toISOString() },
    error: null
  };

  try {
    const response = await requestWithRetry({
      method: 'GET',
      url: `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${key}`
    });

    result.status = getStatusFromCode(response.status);

    if (response.status === 200 && response.data) {
      result.details.audience = response.data.audience;
      result.details.scope = response.data.scope;
      result.details.expiresIn = response.data.expires_in;
    }

  } catch (error) {
    result.status = KeyStatus.ERROR;
    result.error = error.message;
  }

  return result;
}

/**
 * Tests an AWS Access Key ID (basic validation only)
 * Note: Full AWS key validation requires secret key and is complex
 * 
 * @param {string} key - The AWS Access Key ID to test
 * @returns {Promise<Object>} - Test result with status and details
 */
export async function testAWSKey(key) {
  const result = {
    status: KeyStatus.ERROR,
    details: { testedAt: new Date().toISOString() },
    error: 'AWS key validation requires both Access Key ID and Secret Access Key'
  };

  // AWS keys cannot be validated with just the access key ID
  // We can only verify the format
  if (/^AKIA[A-Z0-9]{16}$/.test(key)) {
    result.status = KeyStatus.VALID;
    result.details.note = 'Format valid. Full validation requires Secret Access Key.';
    result.error = null;
  } else {
    result.status = KeyStatus.INVALID;
    result.error = 'Invalid AWS Access Key ID format';
  }

  return result;
}

/**
 * Tests an Anthropic API key for validity
 * 
 * @param {string} key - The Anthropic API key to test
 * @returns {Promise<Object>} - Test result with status and details
 */
export async function testAnthropicKey(key) {
  const result = {
    status: KeyStatus.ERROR,
    details: { testedAt: new Date().toISOString() },
    error: null
  };

  try {
    // Use messages endpoint for validation
    const response = await requestWithRetry({
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      data: {
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }]
      }
    });

    // 400 means key is valid but request may be malformed
    // 401 means invalid key
    if (response.status === 200 || response.status === 400) {
      result.status = KeyStatus.VALID;
    } else {
      result.status = getStatusFromCode(response.status);
    }

  } catch (error) {
    result.status = KeyStatus.ERROR;
    result.error = error.message;
  }

  return result;
}

/**
 * Tests a Hugging Face API key for validity
 * 
 * @param {string} key - The Hugging Face API key to test
 * @returns {Promise<Object>} - Test result with status and details
 */
export async function testHuggingFaceKey(key) {
  const result = {
    status: KeyStatus.ERROR,
    details: { testedAt: new Date().toISOString() },
    error: null
  };

  try {
    const response = await requestWithRetry({
      method: 'GET',
      url: 'https://huggingface.co/api/whoami-v2',
      headers: {
        'Authorization': `Bearer ${key}`
      }
    });

    result.status = getStatusFromCode(response.status);

    if (response.status === 200 && response.data) {
      result.details.username = response.data.name;
      result.details.email = response.data.email;
      result.details.orgs = response.data.orgs?.map(o => o.name) || [];
    }

  } catch (error) {
    result.status = KeyStatus.ERROR;
    result.error = error.message;
  }

  return result;
}

/**
 * Maps service names to their test functions
 * @type {Object.<string, Function>}
 */
const SERVICE_TESTERS = {
  'OpenAI': testOpenAIKey,
  'Groq': testGroqKey,
  'GitHub': testGitHubKey,
  'Stripe': testStripeKey,
  'Google/Firebase': testGoogleKey,
  'AWS': testAWSKey,
  'Anthropic': testAnthropicKey,
  'Hugging Face': testHuggingFaceKey
};

/**
 * Tests an array of API keys against their respective services
 * 
 * Iterates through each key, calls the appropriate service tester,
 * and returns results with validation status and details.
 * Includes rate limiting between requests to avoid service throttling.
 * 
 * @param {Array<{service: string, key: string, fullKey: string, filePath: string, lineNumber: number, column: number}>} keysArray
 *        Array of key objects from scanner.js
 * @param {Object} [options={}] - Testing options
 * @param {boolean} [options.showSpinner=true] - Whether to show loading spinner
 * @param {boolean} [options.verbose=false] - Whether to show verbose output
 * 
 * @returns {Promise<Array<{service: string, key: string, status: string, details: Object, error: string|null}>>}
 *          Array of tested key objects with status
 * 
 * @example
 * const keys = await scanDirectory('./src');
 * const results = await testKeys(keys.keysFound);
 * results.forEach(r => console.log(`${r.service}: ${r.status}`));
 */
export async function testKeys(keysArray, options = {}) {
  const { showSpinner = true, verbose = false } = options;
  const results = [];
  
  let spinner = null;
  if (showSpinner) {
    spinner = ora({
      text: 'Testing API keys...',
      spinner: 'dots'
    }).start();
  }

  for (let i = 0; i < keysArray.length; i++) {
    const keyInfo = keysArray[i];
    const { service, key, fullKey, filePath, lineNumber, column } = keyInfo;

    if (spinner) {
      spinner.text = `Testing key ${i + 1}/${keysArray.length}: ${service} (${key})`;
    }

    // Get the appropriate tester for this service
    const tester = SERVICE_TESTERS[service];
    
    let testResult;
    if (tester) {
      try {
        testResult = await tester(fullKey);
      } catch (error) {
        testResult = {
          status: KeyStatus.ERROR,
          details: { testedAt: new Date().toISOString() },
          error: error.message
        };
      }
    } else {
      testResult = {
        status: KeyStatus.ERROR,
        details: { testedAt: new Date().toISOString() },
        error: `No tester available for service: ${service}`
      };
    }

    // Combine key info with test results
    results.push({
      service,
      key,
      fullKey,
      filePath,
      lineNumber,
      column,
      status: testResult.status,
      details: testResult.details,
      error: testResult.error
    });

    // Rate limiting delay between requests
    if (i < keysArray.length - 1) {
      await delay(RATE_LIMIT_DELAY);
    }
  }

  if (spinner) {
    const validCount = results.filter(r => r.status === KeyStatus.VALID).length;
    const invalidCount = results.filter(r => r.status === KeyStatus.INVALID).length;
    spinner.succeed(`Tested ${results.length} keys: ${validCount} valid, ${invalidCount} invalid`);
  }

  return results;
}

/**
 * Gets list of supported services for testing
 * 
 * @returns {string[]} - Array of service names
 */
export function getSupportedServices() {
  return Object.keys(SERVICE_TESTERS);
}

export default {
  testKeys,
  testOpenAIKey,
  testGroqKey,
  testGitHubKey,
  testStripeKey,
  testGoogleKey,
  testAWSKey,
  testAnthropicKey,
  testHuggingFaceKey,
  getSupportedServices,
  KeyStatus
};
