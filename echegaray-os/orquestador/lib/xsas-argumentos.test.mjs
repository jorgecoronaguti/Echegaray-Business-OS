import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completarArgumentos, prompt } from './xsas-argumentos.mjs'
import { senalFuerteEn } from './elegir-capacidad.mjs'

const TOOL = {
  capability: 'drive.read',
  schema: {
    name: 'analizar_planos_y_cotizar',
    input_schema: {
      type: 'object',
      properties: {
        proyecto: { type: 'string', description: 'cliente u obra cuyos planos hay que analizar' },
        numero: { type: 'string', description: 'número para la cotización' },
      },
      required: ['proyecto'],
    },
  },
}

/** `pedirTextoONull` devuelve el TEXTO, no `{texto}`. El doble lo imita EXACTAMENTE: leerlo mal fue
 *  el defecto que hizo que el argumento nunca se completara sin que fallara nada. */
const iaQueDevuelve = (texto) => ({ pedirTextoONull: async () => texto })

test('el argumento dicho en la frase se completa — y el doble devuelve texto, no {texto}', async () => {
  const r = await completarArgumentos({
    ia: iaQueDevuelve('{"proyecto":"Quattropani"}'),
    texto: 'analizá los planos de Quattropani y armame una cotización',
    tool: TOOL, args: {}, falta: ['proyecto'],
  })
  assert.deepEqual(r.args, { proyecto: 'Quattropani' })
  assert.deepEqual(r.falta, [])
})

test('un null del modelo deja el argumento faltando: no se inventa para que la tool corra', async () => {
  const r = await completarArgumentos({
    ia: iaQueDevuelve('{"proyecto":null}'),
    texto: 'armame una cotización', tool: TOOL, args: {}, falta: ['proyecto'],
  })
  assert.deepEqual(r.falta, ['proyecto'])
  assert.equal(r.args.proyecto, undefined)
})

test('sólo entran las claves que la tool DECLARA: el modelo no puede agregar parámetros', async () => {
  const r = await completarArgumentos({
    ia: iaQueDevuelve('{"proyecto":"X","borrar_todo":true,"numero":"COT-1"}'),
    texto: 'lo que sea', tool: TOOL, args: {}, falta: ['proyecto'],
  })
  assert.deepEqual(Object.keys(r.args), ['proyecto'], 'ni `borrar_todo` ni `numero` entran: no estaban faltando')
})

test('sin modelo no se rompe: se devuelve lo que había', async () => {
  const r = await completarArgumentos({ ia: { pedirTextoONull: async () => null }, texto: 'x', tool: TOOL, args: {}, falta: ['proyecto'] })
  assert.deepEqual(r.falta, ['proyecto'])
  const sinIa = await completarArgumentos({ ia: null, texto: 'x', tool: TOOL, args: {}, falta: ['proyecto'] })
  assert.deepEqual(sinIa.falta, ['proyecto'])
})

test('el prompt le pasa al modelo la descripción del parámetro, no sólo su nombre', () => {
  const p = prompt({ texto: 'analizá los planos de Quattropani', tool: TOOL, faltan: ['proyecto'] })
  assert.match(p, /cliente u obra cuyos planos/)
  assert.match(p, /Quattropani/)
  assert.doesNotMatch(p, /numero/, 'no se pide lo que no falta')
})

test('una señal inequívoca se reconoce aunque la frase lleve un nombre propio adentro', () => {
  // Con sólo atajos exactos, «analizá los planos de X» no era reclamable por nadie: es lo que hacía
  // inalcanzable desde el canal a TODA capacidad con parámetro.
  assert.equal(senalFuerteEn('analizá los planos de Quattropani y armame una cotización'), 'analiza los planos')
  assert.equal(senalFuerteEn('cómo venimos'), null)
  assert.equal(senalFuerteEn('mandame el plano de seguridad'), null, '«plano» a secas no es señal')
})
