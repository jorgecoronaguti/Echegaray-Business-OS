// MODO SÓLO-ADJUNTOS — cada test revierte un defecto medido en producción (dueño, 02/09/2026).
//
// El defecto: «procesá esto» + «Estructura San Francisco del Monte Entrepiso.pdf» corrió
// `plano.cotizar` y murió con «google download 404». Con el plano en la mano, la corrida salía
// igual al índice de Drive con el rótulo como patrón `%san francisco del monte%`, bajaba los
// archivos que encontraba, y el primer 404 se comía la cotización entera.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fuentesDe, documentosEnMemoria, conTextoParaClasificar } from './pipeline.mjs'
import { partirDocumentos, planosDe } from './documentos.mjs'
import { textoDe } from './documental.mjs'

const ADJUNTO = { nombre: 'Estructura San Francisco del Monte Entrepiso.pdf', contenido: 'LÁMINA E-01 · columnas 2C240 · H=6.10m' }

/** Drive que EXPLOTA si alguien lo toca: la única forma de probar que no se tocó. */
const driveQueExplota = {
  descargarBytes: async () => { throw new Error('el modo sólo-adjuntos bajó un archivo de Drive') },
  readExcel: async () => { throw new Error('el modo sólo-adjuntos leyó una planilla de Drive') },
}
const indiceQueExplota = async () => { throw new Error('el modo sólo-adjuntos consultó el índice de Drive') }

test('CON ADJUNTOS: no se consulta el índice de Drive ni queda un solo archivo por descargar', async () => {
  const { filas, conIndice } = await fuentesDe({ query: indiceQueExplota }, { termino: 'San Francisco del Monte', adjuntos: [ADJUNTO] })
  assert.equal(conIndice, false, 'con adjuntos, Drive no entra')
  assert.equal(filas.length, 1)
  assert.equal(filas[0].name, ADJUNTO.nombre)
  // La prueba de que NADA va a pedirle bytes a Drive: todo documento de la corrida ya los tiene.
  assert.ok(filas.every((f) => Buffer.isBuffer(f._bytes)), 'todo documento adjunto viaja con sus bytes')
  assert.match(filas[0].drive_file_id, /^adjunto:/)
})

test('CON ADJUNTOS + conDrive: true: recién ahí se suma el índice — es un pedido explícito', async () => {
  const llamadas = []
  const query = async (_sql, args) => { llamadas.push(args?.[0]); return { rows: [{ drive_file_id: 'd1', name: 'Plano viejo.pdf', path: 'x', mime_type: null, is_folder: false }] } }
  const { filas, conIndice } = await fuentesDe({ query }, { termino: 'San Francisco', adjuntos: [ADJUNTO], conDrive: true })
  assert.equal(conIndice, true)
  assert.equal(llamadas.length, 1, 'el índice se consulta UNA vez, con el término')
  assert.equal(filas.length, 2, 'Drive + adjunto conviven sólo cuando se pidió')
})

test('SIN ADJUNTOS: la conducta de siempre — se busca por término en el índice', async () => {
  const query = async () => ({ rows: [{ drive_file_id: 'd1', name: 'Plano.pdf', is_folder: false }] })
  const { filas, conIndice } = await fuentesDe({ query }, { termino: 'Quattropani', adjuntos: [] })
  assert.equal(conIndice, true)
  assert.equal(filas.length, 1)
})

test('conDrive: false SIN adjuntos no inventa documentos: corrida vacía, no una búsqueda a ciegas', async () => {
  // Sin esta rama, `termino` null convertía el patrón en «%%» y el índice devolvía TODO Drive.
  const { filas, conIndice } = await fuentesDe({ query: indiceQueExplota }, { termino: null, adjuntos: [], conDrive: false })
  assert.equal(conIndice, false)
  assert.equal(filas.length, 0)
})

test('UN readExcel QUE FALLA NO TUMBA LA LECTURA: declara el motivo y la corrida sigue', async () => {
  // El .xls viejo no lo abre el lector con celdas y el segundo intento sale a Drive. Un adjunto
  // en memoria («adjunto:<hash>») ahí da 404 seguro: antes esa excepción subía sin decir cuál de
  // los dos lectores falló.
  const doc = { name: 'COMPUTO viejo.xls', mime_type: null, drive_file_id: 'adjunto:abc' }
  const r = await textoDe(doc, Buffer.from('no soy un xls de verdad'), { google: driveQueExplota })
  assert.equal(r.ok, false, 'no puede afirmar que leyó lo que no leyó')
  assert.match(String(r.porQue), /Drive tampoco lo pudo convertir/)
  assert.match(String(r.porQue), /sólo-adjuntos leyó una planilla/)
})

