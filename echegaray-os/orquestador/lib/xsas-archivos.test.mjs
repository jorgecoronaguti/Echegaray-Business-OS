// LA INGESTA DE ADJUNTOS DE /XSAS. Cada test prueba un defecto: revertir el arreglo pone rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { bytesDeAdjunto, hashDe, ingerirAdjuntos, textoDeLectura, DESTINO } from './xsas-archivos.mjs'

const CSV = 'col_a;col_b;col_c;col_d\n1;2;3;4\n5;6;7;8\n9;10;11;12\n'

/** Una base falsa: (actor, hash) → fila. Captura los SQL para poder mirar el aislamiento. */
function baseFalsa() {
  const filas = new Map()
  const consultas = []
  const query = async (sql, args) => {
    consultas.push({ sql, args })
    if (/^select/i.test(sql.trim())) {
      const fila = filas.get(`${args[0]}|${args[1]}`)
      return { rows: fila ? [fila] : [] }
    }
    if (/^insert/i.test(sql.trim())) {
      filas.set(`${args[0]}|${args[2]}`, {
        nombre: args[3], tamano: args[4], familia: args[5], formato: args[6], destino: args[7],
        resumen: JSON.parse(args[8]),
      })
      return { rows: [] }
    }
    return { rows: [] }
  }
  return { query, filas, consultas }
}

test('texto plano y base64 producen los MISMOS bytes y el mismo hash — la identidad es el contenido', () => {
  const a = bytesDeAdjunto({ nombre: 'x.csv', contenido: CSV })
  const b = bytesDeAdjunto({ nombre: 'otro-nombre.csv', contenido_base64: Buffer.from(CSV, 'utf8').toString('base64') })
  assert.equal(hashDe(a.bytes), hashDe(b.bytes), 'el nombre no puede cambiar la identidad')
})

test('un CSV genérico se lee como planilla, con filas y encabezado', async () => {
  const { lecturas } = await ingerirAdjuntos({ adjuntos: [{ nombre: 'datos.csv', contenido: CSV }], actorId: 'u1' })
  assert.equal(lecturas.length, 1)
  assert.equal(lecturas[0].destino, DESTINO.PLANILLA)
  assert.match(textoDeLectura(lecturas[0]), /datos\.csv/)
  assert.match(textoDeLectura(lecturas[0]), /col_a/)
})

test('un formato sin motor NO se finge: FORMATO_NO_SOPORTADO, con el archivo nombrado', async () => {
  // Bytes de un ZIP (PK\x03\x04): detectable, sin motor por esta vía.
  const zip = Buffer.from('504b0304140000000800', 'hex').toString('base64')
  const { lecturas } = await ingerirAdjuntos({ adjuntos: [{ nombre: 'algo.zip', contenido_base64: zip }], actorId: 'u1' })
  assert.equal(lecturas.length, 1)
  assert.notEqual(lecturas[0].destino, DESTINO.PLANILLA)
  const texto = textoDeLectura(lecturas[0])
  assert.ok(/FORMATO_NO_SOPORTADO|[Nn]o lo pude leer|imagen/.test(texto), `debe declarar el límite: ${texto}`)
})

test('dos archivos en el mismo pedido conservan identidades distintas', async () => {
  const { lecturas } = await ingerirAdjuntos({
    adjuntos: [{ nombre: 'a.csv', contenido: CSV }, { nombre: 'b.csv', contenido: 'x;y\n9;8\n' }],
    actorId: 'u1',
  })
  assert.equal(lecturas.length, 2)
  assert.notEqual(lecturas[0].hash, lecturas[1].hash)
  assert.deepEqual(lecturas.map((l) => l.nombre), ['a.csv', 'b.csv'])
})

test('el mismo contenido, del mismo actor, REUTILIZA la lectura persistida (no se re-parsea)', async () => {
  const db = baseFalsa()
  const uno = await ingerirAdjuntos({ adjuntos: [{ nombre: 'd.csv', contenido: CSV }], actorId: 'u1', query: db.query })
  assert.equal(uno.lecturas[0].reutilizado, false)
  const dos = await ingerirAdjuntos({ adjuntos: [{ nombre: 'd.csv', contenido: CSV }], actorId: 'u1', query: db.query })
  assert.equal(dos.lecturas[0].reutilizado, true, 'el mismo hash del mismo actor no se vuelve a parsear')
  assert.equal(dos.lecturas[0].destino, DESTINO.PLANILLA)
})

test('AISLAMIENTO: el mismo contenido de OTRO actor NO reutiliza la lectura ajena', async () => {
  const db = baseFalsa()
  await ingerirAdjuntos({ adjuntos: [{ nombre: 'd.csv', contenido: CSV }], actorId: 'u1', query: db.query })
  const otro = await ingerirAdjuntos({ adjuntos: [{ nombre: 'd.csv', contenido: CSV }], actorId: 'u2', query: db.query })
  assert.equal(otro.lecturas[0].reutilizado, false, 'el parse de un actor no es evidencia para otro')
  for (const c of db.consultas.filter((c) => /^select/i.test(c.sql.trim()))) {
    assert.ok(c.args[0], 'toda lectura del caché lleva el actor en el WHERE')
  }
})

test('sin base funciona igual y LO DICE: sinMemoria true', async () => {
  const { lecturas, sinMemoria } = await ingerirAdjuntos({ adjuntos: [{ nombre: 'd.csv', contenido: CSV }], actorId: 'u1' })
  assert.equal(sinMemoria, true)
  assert.equal(lecturas[0].destino, DESTINO.PLANILLA)
})

test('el texto persistido se ACOTA: un archivo enorme no entra entero a la base', async () => {
  const gigante = `a;b;c;d\n${'fila;larga;x;y\n'.repeat(60000)}`
  const db = baseFalsa()
  await ingerirAdjuntos({ adjuntos: [{ nombre: 'g.csv', contenido: gigante }], actorId: 'u1', query: db.query })
  const guardado = [...db.filas.values()][0]
  assert.ok(guardado.resumen.texto.length <= 120_000, `persistió ${guardado.resumen.texto.length} caracteres`)
  assert.equal(guardado.resumen.texto_truncado, true)
})
