// EL VIGÍA — que avise una vez, que no reinicie lo que está sano, y que cierre el incidente.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rondaVigia, correspondeAvisar, guardarMemoria, hayCorrida, REPETIR_AVISO_MS } from './vigia-navegador.mjs'
import { ESTADO, configRuntime, rutaCerrojo, CERROJO_VENCE_MS } from './navegador-runtime.mjs'
import { prepararNavegador } from './preparar-navegador.mjs'

const base = () => mkdtemp(join(tmpdir(), 'vigia-'))
const CFG = async () => ({ ...configRuntime({ ORQ_BALANZ_PUERTO_CDP: '9999' }), base: await base() })

const respuesta = (c, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => c })

function deps({ vivo = true, targets = [], corriendo = true, registro = [] } = {}) {
  return {
    fetchImpl: async (url) => {
      if (String(url).includes('/json/version')) {
        if (!vivo) throw new Error('ECONNREFUSED')
        return respuesta({ Browser: 'Chrome/151' })
      }
      if (String(url).includes('/json/list')) return respuesta(targets)
      return respuesta({})
    },
    ejecutar: async (cmd, args) => {
      registro.push(args.join(' '))
      if (args[0] === 'inspect') {
        if (!corriendo) { const e = new Error('x'); e.stderr = 'No such object'; throw e }
        return { stdout: 'running|2026-08-03T00:00:00Z|false\n' }
      }
      return { stdout: '' }
    },
    dormirImpl: async () => {},
  }
}

const LOGIN = [{ type: 'page', url: 'https://clientes.balanz.com/auth/login', id: 'T' }]
const DENTRO = [{ type: 'page', url: 'https://clientes.balanz.com/app/home', id: 'T' }]

// ════════════════════════════════════════════════════════════════════════════
// AVISAR UNA VEZ
// ════════════════════════════════════════════════════════════════════════════

test('avisa la primera vez y NO repite en la ronda siguiente', async () => {
  // Una alerta cada quince minutos se aprende a ignorar, y entonces el día que dice algo nuevo
  // tampoco se lee.
  const cfg = await CFG()
  const dichos = []
  const publicar = async (t) => dichos.push(t)
  const d = deps({ targets: LOGIN })

  const a = await rondaVigia({ cfg, publicar, deps: d, enlace: () => ({ url: 'https://x/balanz?t=1' }) })
  assert.equal(a.estado, ESTADO.SESSION_REQUIRED)
  assert.equal(a.aviso, true)
  assert.match(dichos[0], /NECESITA AUTENTICACIÓN/)
  assert.match(dichos[0], /https:\/\/x\/balanz/, 'el aviso tiene que traer el enlace')

  const b = await rondaVigia({ cfg, publicar, deps: d })
  assert.equal(b.aviso, false, 'repitió el aviso del mismo incidente')
  assert.equal(dichos.length, 1)
})

test('el aviso se repite recién después de un día', () => {
  const ahora = Date.now()
  const m = { estado: ESTADO.SESSION_REQUIRED, avisado_en: ahora }
  assert.equal(correspondeAvisar(ESTADO.SESSION_REQUIRED, m, ahora + 60000), false)
  assert.equal(correspondeAvisar(ESTADO.SESSION_REQUIRED, m, ahora + REPETIR_AVISO_MS + 1000), true)
  // Y un estado DISTINTO avisa siempre: es un incidente nuevo.
  assert.equal(correspondeAvisar(ESTADO.BROWSER_ERROR, m, ahora + 1000), true)
})

test('cuando la sesión vuelve, cierra el incidente avisando', async () => {
  const cfg = await CFG()
  await guardarMemoria(cfg, { estado: ESTADO.SESSION_REQUIRED, avisado_en: Date.now() })
  const dichos = []
  const r = await rondaVigia({ cfg, publicar: async (t) => dichos.push(t), deps: deps({ targets: DENTRO }) })
  assert.equal(r.estado, ESTADO.SESSION_ACTIVE)
  assert.match(dichos[0], /SESIÓN RESTAURADA/)
})

test('sin incidente previo, una sesión activa no dice nada', async () => {
  const cfg = await CFG()
  const dichos = []
  const r = await rondaVigia({ cfg, publicar: async (t) => dichos.push(t), deps: deps({ targets: DENTRO }) })
  assert.equal(r.aviso, false)
  assert.equal(dichos.length, 0)
})

