import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EXPECTED_TOOLS = [
  'session.list',
  'session.open',
  'session.focus',
  'session.close',
  'session.getCurrent',
  'browser.listTabs',
  'browser.getWindowState',
  'browser.resizeWindow',
  'chrome.getAppearance',
  'chrome.setAppearance',
  'chrome.resetAppearance',
  'page.navigate',
  'picker.enable',
  'picker.disable',
  'picker.lastSelection',
  'page.viewAsMarkdown',
  'page.scroll',
  'page.screenshot',
  'artifacts.get',
  'artifacts.list',
  'artifacts.delete',
]

const LOG_LIMIT = 20_000
const REGISTRATION_TIMEOUT_MS = 60_000
const REQUEST_TIMEOUT_MS = 15_000
const SHUTDOWN_TIMEOUT_MS = 10_000
const SMOKE_CHROME_COLOR = '#EAF3FF'
const SECOND_SMOKE_CHROME_COLOR = '#F6E9FF'
const SMOKE_ACCENT_COLOR = '#FF6B35'
const UPDATED_ACCENT_COLOR = '#0A84FF'
const SECOND_SMOKE_ACCENT_COLOR = '#18A57B'
const SMOKE_PROJECT_ICON_FILE = 'project-icon.svg'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const runtime = process.argv[2]

if (runtime !== 'dev' && runtime !== 'packaged') {
  console.error('Usage: node scripts/mcp-smoke.mjs <dev|packaged>')
  process.exit(1)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const appendLog = (current, chunk) => {
  const next = `${current}${chunk}`
  return next.length > LOG_LIMIT ? next.slice(-LOG_LIMIT) : next
}

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message)
  }
}

const findFreePort = async () =>
  new Promise((resolve, reject) => {
    const server = net.createServer()

    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not allocate a free port.')))
        return
      }

      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve(port)
      })
    })
  })

const waitForFile = async (filePath, timeoutMs, childState) => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return JSON.parse(await readFile(filePath, 'utf8'))
    } catch {
      if (childState.exitCode !== null) {
        throw new Error(
          `App exited before writing registration file (exit ${childState.exitCode}, signal ${childState.signal ?? 'none'}).`,
        )
      }

      await sleep(250)
    }
  }

  throw new Error(`Timed out waiting for MCP registration file at ${filePath}.`)
}

const requestJson = async (url, init) => {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  const text = await response.text()
  let json = null

  if (text.length > 0) {
    try {
      json = JSON.parse(text)
    } catch {
      json = text
    }
  }

  return {
    status: response.status,
    body: json,
    text,
  }
}

const assertFileExists = async (filePath, message) => {
  try {
    await access(filePath)
  } catch {
    throw new Error(message)
  }
}

const assertSamePath = async (actualPath, expectedPath, message) => {
  const [resolvedActualPath, resolvedExpectedPath] = await Promise.all([
    realpath(actualPath),
    realpath(expectedPath),
  ])

  assert(resolvedActualPath === resolvedExpectedPath, message)
}

const writeSmokeProjectFixture = async (
  smokeDir,
  fixtureName,
  {
    chromeColor,
    accentColor,
    iconColor,
  },
) => {
  const projectRoot = path.join(smokeDir, fixtureName)

  await mkdir(projectRoot, { recursive: true })

  const resolvedProjectRoot = await realpath(projectRoot)
  const configPath = path.join(resolvedProjectRoot, '.loop-browser.json')
  const projectIconPath = path.join(resolvedProjectRoot, SMOKE_PROJECT_ICON_FILE)

  await writeFile(
    projectIconPath,
    [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">',
      '  <rect width="256" height="256" rx="48" fill="#18304F" />',
      `  <circle cx="128" cy="112" r="54" fill="${iconColor}" />`,
      '  <path d="M74 176h108v22H74z" fill="#F6F9FF" />',
      '</svg>',
      '',
    ].join('\n'),
    'utf8',
  )

  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        version: 1,
        chrome: {
          chromeColor,
          accentColor,
          projectIconPath: `./${SMOKE_PROJECT_ICON_FILE}`,
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  return {
    projectRoot: resolvedProjectRoot,
    configPath,
    projectIconPath,
  }
}

const writeTallFixture = async (smokeDir) => {
  const fixturePath = path.join(smokeDir, 'tall-fixture.html')
  await writeFile(
    fixturePath,
    [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="utf-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
      '  <title>Loop Tall Fixture</title>',
      '  <style>',
      '    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; }',
      '    body { margin: 0; background: #f8f2ff; color: #1d2140; }',
      '    main { max-width: 960px; margin: 0 auto; padding: 48px 24px 160px; }',
      '    .hero { min-height: 1180px; display: grid; align-content: start; gap: 16px; }',
      '    .hero-card, .ph-deadlines-secondary-grid { background: rgba(255,255,255,0.92); border: 1px solid rgba(112,94,162,0.18); border-radius: 28px; box-shadow: 0 24px 80px rgba(78,48,122,0.12); }',
      '    .hero-card { padding: 32px; }',
      '    .ph-deadlines-secondary-grid { padding: 32px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }',
      '    .deadline-card { min-height: 160px; padding: 20px; border-radius: 20px; background: linear-gradient(180deg, #fff6d8 0%, #fff 100%); }',
      '  </style>',
      '</head>',
      '<body>',
      '  <main>',
      '    <section class="hero">',
      '      <div class="hero-card">',
      '        <h1>Deadlines Fixture</h1>',
      '        <p>This page is intentionally tall so smoke tests can verify below-the-fold scroll and capture behavior.</p>',
      '      </div>',
      '    </section>',
      '    <section class="ph-deadlines-secondary-grid">',
      '      <article class="deadline-card"><h2>Launch Week</h2><p>QA holdback, partner kit, and final review.</p></article>',
      '      <article class="deadline-card"><h2>Ops Prep</h2><p>Refresh incident runbooks and alert windows.</p></article>',
      '      <article class="deadline-card"><h2>Stakeholder Notes</h2><p>Summarize remaining open approvals and risks.</p></article>',
      '      <article class="deadline-card"><h2>Follow-up</h2><p>Confirm the below-the-fold capture path sees this section.</p></article>',
      '    </section>',
      '  </main>',
      '</body>',
      '</html>',
      '',
    ].join('\n'),
    'utf8',
  )

  return pathToFileURL(fixturePath).toString()
}

const callTool = async (registration, id, name, args = {}, options = {}) =>
  makeRpcRequest(
    registration,
    'tools/call',
    {
      name,
      arguments: args,
    },
    id,
    options,
  )

const makeRpcRequest = async (registration, method, params, id, options = {}) => {
  const token = String(registration.transport.headers.Authorization).replace(/^Bearer\s+/, '')

  return requestJson(registration.transport.url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...(options.protocolVersion
        ? { 'mcp-protocol-version': options.protocolVersion }
        : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    }),
  })
}

