import {
  extractLeagueId,
  maskValue,
  normalizeEspnS2,
  normalizeSwid,
  pickCookie,
} from './espn-cookies.js';

const ESPN_SIGN_IN_URL = 'https://fantasy.espn.com/football/players/add';

const statusEl = document.getElementById('status');
const fieldsEl = document.getElementById('fields');
const fieldTemplate = document.getElementById('field-template');

/**
 * Reads one ESPN cookie by name across espn.com and its subdomains.
 * @param {string} name - The cookie name.
 * @returns {Promise<string>} The chosen cookie's value, or '' when absent.
 */
async function readCookie(name) {
  const matches = await chrome.cookies.getAll({ domain: 'espn.com', name });
  return pickCookie(matches)?.value ?? '';
}

/**
 * Reads the league ID out of the active tab, when it happens to be an ESPN
 * fantasy page. Tab URLs are readable here because the manifest asks for
 * `https://*.espn.com/*` — no `tabs` or `activeTab` permission involved.
 * @returns {Promise<string | null>} The league ID, or null.
 */
async function readLeagueId() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return extractLeagueId(tab?.url);
  } catch {
    return null;
  }
}

/**
 * Replaces the status banner.
 * @param {'loading' | 'ok' | 'warn' | 'error'} tone - Which style to use.
 * @param {Node | string} content - The message.
 * @returns {void}
 */
function setStatus(tone, content) {
  statusEl.className = `status status--${tone}`;
  statusEl.replaceChildren(content);
}

/**
 * Copies text to the clipboard, reporting success on the button itself.
 * @param {HTMLButtonElement} button - The button that was pressed.
 * @param {string} value - The text to copy.
 * @param {string} label - The field's display name.
 * @returns {Promise<void>}
 */
async function copyValue(button, value, label) {
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = 'Copied';
    button.classList.add('copy--done');
  } catch {
    // Clipboard access can be refused by policy; the value is already
    // selectable in the field above, so point at that rather than failing mute.
    button.textContent = 'Copy blocked — select the value above';
    button.classList.add('copy--failed');
  }
  setTimeout(() => {
    button.textContent = `Copy ${label}`;
    button.classList.remove('copy--done', 'copy--failed');
  }, 1600);
}

/**
 * Renders one labelled, masked, copyable value.
 * @param {{label: string, value: string, startRevealed?: boolean}} field - The field to render.
 * @returns {DocumentFragment} The rendered field.
 */
function renderField({ label, value, startRevealed = false }) {
  const node = fieldTemplate.content.cloneNode(true);
  const valueEl = node.querySelector('[data-role="value"]');
  const revealBtn = node.querySelector('[data-role="reveal"]');
  const copyBtn = node.querySelector('[data-role="copy"]');

  node.querySelector('.field__label').textContent = label;
  copyBtn.textContent = `Copy ${label}`;

  let revealed = startRevealed;
  const paint = () => {
    valueEl.textContent = revealed ? value : maskValue(value);
    revealBtn.textContent = revealed ? 'Hide' : 'Show';
    revealBtn.setAttribute('aria-pressed', String(revealed));
  };
  paint();

  revealBtn.hidden = startRevealed;
  revealBtn.addEventListener('click', () => {
    revealed = !revealed;
    paint();
  });
  copyBtn.addEventListener('click', () => copyValue(copyBtn, value, label));

  return node;
}

/**
 * Builds a status banner that links out to ESPN, since the popup's CSP
 * rules out inline markup.
 * @param {string} message - The leading sentence.
 * @returns {DocumentFragment} The banner content.
 */
function signInPrompt(message) {
  const fragment = document.createDocumentFragment();
  fragment.append(`${message} `);
  const link = document.createElement('a');
  link.href = ESPN_SIGN_IN_URL;
  link.target = '_blank';
  link.rel = 'noreferrer noopener';
  link.textContent = 'Sign in to ESPN';
  fragment.append(link, ', then reopen this popup.');
  return fragment;
}

async function main() {
  let espnS2 = '';
  let swid = '';
  let leagueId = null;

  try {
    [espnS2, swid, leagueId] = await Promise.all([
      readCookie('espn_s2').then(normalizeEspnS2),
      readCookie('SWID').then(normalizeSwid),
      readLeagueId(),
    ]);
  } catch (error) {
    setStatus('error', `Couldn't read ESPN cookies: ${error?.message ?? 'unknown error'}`);
    return;
  }

  if (!espnS2 && !swid) {
    setStatus('warn', signInPrompt("No ESPN session found in this browser."));
    return;
  }

  const fields = [];
  if (leagueId) fields.push({ label: 'League ID', value: leagueId, startRevealed: true });
  if (espnS2) fields.push({ label: 'espn_s2', value: espnS2 });
  if (swid) fields.push({ label: 'SWID', value: swid });

  fieldsEl.replaceChildren(...fields.map(renderField));
  fieldsEl.hidden = false;

  if (!espnS2 || !swid) {
    const missing = espnS2 ? 'SWID' : 'espn_s2';
    setStatus('warn', signInPrompt(`Found only part of your ESPN session — ${missing} is missing.`));
    return;
  }

  setStatus(
    'ok',
    leagueId
      ? 'Found your ESPN session and league ID.'
      : 'Found your ESPN session. Open a league page on espn.com to pick up its league ID too.'
  );
}

main();
