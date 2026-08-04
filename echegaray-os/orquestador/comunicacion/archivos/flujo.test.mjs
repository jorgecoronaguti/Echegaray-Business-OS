// LA RECEPCIÓN GENÉRICA, DE PUNTA A PUNTA, CON UN MATTERMOST DE MENTIRA.
//
// Cubre todo salvo el frame del WebSocket, que casi nunca es el problema: se inyecta el adjunto en el
// borde (los `file_ids` y un cliente que devuelve bytes conocidos) y se mira EL MENSAJE QUE SALE.
//
// Los cinco casos que el pedido exige están acá con nombre propio: archivo de cada tipo, archivo
// corrupto, archivo vacío, archivo enorme y la descarga que falla. Los cuatro últimos son los que
// importan: el camino feliz nunca fue el problema.

import test from 'node:test'
import assert from 'node:assert/strict'
import { procesarArchivos, bajarArchivo, leerArchivo, DESTINO } from './flujo.mjs'
import { mattermostFalso, repoMemoria } from './dobles.mjs'
import { MAX_BYTES, MAX_ARCHIVOS } from '../../lib/archivos/deteccion.mjs'

const CSV_BANCO = [
  'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
  '22/07/2026;0133;CENTRO;001;000008689;Transferencia recibida - Quattropani;1.000.000,00;5.000.000,00',
  '23/07/2026;0133;CENTRO;002;000008690;Pago proveedores - Katsuda;(500.000,00);4.500.000,00',
  '24/07/2026;0133;CENTRO;003;000008691;Impuesto ley 25413;(3.000,00);4.497.000,00',
].join('\n')

const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)])
const pdf = () => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(512, 1)])

const port = { async query() { return { rows: [] } } }
const entrada = (fileIds, extra = {}) => ({
  fileIds,
  texto: '',
  actor: { plataforma_user_id: 'u1', channel_id: 'c1' },
  channelId: 'c1',
  rootPostId: 'raiz-1',
  postId: 'raiz-1',
  commEventId: 'ev-1',
  ...extra,
})
const abierta = { async puedeImportar() { return { ok: true } } }

// ── EL CASO QUE ORIGINÓ TODO ────────────────────────────────────────────────────────────────────

test('EL CSV DEL BANCO se lee, se previsualiza y queda con botón — pero NO se carga solo', async () => {
  const repo = repoMemoria()
  const mm = mattermostFalso({
    f1: { nombre: 'descargaUltimosMovimientos.xls', mime: 'application/vnd.ms-excel', bytes: Buffer.from(CSV_BANCO) },
  })
  const r = await procesarArchivos({
    port, mattermost: mm, repo, url: 'https://chat/archivos/accion?t=s',
    puedeImportar: abierta.puedeImportar,
  }, entrada(['f1']))

  assert.match(r.texto, /Extracto bancario/)
  assert.match(r.texto, /leí 3 movimiento/)
  assert.match(r.texto, /La cadena de saldos cierra/)
  assert.match(r.texto, /no cargo nada hasta que lo confirmes/i)
  assert.equal(r.estado, 'propuesto')
  assert.equal(r.attachments?.[0]?.actions?.length, 2, 'Importar y Descartar')
  assert.deepEqual(r.attachments[0].actions.map((a) => a.id), ['importar', 'descartar'],
    'ids simples: un id con guión bajo ya rompió la ruta de acciones')

  const fila = [...repo.filas.values()][0]
  assert.equal(fila.estado, 'propuesto')
  assert.equal(fila.formato, 'csv', 'se guarda lo que ES, no lo que el nombre dice')
  assert.equal(fila.propuesta.movimientos.length, 3)
  assert.equal(fila.propuesta.movimientos[1].importe, -500000, 'los paréntesis son un débito')
})

test('SIN PUERTA NO HAY BOTÓN: se muestra lo leído y se dice por qué no se puede cargar', async () => {
  const repo = repoMemoria()
  const mm = mattermostFalso({ f1: { nombre: 'extracto.csv', mime: 'text/csv', bytes: Buffer.from(CSV_BANCO) } })
  const r = await procesarArchivos({
    port, mattermost: mm, repo, url: 'https://chat/archivos/accion?t=s',
    puedeImportar: async () => ({ ok: false, texto: 'Los movimientos del banco se cargan sólo desde el canal de Administración y Finanzas.' }),
  }, entrada(['f1']))

  assert.match(r.texto, /Extracto bancario/, 'leer y describir no tiene efecto: siempre se hace')
  assert.equal(r.attachments, undefined, 'no se ofrece un botón que va a contestar que no')
  assert.match(r.texto, /canal de Administración y Finanzas/)
  assert.match(r.texto, /no cargué nada/)
  assert.equal(repo.filas.size, 0, 'ni siquiera se abre la propuesta')
})

