// RUNTIME DEL NAVEGADOR — que un problema nunca se convierta en "el mercado no tiene nada".
//
// Cada test de acá fija una confusión que cuesta plata de la misma manera: el agente informa una
// ausencia de oportunidades donde en realidad hubo una ausencia de visión.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ESTADO, NO_REINICIAR, configRuntime, diagnosticar, pestanaCanonica, urlEsLogin,
  estadoContenedor, sondearCdp, listarTargets, asegurarPestanaCanonica, reiniciarNavegador,
  tomarCerrojo, soltarCerrojo, rutaCerrojo, CERROJO_VENCE_MS,
} from './navegador-runtime.mjs'

// ── Dobles ──────────────────────────────────────────────────────────────────────────────────────

const respuesta = (cuerpo, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => cuerpo })

/** Un fetch de mentira que responde por ruta. Lo que no está declarado, falla: nada se asume vivo. */
function fetchFalso({ version, targets, nuevaPestana } = {}) {
  return async (url, opts = {}) => {
    if (String(url).includes('/json/version')) {
      if (!version) throw new Error('conexión rechazada')
      return respuesta(version)
    }
    if (String(url).includes('/json/list')) {
      if (!targets) return respuesta(null, false)
      return respuesta(targets)
    }
    if (String(url).includes('/json/new')) {
      if (opts.method !== 'PUT') throw new Error('la creación de pestaña va por PUT')
      return nuevaPestana ? respuesta({ id: 'nueva' }) : respuesta(null, false)
    }
    throw new Error(`ruta no declarada: ${url}`)
  }
}

function dockerFalso(estado, registro = []) {
  return async (cmd, args) => {
    registro.push(args.join(' '))
    if (args[0] === 'inspect') {
      if (estado === 'ausente') { const e = new Error('Error: No such object: x'); e.stderr = 'No such object'; throw e }
      return { stdout: `${estado}|2026-08-03T00:00:00Z|false\n` }
    }
    return { stdout: '' }
  }
}

const CFG = configRuntime({ ORQ_BALANZ_PUERTO_CDP: '9333', ORQ_BALANZ_BASE: '/tmp/no-usado' })
const PAGINA_OK = [{ type: 'page', url: 'https://clientes.balanz.com/app/home', id: 'T1', title: 'Balanz' }]

// ════════════════════════════════════════════════════════════════════════════
// LA PESTAÑA CANÓNICA
// ════════════════════════════════════════════════════════════════════════════

test('el service worker de Balanz NO es la pestaña canónica', () => {
  // Está en el dominio y aparece en /json/list. Si se lo tomara por la pestaña, el agente creería
  // tener target, no podría leer un solo instrumento, y reportaría un mercado vacío.
  const targets = [
    { type: 'service_worker', url: 'https://clientes.balanz.com/ngsw-worker.js', id: 'SW' },
    { type: 'page', url: 'https://clientes.balanz.com/app/home', id: 'P' },
  ]
  assert.equal(pestanaCanonica(targets).id, 'P')
  assert.equal(pestanaCanonica([targets[0]]), null)
})

test('una pestaña de otro dominio no cuenta como pestaña de Balanz', () => {
  assert.equal(pestanaCanonica([{ type: 'page', url: 'https://example.com/', id: 'X' }]), null)
})

test('urlEsLogin reconoce el /auth/login real del bróker', () => {
  assert.equal(urlEsLogin('https://clientes.balanz.com/auth/login'), true)
  assert.equal(urlEsLogin('https://clientes.balanz.com/login?x=1'), true)
  assert.equal(urlEsLogin('https://clientes.balanz.com/app/home'), false)
  // Y no se come una ruta legítima que apenas contenga la palabra.
  assert.equal(urlEsLogin('https://clientes.balanz.com/app/mis-autorizaciones'), false)
})

// ════════════════════════════════════════════════════════════════════════════
// EL DIAGNÓSTICO — cada falla tiene SU estado
// ════════════════════════════════════════════════════════════════════════════

test('sin contenedor es BROWSER_ERROR, no una sesión vencida', async () => {
  const d = await diagnosticar(CFG, { fetchImpl: fetchFalso({}), ejecutar: dockerFalso('ausente') })
  assert.equal(d.estado, ESTADO.BROWSER_ERROR)
  assert.match(d.detalle, /no existe/)
})

test('contenedor arriba y CDP todavía mudo es BROWSER_STARTING, no un error', async () => {
  // Chromium tarda segundos en abrir el puerto. Llamarlo error hace que el vigía reinicie un
  // navegador sano una y otra vez, y el bucle de reinicios se ve igual que una caída real.
  const d = await diagnosticar(CFG, { fetchImpl: fetchFalso({}), ejecutar: dockerFalso('running') })
  assert.equal(d.estado, ESTADO.BROWSER_STARTING)
})