// ════════════════════════════════════════════════════════════════════════════
// NO TOCAR LO QUE ESTÁ SANO
// ════════════════════════════════════════════════════════════════════════════

test('una sesión vencida NO reinicia el navegador', async () => {
  // Reiniciar borra la pantalla de login que el dueño podía estar por usar, y no recupera nada:
  // la sesión vive en la pestaña.
  const cfg = await CFG()
  const registro = []
  await rondaVigia({ cfg, deps: deps({ targets: LOGIN, registro }) })
  assert.ok(!registro.some((c) => c.startsWith('rm -f')), 'reinició el navegador por una sesión vencida')
})

test('un navegador caído SÍ se reinicia, y el aviso NO manda a iniciar sesión', async () => {
  // Mandar el enlace acá es mandar al dueño a mirar una pantalla negra.
  const cfg = await CFG()
  const registro = []
  const dichos = []
  const r = await rondaVigia({ cfg, publicar: async (t) => dichos.push(t), deps: deps({ vivo: false, corriendo: false, registro }) })
  assert.equal(r.estado, ESTADO.BROWSER_ERROR)
  assert.ok(registro.some((c) => c.startsWith('run -d')), 'no intentó levantarlo')
  assert.match(dichos[0], /EL NAVEGADOR NO RESPONDE/)
  assert.ok(!/Abrir el navegador de la VM/.test(dichos[0]), 'ofreció la pantalla remota con el navegador caído')
})

test('BROWSER_STARTING no es un incidente: ni se recupera ni se avisa', async () => {
  const cfg = await CFG()
  const registro = []
  const dichos = []
  const r = await rondaVigia({ cfg, publicar: async (t) => dichos.push(t), deps: deps({ vivo: false, corriendo: true, registro }) })
  assert.equal(r.estado, ESTADO.BROWSER_STARTING)
  assert.equal(r.aviso, false)
  assert.ok(!registro.some((c) => c.startsWith('rm -f')))
})

test('durante una corrida el vigía no toca nada', async () => {
  const cfg = await CFG()
  await mkdir(join(cfg.base, 'estado'), { recursive: true })
  await writeFile(rutaCerrojo(cfg), JSON.stringify({ pid: 1, tomado_en: Date.now() }))
  assert.equal(await hayCorrida(cfg), true)
  const r = await rondaVigia({ cfg, deps: deps({ vivo: false, corriendo: false }) })
  assert.equal(r.estado, 'omitida')

  // Un cerrojo vencido no frena al vigía: si no, un proceso muerto lo deja ciego para siempre.
  await writeFile(rutaCerrojo(cfg), JSON.stringify({ pid: 1, tomado_en: Date.now() - CERROJO_VENCE_MS - 1000 }))
  assert.equal(await hayCorrida(cfg), false)
})

// ════════════════════════════════════════════════════════════════════════════
// PREPARAR — la secuencia antes de relevar
// ════════════════════════════════════════════════════════════════════════════

test('sin pestaña, prepararNavegador la repone y NO da por lista la sesión', async () => {
  const cfg = await CFG()
  let hechas = 0
  const d = {
    ...deps({ targets: [] }),
    fetchImpl: async (url, opts = {}) => {
      if (String(url).includes('/json/version')) return respuesta({ Browser: 'Chrome/151' })
      if (String(url).includes('/json/new')) { hechas += 1; assert.equal(opts.method, 'PUT'); return respuesta({}) }
      // Después de reponerla, la pestaña existe y está en el login: eso es lo real.
      return respuesta(hechas ? LOGIN : [])
    },
  }
  const p = await prepararNavegador(cfg, d)
  assert.equal(hechas, 1, 'no repuso la pestaña')
  assert.equal(p.estado, ESTADO.SESSION_REQUIRED)
  assert.equal(p.listo, false, 'una pestaña nueva nace deslogueada: no puede darse por lista')
  assert.ok(p.acciones.includes('se recreó la pestaña de Balanz'))
})

test('con sesión, prepararNavegador da listo — pero sigue siendo presunción', async () => {
  const cfg = await CFG()
  const p = await prepararNavegador(cfg, deps({ targets: DENTRO }))
  assert.equal(p.estado, ESTADO.SESSION_ACTIVE)
  assert.equal(p.listo, true)
})