const makeNotification = async (registration, method, params, options = {}) => {
  const token = String(registration.transport.headers.Authorization).replace(/^Bearer\s+/, '')

  return requestJson(registration.transport.url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...(options.protocolVersion
        ? { 'mcp-protocol-version': options.protocolVersion }
        : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
    }),
  })
}

const waitForChromeAppearance = async (
  registration,
  id,
  sessionId,
  predicate,
  timeoutMs = 10_000,
  intervalMs = 250,
) => {
  const startedAt = Date.now()
  let lastResponse = null

  while (Date.now() - startedAt < timeoutMs) {
    lastResponse = await makeRpcRequest(
      registration,
      'tools/call',
      {
        name: 'chrome.getAppearance',
        arguments: {
          sessionId,
        },
      },
      id,
    )

    const appearance = lastResponse.body?.result?.structuredContent?.appearance
    if (predicate(appearance)) {
      return lastResponse
    }

    await sleep(intervalMs)
  }

  return lastResponse
}

const waitForSessions = async (
  registration,
  id,
  predicate,
  timeoutMs = 20_000,
  intervalMs = 250,
) => {
  const startedAt = Date.now()
  let lastSessions = []

  while (Date.now() - startedAt < timeoutMs) {
    const response = await callTool(registration, id, 'session.list')
    lastSessions = response.body?.result?.structuredContent?.sessions ?? []
    if (predicate(lastSessions)) {
      return lastSessions
    }
    await sleep(intervalMs)
  }

  return lastSessions
}

const findSessionByProjectRoot = (sessions, projectRoot) =>
  sessions.find((session) => session.projectRoot === projectRoot) ?? null

const findWorkspaceBinary = async () => {
  const electronBinary = path.join(
    repoRoot,
    'node_modules',
    'electron',
    'dist',
    'Electron.app',
    'Contents',
    'MacOS',
    'Electron',
  )
  const workspaceEntry = path.join(repoRoot, 'apps', 'desktop')
  const workspaceBundle = path.join(workspaceEntry, '.vite', 'build', 'index.js')

  await access(electronBinary)

  try {
    await access(workspaceBundle)
  } catch {
    throw new Error(
      'Could not find the built workspace app entrypoint. Run `npm run build` first.',
    )
  }

  return {
    command: electronBinary,
    args: [workspaceEntry],
  }
}

const findPackagedBinary = async () => {
  const preferredPath = path.join(
    repoRoot,
    'apps',
    'desktop',
    'out',
    `Loop Browser-darwin-${process.arch}`,
    'Loop Browser.app',
    'Contents',
    'MacOS',
    'Loop Browser',
  )

  try {
    await access(preferredPath)
    return preferredPath
  } catch {
    // Fall through to scanning the output directory.
  }

  const outDir = path.join(repoRoot, 'apps', 'desktop', 'out')
  const entries = await readdir(outDir, { withFileTypes: true })

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || !entry.name.startsWith('Loop Browser-darwin-')) {
      continue
    }

    const candidate = path.join(
      outDir,
      entry.name,
      'Loop Browser.app',
      'Contents',
      'MacOS',
      'Loop Browser',
    )

    try {
      await access(candidate)
      return candidate
    } catch {
      // Keep scanning for another packaged app candidate.
    }
  }

  throw new Error(
    'Could not find a packaged Loop Browser binary. Run `npm run build` first.',
  )
}