test('SIN PUERTA CABLEADA se deniega: no se regala el permiso por omisión (fail-closed)', async () => {
  const repo = repoMemoria()
  const mm = mattermostFalso({ f1: { nombre: 'extracto.csv', mime: 'text/csv', bytes: Buffer.from(CSV_BANCO) } })
  const r = await procesarArchivos({ port, mattermost: mm, repo, url: 'https://chat/a?t=s' }, entrada(['f1']))
  assert.equal(r.attachments, undefined)
  assert.match(r.texto, /no está habilitada/i)
})

test('la migración sin aplicar no revienta: se lee, se muestra, y se dice que no se puede cargar', async () => {
  const repo = repoMemoria({ tablas: false })
  const mm = mattermostFalso({ f1: { nombre: 'extracto.csv', mime: 'text/csv', bytes: Buffer.from(CSV_BANCO) } })
  const r = await procesarArchivos({
    port, mattermost: mm, repo, url: 'https://chat/a?t=s', puedeImportar: abierta.puedeImportar,
  }, entrada(['f1']))
  assert.match(r.texto, /Extracto bancario/)
  assert.match(r.texto, /todavía no está habilitada/)
  assert.equal(r.attachments, undefined)
})

test('IDEMPOTENCIA: el mismo evento procesado dos veces no abre dos propuestas', async () => {
  const repo = repoMemoria()
  const mm = mattermostFalso({ f1: { nombre: 'extracto.csv', mime: 'text/csv', bytes: Buffer.from(CSV_BANCO) } })
  const dep = { port, mattermost: mm, repo, url: 'https://chat/a?t=s', puedeImportar: abierta.puedeImportar }
  await procesarArchivos(dep, entrada(['f1']))
  await procesarArchivos(dep, entrada(['f1']))
  assert.equal(repo.filas.size, 1, 'un lease vencido y reclamado por otro worker no puede duplicar el botón')
})

test('cuántos son NUEVOS sale de la misma función que usa el importador de la terminal', async () => {
  const repo = repoMemoria()
  const mm = mattermostFalso({ f1: { nombre: 'extracto.csv', mime: 'text/csv', bytes: Buffer.from(CSV_BANCO) } })
  const r = await procesarArchivos({
    port, mattermost: mm, repo, url: 'https://chat/a?t=s', puedeImportar: abierta.puedeImportar,
    // Uno de los tres ya está cargado.
    existentesBanco: async () => ([{ fecha: '2026-07-22', concepto: 'Transferencia recibida - Quattropani', importe: 1000000, saldo: 5000000, referencia: '8689' }]),
  }, entrada(['f1']))
  assert.match(r.texto, /\*\*2 son nuevos\*\* · 1 ya estaban/)
})

test('si no se puede mirar la base, NO se inventa el número de nuevos: se omite', async () => {
  const repo = repoMemoria()
  const mm = mattermostFalso({ f1: { nombre: 'extracto.csv', mime: 'text/csv', bytes: Buffer.from(CSV_BANCO) } })
  const r = await procesarArchivos({
    port, mattermost: mm, repo, url: 'https://chat/a?t=s', puedeImportar: abierta.puedeImportar,
    existentesBanco: async () => { throw new Error('base caída') },
  }, entrada(['f1']))
  assert.doesNotMatch(r.texto, /son nuevos/)
  assert.match(r.texto, /Extracto bancario/)
})

// ── UN ARCHIVO DE CADA TIPO ─────────────────────────────────────────────────────────────────────

test('UNA IMAGEN sola se DERIVA al camino de comprobantes, que no se toca', async () => {
  const mm = mattermostFalso({ f1: { nombre: 'factura.jpg', mime: 'image/jpeg', bytes: png() } })
  const r = await procesarArchivos({ port, mattermost: mm, repo: repoMemoria() }, entrada(['f1']))
  assert.equal(r.derivar, DESTINO.COMPROBANTES)
  assert.equal(r.estado, 'derivado')
  assert.equal(r.texto, '', 'no contesta nada: contesta Compras IA')
})

