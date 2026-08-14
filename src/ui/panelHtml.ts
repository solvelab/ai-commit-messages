import type { Backend } from '../providers/catalog.js'

/**
 * The panel's document.
 *
 * Everything is inline and nonce-signed: the Content-Security-Policy forbids any external resource,
 * so the panel works offline and cannot be made to fetch anything. Colours come from the editor's
 * own theme variables, so it follows whatever theme is in use instead of inventing one.
 */
export function panelHtml(cspSource: string, backends: readonly Backend[]): string {
  const nonce = makeNonce()
  const options = backends
    .map(b => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.label)}</option>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); padding: 1.5rem; max-width: 46rem; }
  h1 { font-size: 1.2rem; font-weight: 600; margin: 0 0 1.5rem; }
  .field { margin-bottom: 1.25rem; }
  .field[hidden] { display: none; }
  label { display: block; font-weight: 600; margin-bottom: .35rem; }
  .hint { font-size: .85em; opacity: .8; margin: .35rem 0 0; }
  input, select { width: 100%; box-sizing: border-box; padding: .4rem .5rem;
    color: var(--vscode-input-foreground); background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px;
    font-family: inherit; font-size: inherit; }
  .row { display: flex; gap: .5rem; align-items: center; }
  .row > select, .row > input { flex: 1; }
  button { padding: .4rem .9rem; border: none; border-radius: 2px; cursor: pointer;
    color: var(--vscode-button-foreground); background: var(--vscode-button-background);
    font-family: inherit; font-size: inherit; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { color: var(--vscode-button-secondaryForeground);
    background: var(--vscode-button-secondaryBackground); }
  .actions { display: flex; gap: .5rem; margin-top: 1.75rem; align-items: center; }
  .status { font-size: .85em; opacity: .85; min-height: 1.2em; margin-top: .75rem; }
  .status.bad { color: var(--vscode-errorForeground); opacity: 1; }
  .stored { font-size: .85em; opacity: .8; }
</style>
</head>
<body>
<h1>AI Commit Messages</h1>

<div class="field">
  <label for="backend">Backend</label>
  <select id="backend">${options}</select>
  <p class="hint" id="backend-note"></p>
</div>

<div class="field" id="endpoint-field">
  <label for="endpoint">Endpoint</label>
  <input id="endpoint" type="text" spellcheck="false" placeholder="http://localhost:11434">
  <p class="hint">A path such as <code>/api/generate</code> is trimmed.</p>
</div>

<div class="field" id="key-field">
  <label for="key">API key</label>
  <div class="row">
    <input id="key" type="password" spellcheck="false" placeholder="paste the key">
    <button id="save-key">Save key</button>
    <button id="clear-key" class="secondary">Clear</button>
  </div>
  <p class="hint"><span id="key-state" class="stored"></span> Stored in the OS secret store, bound to
    this host, never written to settings.json and never shown here again.</p>
</div>

<div class="field">
  <label for="model">Model</label>
  <div class="row">
    <select id="model"></select>
    <button id="reload" class="secondary" title="Read the list from the server">Reload</button>
  </div>
  <input id="model-manual" type="text" spellcheck="false" placeholder="or type the model name"
         style="margin-top:.5rem">
  <p class="hint" id="model-note"></p>
</div>

<div class="actions">
  <button id="save">Save</button>
  <button id="test" class="secondary">Test connection</button>
</div>
<p class="status" id="status"></p>

<script nonce="${nonce}">
const vscode = acquireVsCodeApi()
const $ = id => document.getElementById(id)
let state = null
let loadedOnce = false

const post = message => vscode.postMessage(message)
const say = (text, bad) => { const s = $('status'); s.textContent = text; s.classList.toggle('bad', Boolean(bad)) }

$('backend').addEventListener('change', () => {
  loadedOnce = false
  post({ type: 'backendChanged', backendId: $('backend').value })
})
$('reload').addEventListener('click', () => {
  say('Reading the model list…')
  post({ type: 'loadModels', backendId: $('backend').value, endpoint: $('endpoint').value })
})
$('test').addEventListener('click', () => {
  say('Testing…')
  post({ type: 'test', backendId: $('backend').value, endpoint: $('endpoint').value })
})
$('save-key').addEventListener('click', () => {
  const key = $('key').value.trim()
  if (!key) { say('Nothing to save: the field is empty.', true); return }
  $('key').value = ''
  post({ type: 'setKey', key, backendId: $('backend').value, endpoint: $('endpoint').value })
})
$('clear-key').addEventListener('click', () =>
  post({ type: 'clearKey', backendId: $('backend').value, endpoint: $('endpoint').value }))
$('model').addEventListener('change', () => { $('model-manual').value = '' })
$('save').addEventListener('click', () => {
  const model = $('model-manual').value.trim() || $('model').value
  if (!model) { say('Pick or type a model first.', true); return }
  post({ type: 'save', backendId: $('backend').value, endpoint: $('endpoint').value.trim(), model })
})

window.addEventListener('message', event => {
  const message = event.data
  if (message.type === 'state') {
    state = message
    $('backend').value = message.fields.backendId
    $('backend-note').textContent = message.fields.note
    $('endpoint-field').hidden = !message.fields.showEndpoint
    $('endpoint').value = message.endpoint
    $('key-field').hidden = false
    $('key-state').textContent = message.hasKey
      ? 'A key is stored for ' + message.host + '.'
      : (message.fields.requiresKey ? 'This backend needs a key.' : 'No key stored — not needed for a plain local server.')
    fillModels((message.knownModels || []).map(id => ({ id, label: id })), message.model)
    if (!loadedOnce) {
      loadedOnce = true
      say('Reading the model list…')
      post({ type: 'loadModels', backendId: $('backend').value, endpoint: $('endpoint').value })
    }
    return
  }
  if (message.type === 'models') {
    fillModels(message.models, state && state.model)
    say(message.error ? 'Showing known models: ' + message.error : 'List read from the server.', Boolean(message.error))
    return
  }
  if (message.type === 'testResult') {
    say(message.detail, !message.ok)
  }
})

function fillModels(models, selected) {
  const select = $('model')
  select.innerHTML = ''
  const list = models && models.length ? models : (selected ? [{ id: selected, label: selected }] : [])
  for (const model of list) {
    const option = document.createElement('option')
    option.value = model.id
    option.textContent = model.label
    select.appendChild(option)
  }
  if (selected && !list.some(m => m.id === selected)) {
    const option = document.createElement('option')
    option.value = selected
    option.textContent = selected + ' (configured)'
    select.appendChild(option)
  }
  if (selected) { select.value = selected }
  $('model-note').textContent = list.length
    ? 'Reload reads what the server actually offers.'
    : 'No list yet — press Reload, or type the name.'
}

post({ type: 'ready' })
</script>
</body>
</html>`
}

function makeNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let nonce = ''
  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length))
  }
  return nonce
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
