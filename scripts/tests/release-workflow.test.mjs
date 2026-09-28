import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, chmodSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
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

const draftStep = workflow.match(
  /      - name: Create the draft release, or reuse this tag's draft\n[\s\S]*?        run: \|\n((?:          .*\n|\n)+)/,
)?.[1]
assert.ok(draftStep, 'The draft-creating step must exist')
const draftScript = draftStep.replace(/^          /gm, '')

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
    /uses: actions\/checkout@[^\n]+\n        with:\n          ref: refs\/tags\/\$\{\{ needs\.create-release\.outputs\.tag \}\}/,
  )
  assert.match(workflow, /VERSION: \$\{\{ needs\.create-release\.outputs\.version \}\}/)
  assert.match(workflow, /  build:\n    needs: create-release\n/)
})

test('untrusted input is passed through environment and releases remain drafts', () => {
  assert.equal((workflow.match(/github\.event\.inputs\.tag/g) ?? []).length, 1)
  assert.match(
    workflow,
    /REQUESTED_TAG: \$\{\{ github\.event\.inputs\.tag \|\| github\.ref_name \}\}/,
  )
  assert.match(draftScript, /-F draft=true/)
  assert.doesNotMatch(workflow, /default: 'v/)
})

test('every build uploads to the one draft instead of creating its own', () => {
  assert.match(workflow, /releaseId: \$\{\{ needs\.create-release\.outputs\.release_id \}\}/)
  // With a tag name, tauri-action finds-or-creates the release per job, and
  // parallel jobs can race into two drafts for one tag.
  assert.doesNotMatch(workflow, /tagName:/)
})

// Runs the real draft step against a fake `gh` that answers from a fixture:
// `api .../releases` pipes the fixture through the step's own --jq filter.
function runDraftStep(releases, { tagPushed = true } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'pipeup-draft-test-'))
  const output = join(directory, 'output')
  const calls = join(directory, 'calls')
  const fixture = join(directory, 'releases.json')
  writeFileSync(fixture, JSON.stringify(releases))
  writeFileSync(
    join(directory, 'gh'),
    `#!/bin/bash
echo "$*" >> "${calls}"
if [[ "$*" == *"git/ref/tags/"* ]]; then ${tagPushed ? 'exit 0' : 'exit 1'}; fi
if [[ "$*" == *"-X POST"* ]]; then echo 4242; exit 0; fi
filter=""
while [[ $# -gt 0 ]]; do [[ "$1" == --jq ]] && filter="$2"; shift; done
jq -r "$filter" "${fixture}"
`,
  )
  chmodSync(join(directory, 'gh'), 0o755)
  try {
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', draftScript], {
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        GH_REPO: 'owner/repo',
        TAG: 'v1.2.3',
        GITHUB_OUTPUT: output,
        RUNNER_TEMP: directory,
      },
      encoding: 'utf8',
    })
    return {
      status: result.status,
      stdout: result.stdout,
      output: existsSync(output) ? readFileSync(output, 'utf8') : '',
      calls: existsSync(calls) ? readFileSync(calls, 'utf8') : '',
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('creates one draft for a new tag and hands its id to the builds', () => {
  const r = runDraftStep([{ id: 7, tag_name: 'v1.2.2', draft: false }])
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.output, 'release_id=4242\n')
  assert.match(r.calls, /-X POST repos\/owner\/repo\/releases .*tag_name=v1\.2\.3.*draft=true/)
})

test('reuses the tag draft on a rebuild without creating another', () => {
  const r = runDraftStep([{ id: 9, tag_name: 'v1.2.3', draft: true }])
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.output, 'release_id=9\n')
  assert.doesNotMatch(r.calls, /-X POST/)
})

test('refuses a published tag, a tag with several releases, and an unpushed tag', () => {
  const published = runDraftStep([{ id: 9, tag_name: 'v1.2.3', draft: false }])
  assert.equal(published.status, 1)
  assert.match(published.stdout, /already published/)

  const several = runDraftStep([
    { id: 9, tag_name: 'v1.2.3', draft: true },
    { id: 10, tag_name: 'v1.2.3', draft: true },
  ])
  assert.equal(several.status, 1)
  assert.match(several.stdout, /More than one release/)

  const unpushed = runDraftStep([], { tagPushed: false })
  assert.equal(unpushed.status, 1)
  assert.doesNotMatch(unpushed.calls, /-X POST/)
})

test('macOS release jobs require the Pipeup signing identity', () => {
  const signingStep = workflow.match(
    /      - name: Import macOS code-signing certificate\n[\s\S]*?        run: \|\n((?:          .*\n|\n)+)/,
  )
  assert.ok(signingStep, 'macOS signing step must exist')
  assert.match(signingStep[0], /if: startsWith\(matrix\.platform, 'macos'\)/)
  assert.match(signingStep[0], /IDENTITY=.*"Pipeup Release"/)

  const guard = signingStep[1].split('          KEYCHAIN_PATH=')[0].replace(/^          /gm, '')
  for (const [certificate, password] of [
    ['', ''],
    ['present', ''],
    ['', 'present'],
  ]) {
    const result = spawnSync('bash', ['-e', '-c', guard], {
      env: {
        ...process.env,
        MACOS_CERT_P12_BASE64: certificate,
        MACOS_CERT_P12_PASSWORD: password,
      },
      encoding: 'utf8',
    })
    assert.equal(result.status, 1)
    assert.match(result.stdout, /Pipeup release signing secrets are required/)
  }
})
