import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');

test('log modal form closes before its dialog', () => {
  const dialogStart = html.indexOf('<dialog id="logModal"');
  const dialogEnd = html.indexOf('</dialog>', dialogStart);
  assert.notEqual(dialogStart, -1, 'log modal dialog exists');
  assert.notEqual(dialogEnd, -1, 'log modal dialog closes');

  const dialogMarkup = html.slice(dialogStart, dialogEnd);
  const formStart = dialogMarkup.indexOf('<form method="dialog">');
  const formEnd = dialogMarkup.indexOf('</form>');
  assert.notEqual(formStart, -1, 'log modal form opens');
  assert.ok(formEnd > formStart, 'log modal form closes before the dialog');
});


test('assistant assets use explicit cache-busting versions', () => {
  assert.match(html, /href="assistant\.css\?v=10"/);
  assert.match(html, /src="assistant-ui\.js\?v=10"/);
  assert.match(html, /id="needleAssistantToolsToggle"/);
  assert.match(html, /id="needleAssistantToolsList"/);
});
