// UN ARCHIVO ADJUNTO NO ES UN PROMPT. Cada test prueba un defecto: revertir el arreglo pone rojo.
//
// El defecto que esta rama evita: el CSV del extracto llegaba al chat y terminaba en un modelo que
// no puede abrirlo — mientras el circuito determinístico entero (parseo, cadena, base, _BANCO_RAW,
// DEBITADO) existía y estaba probado en producción el 01/09/2026.
import test from 'node:test'
import assert from 'node:assert/strict'
import { atender } from './xsas-gateway.mjs'

const CSV = [
  'Últimos Movimientos',
  'Cuenta corriente en Pesos Nro. 179-091383/6',
  'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
  '02/09/2026;0179;San Juan;3043;000000400;Echeq clearing recibido 48hs;(100.000,00);5.607.239,01',
  '01/09/2026;0179;San Juan;4633;000000999;Impuesto ley 25.413 debito 0,6%;(7.239,01);5.707.239,01',
].join('\n')

const razonadorMuerto = () => ({
  pedirTexto: async () => { throw new Error('un adjunto determinístico llamó al modelo') },
  pedirTextoONull: async () => { throw new Error('un adjunto determinístico llamó al modelo') },
})

const registroCon = (corridas) => ({
  mapa: new Map([['banco.importar_extracto', {
    capability: 'drive.write',
    schema: { name: 'importar_extracto_bancario', input_schema: { type: 'object', properties: { contenido: { type: 'string' }, nombre: { type: 'string' } }, required: ['contenido'] } },
    async run(a) { corridas.push(a); return { ok: true, nuevos: 1, resumen_texto: 'importado' } },
  }]]),
  porArchivo: new Map(), fallaron: [],
})

const ACTOR = { id: 'u', rol: 'direccion', permisos: ['drive.read', 'drive.write'] }

test('un CSV de extracto adjunto corre el importador determinístico, con el razonador MUERTO', async () => {
  const corridas = []
  const r = await atender(
    { actor: ACTOR, canal: 'app', mensaje: 'procesá esto', adjuntos: [{ nombre: 'extracto.csv', contenido: CSV }] },
    { registro: registroCon(corridas), catalogo: [], ia: razonadorMuerto() },
  )
  assert.equal(r.ok, true)
  assert.equal(r.llm ?? null, null, 'el extracto pagó un modelo teniendo el motor al lado')
  assert.equal(r.capacidades.via, 'adjunto_extracto')
  assert.equal(corridas.length, 1)
  assert.equal(corridas[0].contenido, CSV, 'el contenido tiene que llegar ENTERO al motor')
  assert.equal(corridas[0].nombre, 'extracto.csv')
})

test('un adjunto que NO es extracto se declara, sin inventar soporte y sin modelo', async () => {
  const corridas = []
  const r = await atender(
    { actor: ACTOR, canal: 'app', mensaje: 'mirá esto', adjuntos: [{ nombre: 'notas.txt', contenido: 'hola, esto no es un extracto' }] },
    { registro: registroCon(corridas), catalogo: [], ia: razonadorMuerto() },
  )
  assert.equal(r.ok, true)
  assert.equal(r.llm ?? null, null)
  assert.equal(r.capacidades.via, 'adjunto_desconocido')
  assert.match(r.respuesta, /ninguno se parsea como extracto/)
  assert.equal(corridas.length, 0, 'un adjunto desconocido NO puede correr el importador')
})

test('EL CANDADO: sin drive.write el extracto no se importa, y se dice por qué', async () => {
  const r = await atender(
    { actor: { id: 'u2', rol: 'campo', permisos: ['drive.read'] }, canal: 'app', mensaje: 'cargá', adjuntos: [{ nombre: 'e.csv', contenido: CSV }] },
    { registro: registroCon([]), catalogo: [], ia: razonadorMuerto() },
  )
  assert.equal(r.ok, false)
  assert.equal(r.error.tipo, 'sin_permiso')
})
