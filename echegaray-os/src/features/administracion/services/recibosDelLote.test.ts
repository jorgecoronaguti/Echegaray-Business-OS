// LO QUE SOSTIENE EL LOTE DE RECIBOS REHECHO (01/10/2026): reimprimir no duplica, la marca «impreso» sale del
// último recibo guardado, y el PDF tiene las hojas que tiene que tener.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import { mismoPapel, type PapelDelRecibo } from './reciboEmitido.ts'
import { horaDeSanJuan, ultimoPorPersona } from './recibosDeLaQuincenaService.ts'
import { pdfDeRecibos, type ReciboParaElPdf } from './recibosLotePdf.ts'

const leer = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const papel = (cambios: Partial<PapelDelRecibo> = {}): PapelDelRecibo => ({
  nombre: 'AGÜERO LUIS', categoria: 'Oficial', total: 536000,
  renglones: {
    horas: [{ rotulo: 'Horas trabajadas', importe: null, horas: 96 }],
    medios: [{ rotulo: 'Depósito en banco', importe: 230000 }, { rotulo: 'Efectivo', importe: 306000 }],
  },
  ...cambios,
})

test('mismo papel: lo que vuelve de la base (claves en otro orden, null por undefined, numeric como texto ya convertido) es igual', () => {
  const deLaBase: PapelDelRecibo = {
    total: 536000.0, categoria: 'Oficial ', nombre: ' AGÜERO LUIS',
    renglones: {
      medios: [{ importe: 230000, rotulo: 'Depósito en banco', detalle: null, sub: false }, { sub: false, rotulo: 'Efectivo', importe: 306000.004 }],
      horas: [{ horas: 96, rotulo: 'Horas trabajadas', importe: null, detalle: null }],
    },
  }
  assert.equal(mismoPapel(papel(), deLaBase), true)
})

test('otro papel: cambia un importe, un renglón, el orden, el total, el nombre o la categoría', () => {
  const base = papel()
  const otroImporte = papel({ renglones: { ...base.renglones, medios: [{ rotulo: 'Depósito en banco', importe: 230000 }, { rotulo: 'Efectivo', importe: 300000 }] } })
  const unoMenos = papel({ renglones: { ...base.renglones, medios: [base.renglones.medios[0]] } })
  const otroOrden = papel({ renglones: { ...base.renglones, medios: [...base.renglones.medios].reverse() } })
  const otrasHoras = papel({ renglones: { ...base.renglones, horas: [{ rotulo: 'Horas trabajadas', importe: null, horas: 88 }] } })
  for (const [nombre, otro] of Object.entries({ otroImporte, unoMenos, otroOrden, otrasHoras, total: papel({ total: 530000 }), nombre: papel({ nombre: 'AGÜERO JUAN' }), categoria: papel({ categoria: 'Ayudante' }) })) {
    assert.equal(mismoPapel(base, otro), false, nombre)
  }
})

test('la marca «impreso»: el último recibo de cada persona, en hora de San Juan', () => {
  assert.deepEqual(horaDeSanJuan('2026-10-01T17:32:10Z'), { corta: '01/10 14:32', larga: '01/10/2026 14:32' })
  // Cerca de medianoche UTC el día de San Juan es el anterior.
  assert.equal(horaDeSanJuan('2026-10-02T01:05:00Z')?.corta, '01/10 22:05')
  assert.equal(horaDeSanJuan('no es fecha'), null)
  const m = ultimoPorPersona([
    { id: 'r1', persona_id: 'p1', emitido_en: '2026-10-01T13:00:00+00:00', codigo: 'REC-2026-0001' },
    { id: 'r2', persona_id: 'p1', emitido_en: '2026-10-01T16:52:49+00:00', codigo: 'REC-2026-0003' },
    { id: 'r3', persona_id: 'p2', emitido_en: '2026-10-01T14:00:00+00:00', codigo: null },
  ])
  assert.equal(m.p1.id, 'r2')
  assert.equal(m.p1.texto, 'impreso 01/10 13:52')
  assert.match(m.p1.titulo, /REC-2026-0003 guardado en el legajo el 01\/10\/2026 13:52/)
  assert.equal(m.p2.texto, 'impreso 01/10 11:00')
  assert.equal(m.p3, undefined)
})

