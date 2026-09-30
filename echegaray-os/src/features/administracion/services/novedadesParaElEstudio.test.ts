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
import { xlsxConLogo } from '../../../shared/exportar/xlsxConLogo.ts'
import { logoPng } from '../../../shared/exportar/logoMarca.ts'
import { PDFDocument } from 'pdf-lib'
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
function fila(id: string, nombre: string, s: SueldoBlancoNegro, horas = 40, grupo: 'obreros' | 'oficina' | 'final' = 'obreros',
  presentismo: { estado: string } | null = { estado: 'aplica' }): FilaDelEspejo {
  return {
    personaId: id, nombre, categoria: 'OFICIAL', grupo,
    celdas: [celda('2026-08-17', 'horas', 8), celda('2026-08-18', 'horas', 8), celda('2026-08-19', 'ausencia', null, true),
      celda('2026-08-20', 'licencia', 8), celda('2026-08-21', 'horas', 0)],
    linea: { sueldo: s, presentismo },
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
    if (c.sinTotal) { assert.equal(totalDeColumna(r.filas, c), null, `${c.titulo}: un $/h no se suma`); continue }
    if (c.tipo !== 'plata' && c.tipo !== 'horas') continue
    const esperado = Math.round(r.filas.reduce((a, f) => a + Number(c.valor(f) ?? 0), 0) * 100) / 100
    assert.equal(totalDeColumna(r.filas, c), esperado, c.titulo)
  }
  // La fila TOTALES del xlsx releído es ese mismo número, no otra cuenta.
  const wb = XLSX.read(xlsxDeNovedades(r), { type: 'array' })
  const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 })
  const pie = filas[filas.length - 1]
  assert.equal(pie[0], 'TOTAL GENERAL')
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

test('quien no tiene recibo NO se omite: entra con su categoría del legajo, sus horas y los importes vacíos', () => {
  const sinRecibo = sueldo({ reciboEstimado: null, conceptosReales: null, totalesReales: null, categoriaRecibo: null, estado: 'sin-recibo' as never })
  const r = reporte([fila('a', 'Alvarez Bruno', sueldo()), fila('b', 'Sin Recibo Pedro', sinRecibo)],
    [['a', legajo('Alvarez Bruno', 1)], ['b', legajo('Sin Recibo Pedro', 2)]])
  assert.equal(r.filas.length, 2)
  assert.equal(r.sinRecibo, 1)
  const p = r.filas.find((f) => f.apellidoYNombre.startsWith('Sin Recibo'))!
  assert.equal(p.origen, 'sin_recibo')
  assert.equal(p.categoriaDelLegajo, true, 'la categoría del legajo se marca, no se hace pasar por la del recibo')
  assert.equal(p.neto, null)
  assert.equal(p.legajo, '2')
})

test('OBREROS y OFICINA son dos secciones, cada una con su subtotal, y los de liquidación final no entran', () => {
  const r = reporte(
    [fila('1', 'Zeta Zoe', sueldo(), 40, 'oficina', null), fila('2', 'Beta Beto', sueldo(), 40, 'obreros'), fila('3', 'Alfa Ana', sueldo(), 20, 'obreros'),
      fila('4', 'Finiquito Fran', sueldo(), 40, 'final')],
    [['1', legajo('Zeta Zoe', 1)], ['2', legajo('Beta Beto', 2)], ['3', legajo('Alfa Ana', 3)], ['4', legajo('Finiquito Fran', 4)]],
  )
  assert.deepEqual(r.secciones.map((s) => [s.titulo, s.filas.map((f) => f.apellidoYNombre)]),
    [['OBREROS', ['Alfa Ana', 'Beta Beto']], ['OFICINA', ['Zeta Zoe']]])
  assert.equal(r.excluidos, 1, 'la liquidación final se cuenta aparte')
  assert.ok(!JSON.stringify(r.filas).includes('Finiquito'))
  const [ob, of] = r.secciones
  assert.equal(r.totales.neto, Math.round((ob.totales.neto + of.totales.neto) * 100) / 100, 'el general es la suma de las secciones')
  assert.equal(r.totales.horasAConsiderar, ob.totales.horasAConsiderar + of.totales.horasAConsiderar)
  const wb = XLSX.read(xlsxDeNovedades(r), { type: 'array' })
  const col0 = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 }).map((f) => String(f[0] ?? ''))
  for (const rotulo of ['OBREROS · 2 personas', 'Subtotal OBREROS', 'OFICINA · 1 persona', 'Subtotal OFICINA', 'TOTAL GENERAL']) {
    assert.ok(col0.includes(rotulo), `falta «${rotulo}»`)
  }
  assert.ok(col0.indexOf('Subtotal OBREROS') < col0.indexOf('OFICINA · 1 persona'), 'primero obreros, luego oficina')
})

