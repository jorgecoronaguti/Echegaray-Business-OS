// CON CLAUDE APAGADO, EL DOCUMENTO SE ARMA IGUAL. SOBRE EL CIRCUITO VIVO, NO SOBRE DOBLES.
//
// Corre el SCRIPT REAL en otro proceso, con la llave puesta A PROPÓSITO en el entorno: si el script
// la respetara en vez de borrarla, el resultado cambiaría. Otro proceso y no un import, porque un
// test que importa comparte el `process.env` del runner y ya no está probando el arranque en frío,
// que es donde una llave se cuela.
//
// Acá corre en modo `--seco`: arma el informe, el certificado con tabla y la presentación entera
// SIN salir a la red. La corrida contra Drive de verdad —crear, editar, releer, exportar, mirar el
// render, limpiar— es el mismo script sin `--seco`, y se corre a mano: la suite no deja archivos
// en el Drive del dueño cada vez que alguien la ejecuta.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'motores-sin-llm.mjs')

const correr = () => JSON.parse(execFileSync(process.execPath, [SCRIPT, '--seco', '--json'], {
  encoding: 'utf8',
  env: { ...process.env, ANTHROPIC_API_KEY: 'sk-ant-FALSA-NO-DEBE-USARSE' },
}))

test('SIN LLM · los motores arman documento y presentación con llamadas_llm = 0', () => {
  const { metricas, pasos } = correr()
  assert.equal(metricas.llamadas_llm, 0, `hubo llamadas a un modelo: ${metricas.destinos_llm.join(', ')}`)
  assert.equal(metricas.llamadas_a_google, 0, 'el modo seco no sale a la red')
  assert.equal(pasos.length, 3)
  assert.ok(pasos.every((p) => p.ok), JSON.stringify(pasos))
})

test('SIN LLM · una API KEY en el entorno NO habilita nada: el script la borra y la config no la revive', () => {
  // MUTACIÓN QUE LO PONE ROJO: en el script, cambiar el `delete process.env[k]` por una lectura, o
  // sacar el `process.env.ORQ_ANTHROPIC_ENV_FILE = '/dev/null/no-existe'`. Lo segundo es el caso
  // real: `lib/config.mjs` carga `anthropic.env` dentro de `process.env`, así que borrar la llave y
  // después importar la configuración la devolvía a la vida.
  const { metricas } = correr()
  assert.deepEqual(metricas.llaves_borradas_del_entorno, ['ANTHROPIC_API_KEY'])
  assert.equal(metricas.config_cargada, true, 'sin cargar la config, «ausente» no probaría nada')
  assert.equal(metricas.ANTHROPIC_API_KEY_despues_de_cargar_config, 'ausente',
    'la llave revivió después de cargar la config, o el control dejó de poder verlo')
})

test('SIN LLM · ningún módulo de los dos motores importa un cliente de IA', () => {
  const { metricas } = correr()
  assert.ok(metricas.modulos_auditados >= 20, `sólo se auditaron ${metricas.modulos_auditados} módulos: ¿cambió la carpeta?`)
  assert.deepEqual(metricas.modulos_que_importan_ia, [])
})

test('SIN LLM · el informe sale COMPLETO, no degradado: secciones, tabla y láminas', () => {
  const { pasos } = correr()
  const [informe, certificado, presentacion] = pasos
  assert.ok(informe.secciones >= 3, 'el informe tiene sus secciones')
  assert.ok(informe.caracteres > 200, 'y su texto')
  assert.ok(informe.peticiones >= 4)
  assert.equal(certificado.tablas, 1, 'la tabla del certificado se arma sin modelo')
  assert.ok(presentacion.laminas >= 4)
})
