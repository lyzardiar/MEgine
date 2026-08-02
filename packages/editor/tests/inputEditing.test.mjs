import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeUiInputText,
  resolveUiInputEdit,
  uiInputKeyAction,
} from '../src/ui/inputEditing.ts';

test('InputField native text edits normalize line endings and Unicode character limits', () => {
  assert.equal(normalizeUiInputText('alpha\r\nbeta\rgamma', true, 0), 'alpha\nbeta\ngamma');
  assert.equal(normalizeUiInputText('alpha\r\nbeta', false, 0), 'alphabeta');
  assert.equal(normalizeUiInputText('A😀中文Z', false, 4), 'A😀中文');
  assert.equal(normalizeUiInputText('unchanged', false, Number.NaN), 'unchanged');
});

test('InputField keyboard routing leaves composition and multiline editing to the browser', () => {
  assert.deepEqual(resolveUiInputEdit('拼音输入', false, 2, true), {
    text: '拼音输入',
    commit: false,
  });
  assert.deepEqual(resolveUiInputEdit('中文输入', false, 2, false), {
    text: '中文',
    commit: true,
  });
  assert.equal(uiInputKeyAction('Enter', false, true), 'native');
  assert.equal(uiInputKeyAction('Enter', true, false), 'native');
  assert.equal(uiInputKeyAction('Enter', false, false), 'submit');
  assert.equal(uiInputKeyAction('Escape', false, false), 'cancel');
  assert.equal(uiInputKeyAction('Tab', false, false), 'navigate');
  assert.equal(uiInputKeyAction('Backspace', false, false), 'native');
});
