// LA PRUEBA DEL §13 SOBRE EL CIRCUITO VIVO, NO SOBRE DOBLES.
//
// `fast-path.test.mjs` prueba el mecanismo con resolvedores de mentira. Esto corre el SCRIPT REAL
// —`orquestador/scripts/xsas-sin-llm.mjs`— en un proceso aparte, con el entorno limpiado de toda
// llave de API, y verifica sobre su salida JSON que la cotización llegó al final con
// `llamadas_llm = 0`.
//
// Corre en otro proceso a propósito: un test que importa el script comparte el `process.env` del
// runner y ya no está probando el arranque en frío, que es donde una llave se cuela.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const SCRIPT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'scripts', 'xsas-sin-llm.mjs')

/** Corre el script con las llaves puestas A PROPÓSITO: si el script las respetara en vez de
 *  borrarlas, el resultado cambiaría — y no cambia. */
const correrScript = (env = {}) => JSON.parse(execFileSync(process.execPath, [SCRIPT, '--json'], {
  encoding: 'utf8',
  env: { ...process.env, ANTHROPIC_API_KEY: 'sk-ant-FALSA-NO-DEBE-USARSE', ...env },
}))

test('SIN LLM · la cotización llega al final con llamadas_llm = 0', () => {
  const { metricas, proveedor, imports } = correrScript()

  // Las cuatro condiciones, verificadas sobre la salida y no sobre el código:
  assert.equal(proveedor.disponible, false)
  assert.deepEqual(proveedor.motivos, ['sin_key', 'sin_saldo', 'proveedor_caido', 'desactivados'])

  // Lo que el §13 exige:
  assert.equal(metricas.llamadas_llm, 0, 'ni una llamada')
  assert.equal(metricas.tokens, 0)
  assert.equal(metricas.costo_llm_usd, 0)

  // Y la garantía estructural: ningún módulo del cotizador importa un cliente de IA.
  assert.ok(imports.archivos >= 20, `sólo se auditaron ${imports.archivos} módulos: ¿cambió la carpeta?`)
  assert.deepEqual(imports.culpables, [])
})

test('SIN LLM · una API KEY en el entorno NO habilita nada: el script la borra', () => {
  // MUTACIÓN QUE LO PONE ROJO: en el script, cambiar el `delete process.env[k]` por un `if` que
  // sólo lea la variable. Con la llave puesta el proveedor pasaría a `sin_key: false` y el test
  // vería tres motivos en vez de cuatro.
  const { proveedor } = correrScript({ ANTHROPIC_API_KEY: 'sk-ant-REAL-SI-EXISTIERA' })
  assert.equal(proveedor.condiciones.sin_key, true, 'la llave estaba en el entorno y aun así se corrió sin ella')
  assert.equal(proveedor.disponible, false)
})

test('SIN LLM · los seis huecos se resuelven por la cascada, y el ambiguo va al humano', () => {
  const { huecos } = correrScript()
  const por = Object.fromEntries(huecos.map((h) => [h.que, h]))

  // El orden de la jerarquía, visto en el resultado real:
  assert.equal(por.PRECIO.nivel, 'SQL', 'un precio no se investiga: se consulta')
  assert.equal(por.NORMATIVA.fuente, 'NORMA')
  assert.equal(por.PROCESO.fuente, 'EXPERIENCIA_ECSAS', 'lo medido en obra sale como experiencia')

  // WEB ≠ EXPERIENCIA, sobre el circuito vivo: el resolvedor del RENDIMIENTO declara
  // `EXPERIENCIA_ECSAS` porque una página envenenada se lo pide, y sale WEB igual.
  assert.equal(por.RENDIMIENTO.fuente, 'WEB')

  // Lo ambiguo necesita interpretar, no hay modelo, y el último recurso es una persona.
  assert.equal(por['TÉCNICA (ambigua)'].nivel, null)
  assert.equal(por['TÉCNICA (ambigua)'].fuente, 'FALTA_DATO')
})

test('SIN LLM · sin un real conocido las exactitudes son SIN_MEDIR', () => {
  const { metricas } = correrScript()
  for (const k of ['exactitud_cantidad', 'exactitud_hh', 'exactitud_recursos', 'exactitud_costo', 'exactitud_precio']) {
    assert.equal(metricas[k], 'SIN_MEDIR', `${k} salió ${metricas[k]} sin tener contra qué medirse`)
  }
  // Y la corrida NO publica 100 % de autonomía teniendo preguntas abiertas.
  assert.ok(metricas.human_questions > 0, 'esta corrida tiene preguntas abiertas')
  assert.ok(metricas.autonomous_resolution_rate < 1,
    `con ${metricas.human_questions} preguntas abiertas la autonomía no puede ser ${metricas.autonomous_resolution_rate}`)
})