test('UN PDF se convierte a texto y se dice qué se encontró', async () => {
  const mm = mattermostFalso({ f1: { nombre: 'contrato.pdf', mime: 'application/pdf', bytes: pdf() } })
  const r = await procesarArchivos({
    port, mattermost: mm, repo: repoMemoria(),
    leerPdf: async () => ({ paginas: 3, caracteres: 240, texto: 'CONTRATO DE LOCACIÓN DE OBRA entre ARCOR y ECHEGARAY', truncado: false, escaneado: false }),
  }, entrada(['f1']))
  assert.match(r.texto, /PDF de 3 página/)
  assert.match(r.texto, /CONTRATO DE LOCACIÓN DE OBRA/)
})

test('UN PDF ESCANEADO dice que no tiene texto y NO inventa el contenido', async () => {
  const mm = mattermostFalso({ f1: { nombre: 'remito.pdf', mime: 'application/pdf', bytes: pdf() } })
  const r = await procesarArchivos({
    port, mattermost: mm, repo: repoMemoria(),
    leerPdf: async () => ({ paginas: 1, caracteres: 3, texto: '  \n', truncado: false, escaneado: true }),
  }, entrada(['f1']))
  assert.match(r.texto, /sin texto extraíble/)
  assert.match(r.texto, /no voy a inventarlo/)
})

test('UN PDF QUE NO SE PUEDE PARSEAR se declara, no se resume igual', async () => {
  const mm = mattermostFalso({ f1: { nombre: 'roto.pdf', mime: 'application/pdf', bytes: pdf() } })
  const r = await procesarArchivos({
    port, mattermost: mm, repo: repoMemoria(),
    leerPdf: async () => { throw new Error('XRef table not found') },
  }, entrada(['f1']))
  assert.match(r.texto, /no pude extraer su texto/)
})

test('UNA PLANILLA QUE NO ES DEL BANCO se describe y se dice que no se sabe qué hacer', async () => {
  const materiales = 'Fecha;Material;Cantidad;Precio\n22/07/2026;Cemento;100;15.000,00\n23/07/2026;Hierro;250;28.500,00'
  const mm = mattermostFalso({ f1: { nombre: 'pedido.csv', mime: 'text/csv', bytes: Buffer.from(materiales) } })
  const r = await procesarArchivos({ port, mattermost: mm, repo: repoMemoria() }, entrada(['f1']))
  assert.match(r.texto, /3 fila\(s\) leída/)
  assert.match(r.texto, /Columnas:/)
  assert.match(r.texto, /No sé qué hacer con esto/)
  assert.doesNotMatch(r.texto, /Extracto bancario/, 'no se anuncia un extracto que no es un extracto')
})

test('UN TEXTO PLANO se muestra tal cual, sin interpretarlo', async () => {
  const mm = mattermostFalso({ f1: { nombre: 'nota.txt', mime: 'text/plain', bytes: Buffer.from('Acordamos con el cliente extender el plazo dos semanas.') } })
  const r = await procesarArchivos({ port, mattermost: mm, repo: repoMemoria() }, entrada(['f1']))
  assert.match(r.texto, /Texto de 55 caracteres/)
  assert.match(r.texto, /extender el plazo dos semanas/)
})

test('UN FORMATO QUE NO SE PROCESA se guarda, se nombra y se declara la limitación', async () => {
  const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('carpeta/plano.dwg')])
  const repo = repoMemoria()
  const mm = mattermostFalso({ f1: { nombre: 'planos.zip', mime: 'application/zip', bytes: zip } })
  const r = await procesarArchivos({ port, mattermost: mm, repo }, entrada(['f1']))
  assert.match(r.texto, /`zip`/)
  assert.match(r.texto, /No sé qué hacer con esto/)
  assert.equal([...repo.filas.values()][0].formato, 'zip', 'igual queda registrado que llegó')
})

// ── LOS CUATRO MODOS DE FALLA ───────────────────────────────────────────────────────────────────

test('ARCHIVO VACÍO: se dice que está vacío y adónde mirar', async () => {
  const mm = mattermostFalso({ f1: { nombre: 'extracto.csv', mime: 'text/csv', bytes: Buffer.alloc(0) } })
  const r = await procesarArchivos({ port, mattermost: mm, repo: repoMemoria() }, entrada(['f1']))
  assert.match(r.texto, /está vacío/)
  assert.match(r.texto, /Revisá la exportación/)
})