const spawnApp = async (mode, env, cwd, state) => {
  const spawnOptions = {
    cwd,
    env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  }

  const launch =
    mode === 'dev'
      ? await findWorkspaceBinary()
      : {
          command: await findPackagedBinary(),
          args: [],
        }

  const child = spawn(launch.command, launch.args, spawnOptions)

  child.stdout.on('data', (chunk) => {
    state.stdout = appendLog(state.stdout, String(chunk))
  })

  child.stderr.on('data', (chunk) => {
    state.stderr = appendLog(state.stderr, String(chunk))
  })

  const exitPromise = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      state.exitCode = code
      state.signal = signal
      resolve({ code, signal })
    })
  })

  return { child, exitPromise }
}

const terminateChild = async (child, exitPromise) => {
  if (child.exitCode !== null || child.signalCode !== null) {
    await exitPromise
    return
  }

  try {
    if (process.platform === 'win32') {
      child.kill('SIGTERM')
    } else if (child.pid) {
      process.kill(-child.pid, 'SIGTERM')
    }
  } catch {
    // Ignore shutdown errors and fall through to the wait/kill path.
  }

  const exited = await Promise.race([
    exitPromise.then(() => true),
    sleep(SHUTDOWN_TIMEOUT_MS).then(() => false),
  ])

  if (exited) {
    return
  }

  try {
    if (process.platform === 'win32') {
      child.kill('SIGKILL')
    } else if (child.pid) {
      process.kill(-child.pid, 'SIGKILL')
    }
  } catch {
    // Best effort cleanup.
  }

  await Promise.race([exitPromise, sleep(2_000)])
}

const terminateSessionProcesses = async (clusterDir) => {
  const pids = []

  try {
    const sessionsDir = path.join(clusterDir, 'sessions')
    const entries = await readdir(sessionsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue
      }

      try {
        const record = JSON.parse(await readFile(path.join(sessionsDir, entry.name), 'utf8'))
        if (typeof record?.pid === 'number') {
          pids.push(record.pid)
          try {
            process.kill(record.pid, 'SIGTERM')
          } catch {
            // Process may already be gone.
          }
        }
      } catch {
        // Ignore malformed records during cleanup.
      }
    }
  } catch {
    // Cluster directory may already be gone.
  }

  if (pids.length === 0) {
    return
  }

  await sleep(1_500)

  for (const pid of pids) {
    try {
      process.kill(pid, 0)
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // Process may have exited between checks.
      }
    } catch {
      // Process already exited.
    }
  }

  await sleep(400)
}

const state = {
  runtime,
  stdout: '',
  stderr: '',
  exitCode: null,
  signal: null,
  registration: null,
  requests: [],
}

