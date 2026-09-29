// «NOVEDADES PARA EL ESTUDIO»: lo que se cuida es lo que el contador NO debe recibir y lo que SÍ debe poder sumar.
//
// Dueño, 29/09/2026: al contador va SÓLO EL BLANCO. Por eso el primer test siembra importes reconocibles en el
// negro y en lo pagado del `sueldo` de entrada y busca CADA UNO en el JSON, en las celdas del xlsx releído y en
// los bytes del pdf. El segundo cuida que el pie sea la suma de lo que está en las filas, el tercero el orden
// por apellido con la Ñ y las tildes, y el cuarto que quien no tiene blanco no viaje con importes vacíos.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { estimarRecibo } from './reciboEstimado.ts'
import { reglasDelRecibo, type ConceptoDeRecibo, type ReciboParaReglas, type SeccionDelConcepto } from './reglasDelRecibo.ts'
import type { SueldoBlancoNegro } from './sueldoBlancoNegro.ts'
import type { FilaDelEspejo } from './espejoDeJornales.ts'
import { novedadesParaElEstudio, type DatosDelLegajo, type ReporteDeNovedades } from './novedadesParaElEstudio.ts'
import { columnasDeSalida, totalDeColumna } from './novedadesColumnas.ts'
import { xlsxDeNovedades } from './novedadesXlsx.ts'
import { pdfDeNovedades } from './novedadesPdf.ts'

type Tupla = [string, string, number, number, number, number, [string, string, number | null, number | null, number][]]
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/recibos-2026-q2-06-a-q2-08.json', import.meta.url), 'utf8')) as
  { rosales: string; catalogo: Record<string, string>; recibos: Tupla[] }
const SECCION: Record<string, SeccionDelConcepto> = { R: 'remunerativo', N: 'no_remunerativo', D: 'descuento', C: 'contribucion' }
const RECIBOS: ReciboParaReglas[] = FIXTURE.recibos.map(([persona, periodo, valorHora, horasNormales, horasFeriado, horasOtras, cs]) => ({
  persona, periodo, valorHora, horasNormales, horasFeriado, horasOtras,
  conceptos: cs.map(([codigo, s, unidad, base, monto]): ConceptoDeRecibo => ({ codigo, descripcion: FIXTURE.catalogo[codigo], seccion: SECCION[s], unidad, base, monto })),
}))
const REGLAS = reglasDelRecibo(RECIBOS, 'Q2-08/2026')
const EST = estimarRecibo(REGLAS, { persona: FIXTURE.rosales, periodo: 'Q2-08/2026', valorHora: 6348, horasRecibo: null, feriados: 1, recibosPropios: RECIBOS.filter((r) => r.persona === FIXTURE.rosales) })!

// Importes que no se parecen a ningún concepto: si aparecen en un archivo, el negro entró.
const NEGRO = 987654.32
const TOTAL_CON_NEGRO = 1234567.89
const VALOR_HORA_NEGRO = 11111.11
const PROHIBIDOS = [NEGRO, TOTAL_CON_NEGRO, VALOR_HORA_NEGRO]

const sueldo = (o: Partial<SueldoBlancoNegro> = {}): SueldoBlancoNegro => ({
  estado: 'estimado', horas: 90, horasBlanco: 50, valorHoraCategoria: 6348, pisoCategoria: 6348, categoriaRecibo: 'OFICIAL',
  periodoRecibo: 'Q1-08/2026', bruto: EST.remunerativo, neto: EST.neto, origenNeto: 'conceptos', netoNoRecalculado: false,
  editado: { horasRecibo: false, valorHoraRecibo: false, neto: false }, proporcion: null, reciboEstimado: EST,
  conceptosReales: null, totalesReales: null, horasNegro: 40, recargoExtras: 3, valorHoraNegro: VALOR_HORA_NEGRO, negro: NEGRO,
  total: TOTAL_CON_NEGRO, reciboExcedeHoras: false, driveFileId: null, ...o,
})

const celda = (fecha: string, marca: string, horas: number | null, sinMotivo = false) => ({ fecha, marca, horas, sinMotivo })
/** Una fila del espejo con lo mínimo que el armado lee; el resto del tipo no le importa. */
function fila(id: string, nombre: string, s: SueldoBlancoNegro, horas = 40): FilaDelEspejo {
  return {
    personaId: id, nombre, categoria: 'OFICIAL',
    celdas: [celda('2026-08-17', 'horas', 8), celda('2026-08-18', 'horas', 8), celda('2026-08-19', 'ausencia', null, true),
      celda('2026-08-20', 'licencia', 8), celda('2026-08-21', 'horas', 0)],
    linea: { sueldo: s },
    horasPorTipo: { normales: horas, extra50: 2, extra100: 1, total: horas + 3 },
  } as unknown as FilaDelEspejo
}
const legajo = (nombreCompleto: string, n: number): DatosDelLegajo =>
  ({ nombreCompleto, legajo: String(n), cuil: `20-3000000${n}-1`, obra: 'OB-0008' })

const QUINCENA = { desde: '2026-08-16', hasta: '2026-08-31' }
function reporte(filas: FilaDelEspejo[], legajos: [string, DatosDelLegajo][]): ReporteDeNovedades {
  return novedadesParaElEstudio({ filas, legajos: new Map(legajos), quincena: QUINCENA, emision: '2026-09-29', feriados: 1 })
}
const tres = () => reporte(
  [fila('c', 'Zapata Luis', sueldo()), fila('a', 'Ñandú Ana', sueldo({ estado: 'estimado' })), fila('b', 'Alvarez Bruno', sueldo())],
  [['c', legajo('Zapata Luis', 3)], ['a', legajo('Ñandú Ana', 1)], ['b', legajo('Alvarez Bruno', 2)]],
)

