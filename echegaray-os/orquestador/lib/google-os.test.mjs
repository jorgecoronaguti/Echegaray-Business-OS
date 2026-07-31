// LA IDENTIDAD CON LA QUE EL OS LE HABLA A GOOGLE.
//
// Dos cosas se prueban acá, y las dos existen por el mismo incidente:
//
//  1. Que `googleDelOs()` devuelva el cliente INSTITUCIONAL (Service Account) y no reciba
//     `getToken`. Es la identidad con la que el OS escribe JORNALES; si alguien la cambia
//     sin querer, el candado de ediciones deja de reconocer las escrituras del propio OS y
//     se auto-canda encima de ellas.
//
//  2. Que nadie vuelva a llamar sin `await` a una función `async` de google-oauth.mjs. El
//     bug original no fue un descuido puntual: fue una Promise usada como si fuera un email,
//     que ni tira ni loguea — sólo cambia la cuenta en silencio. Un test que mire UNA línea
//     no protege de la próxima; este escanea el árbol entero.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  googleDelOs, identidadDe, describirIdentidad, IDENTIDAD, IDENTIDAD_OS, CUENTA_INSTITUCIONAL,
} from './google-os.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const ORQUESTADOR = path.resolve(AQUI, '..')

/** Cliente de mentira: no habla con Google, sólo recuerda con qué lo armaron. */
function crearDoble() {
  const visto = []
  const crearCliente = (args) => { visto.push(args); return { esDoble: true } }
  return { crearCliente, visto, loadConfig: () => ({ CONFIG: 'de prueba' }) }
}

test('googleDelOs arma el cliente INSTITUCIONAL (Service Account)', () => {
  const d = crearDoble()
  const g = googleDelOs({ config: {}, deps: d })
  assert.equal(identidadDe(g)?.tipo, IDENTIDAD.INSTITUCIONAL)
  assert.equal(identidadDe(g)?.cuenta, CUENTA_INSTITUCIONAL)
})

test('googleDelOs NO pasa getToken: sin OAuth de por medio no hay cuenta de persona posible', () => {
  const d = crearDoble()
  googleDelOs({ config: {}, deps: d })
  assert.equal(d.visto.length, 1)
  assert.equal('getToken' in d.visto[0], false, 'un getToken acá cambiaría la identidad de JORNALES')
})

test('googleDelOs pide los scopes de Workspace, como siempre', () => {
  const d = crearDoble()
  googleDelOs({ config: {}, deps: d })
  assert.ok(Array.isArray(d.visto[0].scopes) && d.visto[0].scopes.length > 0)
  assert.ok(d.visto[0].scopes.includes('https://www.googleapis.com/auth/spreadsheets'))
})

test('googleDelOs usa la config que le pasan y no vuelve a cargarla', () => {
  const d = crearDoble()
  const cfg = { marca: 'la del worker' }
  googleDelOs({ config: cfg, deps: d })
  assert.equal(d.visto[0].config, cfg)
})

test('googleDelOs carga la config sola cuando no se la pasan', () => {
  const d = crearDoble()
  googleDelOs({ deps: d })
  assert.deepEqual(d.visto[0].config, { CONFIG: 'de prueba' })
})

test('un cliente congelado no rompe: se devuelve igual, sólo sin marca', () => {
  const d = crearDoble()
  d.crearCliente = () => Object.freeze({ congelado: true })
  const g = googleDelOs({ config: {}, deps: d })
  assert.ok(g)
  assert.equal(identidadDe(g), null)
})

test('identidadDe entiende también la marca del asistente (la cuenta de una persona)', () => {
  const personal = { [Symbol.for('asistente.google.cuenta')]: { email: 'jorge@ecsas.com.ar', propia: true } }
  const i = identidadDe(personal)
  assert.equal(i.tipo, IDENTIDAD.PERSONAL)
  assert.equal(i.cuenta, 'jorge@ecsas.com.ar')
  assert.equal(i.propia, true)
})

test('identidadDe devuelve null cuando el cliente no trae marca (no inventa una)', () => {
  assert.equal(identidadDe({}), null)
  assert.equal(identidadDe(null), null)
  assert.equal(identidadDe(undefined), null)
})

test('describirIdentidad sirve para un log y no filtra secretos', () => {
  const d = crearDoble()
  assert.equal(describirIdentidad(googleDelOs({ config: {}, deps: d })), 'service_account')
  const personal = { [Symbol.for('asistente.google.cuenta')]: { email: 'rodrigo@ecsas.com.ar', propia: true } }
  assert.equal(describirIdentidad(personal), 'user_oauth:rodrigo@ecsas.com.ar')
  assert.equal(describirIdentidad({}), 'desconocida')
})

test('la marca viaja en un Symbol.for: dos copias del módulo la leen igual', () => {
  const d = crearDoble()
  const g = googleDelOs({ config: {}, deps: d })
  // Un módulo cargado por otra ruta no comparte el binding, pero sí el símbolo global.
  assert.deepEqual(g[Symbol.for('echegaray.google.identidad')], g[IDENTIDAD_OS])
})

// ── El escáner ───────────────────────────────────────────────────────────────────────

/** Todas las funciones `async` que exporta google-oauth.mjs. Llamar a cualquiera sin
 *  esperarla devuelve una Promise que después se usa como si fuera un dato. */
const ASYNC_DE_OAUTH = ['operadorEmail', 'operadorPara', 'tieneToken', 'hayCuentaAutorizada', 'accessTokenFor', 'exchangeCode']

function archivosMjs(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) archivosMjs(p, acc)
    else if (e.name.endsWith('.mjs')) acc.push(p)
  }
  return acc
}

test('nadie llama sin await a una función async de google-oauth', () => {
  const ofensas = []
  for (const archivo of archivosMjs(ORQUESTADOR)) {
    const lineas = fs.readFileSync(archivo, 'utf8').split('\n')
    lineas.forEach((linea, i) => {
      // El comentario que EXPLICA el bug cita la línea vieja: no es una llamada.
      const codigo = linea.replace(/\/\/.*$/, '')
      for (const fn of ASYNC_DE_OAUTH) {
        const re = new RegExp(`(^|[^\\w.])(${fn})\\s*\\(`, 'g')
        let m
        while ((m = re.exec(codigo)) !== null) {
          const antes = codigo.slice(0, m.index + m[1].length).trimEnd()
          // Válido: se espera, se devuelve (la promesa es del llamador), o se encadena.
          if (/\b(await|return|yield)$/.test(antes)) continue
          if (/=>$/.test(antes)) continue
          // La definición y la reexportación no son llamadas.
          if (/\b(function|export|import)\b[^(]*$/.test(antes)) continue
          ofensas.push(`${path.relative(ORQUESTADOR, archivo)}:${i + 1}  ${linea.trim()}`)
        }
      }
    })
  }
  assert.deepEqual(ofensas, [], `una Promise usada como valor:\n${ofensas.join('\n')}`)
})
