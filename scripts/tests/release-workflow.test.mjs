import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const workflow = readFileSync(
  new URL('../../.github/workflows/release.yml', import.meta.url),
  'utf8',
)
// Execute the actual inline guard, rather than a second copy of its validation.
const guard = workflow.match(
  /      - name: Validate release tag\n[\s\S]*?        run: \|\n((?:          .*\n|\n)+)/,
)?.[1]
assert.ok(guard, 'Release tag validation must run before checkout')
const script = guard.replace(/^          /gm, '')

function validate(tag) {
  const directory = mkdtempSync(join(tmpdir(), 'pipeup-release-test-'))
  const output = join(directory, 'output')
  try {
    const result = spawnSync('bash', ['-e', '-c', script], {
      env: { ...process.env, REQUESTED_TAG: tag, GITHUB_OUTPUT: output },
      encoding: 'utf8',
    })
    return {
      status: result.status,
      output: result.status === 0 ? readFileSync(output, 'utf8') : '',
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('accepts release tags and produces matching version metadata', () => {
  for (const tag of ['v0.0.0', 'v0.9.1', 'v12.34.56']) {
    assert.deepEqual(validate(tag), { status: 0, output: `tag=${tag}\nversion=${tag.slice(1)}\n` })
  }
})

test('rejects branch names, missing input, malformed versions and shell payloads', () => {
  for (const tag of [
    '',
    'main',
    'refs/tags/v1.2.3',
    '1.2.3',
    'v1.2',
    'v01.2.3',
    'v1.2.3-beta',
    'v1.2.3\ntag=main',
    '$(exit 0)',
    'v1.2.3"; exit 0 #',
  ]) {
    assert.equal(validate(tag).status, 1, JSON.stringify(tag))
  }
})

test('validates before checking out only the requested tag namespace', () => {
  assert.ok(
    workflow.indexOf('name: Validate release tag') < workflow.indexOf('uses: actions/checkout@'),
  )
  assert.match(
    workflow,
    /uses: actions\/checkout@[^\n]+\n        with:\n          ref: refs\/tags\/\$\{\{ steps\.release\.outputs\.tag \}\}/,
  )
  assert.match(workflow, /VERSION: \$\{\{ steps\.release\.outputs\.version \}\}/)
  assert.match(workflow, /tagName: \$\{\{ steps\.release\.outputs\.tag \}\}/)
  assert.match(workflow, /releaseName: 'Pipeup \$\{\{ steps\.release\.outputs\.tag \}\}'/)
})

test('untrusted input is passed through environment and releases remain drafts', () => {
  assert.equal((workflow.match(/github\.event\.inputs\.tag/g) ?? []).length, 1)
  assert.match(
    workflow,
    /REQUESTED_TAG: \$\{\{ github\.event\.inputs\.tag \|\| github\.ref_name \}\}/,
  )
  assert.match(workflow, /releaseDraft: true/)
  assert.doesNotMatch(workflow, /default: 'v/)
})