test('navegador vivo sin pestaña de Balanz es BALANZ_TARGET_MISSING', async () => {
  const d = await diagnosticar(CFG, {
    fetchImpl: fetchFalso({ version: { Browser: 'Chrome/151' }, targets: [] }),
    ejecutar: dockerFalso('running'),
  })
  assert.equal(d.estado, ESTADO.BALANZ_TARGET_MISSING)
  assert.equal(d.targets, 0)
})

test('la pestaña en /auth/login es SESSION_REQUIRED', async () => {
  const d = await diagnosticar(CFG, {
    fetchImpl: fetchFalso({ version: { Browser: 'Chrome/151' }, targets: [{ type: 'page', url: 'https://clientes.balanz.com/auth/login', id: 'T' }] }),
    ejecutar: dockerFalso('running'),
  })
  assert.equal(d.estado, ESTADO.SESSION_REQUIRED)
})

test('la pestaña fuera del login es SESSION_ACTIVE, y se declara PRESUNCIÓN', async () => {
  // La URL no prueba que la sesión sirva. Marcarlo importa: sin la marca, este diagnóstico barato
  // se usaría como evidencia de sesión y el ciclo saltearía la verificación del DOM.
  const d = await diagnosticar(CFG, {
    fetchImpl: fetchFalso({ version: { Browser: 'Chrome/151' }, targets: PAGINA_OK }),
    ejecutar: dockerFalso('running'),
  })
  assert.equal(d.estado, ESTADO.SESSION_ACTIVE)
  assert.equal(d.presuncion, true)
})

test('si /json/list falla es BROWSER_ERROR — no "no hay pestañas"', async () => {
  const d = await diagnosticar(CFG, {
    fetchImpl: fetchFalso({ version: { Browser: 'Chrome/151' }, targets: null }),
    ejecutar: dockerFalso('running'),
  })
  assert.equal(d.estado, ESTADO.BROWSER_ERROR)
})

test('estadoContenedor distingue "no existe" de "no pude preguntar"', async () => {
  const ausente = await estadoContenedor(CFG, dockerFalso('ausente'))
  assert.equal(ausente.status, 'ausente')
  const roto = await estadoContenedor(CFG, async () => { throw new Error('docker daemon caído') })
  assert.equal(roto.status, 'desconocido', 'un daemon caído no es un contenedor ausente')
})

test('sondearCdp y listarTargets no lanzan: devuelven el motivo', async () => {
  const s = await sondearCdp('http://127.0.0.1:1', async () => { throw new Error('ECONNREFUSED') })
  assert.equal(s.vivo, false)
  assert.match(s.motivo, /ECONNREFUSED/)
  const l = await listarTargets('http://127.0.0.1:1', async () => { throw new Error('ECONNREFUSED') })
  assert.equal(l.ok, false)
  assert.deepEqual(l.targets, [])
})

// ════════════════════════════════════════════════════════════════════════════
// LA PESTAÑA NO SE DUPLICA
// ════════════════════════════════════════════════════════════════════════════

test('no se abre una segunda pestaña si ya hay una: eso rompería la sesión', async () => {
  // `sessionStorage` es por pestaña. Abrir otra no "refresca" nada; sólo agrega una pestaña
  // deslogueada, y si el agente se fuera a esa, vería el login con la sesión intacta al lado.
  const r = await asegurarPestanaCanonica(CFG, { fetchImpl: fetchFalso({ version: {}, targets: PAGINA_OK, nuevaPestana: true }) })
  assert.equal(r.creada, false)
  assert.match(r.motivo, /ya existe/)
})

test('sin ninguna pestaña sí se recrea, y va por PUT', async () => {
  const r = await asegurarPestanaCanonica(CFG, { fetchImpl: fetchFalso({ version: {}, targets: [], nuevaPestana: true }) })
  assert.equal(r.creada, true)
})

test('una pestaña que salió TRANSITORIAMENTE del dominio no dispara una segunda', async () => {
  // La pestaña con sesión puede estar un instante en `about:blank` (la SPA recargando),
  // `chrome-error://` (un corte de red) o un proveedor de identidad externo. Abrir otra ahí no
  // rompe el análisis —la sesión sigue viva en la primera— pero hace que `buscarPestanaAutenticada`
  // pueda tomar la nueva, que nace deslogueada, y pedirle al dueño que entre cuando ya estaba
  // adentro. Un aviso falso enseña a ignorar los avisos.
  for (const url of ['about:blank', 'chrome-error://chromewebdata/', 'https://idp.ejemplo.com/oauth']) {
    const r = await asegurarPestanaCanonica(CFG, {
      fetchImpl: fetchFalso({ version: {}, targets: [{ type: 'page', url, id: 'T' }], nuevaPestana: true }),
    })
    assert.equal(r.creada, false, `${url} disparó una pestaña nueva`)
    assert.match(r.motivo, /no se abre otra/)
  }
  // Y un service worker suelto NO cuenta como pestaña: si es lo único que queda, sí hay que reponerla.
  const sw = await asegurarPestanaCanonica(CFG, {
    fetchImpl: fetchFalso({ version: {}, targets: [{ type: 'service_worker', url: 'https://clientes.balanz.com/ngsw-worker.js', id: 'SW' }], nuevaPestana: true }),
  })
  assert.equal(sw.creada, true, 'un service worker no es una pestaña: había que reponerla')
})