test('el negro y lo pagado no aparecen en el JSON, en el xlsx ni en el pdf', async () => {
  const r = tres()
  const json = JSON.stringify(r)
  const wb = XLSX.read(xlsxDeNovedades(r), { type: 'array' })
  const celdas = JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }))
  const pdf = Buffer.from(await pdfDeNovedades(r)).toString('latin1')
  for (const p of PROHIBIDOS) {
    for (const [donde, texto] of [['json', json], ['xlsx', celdas]] as const) {
      assert.ok(!texto.includes(String(p)), `${donde}: ${p} es del negro`)
    }
    assert.ok(!pdf.includes(p.toLocaleString('es-AR', { minimumFractionDigits: 2 })), `pdf: ${p} es del negro`)
  }
  // Ni una columna ni una nota que hable del negro.
  const textos = `${celdas} ${json}`.toLowerCase()
  for (const palabra of ['negro', 'efectivo', 'plataforma', 'diferencia']) {
    assert.ok(!textos.includes(palabra), `aparece «${palabra}»`)
  }
})

test('el pie es la suma de las filas y cada columna suma lo que muestra', () => {
  const r = tres()
  const suma = (f: (x: (typeof r.filas)[number]) => number | null) => Math.round(r.filas.reduce((a, x) => a + (f(x) ?? 0), 0) * 100) / 100
  assert.equal(r.totales.personas, 3)
  assert.equal(r.totales.totalRemunerativo, suma((x) => x.totalRemunerativo))
  assert.equal(r.totales.neto, suma((x) => x.neto))
  assert.equal(r.totales.horasNormales, 120)
  assert.ok(r.totales.neto > 0 && r.totales.totalRemunerativo > 0, 'el ensayo tiene que sumar algo')
  for (const c of columnasDeSalida(r)) {
    if (c.tipo !== 'plata' && c.tipo !== 'horas') continue
    const esperado = Math.round(r.filas.reduce((a, f) => a + Number(c.valor(f) ?? 0), 0) * 100) / 100
    assert.equal(totalDeColumna(r, c), esperado, c.titulo)
  }
  // La fila TOTALES del xlsx releído es ese mismo número, no otra cuenta.
  const wb = XLSX.read(xlsxDeNovedades(r), { type: 'array' })
  const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 })
  const pie = filas[filas.length - 1]
  assert.equal(pie[0], 'TOTALES')
  assert.ok(pie.includes(r.totales.neto), 'el neto del pie')
})

test('días y horas salen de las celdas de la grilla', () => {
  const f = tres().filas[0]
  assert.equal(f.diasTrabajados, 2, 'una celda con 0 h no es día trabajado')
  assert.equal(f.diasAusencia, 1)
  assert.equal(f.diasAusenciaSinMotivo, 1)
  assert.equal(f.diasLicencia, 1)
  assert.equal(f.horasLicencia, 8)
})

test('orden por apellido, con la Ñ después de la N y sin que las tildes lo rompan', () => {
  const r = reporte(
    [fila('1', 'x', sueldo()), fila('2', 'x', sueldo()), fila('3', 'x', sueldo()), fila('4', 'x', sueldo())],
    [['1', legajo('Ñandú Ana', 1)], ['2', legajo('Álvarez Bruno', 2)], ['3', legajo('Nuñez Carlos', 3)], ['4', legajo('Zapata Luis', 4)]],
  )
  assert.deepEqual(r.filas.map((f) => f.apellidoYNombre), ['Álvarez Bruno', 'Nuñez Carlos', 'Ñandú Ana', 'Zapata Luis'])
})

test('quien no tiene blanco por conceptos queda fuera y se cuenta aparte', () => {
  const sinBlanco = sueldo({ reciboEstimado: null, conceptosReales: null, totalesReales: null, estado: 'sin-recibo' as never })
  const r = reporte([fila('a', 'Alvarez Bruno', sueldo()), fila('b', 'Sin Blanco Pedro', sinBlanco)],
    [['a', legajo('Alvarez Bruno', 1)], ['b', legajo('Sin Blanco Pedro', 2)]])
  assert.equal(r.filas.length, 1)
  assert.equal(r.excluidos, 1)
  assert.ok(!JSON.stringify(r.filas).includes('Sin Blanco'))
})

test('si el recibo no cuadra el neto no se afirma', () => {
  const r = reporte([fila('a', 'Alvarez Bruno', sueldo({ reciboEstimado: { ...EST, neto: (EST.neto ?? 0) + 1000 } }))], [['a', legajo('Alvarez Bruno', 1)]])
  assert.equal(r.filas.length, 1, 'la persona sigue en el archivo')
  assert.equal(r.filas[0].neto, null, 'remunerativo + no remunerativo − descuentos no da ese neto')
  assert.equal(r.totales.filasIncompletas, 1)
})

test('los archivos son archivos: el xlsx se relee con la fila TOTALES y el pdf empieza con %PDF', async () => {
  const r = tres()
  const wb = XLSX.read(xlsxDeNovedades(r), { type: 'array' })
  assert.match(wb.SheetNames[0], /^Q[12] 08-2026$/)
  const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 })
  assert.match(String(filas[1][0]), /30-71630464-3/)
  const pdf = await pdfDeNovedades(r)
  assert.equal(Buffer.from(pdf.slice(0, 4)).toString('latin1'), '%PDF')
})

test('el módulo no lee nada del negro ni del banco', () => {
  const fuente = readFileSync(new URL('./novedadesParaElEstudio.ts', import.meta.url), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  for (const campo of ['.negro', 'horasNegro', 'valorHoraNegro', 'adelanto', 'pagado']) {
    assert.ok(!fuente.includes(campo), `el armado lee «${campo}»`)
  }
})
