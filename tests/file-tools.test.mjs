import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  deleteFile,
  editFile,
  grantReadAccess,
  listDirectory,
  moveFile,
  readFile,
  searchFiles,
  setWorkingDirectory,
  writeFile,
} from '../build/compatibility-tests/file-tools.mjs';

let base;
let workspace;
let outside;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'astreus-file-tools-'));
  workspace = join(base, 'project');
  // Sibling whose name starts with the workspace name: a string-prefix check would let it through
  outside = join(base, 'project-secrets');
  mkdirSync(workspace);
  mkdirSync(outside);
  writeFileSync(join(workspace, 'inside.txt'), 'inside');
  writeFileSync(join(outside, 'secret.txt'), 'secret');
  setWorkingDirectory(workspace);
});

test('relative and absolute paths inside the working directory work', () => {
  assert.equal(readFile('inside.txt').data, 'inside');
  assert.equal(readFile(join(workspace, 'inside.txt')).data, 'inside');
  assert.ok(writeFile('nested/new.txt', 'hello').success);
  assert.equal(readFileSync(join(workspace, 'nested/new.txt'), 'utf-8'), 'hello');
  assert.ok(editFile('nested/new.txt', 'hello', 'bye').success);
  assert.ok(moveFile('nested/new.txt', 'moved.txt').success);
  assert.ok(deleteFile('moved.txt').success);
  assert.ok(listDirectory('.').success);
});

test('paths outside the working directory are refused', () => {
  for (const path of [join(outside, 'secret.txt'), '../project-secrets/secret.txt']) {
    const read = readFile(path);
    assert.equal(read.success, false);
    assert.match(read.error, /outside the working directory/);
  }
  assert.equal(writeFile('../project-secrets/new.txt', 'x').success, false);
  assert.equal(existsSync(join(outside, 'new.txt')), false);
  assert.equal(editFile(join(outside, 'secret.txt'), 'secret', 'x').success, false);
  assert.equal(deleteFile(join(outside, 'secret.txt')).success, false);
  assert.equal(moveFile('inside.txt', join(outside, 'stolen.txt')).success, false);
  assert.equal(moveFile(join(outside, 'secret.txt'), 'here.txt').success, false);
  assert.equal(listDirectory('..').success, false);
  assert.equal(readFileSync(join(outside, 'secret.txt'), 'utf-8'), 'secret');
  assert.ok(existsSync(join(workspace, 'inside.txt')));
});

test('symlinks cannot reach outside the working directory', () => {
  symlinkSync(join(outside, 'secret.txt'), join(workspace, 'link.txt'));
  symlinkSync(outside, join(workspace, 'linkdir'));
  symlinkSync(join(outside, 'missing.txt'), join(workspace, 'dangling.txt'));

  assert.equal(readFile('link.txt').success, false);
  assert.equal(writeFile('link.txt', 'x').success, false);
  assert.equal(writeFile('linkdir/new.txt', 'x').success, false);
  assert.equal(writeFile('dangling.txt', 'x').success, false);
  assert.equal(existsSync(join(outside, 'missing.txt')), false);
  assert.equal(readFileSync(join(outside, 'secret.txt'), 'utf-8'), 'secret');
  assert.doesNotMatch(searchFiles('secret').data, /secret\.txt/);

  // Deleting a link removes the link, never its target
  assert.ok(deleteFile('link.txt').success);
  assert.equal(existsSync(join(workspace, 'link.txt')), false);
  assert.equal(readFileSync(join(outside, 'secret.txt'), 'utf-8'), 'secret');
});

test('the working directory itself cannot be deleted or moved', () => {
  assert.equal(deleteFile('.').success, false);
  assert.equal(deleteFile(workspace).success, false);
  assert.equal(moveFile('.', 'elsewhere').success, false);
  assert.ok(existsSync(join(workspace, 'inside.txt')));
});

test('an attached file outside the working directory is readable but not writable', () => {
  const attached = join(outside, 'secret.txt');
  grantReadAccess(attached);
  assert.equal(readFile(attached).data, 'secret');
  assert.equal(writeFile(attached, 'x').success, false);
  assert.equal(deleteFile(attached).success, false);
  assert.equal(readFile(join(outside, 'other.txt')).success, false);
  assert.equal(readFileSync(attached, 'utf-8'), 'secret');
});