test('ARCHIVO CORRUPTO: no se adivina por el nombre y no se rompe nada', async () => {
  const basura = Buffer.from([0x00, 0x13, 0x37, 0x00, 0xff, 0xfe, 0x01, 0x02, 0x00, 0x99])
  const mm = mattermostFalso({ f1: { nombre: 'extracto.csv', mime: 'text/csv', bytes: basura } })
  const r = await procesarArchivos({ port, mattermost: mm, repo: repoMemoria() }, entrada(['f1']))
  assert.match(r.texto, /No pude reconocer el formato/)
  assert.doesNotMatch(r.texto, /Extracto bancario/, 'llamarse .csv no lo convierte en un extracto')
})

test('ARCHIVO ENORME: se rechaza por la METADATA, sin bajar un solo byte', async () => {
  let bajadas = 0
  const mm = mattermostFalso({ f1: { nombre: 'obra.mp4', mime: 'video/mp4', bytes: Buffer.alloc(10), tamano: MAX_BYTES + 1 } })
  const espia = { ...mm, archivo: async (id) => { bajadas++; return mm.archivo(id) } }
  const r = await procesarArchivos({ port, mattermost: espia, repo: repoMemoria() }, entrada(['f1']))
  assert.equal(bajadas, 0, 'preguntar el tamaño cuesta 200 bytes; bajarlo, 25 MB')
  assert.match(r.texto, /pesa .* y mi techo es/)
})

test('LA DESCARGA QUE FALLA no tumba a los demás archivos del mismo post', async () => {
  const mm = mattermostFalso({
    f1: { nombre: 'extracto.csv', mime: 'text/csv', bytes: Buffer.from(CSV_BANCO) },
    f2: { nombre: 'nota.txt', mime: 'text/plain', bytes: Buffer.from('todo bien por acá') },
  }, { fallaEn: ['f1'] })
  const r = await procesarArchivos({
    port, mattermost: mm, repo: repoMemoria(), url: 'https://chat/a?t=s', puedeImportar: abierta.puedeImportar,
  }, entrada(['f1', 'f2']))
  assert.match(r.texto, /no pude bajar el archivo/)
  assert.match(r.texto, /todo bien por acá/, 'el segundo archivo se procesó igual')
})

test('SI NO HAY CLIENTE DE MATTERMOST se dice, en vez de fallar raro', async () => {
  const r = await procesarArchivos({ port, mattermost: null, repo: repoMemoria() }, entrada(['f1']))
  assert.match(r.texto, /No pude alcanzar Mattermost/)
})

test('la metadata que falla también se contesta en castellano', async () => {
  const mm = mattermostFalso({ f1: { nombre: 'x.csv', bytes: Buffer.from('a') } }, { fallaInfo: ['f1'] })
  const r = await procesarArchivos({ port, mattermost: mm, repo: repoMemoria() }, entrada(['f1']))
  assert.match(r.texto, /no pude consultar el archivo/)
})

test('sin adjuntos y con demasiados adjuntos: los dos bordes', async () => {
  const mm = mattermostFalso({})
  assert.match((await procesarArchivos({ port, mattermost: mm, repo: repoMemoria() }, entrada([]))).texto, /No vino ningún archivo/)
  const muchos = Array.from({ length: MAX_ARCHIVOS + 1 }, (_, i) => `f${i}`)
  const r = await procesarArchivos({ port, mattermost: mm, repo: repoMemoria() }, entrada(muchos))
  assert.match(r.texto, new RegExp(`hasta ${MAX_ARCHIVOS} archivos`))
})

// ── LAS PIEZAS SUELTAS ──────────────────────────────────────────────────────────────────────────

test('bajarArchivo usa el tamaño REAL de los bytes, no el declarado', async () => {
  const mm = mattermostFalso({ f1: { nombre: 'x.txt', mime: 'text/plain', bytes: Buffer.from('hola'), tamano: 999 } })
  const d = await bajarArchivo(mm, 'f1')
  assert.equal(d.ok, true)
  assert.equal(d.tamano, 4, 'lo único que se puede leer es lo que llegó')
})

test('leerArchivo sobre una descarga fallida devuelve un resultado, no una excepción', async () => {
  const l = await leerArchivo({ ok: false, fileId: 'f1', nombre: 'x', error: 'se cayó' })
  assert.equal(l.destino, DESTINO.NINGUNO)
  assert.equal(l.error, 'se cayó')
})
