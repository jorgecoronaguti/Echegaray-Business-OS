#!/usr/bin/env node
// Test del ejecutor policy-gated (lib/tool-executor.mjs) + cliente Google (fakes).
// Hermético: sin red, sin DB, sin credencial. exit 0 = OK, 1 = falla.
import { makeToolExecutor } from './tool-executor.mjs'
import { makeGoogleClient } from './google.mjs'
import { driveReadTools } from './tools/drive.mjs'

let ok = 0
let fail = 0
function check(n, c) { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

async function main() {
  // Registry de prueba: una tool auto (drive.read), una E (drive.write), una F (drive.delete).
  let ran = 0
  const tools = {
    'drive.read':   { capability: 'drive.read',   account: 'ecsas', schema: { name: 'drive_read' },   run: async () => { ran++; return { values: [['SALDO', '-12080208']] } } },
    'drive.write':  { capability: 'drive.write',  account: 'ecsas', schema: { name: 'drive_write' },  run: async () => { ran++; return { wrote: true } } },
    'drive.delete': { capability: 'drive.delete', account: 'ecsas', schema: { name: 'drive_delete' }, run: async () => { ran++; return { deleted: true } } },
  }
  const dispoBy = { 'drive.read': 'auto', 'drive.write': 'requires_approval', 'drive.delete': 'forbidden' }
  const decide = async (cap) => dispoBy[cap]

  const enqueued = []
  const enqueue = async (op) => { enqueued.push(op); return 'op_123' }
  const exec = makeToolExecutor({ decide, tools, principalId: 'cfo-id', enqueue })

  // auto -> ejecuta
  const r1 = await exec('drive_read', { file_id: 'ABC' }, {})
  check('auto: ejecutó la tool', ran === 1 && r1.values[0][0] === 'SALDO')

  // requires_approval -> NO ejecuta, encola
  const r2 = await exec('drive_write', { file_id: 'X', data: 1 }, {})
  check('E: no ejecutó', ran === 1)
  check('E: encoló la operación', enqueued.length === 1 && enqueued[0].capability_slug === 'drive.write')
  check('E: devolvió pending_operation_id', r2.queued === true && r2.pending_operation_id === 'op_123')
  check('E: pasó el payload real (tool+args)', enqueued[0].payload.tool === 'drive_write' && enqueued[0].payload.args.file_id === 'X')

  // forbidden -> NO ejecuta, niega
  const r3 = await exec('drive_delete', { file_id: 'Y' }, {})
  check('F: no ejecutó', ran === 1)
  check('F: denegó', r3.denied === true)
  check('F: no encoló', enqueued.length === 1)

  // tool desconocida
  const r4 = await exec('inexistente', {}, {})
  check('desconocida: error claro', r4.error && /desconocida/.test(r4.error))

  // fallo de la tool no rompe: vuelve como error
  const tools2 = { 'drive.read': { capability: 'drive.read', schema: { name: 'drive_read' }, run: async () => { throw new Error('boom') } } }
  const exec2 = makeToolExecutor({ decide: async () => 'auto', tools: tools2, principalId: 'x' })
  const r5 = await exec2('drive_read', {}, {})
  check('fallo de tool -> {error}', r5.error === 'boom')

  // requires_approval sin cola configurada -> denied claro
  const exec3 = makeToolExecutor({ decide: async () => 'requires_approval', tools, principalId: 'x' })
  const r6 = await exec3('drive_write', {}, {})
  check('E sin cola -> denied', r6.denied === true)

  // PRE-FLIGHT (honestidad): si la precondición falla (ej. adjunto inexistente), NO se ejecuta
  // NI se encola, y se devuelve el error — así el OS no puede afirmar haber adjuntado algo falso.
  {
    let corrio = false
    const encoladas = []
    const toolsPF = {
      'mail.send': {
        capability: 'mail.send', schema: { name: 'gmail_enviar' },
        preflight: async (input) => (input?.adjuntos?.length ? { error: 'no existe el archivo X' } : null),
        run: async () => { corrio = true; return { ok: true } },
      },
    }
    const execPF = makeToolExecutor({ decide: async () => 'requires_approval', tools: toolsPF, principalId: 'x', enqueue: async (op) => { encoladas.push(op); return 'op_pf' } })
    const rPF = await execPF('gmail_enviar', { to: 'a@b.com', body: 'x', adjuntos: ['fantasma'] }, {})
    check('preflight falla -> devuelve error', rPF.error && /no existe el archivo/.test(rPF.error))
    check('preflight falla -> NO encoló', encoladas.length === 0)
    check('preflight falla -> NO ejecutó', corrio === false)
    // sin adjuntos, preflight pasa y encola normal
    const rOK = await execPF('gmail_enviar', { to: 'a@b.com', body: 'x' }, {})
    check('preflight OK -> encoló', rOK.queued === true && encoladas.length === 1)
  }

  // --- cliente Google con fetch + auth falsos: construye URL y parsea ---
  {
    const calls = []
    const auth = { getAccessToken: async () => 'FAKE_TOKEN' }
    const fetchImpl = async (url, opts) => {
      calls.push({ url, auth: opts.headers.Authorization })
      if (url.includes('/values/')) return { ok: true, json: async () => ({ values: [['SALDO TOTAL DISPONIBLE', '-12080208']] }) }
      if (url.includes('/files?')) return { ok: true, json: async () => ({ files: [{ id: 'FID', name: 'Flujo de Caja - Cash Flow' }] }) }
      return { ok: true, json: async () => ({}) }
    }
    const g = makeGoogleClient({ auth, fetchImpl })
    const files = await g.searchFile('Flujo de Caja - Cash Flow')
    check('google: searchFile parsea files', files[0].id === 'FID')
    const vals = await g.readSheetValues('FID', 'RESUMEN!A1:F10')
    check('google: readSheetValues parsea values', vals[0][1] === '-12080208')
    check('google: mandó Bearer token', calls.every((c) => c.auth === 'Bearer FAKE_TOKEN'))
    check('google: encodeó el rango en la URL', calls.some((c) => c.url.includes('RESUMEN!A1%3AF10') || c.url.includes('RESUMEN!A1:F10')))

    // error de la API -> lanza con status
    const g2 = makeGoogleClient({ auth, fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'forbidden' }) })
    let err = null
    try { await g2.readSheetValues('X', 'A1') } catch (e) { err = e }
    check('google: error API lanza con status', err && err.status === 403)
  }

  // --- driveReadTools: resuelve por query y lee ---
  {
    const g = {
      searchFile: async (n) => (n === 'Flujo de Caja - Cash Flow' ? [{ id: 'CF1' }] : []),
      getMeta: async () => ({ mimeType: 'application/vnd.google-apps.spreadsheet', name: 'Flujo de Caja' }),
      readSheetValues: async (id, range) => [['SALDO', '-12080208'], [`${id}`, `${range}`]],
    }
    const tool = driveReadTools(g)['drive.read']
    const out = await tool.run({ query: 'Flujo de Caja - Cash Flow' })
    check('drive.read tool: resolvió file por query', out.file_id === 'CF1')
    check('drive.read tool: usó rango default', out.range === 'A1:F60')
    check('drive.read tool: devolvió values', out.values[0][1] === '-12080208')
    const miss = await tool.run({ query: 'No existe' })
    check('drive.read tool: archivo inexistente -> error', !!miss.error)
  }

  console.log(`tool-executor.test: ${ok} OK, ${fail} FALLA`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error('tool-executor.test abortó:', e); process.exit(1) })