const recibo = (n: number): ReciboParaElPdf => ({
  nombre: `PERSONA NÚMERO ${n}`, categoria: n % 2 ? 'Oficial Especializado' : null,
  quincenaDesde: '2026-09-16', quincenaHasta: '2026-09-30', total: 536000.5,
  renglones: papel().renglones, codigo: `RP-${String(n + 1).padStart(6, '0')}`,
})

test('el PDF: cuatro por hoja en A4 horizontal — 1, 4, 5 y 9 recibos son 1, 1, 2 y 3 hojas', async () => {
  for (const [cuantos, hojas] of [[1, 1], [4, 1], [5, 2], [9, 3]] as const) {
    const bytes = await pdfDeRecibos(Array.from({ length: cuantos }, (_, i) => recibo(i)), 'Recibos de prueba')
    assert.equal(String.fromCharCode(...bytes.slice(0, 5)), '%PDF-')
    const doc = await PDFDocument.load(bytes)
    assert.equal(doc.getPageCount(), hojas, `${cuantos} recibos`)
    const { width, height } = doc.getPage(0).getSize()
    assert.ok(width > height, 'horizontal')
    assert.equal(Math.round(width), 842)
  }
})

test('el PDF no se rompe con lo que el papel puede traer: «sin dato», renglón sub, nombre largo, sin medios', async () => {
  const raro: ReciboParaElPdf = {
    nombre: 'MALDONADO BATISTA EMILIANO MIGUEL DE LOS ÁNGELES Y OTROS NOMBRES MUY LARGOS', categoria: 'Jefe de obra — mensual',
    quincenaDesde: '2026-09-16', quincenaHasta: '2026-09-30', total: null, codigo: null,
    renglones: {
      horas: [{ rotulo: 'Horas trabajadas', importe: null, horas: null }, { rotulo: 'Horas al 50 %', importe: null, horas: 7.5 }],
      medios: [{ rotulo: 'Efectivo', importe: null }, { rotulo: 'Adelanto del 20/09 → descontado', importe: -150000, sub: true }],
    },
  }
  const sinMedios: ReciboParaElPdf = { ...raro, renglones: { horas: raro.renglones.horas, medios: [] } }
  const doc = await PDFDocument.load(await pdfDeRecibos([raro, sinMedios], 'Recibos'))
  assert.equal(doc.getPageCount(), 1)
})

test('CABLEADO: el lote guarda por la misma puerta, compara antes de registrar, y la ruta del PDF es sólo de quien liquida', () => {
  const acciones = leer('./recibosEmitidosActions.ts')
  assert.match(acciones, /if \(ya && mismoPapel\(ya, r\)\) \{ recibos\.push\(\{ personaId: r\.personaId, ok: true, id: ya\.id, codigo: ya\.codigo, yaEstaba: true \}\); continue \}/)
  assert.match(acciones, /const x = await registrar\(supabase, r\)/, 'el lote registra con la misma función que el individual')
  assert.match(acciones, /\.is\('archivado_en', null\)/, 'un recibo archivado no cuenta como ya guardado')
  assert.match(acciones, /No pude leer los recibos ya guardados[^`]*No guardé nada/, 'si no puede comparar no registra a ciegas')
  assert.match(acciones, /new Set\(validos\.map\(\(r\) => r\.personaId\)\)\.size !== validos\.length/, 'dos recibos de la misma persona en una llamada no pasan')
  const previa = leer('../components/liquidacion/cuadro/VistaPreviaDeRecibos.tsx')
  assert.equal((previa.match(/finally \{\s*setTarea\(null\)/g) ?? []).length, 2, 'imprimir y descargar liberan los botones pase lo que pase')
  assert.doesNotMatch(previa, /window\.location\.assign/, 'el PDF se baja sin salir de la pantalla')
  const ruta = leer('../../../app/(main)/administracion/personas/recibos-lote/route.ts')
  assert.match(ruta, /if \(!liquidaSueldos\(rol\)\) return new Response\('Not found', \{ status: 404 \}\)/)
  assert.match(ruta, /faltan\.length > 0/, 'no entrega un PDF incompleto')
  const solapa = leer('../components/liquidacion/solapas/quincena.tsx')
  assert.match(solapa, /impresos=\{recibos\.impresos\}/)
})