const run = async () => {
  const smokeDir = await mkdtemp(path.join(os.tmpdir(), 'agent-browser-mcp-smoke-'))
  const clusterDir = path.join(smokeDir, 'cluster')
  const homeDir = path.join(smokeDir, 'home')
  const projectFixtureA = await writeSmokeProjectFixture(smokeDir, 'project-a', {
    chromeColor: SMOKE_CHROME_COLOR,
    accentColor: SMOKE_ACCENT_COLOR,
    iconColor: '#FF6B35',
  })
  const projectFixtureB = await writeSmokeProjectFixture(smokeDir, 'project-b', {
    chromeColor: SECOND_SMOKE_CHROME_COLOR,
    accentColor: SECOND_SMOKE_ACCENT_COLOR,
    iconColor: '#4F46E5',
  })
  const fixtureUrl = pathToFileURL(
    path.join(repoRoot, 'apps', 'desktop', 'static', 'local-fixture.html'),
  ).toString()
  const fixtureUrlA = `${fixtureUrl}?session=alpha`
  const tallFixtureUrl = await writeTallFixture(smokeDir)
  const fixtureUrlB = `${tallFixtureUrl}?session=beta`
  const fixtureUrlBAfterClose = `${fixtureUrl}?session=beta-after-close`
  const port = await findFreePort()

  await mkdir(clusterDir, { recursive: true })
  await mkdir(homeDir, { recursive: true })

  const env = {
    ...process.env,
    LOOP_BROWSER_CLUSTER_DIR: clusterDir,
    LOOP_BROWSER_USE_MOCK_KEYCHAIN: '1',
    HOME: homeDir,
    AGENT_BROWSER_TOOL_SERVER_PORT: String(port),
    AGENT_BROWSER_START_URL: 'about:blank',
  }

  const registrationPath = path.join(clusterDir, 'mcp-registration.json')
  const { child, exitPromise } = await spawnApp(runtime, env, repoRoot, state)

  try {
    const registration = await waitForFile(registrationPath, REGISTRATION_TIMEOUT_MS, state)
    state.registration = registration

    const registrationUrl = new URL(registration.transport.url)
    assert(registrationUrl.port === String(port), 'Registration file did not use the overridden MCP port.')
    assert(
      String(registration.transport.headers.Authorization).startsWith('Bearer '),
      'Registration file did not include a bearer token.',
    )

    const unauthorized = await requestJson(registration.transport.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {},
      }),
    })
    state.requests.push({ name: 'unauthorized.initialize', status: unauthorized.status, body: unauthorized.body })
    assert(unauthorized.status === 401, 'Unauthorized initialize request should return 401.')

    const sseProbe = await requestJson(registration.transport.url, {
      method: 'GET',
    })
    state.requests.push({ name: 'get.mcp', status: sseProbe.status, body: sseProbe.body })
    assert(sseProbe.status === 405, 'GET /mcp should return 405 when SSE is unsupported.')

    const initialize = await makeRpcRequest(
      registration,
      'initialize',
      {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: {
          name: 'mcp-smoke',
          version: '1.0.0',
        },
      },
      1,
    )
    state.requests.push({ name: 'initialize', status: initialize.status, body: initialize.body })
    assert(initialize.status === 200, 'initialize should return 200.')
    assert(
      initialize.body?.result?.serverInfo?.name === 'agent-browser',
      'initialize did not return the expected server info.',
    )
    assert(
      initialize.body?.result?.protocolVersion === '2025-11-25',
      'initialize did not negotiate the expected protocol version.',
    )
    const protocolVersion = initialize.body?.result?.protocolVersion

    const initialized = await makeNotification(
      registration,
      'notifications/initialized',
      {},
      { protocolVersion },
    )
    state.requests.push({
      name: 'notifications/initialized',
      status: initialized.status,
      body: initialized.body,
    })
    assert(initialized.status === 202, 'notifications/initialized should return 202.')

    const tools = await makeRpcRequest(registration, 'tools/list', {}, 2, { protocolVersion })
    state.requests.push({ name: 'tools/list', status: tools.status, body: tools.body })
    assert(tools.status === 200, 'tools/list should return 200.')

    const toolDefinitions = tools.body?.result?.tools ?? []
    const toolNames = toolDefinitions.map((tool) => tool.name) ?? []
    for (const toolName of EXPECTED_TOOLS) {
      assert(toolNames.includes(toolName), `tools/list did not include ${toolName}.`)
    }
    const navigateDefinition = toolDefinitions.find((tool) => tool.name === 'page.navigate')
    assert(
      navigateDefinition?.inputSchema?.required?.includes('sessionId'),
      'tools/list did not mark page.navigate as requiring sessionId.',
    )

    const resources = await makeRpcRequest(
      registration,
      'resources/list',
      {},
      'resources-list',
      { protocolVersion },
    )
    state.requests.push({ name: 'resources/list', status: resources.status, body: resources.body })
    assert(resources.status === 200, 'resources/list should return 200.')
    const resourceUris = resources.body?.result?.resources?.map((resource) => resource.uri) ?? []
    assert(
      resourceUris.includes('loop-browser:///sessions'),
      'resources/list did not include the sessions resource.',
    )

    const resourceTemplates = await makeRpcRequest(
      registration,
      'resources/templates/list',
      {},
      'resource-templates-list',
      { protocolVersion },
    )
    state.requests.push({
      name: 'resources/templates/list',
      status: resourceTemplates.status,
      body: resourceTemplates.body,
    })
    assert(resourceTemplates.status === 200, 'resources/templates/list should return 200.')
    const resourceTemplateUris =
      resourceTemplates.body?.result?.resourceTemplates?.map(
        (resourceTemplate) => resourceTemplate.uriTemplate,
      ) ?? []
    assert(
      resourceTemplateUris.includes('loop-browser:///session/{sessionId}/summary'),
      'resources/templates/list did not include the session summary template.',
    )

    const sessionsResource = await makeRpcRequest(
      registration,
      'resources/read',
      { uri: 'loop-browser:///sessions' },
      'resource-read-sessions',
      { protocolVersion },
    )
    state.requests.push({
      name: 'resources/read:sessions',
      status: sessionsResource.status,
      body: sessionsResource.body,
    })
    assert(sessionsResource.status === 200, 'resources/read(sessions) should return 200.')
    assert(
      sessionsResource.body?.result?.contents?.[0]?.uri === 'loop-browser:///sessions',
      'resources/read(sessions) did not echo the sessions resource URI.',
    )

    const missingSessionId = await callTool(registration, 3, 'chrome.getAppearance')
    state.requests.push({
      name: 'tools/call:chrome.getAppearance:missing-sessionId',
      status: missingSessionId.status,
      body: missingSessionId.body,
    })
    assert(missingSessionId.status === 500, 'chrome.getAppearance without sessionId should fail.')
    assert(
      missingSessionId.body?.error?.message?.includes('requires sessionId'),
      'chrome.getAppearance without sessionId did not explain the sessionId requirement.',
    )

    const openFirstSession = await callTool(registration, 4, 'session.open', {
      projectRoot: projectFixtureA.projectRoot,
    })
    state.requests.push({
      name: 'tools/call:session.open:project-a',
      status: openFirstSession.status,
      body: openFirstSession.body,
    })
    assert(openFirstSession.status === 200, 'session.open(project-a) should return 200.')

    const openSecondSession = await callTool(registration, 5, 'session.open', {
      projectRoot: projectFixtureB.projectRoot,
    })
    state.requests.push({
      name: 'tools/call:session.open:project-b',
      status: openSecondSession.status,
      body: openSecondSession.body,
    })
    assert(openSecondSession.status === 200, 'session.open(project-b) should return 200.')

    const sessions = await waitForSessions(
      registration,
      6,
      (currentSessions) =>
        currentSessions.length === 2 &&
        Boolean(findSessionByProjectRoot(currentSessions, projectFixtureA.projectRoot)) &&
        Boolean(findSessionByProjectRoot(currentSessions, projectFixtureB.projectRoot)),
    )
    const sessionA = findSessionByProjectRoot(sessions, projectFixtureA.projectRoot)
    const sessionB = findSessionByProjectRoot(sessions, projectFixtureB.projectRoot)
    assert(sessionA, 'session.list did not include project-a.')
    assert(sessionB, 'session.list did not include project-b.')

    const resourcesAfterSessions = await makeRpcRequest(
      registration,
      'resources/list',
      {},
      'resources-list-after-open',
      { protocolVersion },
    )
    state.requests.push({
      name: 'resources/list:after-open',
      status: resourcesAfterSessions.status,
      body: resourcesAfterSessions.body,
    })
    assert(resourcesAfterSessions.status === 200, 'resources/list after opening sessions should return 200.')
    const resourceUrisAfterOpen =
      resourcesAfterSessions.body?.result?.resources?.map((resource) => resource.uri) ?? []
    assert(
      resourceUrisAfterOpen.includes(`loop-browser:///session/${sessionA.sessionId}/summary`),
      'resources/list after opening sessions did not include the project-a summary resource.',
    )
    assert(
      resourceUrisAfterOpen.includes(`loop-browser:///session/${sessionB.sessionId}/summary`),
      'resources/list after opening sessions did not include the project-b summary resource.',
    )

    const sessionSummaryResource = await makeRpcRequest(
      registration,
      'resources/read',
      { uri: `loop-browser:///session/${sessionA.sessionId}/summary` },
      'resource-read-project-a-summary',
      { protocolVersion },
    )
    state.requests.push({
      name: 'resources/read:project-a-summary',
      status: sessionSummaryResource.status,
      body: sessionSummaryResource.body,
    })
    assert(
      sessionSummaryResource.status === 200,
      'resources/read(project-a summary) should return 200.',
    )
    assert(
      JSON.parse(sessionSummaryResource.body?.result?.contents?.[0]?.text ?? '{}')?.session
        ?.sessionId === sessionA.sessionId,
      'resources/read(project-a summary) did not return the expected session metadata.',
    )

    const currentSession = await callTool(registration, 7, 'session.getCurrent')
    state.requests.push({
      name: 'tools/call:session.getCurrent',
      status: currentSession.status,
      body: currentSession.body,
    })
    assert(currentSession.status === 200, 'session.getCurrent should return 200.')
    const currentSessionId = currentSession.body?.result?.structuredContent?.session?.sessionId
    assert(
      currentSessionId === sessionA.sessionId || currentSessionId === sessionB.sessionId,
      'session.getCurrent did not return one of the open project sessions.',
    )

    const focusSecondSession = await callTool(registration, 8, 'session.focus', {
      sessionId: sessionB.sessionId,
    })
    state.requests.push({
      name: 'tools/call:session.focus:project-b',
      status: focusSecondSession.status,
      body: focusSecondSession.body,
    })
    assert(
      focusSecondSession.status === 200 || focusSecondSession.status === 500,
      'session.focus(project-b) should return 200 or a clear timeout error.',
    )
    if (focusSecondSession.status === 200) {
      assert(
        focusSecondSession.body?.result?.structuredContent?.session?.sessionId === sessionB.sessionId,
        'session.focus(project-b) did not return the focused project-b session.',
      )
      assert(
        focusSecondSession.body?.result?.structuredContent?.session?.isFocused === true,
        'session.focus(project-b) did not report project-b as focused.',
      )
    } else {
      assert(
        String(focusSecondSession.body?.error?.message ?? '').includes(
          'Timed out waiting for session',
        ),
        'session.focus(project-b) did not return the expected bounded timeout error.',
      )
    }

    const initialAppearanceA = await waitForChromeAppearance(
      registration,
      9,
      sessionA.sessionId,
      (appearance) => appearance?.dockIconStatus !== 'idle',
    )
    state.requests.push({
      name: 'tools/call:chrome.getAppearance:project-a',
      status: initialAppearanceA.status,
      body: initialAppearanceA.body,
    })
    assert(initialAppearanceA.status === 200, 'chrome.getAppearance(project-a) should return 200.')
    const initialAppearanceStateA = initialAppearanceA.body?.result?.structuredContent?.appearance
    await assertSamePath(
      initialAppearanceStateA?.projectRoot,
      projectFixtureA.projectRoot,
      'chrome.getAppearance(project-a) did not report the smoke project root.',
    )
    await assertSamePath(
      initialAppearanceStateA?.configPath,
      projectFixtureA.configPath,
      'chrome.getAppearance(project-a) did not report the smoke config path.',
    )
    assert(
      initialAppearanceStateA?.chromeColor === SMOKE_CHROME_COLOR,
      'chrome.getAppearance(project-a) did not load the configured chrome color.',
    )
    assert(
      initialAppearanceStateA?.accentColor === SMOKE_ACCENT_COLOR,
      'chrome.getAppearance(project-a) did not load the configured accent color.',
    )
    assert(
      initialAppearanceStateA?.projectIconPath === `./${SMOKE_PROJECT_ICON_FILE}`,
      'chrome.getAppearance(project-a) did not load the configured project icon path.',
    )
    await assertSamePath(
      initialAppearanceStateA?.resolvedProjectIconPath,
      projectFixtureA.projectIconPath,
      'chrome.getAppearance(project-a) did not resolve the project icon path relative to the smoke project.',
    )
    assert(
      initialAppearanceStateA?.dockIconStatus === 'applied',
      'chrome.getAppearance(project-a) did not report an applied Dock icon state.',
    )
    assert(
      initialAppearanceStateA?.dockIconSource === 'projectIcon',
      'chrome.getAppearance(project-a) did not report the expected Dock icon source.',
    )
    assert(
      initialAppearanceStateA?.dockIconLastError === null,
      'chrome.getAppearance(project-a) reported a Dock icon error during initial load.',
    )

    const initialAppearanceB = await waitForChromeAppearance(
      registration,
      10,
      sessionB.sessionId,
      (appearance) => appearance?.dockIconStatus !== 'idle',
    )
    state.requests.push({
      name: 'tools/call:chrome.getAppearance:project-b',
      status: initialAppearanceB.status,
      body: initialAppearanceB.body,
    })
    assert(initialAppearanceB.status === 200, 'chrome.getAppearance(project-b) should return 200.')
    const initialAppearanceStateB = initialAppearanceB.body?.result?.structuredContent?.appearance
    assert(
      initialAppearanceStateB?.chromeColor === SECOND_SMOKE_CHROME_COLOR,
      'chrome.getAppearance(project-b) did not load the second project chrome color.',
    )
    assert(
      initialAppearanceStateB?.accentColor === SECOND_SMOKE_ACCENT_COLOR,
      'chrome.getAppearance(project-b) did not load the second project accent color.',
    )

    const updatedAppearance = await callTool(registration, 11, 'chrome.setAppearance', {
      sessionId: sessionA.sessionId,
      accentColor: UPDATED_ACCENT_COLOR,
    })
    assert(updatedAppearance.status === 200, 'chrome.setAppearance should return 200.')
    const updatedAppearanceState = updatedAppearance.body?.result?.structuredContent?.appearance
    assert(
      updatedAppearanceState?.accentColor === UPDATED_ACCENT_COLOR,
      'chrome.setAppearance did not apply the requested accent color.',
    )
    assert(
      updatedAppearanceState?.dockIconStatus === 'applied',
      'chrome.setAppearance did not report an applied Dock icon state.',
    )
    assert(
      updatedAppearanceState?.dockIconLastError === null,
      'chrome.setAppearance reported a Dock icon error.',
    )
    const persistedAppearance = JSON.parse(await readFile(projectFixtureA.configPath, 'utf8'))
    assert(
      persistedAppearance?.chrome?.accentColor === UPDATED_ACCENT_COLOR,
      'chrome.setAppearance did not persist the updated accent color to .loop-browser.json.',
    )

    const navigateA = await callTool(registration, 12, 'page.navigate', {
      sessionId: sessionA.sessionId,
      target: fixtureUrlA,
    })
    state.requests.push({ name: 'tools/call:page.navigate:project-a', status: navigateA.status, body: navigateA.body })
    assert(navigateA.status === 200, 'page.navigate(project-a) should return 200.')
    assert(
      navigateA.body?.result?.structuredContent?.navigation?.url === fixtureUrlA,
      'page.navigate(project-a) did not navigate to the expected fixture URL.',
    )

    const navigateB = await callTool(registration, 13, 'page.navigate', {
      sessionId: sessionB.sessionId,
      target: fixtureUrlB,
    })
    state.requests.push({ name: 'tools/call:page.navigate:project-b', status: navigateB.status, body: navigateB.body })
    assert(navigateB.status === 200, 'page.navigate(project-b) should return 200.')
    assert(
      navigateB.body?.result?.structuredContent?.navigation?.url === fixtureUrlB,
      'page.navigate(project-b) did not navigate to the expected fixture URL.',
    )

    const listTabsA = await callTool(registration, 14, 'browser.listTabs', {
      sessionId: sessionA.sessionId,
    })
    state.requests.push({ name: 'tools/call:browser.listTabs:project-a', status: listTabsA.status, body: listTabsA.body })
    assert(listTabsA.status === 200, 'browser.listTabs(project-a) should return 200.')
    assert(
      listTabsA.body?.result?.structuredContent?.tabs?.[0]?.url === fixtureUrlA,
      'browser.listTabs(project-a) did not return the navigated fixture URL.',
    )

    const listTabsB = await callTool(registration, 15, 'browser.listTabs', {
      sessionId: sessionB.sessionId,
    })
    state.requests.push({ name: 'tools/call:browser.listTabs:project-b', status: listTabsB.status, body: listTabsB.body })
    assert(listTabsB.status === 200, 'browser.listTabs(project-b) should return 200.')
    assert(
      listTabsB.body?.result?.structuredContent?.tabs?.[0]?.url === fixtureUrlB,
      'browser.listTabs(project-b) did not return the navigated fixture URL.',
    )

    const markdown = await callTool(registration, 16, 'page.viewAsMarkdown', {
      sessionId: sessionA.sessionId,
      forceRefresh: true,
    })
    state.requests.push({
      name: 'tools/call:page.viewAsMarkdown:project-a',
      status: markdown.status,
      body: markdown.body,
    })
    assert(markdown.status === 200, 'page.viewAsMarkdown(project-a) should return 200.')
    assert(
      markdown.body?.result?.structuredContent?.url === fixtureUrlA,
      'page.viewAsMarkdown(project-a) did not report the fixture URL.',
    )
    assert(
      markdown.body?.result?.structuredContent?.title === 'Loop Fixture',
      'page.viewAsMarkdown(project-a) did not return the expected fixture title.',
    )
    assert(
      markdown.body?.result?.structuredContent?.markdown?.includes(
        'Your local launchpad is ready.',
      ),
      'page.viewAsMarkdown(project-a) did not contain the expected fixture Markdown.',
    )

    const windowState = await callTool(registration, 17, 'browser.getWindowState', {
      sessionId: sessionB.sessionId,
    })
    state.requests.push({
      name: 'tools/call:browser.getWindowState:project-b',
      status: windowState.status,
      body: windowState.body,
    })
    assert(windowState.status === 200, 'browser.getWindowState(project-b) should return 200.')
    assert(
      typeof windowState.body?.result?.structuredContent?.window?.chromeHeight === 'number',
      'browser.getWindowState(project-b) did not return a valid window payload.',
    )

    const resized = await callTool(registration, 18, 'browser.resizeWindow', {
      sessionId: sessionB.sessionId,
      width: 1280,
      height: 720,
      target: 'pageViewport',
    })
    state.requests.push({
      name: 'tools/call:browser.resizeWindow:project-b',
      status: resized.status,
      body: resized.body,
    })
    assert(resized.status === 200, 'browser.resizeWindow(project-b) should return 200.')
    assert(
      resized.body?.result?.structuredContent?.window?.pageViewportBounds?.width === 1280,
      'browser.resizeWindow(project-b) did not apply the requested viewport width.',
    )
    assert(
      resized.body?.result?.structuredContent?.window?.pageViewportBounds?.height === 720,
      'browser.resizeWindow(project-b) did not apply the requested viewport height.',
    )

    const pageScroll = await callTool(registration, 19, 'page.scroll', {
      sessionId: sessionB.sessionId,
      byY: 480,
    })
    state.requests.push({
      name: 'tools/call:page.scroll:project-b',
      status: pageScroll.status,
      body: pageScroll.body,
    })
    assert(pageScroll.status === 200, 'page.scroll(project-b) should return 200.')
    assert(
      pageScroll.body?.result?.structuredContent?.scrollY > 0,
      'page.scroll(project-b) did not report a positive scrollY after scrolling.',
    )
    assert(
      pageScroll.body?.result?.structuredContent?.maxScrollY >
        pageScroll.body?.result?.structuredContent?.scrollY,
      'page.scroll(project-b) did not report a meaningful maxScrollY.',
    )

    const navigateBAfterScroll = await callTool(registration, 20, 'page.navigate', {
      sessionId: sessionB.sessionId,
      target: fixtureUrlB,
    })
    state.requests.push({
      name: 'tools/call:page.navigate:project-b-reset',
      status: navigateBAfterScroll.status,
      body: navigateBAfterScroll.body,
    })
    assert(
      navigateBAfterScroll.status === 200,
      'page.navigate(project-b reset) should return 200.',
    )

    const pageScreenshotA = await callTool(registration, 21, 'page.screenshot', {
      sessionId: sessionA.sessionId,
      target: 'page',
      fileNameHint: 'fixture-page-a',
    })
    state.requests.push({
      name: 'tools/call:page.screenshot:page:project-a',
      status: pageScreenshotA.status,
      body: pageScreenshotA.body,
    })
    assert(pageScreenshotA.status === 200, 'page.screenshot(project-a page) should return 200.')
    const pageArtifactA = pageScreenshotA.body?.result?.structuredContent
    assert(typeof pageArtifactA?.artifactId === 'string', 'page.screenshot(project-a) did not return an artifact id.')
    assert(pageArtifactA.target === 'page', 'page.screenshot(project-a) returned the wrong target.')

    const elementScreenshotB = await callTool(registration, 22, 'page.screenshot', {
      sessionId: sessionB.sessionId,
      target: 'element',
      selector: '.ph-deadlines-secondary-grid',
      fileNameHint: 'fixture-element-below-fold',
    })
    state.requests.push({
      name: 'tools/call:page.screenshot:element:project-b',
      status: elementScreenshotB.status,
      body: elementScreenshotB.body,
    })
    assert(
      elementScreenshotB.status === 200,
      'page.screenshot(project-b element) should return 200 for a below-the-fold selector.',
    )
    const elementArtifactB = elementScreenshotB.body?.result?.structuredContent
    assert(
      typeof elementArtifactB?.artifactId === 'string',
      'page.screenshot(project-b element) did not return an artifact id.',
    )
    assert(
      elementArtifactB.target === 'element',
      'page.screenshot(project-b element) returned the wrong target.',
    )

    const pageScreenshotB = await callTool(registration, 23, 'page.screenshot', {
      sessionId: sessionB.sessionId,
      target: 'page',
      fullPage: true,
      fileNameHint: 'fixture-page-b-full',
    })
    state.requests.push({
      name: 'tools/call:page.screenshot:full-page:project-b',
      status: pageScreenshotB.status,
      body: pageScreenshotB.body,
    })
    assert(
      pageScreenshotB.status === 200,
      'page.screenshot(project-b full page) should return 200.',
    )
    const pageArtifactB = pageScreenshotB.body?.result?.structuredContent
    assert(typeof pageArtifactB?.artifactId === 'string', 'page.screenshot(project-b) did not return an artifact id.')
    assert(pageArtifactB.target === 'page', 'page.screenshot(project-b) returned the wrong target.')
    assert(
      pageArtifactB.pixelHeight > 720,
      'page.screenshot(project-b full page) did not produce a taller-than-viewport image.',
    )

    const pageArtifactRecord = await callTool(registration, 24, 'artifacts.get', {
      sessionId: sessionA.sessionId,
      artifactId: pageArtifactA.artifactId,
    })
    state.requests.push({
      name: 'tools/call:artifacts.get:project-a',
      status: pageArtifactRecord.status,
      body: pageArtifactRecord.body,
    })
    assert(pageArtifactRecord.status === 200, 'artifacts.get(project-a) should return 200.')
    const pageArtifactFile = pageArtifactRecord.body?.result?.structuredContent?.artifact?.filePath
    assert(typeof pageArtifactFile === 'string', 'artifacts.get(project-a) did not return a file path.')
    await assertFileExists(pageArtifactFile, 'artifacts.get(project-a) returned a missing file path.')

    const listedArtifacts = await callTool(registration, 25, 'artifacts.list', {
      sessionId: sessionA.sessionId,
    })
    state.requests.push({
      name: 'tools/call:artifacts.list:project-a',
      status: listedArtifacts.status,
      body: listedArtifacts.body,
    })
    assert(listedArtifacts.status === 200, 'artifacts.list(project-a) should return 200.')
    const artifactIds =
      listedArtifacts.body?.result?.structuredContent?.artifacts?.map((artifact) => artifact.artifactId) ?? []
    assert(
      artifactIds.includes(pageArtifactA.artifactId),
      'artifacts.list(project-a) did not include the project-a page screenshot artifact.',
    )
    assert(
      !artifactIds.includes(pageArtifactB.artifactId),
      'artifacts.list(project-a) unexpectedly included the project-b artifact.',
    )

    const deleteArtifact = await callTool(registration, 26, 'artifacts.delete', {
      sessionId: sessionA.sessionId,
      artifactId: pageArtifactA.artifactId,
    })
    state.requests.push({
      name: 'tools/call:artifacts.delete:project-a',
      status: deleteArtifact.status,
      body: deleteArtifact.body,
    })
    assert(deleteArtifact.status === 200, 'artifacts.delete(project-a) should return 200.')
    assert(
      deleteArtifact.body?.result?.structuredContent?.artifact?.deleted === true,
      'artifacts.delete(project-a) did not confirm deletion.',
    )

    const closeFirstSession = await callTool(registration, 27, 'session.close', {
      sessionId: sessionA.sessionId,
    })
    state.requests.push({
      name: 'tools/call:session.close:project-a',
      status: closeFirstSession.status,
      body: closeFirstSession.body,
    })
    assert(closeFirstSession.status === 200, 'session.close(project-a) should return 200.')

    const remainingSessions = await waitForSessions(
      registration,
      28,
      (currentSessions) =>
        currentSessions.length === 1 &&
        currentSessions[0]?.sessionId === sessionB.sessionId,
    )
    assert(
      remainingSessions.length === 1 && remainingSessions[0]?.sessionId === sessionB.sessionId,
      'session.close(project-a) did not leave project-b as the remaining session.',
    )

    const navigateBAfterClose = await callTool(registration, 29, 'page.navigate', {
      sessionId: sessionB.sessionId,
      target: fixtureUrlBAfterClose,
    })
    state.requests.push({
      name: 'tools/call:page.navigate:project-b-after-close',
      status: navigateBAfterClose.status,
      body: navigateBAfterClose.body,
    })
    assert(
      navigateBAfterClose.status === 200,
      'page.navigate(project-b after close) should still return 200.',
    )
    assert(
      navigateBAfterClose.body?.result?.structuredContent?.navigation?.url === fixtureUrlBAfterClose,
      'page.navigate(project-b after close) did not keep the remaining session usable.',
    )

    console.log(
      JSON.stringify(
        {
          runtime,
          registration,
          verifiedTools: toolNames,
          sessions: {
            projectA: {
              sessionId: sessionA.sessionId,
              projectRoot: initialAppearanceStateA.projectRoot,
              chromeColor: initialAppearanceStateA.chromeColor,
              accentColor: updatedAppearanceState.accentColor,
              projectIconPath: initialAppearanceStateA.projectIconPath,
            },
            projectB: {
              sessionId: sessionB.sessionId,
              projectRoot: initialAppearanceStateB.projectRoot,
              chromeColor: initialAppearanceStateB.chromeColor,
              accentColor: initialAppearanceStateB.accentColor,
              projectIconPath: initialAppearanceStateB.projectIconPath,
            },
          },
          navigatedUrls: {
            projectA: fixtureUrlA,
            projectB: fixtureUrlB,
            projectBFullPage: fixtureUrlB,
            projectBAfterClose: fixtureUrlBAfterClose,
          },
          markdownTitle: markdown.body.result.structuredContent.title,
          artifactIds: {
            projectA: pageArtifactA.artifactId,
            projectB: pageArtifactB.artifactId,
          },
        },
        null,
        2,
      ),
    )
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          runtime,
          error: error instanceof Error ? error.message : String(error),
          registrationPath,
          state,
        },
        null,
        2,
      ),
    )
    process.exitCode = 1
  } finally {
    await terminateChild(child, exitPromise)
    await terminateSessionProcesses(clusterDir)
    await rm(smokeDir, { recursive: true, force: true })
  }
}

await run()