// ════════════════════════════════════════════════════════════════════════════
// EL REINICIO NO SE USA PARA TAPAR UNA SESIÓN VENCIDA
// ════════════════════════════════════════════════════════════════════════════

test('no se reinicia el navegador por una sesión vencida', async () => {
  // Reiniciar no recupera la sesión —vive en la pestaña— y encima borra la pantalla de login que el
  // dueño podía estar por usar. Es la reacción intuitiva y es exactamente la equivocada.
  const registro = []
  const r = await reiniciarNavegador(CFG, {
    motivo: 'prueba',
    deps: {
      fetchImpl: fetchFalso({ version: { Browser: 'Chrome/151' }, targets: [{ type: 'page', url: 'https://clientes.balanz.com/auth/login', id: 'T' }] }),
      ejecutar: dockerFalso('running', registro),
    },
  })
  assert.equal(r.reiniciado, false)
  assert.ok(!registro.some((c) => c.startsWith('rm -f')), 'no tenía que tocar el contenedor')
})

test('sí se reinicia cuando el navegador está caído', async () => {
  const registro = []
  const r = await reiniciarNavegador(CFG, {
    motivo: 'caído',
    deps: { fetchImpl: fetchFalso({}), ejecutar: dockerFalso('exited', registro) },
  })
  assert.equal(r.reiniciado, true)
  assert.ok(registro.some((c) => c.startsWith('rm -f')))
  assert.ok(registro.some((c) => c.startsWith('run -d')))
})

test('los estados sanos están todos en la lista de NO reiniciar', () => {
  for (const e of [ESTADO.SESSION_REQUIRED, ESTADO.SESSION_ACTIVE, ESTADO.MARKET_RUNNING, ESTADO.MARKET_READY]) {
    assert.ok(NO_REINICIAR.has(e), `${e} tendría que estar protegido del reinicio`)
  }
  assert.ok(!NO_REINICIAR.has(ESTADO.BROWSER_ERROR))
})

// ════════════════════════════════════════════════════════════════════════════
// EL ARRANQUE ATA LOS PUERTOS A LOOPBACK
// ════════════════════════════════════════════════════════════════════════════

test('el contenedor publica CDP y VNC SÓLO en 127.0.0.1', async () => {
  // El CDP no pide autenticación: quien lo alcanza maneja el navegador entero, con la sesión del
  // bróker adentro. Un `-p 9222:9223` sin dirección lo publicaría en todas las interfaces.
  const registro = []
  const { arrancarNavegador } = await import('./navegador-runtime.mjs')
  await arrancarNavegador({ ...CFG, base: await mkdtemp(join(tmpdir(), 'balanz-')) }, { ejecutar: dockerFalso('ausente', registro) })
  const run = registro.find((c) => c.startsWith('run -d'))
  assert.ok(run, 'no lanzó el contenedor')
  const puertos = run.match(/-p [^ ]+/g) || []
  assert.equal(puertos.length, 2)
  for (const p of puertos) assert.match(p, /^-p 127\.0\.0\.1:/, `${p} no está atado a loopback`)
  assert.ok(run.includes('--restart unless-stopped'), 'sin política de reinicio no sobrevive a un reboot')
})

// ════════════════════════════════════════════════════════════════════════════
// CERROJO
// ════════════════════════════════════════════════════════════════════════════

test('el cerrojo impide dos corridas a la vez, y uno vencido se pisa', async () => {
  const cfg = { ...CFG, base: await mkdtemp(join(tmpdir(), 'balanz-')) }
  assert.equal((await tomarCerrojo(cfg)).tomado, true)
  assert.equal((await tomarCerrojo(cfg)).tomado, false, 'dejó entrar una segunda corrida')

  // Un proceso muerto no suelta su cerrojo. Si no venciera, el agente no volvería a correr nunca.
  await writeFile(rutaCerrojo(cfg), JSON.stringify({ pid: 1, tomado_en: Date.now() - CERROJO_VENCE_MS - 1000 }))
  assert.equal((await tomarCerrojo(cfg)).tomado, true, 'un cerrojo vencido tiene que poder pisarse')

  await soltarCerrojo(cfg)
  assert.equal((await tomarCerrojo(cfg)).tomado, true)
})