test('EL PLANO ADJUNTO CUENTA COMO PLANO: sin esto, la corrida contesta «ninguno es un plano» con el plano en la mano', () => {
  // Medido con el archivo real del dueño: «Estructura San Francisco del Monte Entrepiso.pdf»
  // salía `desconocido` porque el clasificador de Drive exige una señal gráfica en el nombre
  // («plano», «lámina», «E-01») — premisa que vale para una carpeta de Drive y no para un adjunto.
  const filas = documentosEnMemoria([ADJUNTO])
  const { insumos } = partirDocumentos(filas, { carpetaObra: '' })
  const planos = planosDe(insumos)
  assert.equal(planos.legibles.length, 1, 'el adjunto que el detector mandó al cotizador tiene que ser un plano acá también')
  assert.equal(planos.otros.length, 0)
  assert.match(insumos[0].senal, /adjunto/)
})

test('UN ADJUNTO QUE REVELA EL RESULTADO SIGUE RESERVADO: la elevación no abre esa puerta', () => {
  const filas = documentosEnMemoria([{ nombre: 'Cómputo estructura entrepiso.pdf', contenido: 'x' }])
  const { insumos, reservados } = partirDocumentos(filas, { carpetaObra: '' })
  assert.equal(insumos.length, 0)
  assert.equal(reservados.length, 1, 'un cómputo adjunto no entra a cotizar por ser adjunto')
})

test('UN ADJUNTO QUE NO ES PLANO NO SE ELEVA: la factura sigue siendo desconocida para el cotizador', () => {
  const filas = documentosEnMemoria([{ nombre: 'Nota del cliente.pdf', contenido: 'x' }])
  const { insumos } = partirDocumentos(filas, { carpetaObra: '' })
  assert.equal(planosDe(insumos).legibles.length, 0)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL PLANO QUE EL NOMBRE NO DECLARA — el defecto que encontró la auditoría de esta misma rama.
//
// El gateway rutea al cotizador con NOMBRE + TEXTO; adentro se clasificaba sólo por el NOMBRE.
// «GOP-153479.pdf» y «E3 Techo P.Alta.pdf» entraban por su texto de lámina y volvían a salir
// `desconocido`: la corrida contestaba «ninguno de los adjuntos es un plano» habiéndolos aceptado.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const TEXTO_LAMINA = 'PLANTA ALTA · escala 1:100 · cotas en metros · vigas VF y columnas C1 · hormigón H-21 · corte A'

const planosDeAdjuntos = async (adjuntos) => {
  const { filas } = await fuentesDe({ query: indiceQueExplota }, { termino: 'X', adjuntos })
  return planosDe(partirDocumentos(filas, { carpetaObra: '' }).insumos)
}

test('EL TEXTO CLASIFICA CUANDO EL NOMBRE CALLA: «GOP-153479.pdf» y «E3 Techo P.Alta.pdf» son planos', async () => {
  for (const nombre of ['GOP-153479.pdf', 'E3 Techo P.Alta.pdf']) {
    const planos = await planosDeAdjuntos([{ nombre, texto: TEXTO_LAMINA, contenido: TEXTO_LAMINA }])
    assert.equal(planos.legibles.length, 1, `«${nombre}» tiene que ser un plano acá, igual que en el gateway`)
    assert.equal(planos.otros.length, 0)
  }
})

test('SIN TEXTO PROVISTO se extrae de los bytes: el mismo archivo clasifica igual venga de donde venga', async () => {
  // Un script que llame la capacidad directo no manda `texto`. Si la clasificación dependiera de
  // que el llamador lo traiga, el mismo plano sería plano por una cara y no por la otra.
  // Se mira el TIPO y no la legibilidad: que un .txt no se pueda mirar con visión es otro hecho,
  // y mezclarlos escondería exactamente el defecto que este test cuida.
  const filas = await conTextoParaClasificar(documentosEnMemoria([{ nombre: 'E3 Techo P.Alta.txt', contenido: TEXTO_LAMINA }]))
  assert.equal(filas[0]._texto, TEXTO_LAMINA, 'el texto se completa desde los bytes')
  const { insumos } = partirDocumentos(filas, { carpetaObra: '' })
  assert.match(insumos[0].tipo, /plano/, 'el mismo archivo, la misma clase, lo traiga o no el llamador')
})

test('EL TEXTO NO PUEDE ASCENDER UN PAPEL DE PLATA: «Estructura de costos.pdf» no sale a visión paga', async () => {
  // Se elevaba a plano_general por la palabra ESTRUCTURA y se pagaban llamadas de visión para
  // mirar una planilla de costos.
  for (const nombre of ['Estructura de costos.pdf', 'Cómputo de estructura metálica.pdf', 'Presupuesto estructura.pdf']) {
    const planos = await planosDeAdjuntos([{ nombre, texto: TEXTO_LAMINA, contenido: TEXTO_LAMINA }])
    assert.equal(planos.legibles.length, 0, `«${nombre}» no puede entrar a computar`)
  }
})

test('UN BINARIO SIN TEXTO NO INVENTA TEXTO: queda con el nombre como única señal', async () => {
  const bytes = Buffer.from([0x00, 0x01, 0x02, 0x00, 0x03]).toString('base64')
  const filas = await conTextoParaClasificar(documentosEnMemoria([{ nombre: 'escaneo.pdf', contenido_base64: bytes }]))
  assert.equal(filas[0]._texto, null, 'sin texto extraíble se declara null, no una cadena de basura')
})