test('presentismo: Sí si cumple, No si lo perdió, «No aplica» antes de su vigencia y sin inventar sin dato', () => {
  const casos: [string, { estado: string } | null, string][] = [
    ['aplica', { estado: 'aplica' }, 'Sí'], ['perdido', { estado: 'perdido' }, 'No'],
    ['no_aplica', { estado: 'no_aplica' }, 'No aplica'], ['no_rige', { estado: 'no_rige' }, 'No aplica'],
  ]
  for (const [nombre, p, esperado] of casos) {
    const r = reporte([fila('a', 'Alvarez Bruno', sueldo(), 40, 'obreros', p)], [['a', legajo('Alvarez Bruno', 1)]])
    assert.equal(r.filas[0].presentismo, esperado, nombre)
  }
  const sin = reporte([fila('a', 'Alvarez Bruno', sueldo({ reciboEstimado: null, categoriaRecibo: null }), 40, 'oficina', null)], [['a', legajo('Alvarez Bruno', 1)]])
  assert.equal(sin.filas[0].presentismo, 'Sin dato', 'sin estado ni recibo no se inventa Sí ni No')
})

test('categoría y $/h son los del recibo; las horas a considerar, las del blanco', () => {
  const r = reporte([fila('a', 'Alvarez Bruno', sueldo({ categoriaRecibo: 'MEDIO OFICIAL', valorHoraCategoria: 5000, horasBlanco: 37.5 }))], [['a', legajo('Alvarez Bruno', 1)]])
  const f = r.filas[0]
  assert.equal(f.categoria, 'MEDIO OFICIAL')
  assert.equal(f.categoriaDelLegajo, false)
  assert.equal(f.horasAConsiderar, 37.5)
})

test('el logo de la empresa va en el xlsx (imagen anclada) y en el pdf (imagen embebida)', async () => {
  const r = tres()
  const zip = Buffer.from(xlsxDeNovedades(r))
  assert.ok(zip.includes(Buffer.from('xl/media/logo.png')), 'el xlsx no trae el logo')
  const pdf = Buffer.from(await pdfDeNovedades(r)).toString('latin1')
  assert.ok(pdf.includes('/Subtype /Image'), 'el pdf no trae ninguna imagen')
  assert.ok((await PDFDocument.load(await pdfDeNovedades(r))).getPageCount() >= 1)
})

test('xlsxConLogo devuelve un libro que SheetJS sigue leyendo con las mismas celdas, y el png es el de public/', () => {
  const ws = XLSX.utils.aoa_to_sheet([['a', 1], ['b', 2]])
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'H')
  const base = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
  const leido = XLSX.read(xlsxConLogo(base, 60), { type: 'array' })
  assert.deepEqual(XLSX.utils.sheet_to_json(leido.Sheets.H, { header: 1 }), [['a', 1], ['b', 2]])
  const publico = readFileSync(new URL('../../../../public/marca/logo.png', import.meta.url))
  assert.ok(Buffer.from(logoPng()).equals(publico), 'logoMarca.ts se separó de public/marca/logo.png: regenerarlo')
})

test('si el recibo no cuadra el neto no se afirma', () => {
  const r = reporte([fila('a', 'Alvarez Bruno', sueldo({ reciboEstimado: { ...EST, neto: (EST.neto ?? 0) + 1000 } }))], [['a', legajo('Alvarez Bruno', 1)]])
  assert.equal(r.filas.length, 1, 'la persona sigue en el archivo')
  assert.equal(r.filas[0].neto, null, 'remunerativo + no remunerativo − descuentos no da ese neto')
  assert.equal(r.totales.filasIncompletas, 1)
})

test('los archivos son archivos: el xlsx se relee con el TOTAL GENERAL y el pdf empieza con %PDF', async () => {
  const r = tres()
  const wb = XLSX.read(xlsxDeNovedades(r), { type: 'array' })
  assert.match(wb.SheetNames[0], /^Q[12] 08-2026$/)
  const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 })
  assert.ok(filas.some((f) => /30-71630464-3/.test(String(f[0] ?? ''))), 'el CUIT del empleador está en el encabezado')
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
