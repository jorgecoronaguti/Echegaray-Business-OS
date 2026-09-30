// «NOVEDADES PARA EL ESTUDIO»: lo que se cuida es lo que el contador NO debe recibir y lo que SÍ necesita leer.
//
// Dueño, 30/09/2026 (segundo rechazo): «esos conceptos no tenías que incluirlos en el export a contadores». Por eso
// la entrada de estos tests trae un recibo estimado COMPLETO (0401, 0425, 4010…, con su bruto y su neto) y el test
// busca cada rastro en el JSON, en las celdas del xlsx releído y en el TEXTO del pdf (los streams descomprimidos,
// no los bytes crudos: el contenido de pdf-lib va con Flate y una búsqueda en crudo pasaría siempre). Si alguien
// vuelve a poner una columna de conceptos, se pone rojo. Lo mismo con el negro, sembrado con importes reconocibles.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import * as XLSX from 'xlsx'
import { PDFDocument } from 'pdf-lib'
import { estimarRecibo } from './reciboEstimado.ts'
import { reglasDelRecibo, type ConceptoDeRecibo, type ReciboParaReglas, type SeccionDelConcepto } from './reglasDelRecibo.ts'
import type { SueldoBlancoNegro } from './sueldoBlancoNegro.ts'
import type { FilaDelEspejo } from './espejoDeJornales.ts'
import { cuilConGuiones, novedadesParaElEstudio, type AlcanceDeNovedades, type DatosDelLegajo, type ReporteDeNovedades } from './novedadesParaElEstudio.ts'
import { xlsxDeNovedades } from './novedadesXlsx.ts'
import { esReciboContador, reciboFormatoContador } from './reciboFormatoContador.ts'
import { pdfDeNovedades } from './novedadesPdf.ts'
import { xlsxConLogo } from '../../../shared/exportar/xlsxConLogo.ts'
import { logoPng } from '../../../shared/exportar/logoMarca.ts'

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

// Importes que no se parecen a ningún concepto: si aparecen en un archivo, el negro (o el acordado total) entró.
const NEGRO = 987654.32
const TOTAL_CON_NEGRO = 1234567.89
const VALOR_HORA_NEGRO = 11111.11
const NETO_MENSUAL_ACORDADO = 7777777.77
const PROHIBIDOS = [NEGRO, TOTAL_CON_NEGRO, VALOR_HORA_NEGRO, NETO_MENSUAL_ACORDADO]

const sueldo = (o: Partial<SueldoBlancoNegro> = {}): SueldoBlancoNegro => ({
  estado: 'estimado', horas: 90, horasBlanco: 50, valorHoraCategoria: 6348, pisoCategoria: 6348, categoriaRecibo: 'OFICIAL',
  periodoRecibo: 'Q1-08/2026', bruto: EST.remunerativo, neto: EST.neto, origenNeto: 'conceptos', netoNoRecalculado: false,
  editado: { horasRecibo: false, valorHoraRecibo: false, neto: false }, proporcion: null, reciboEstimado: EST,
  conceptosReales: null, totalesReales: null, horasNegro: 40, recargoExtras: 3, valorHoraNegro: VALOR_HORA_NEGRO, negro: NEGRO,
  total: TOTAL_CON_NEGRO, reciboExcedeHoras: false, driveFileId: null, ...o,
})

const celda = (fecha: string, marca: string, horas: number | null, sinMotivo = false) => ({ fecha, marca, horas, sinMotivo })
interface Extra { grupo?: 'obreros' | 'oficina' | 'final'; presentismo?: object | null; celdas?: object[]; alta?: string | null; baja?: object | null; categoria?: string }
/** Una fila del espejo con lo mínimo que el armado lee; el resto del tipo no le importa. */
function fila(id: string, nombre: string, s: SueldoBlancoNegro | undefined, x: Extra = {}): FilaDelEspejo {
  return {
    personaId: id, nombre, categoria: x.categoria ?? 'oficial', grupo: x.grupo ?? 'obreros', alta: x.alta ?? '2025-05-26', baja: x.baja ?? null,
    celdas: x.celdas ?? [celda('2026-08-17', 'horas', 8), celda('2026-08-18', 'horas', 8)],
    linea: { sueldo: s, presentismo: x.presentismo === undefined ? { estado: 'aplica', causas: [] } : x.presentismo, netoMensual: NETO_MENSUAL_ACORDADO },
    // Distinto de horasBlanco a propósito: la columna de horas NO es lo trabajado.
    horasPorTipo: { normales: 88, extra50: 2, extra100: 1, total: 91 },
  } as unknown as FilaDelEspejo
}
const legajo = (nombreCompleto: string, n: number): DatosDelLegajo =>
  ({ nombreCompleto, legajo: String(n), cuil: `20-3000000${n}-1`, convenio: 'UOCRA — Ley 22.250 (construcción)', puesto: 'JEFE DE OBRA' })

const QUINCENA = { desde: '2026-08-16', hasta: '2026-08-31' }
function reporte(filas: FilaDelEspejo[], legajos: [string, DatosDelLegajo][], alcance?: AlcanceDeNovedades): ReporteDeNovedades {
  return novedadesParaElEstudio({ filas, legajos: new Map(legajos), quincena: QUINCENA, emision: '2026-09-29', alcance })
}
const mixto = (alcance?: AlcanceDeNovedades) => reporte(
  [fila('c', 'Zapata Luis', sueldo()), fila('a', 'Ñandú Ana', sueldo()),
    fila('o', 'Oficina Olga', undefined, { grupo: 'oficina', categoria: 'oficial_especializado', presentismo: { estado: 'no_aplica', causas: [], motivoNoAplica: 'mensual' } }),
    fila('f', 'Finiquito Fran', sueldo(), { grupo: 'final' })],
  [['c', legajo('Zapata Luis', 3)], ['a', legajo('Ñandú Ana', 1)], ['o', legajo('Oficina Olga', 4)], ['f', legajo('Finiquito Fran', 5)]],
  alcance,
)

const celdasDelXlsx = (bytes: Uint8Array): unknown[][] => {
  const wb = XLSX.read(bytes, { type: 'array' })
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 })
}
/** El texto que dibuja el pdf: cada stream inflado, cada `<hex> Tj` decodificado. */
function textoDelPdf(bytes: Uint8Array): string {
  const crudo = Buffer.from(bytes).toString('latin1')
  const partes: string[] = []
  for (const m of crudo.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let s: string
    try { s = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1') } catch { s = m[1] }
    for (const t of s.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) partes.push(Buffer.from(t[1], 'hex').toString('latin1'))
  }
  return partes.join(' ')
}
const encabezadosDe = (filas: unknown[][], barra: string): unknown[] => filas[filas.findIndex((f) => String(f[0] ?? '').startsWith(barra)) + 1]

test('precondición: la entrada SÍ trae un recibo con 0401, 0425 y 4010, bruto y neto (si no, el test de abajo no prueba nada)', () => {
  const r = reciboFormatoContador(sueldo())
  assert.ok(esReciboContador(r), 'el sueldo de ensayo no arma recibo')
  const codigos = [...r.remunerativo, ...r.noRemunerativo, ...r.descuentos].map((c) => c.codigo)
  for (const c of ['0401', '0425', '4010']) assert.ok(codigos.includes(c), `el estimado de ensayo no trae ${c}`)
  assert.ok((r.sueldoBruto ?? 0) > 0 && (r.neto ?? 0) > 0)
})

test('ningún concepto, total remunerativo ni bruto/neto en el JSON, el xlsx releído ni el texto del pdf', async () => {
  const r = mixto()
  const json = JSON.stringify(r)
  const xlsx = JSON.stringify(celdasDelXlsx(xlsxDeNovedades(r)))
  const pdf = textoDelPdf(await pdfDeNovedades(r))
  assert.ok(pdf.includes('Zapata Luis'), 'el lector del pdf tiene que ver el texto; si no, no prueba nada')
  for (const [donde, texto] of [['json', json], ['xlsx', xlsx], ['pdf', pdf]] as const) {
    for (const p of [/Rem\./, /Desc\./, /bruto/i, /\bneto\b/i, /0401/, /0425/, /0426/, /4010/, /remunerativo/i, /descuento/i]) {
      assert.doesNotMatch(texto, p, `${donde}: aparece ${p}`)
    }
    for (const monto of [EST.remunerativo, EST.neto]) {
      assert.ok(!texto.includes(String(monto)) && !texto.includes((monto ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })), `${donde}: aparece el importe ${monto}`)
    }
  }
})

test('el negro, lo pagado y el mensual acordado no aparecen en el JSON, el xlsx ni el pdf', async () => {
  const r = mixto()
  const json = JSON.stringify(r)
  const xlsx = JSON.stringify(celdasDelXlsx(xlsxDeNovedades(r)))
  const pdf = textoDelPdf(await pdfDeNovedades(r))
  for (const p of PROHIBIDOS) {
    for (const [donde, texto] of [['json', json], ['xlsx', xlsx]] as const) assert.ok(!texto.includes(String(p)), `${donde}: ${p}`)
    assert.ok(!pdf.includes(p.toLocaleString('es-AR', { minimumFractionDigits: 2 })), `pdf: ${p}`)
  }
  const textos = `${xlsx} ${json} ${pdf}`.toLowerCase()
  for (const palabra of ['negro', 'efectivo', 'plataforma', 'diferencia']) assert.ok(!textos.includes(palabra), `aparece «${palabra}»`)
})

test('encabezados exactos de cada bloque, en el xlsx y en el pdf', async () => {
  const r = mixto()
  const filas = celdasDelXlsx(xlsxDeNovedades(r))
  const OBREROS = ['Legajo N.º', 'Apellido y nombre', 'CUIL', 'Categoría UOCRA', '$/h blanco', 'Hs blanco de la quincena', 'Presentismo', 'Observaciones']
  const OFICINA = ['Legajo N.º', 'Apellido y nombre', 'CUIL', 'Convenio', 'Categoría', 'Puesto', 'Presentismo', 'Observaciones']
  assert.deepEqual(encabezadosDe(filas, 'OBREROS ·'), OBREROS)
  assert.deepEqual(encabezadosDe(filas, 'OFICINA ·'), OFICINA)
  const pdf = textoDelPdf(await pdfDeNovedades(r))
  for (const t of ['Categoría UOCRA', '$/h blanco', 'Convenio', 'Puesto', 'Observaciones']) assert.ok(pdf.includes(t), `pdf sin «${t}»`)
})

test('encabezado del archivo: empresa, quincena desde–hasta, grupo y emisión', async () => {
  const r = mixto('obreros')
  const col0 = celdasDelXlsx(xlsxDeNovedades(r)).map((f) => String(f[0] ?? ''))
  const pdf = textoDelPdf(await pdfDeNovedades(r))
  for (const t of ['Novedades de la quincena para el estudio', 'CUIT 30-71630464-3', 'Quincena: 16/08/2026 al 31/08/2026', 'Grupo: Obreros', 'Emitido el 29/09/2026']) {
    assert.ok(col0.some((c) => c.includes(t)), `xlsx sin «${t}»`)
    assert.ok(pdf.includes(t), `pdf sin «${t}»`)
  }
})

test('OBREROS y OFICINA son dos bloques; el grupo pedido deja fuera el otro; las finales nunca entran', () => {
  const r = mixto()
  assert.deepEqual(r.secciones.map((s) => [s.titulo, s.filas.map((f) => f.apellidoYNombre)]),
    [['OBREROS', ['Zapata Luis', 'Ñandú Ana'].sort((a, b) => a.localeCompare(b, 'es'))], ['OFICINA', ['Oficina Olga']]])
  assert.equal(r.excluidos, 1)
  assert.ok(!JSON.stringify(r.filas).includes('Finiquito'))
  const ob = mixto('obreros'); const of = mixto('oficina')
  assert.deepEqual(ob.secciones.map((s) => s.titulo), ['OBREROS'])
  assert.deepEqual(of.secciones.map((s) => s.titulo), ['OFICINA'])
  assert.ok(!JSON.stringify(celdasDelXlsx(xlsxDeNovedades(ob))).includes('Oficina Olga'), 'el archivo de obreros trae a la oficina')
  assert.ok(!JSON.stringify(celdasDelXlsx(xlsxDeNovedades(of))).includes('Zapata'), 'el archivo de oficina trae obreros')
})

test('orden por apellido, con la Ñ después de la N y sin que las tildes lo rompan', () => {
  const r = reporte(
    [fila('1', 'x', sueldo()), fila('2', 'x', sueldo()), fila('3', 'x', sueldo()), fila('4', 'x', sueldo())],
    [['1', legajo('Ñandú Ana', 1)], ['2', legajo('Álvarez Bruno', 2)], ['3', legajo('Nuñez Carlos', 3)], ['4', legajo('Zapata Luis', 4)]],
  )
  assert.deepEqual(r.filas.map((f) => f.apellidoYNombre), ['Álvarez Bruno', 'Nuñez Carlos', 'Ñandú Ana', 'Zapata Luis'])
})

// RECATEGORIZACIÓN (dueño al estudio, 18/09/2026: cuatro obreros suben desde Q2-09/2026): el legajo dice Oficial
// especializado y el último recibo (Q1-09) todavía dice Ayudante → va la del legajo y Observaciones aclara la vieja.
// MUTACIÓN que pone rojo: volver a `categoriaRecibo ?? legajo` sin comparar.
test('obreros recategorizados: manda la categoría del legajo sobre la del último recibo, y la fila lo dice', () => {
  const r = reporte(
    [fila('q', 'Quiroga Sebastian', sueldo({ categoriaRecibo: 'AYUDANTE', periodoRecibo: 'Q1-09/2026', valorHoraCategoria: 5000, horasBlanco: 37.5 }), { categoria: 'oficial_especializado' })],
    [['q', legajo('Quiroga Sebastian', 1)]],
  )
  const f = r.filas[0]
  assert.equal(f.categoria, 'Oficial especializado')
  assert.equal(f.categoriaDelLegajo, true)
  assert.match(f.observaciones, /Recategorizado desde esta quincena: antes AYUDANTE \(recibo Q1-09\/2026\)/)
  // La misma categoría con otra grafía NO es recategorización.
  const igual = reporte([fila('a', 'Alvarez Bruno', sueldo({ categoriaRecibo: 'OFICIAL' }), { categoria: 'oficial' })], [['a', legajo('Alvarez Bruno', 1)]])
  assert.equal(igual.filas[0].categoria, 'OFICIAL')
  assert.doesNotMatch(igual.filas[0].observaciones, /Recategorizado/)
})

test('obreros: categoría y $/h del recibo, y las horas son sueldo.horasBlanco, no lo trabajado', () => {
  const r = reporte([fila('a', 'Alvarez Bruno', sueldo({ categoriaRecibo: 'MEDIO OFICIAL', valorHoraCategoria: 5000, horasBlanco: 37.5 }), { categoria: 'medio_oficial' })], [['a', legajo('Alvarez Bruno', 1)]])
  const f = r.filas[0]
  assert.equal(f.categoria, 'MEDIO OFICIAL')
  assert.equal(f.categoriaDelLegajo, false)
  assert.doesNotMatch(f.observaciones, /Recategorizado/)
  assert.equal(f.horasBlanco, 37.5, 'horasPorTipo.total (91) no es lo que va al recibo')
  assert.equal(typeof f.valorHora, 'number')
  const fila1 = celdasDelXlsx(xlsxDeNovedades(r)).find((x) => x[1] === 'Alvarez Bruno')!
  assert.equal(fila1[5], 37.5, 'la celda de horas del xlsx es un número, el de horasBlanco')
})

test('oficina: sin $/h ni horas aunque el cuadro tenga sueldo, y la categoría es la del legajo', () => {
  const r = reporte([fila('o', 'Oficina Olga', sueldo({ horasBlanco: 80, valorHoraCategoria: 9999 }), { grupo: 'oficina', categoria: 'oficial_especializado' })],
    [['o', legajo('Oficina Olga', 4)]])
  const f = r.filas[0]
  assert.equal(f.valorHora, null)
  assert.equal(f.horasBlanco, null)
  assert.equal(f.categoria, 'Oficial especializado')
  assert.equal(f.convenio, 'UOCRA — Ley 22.250 (construcción)')
  assert.equal(f.puesto, 'JEFE DE OBRA')
  assert.ok(!JSON.stringify(celdasDelXlsx(xlsxDeNovedades(r))).includes('9999'))
})

test('presentismo con su porqué: las tardanzas y retiros con fecha, agrupados por causa', () => {
  const casos: [object | null, string][] = [
    [{ estado: 'aplica', causas: [] }, 'Cumple'],
    [{ estado: 'aplica', causas: [], restituido: { por: 'x', en: 'y', motivo: null, fechas: [] } }, 'Cumple (restituido)'],
    [{ estado: 'perdido', causas: [
      { fecha: '2026-08-24', causa: 'tardanza', etiqueta: 'Llegó tarde' }, { fecha: '2026-08-24', causa: 'retiro', etiqueta: 'Se retiró antes' },
      { fecha: '2026-08-28', causa: 'retiro', etiqueta: 'Se retiró antes' }] }, 'Perdido: llegó tarde 24/08; se retiró antes 24/08, 28/08'],
    [{ estado: 'no_aplica', causas: [], motivoNoAplica: 'mensual' }, 'No aplica (mensual)'],
    [{ estado: 'no_rige', causas: [] }, 'No rige'],
    [null, 'Sin dato'],
  ]
  for (const [p, esperado] of casos) {
    const r = reporte([fila('a', 'Alvarez Bruno', sueldo(), { presentismo: p })], [['a', legajo('Alvarez Bruno', 1)]])
    assert.equal(r.filas[0].presentismo, esperado)
  }
})

test('observaciones: licencias con sus días, ingreso dentro de la quincena, egreso y sin recibo previo', () => {
  const r = reporte([
    fila('a', 'Alvarez Bruno', sueldo(), { alta: '2026-08-20', celdas: [celda('2026-08-17', 'licencia', 8), celda('2026-08-18', 'licencia', 8), celda('2026-08-19', 'horas', 8)] }),
    fila('b', 'Beta Beto', sueldo({ categoriaRecibo: null }), { baja: { texto: 'baja 25/08', titulo: '' } }),
    fila('c', 'Calma Ceci', sueldo(), { alta: '2026-08-15' }),
  ], [['a', legajo('Alvarez Bruno', 1)], ['b', legajo('Beta Beto', 2)], ['c', legajo('Calma Ceci', 3)]])
  const [a, b, c] = r.filas
  assert.equal(a.observaciones, 'Licencia 2 días: 17/08, 18/08 · Ingresó el 20/08')
  assert.equal(b.observaciones, 'Egreso: baja 25/08 · Sin recibo previo: categoría y $/h del legajo')
  assert.equal(b.categoria, 'Oficial', 'sin recibo previo cae a la del legajo')
  assert.equal(c.observaciones, '', 'un ingreso anterior a la quincena no es novedad')
  assert.equal(r.sinRecibo, 1)
})

test('el logo de la empresa va en el xlsx (imagen anclada) y en el pdf (imagen embebida)', async () => {
  const r = mixto()
  assert.ok(Buffer.from(xlsxDeNovedades(r)).includes(Buffer.from('xl/media/logo.png')), 'el xlsx no trae el logo')
  const pdf = await pdfDeNovedades(r)
  assert.ok(Buffer.from(pdf).toString('latin1').includes('/Subtype /Image'), 'el pdf no trae ninguna imagen')
  assert.equal(Buffer.from(pdf.slice(0, 4)).toString('latin1'), '%PDF')
  assert.ok((await PDFDocument.load(pdf)).getPageCount() >= 1)
  assert.match(XLSX.read(xlsxDeNovedades(r), { type: 'array' }).SheetNames[0], /^Q2 08-2026$/)
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

test('el módulo no lee nada del negro, del acordado ni los renglones del recibo', () => {
  const fuente = readFileSync(new URL('./novedadesParaElEstudio.ts', import.meta.url), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  for (const campo of ['.negro', 'horasNegro', 'valorHoraNegro', 'adelanto', 'pagado', 'netoMensual', '.neto', '.remunerativo',
    '.descuentos', 'sueldoBruto', 'conceptosReales', 'totalesReales']) {
    assert.ok(!fuente.includes(campo), `el armado lee «${campo}»`)
  }
})

test('el CUIL sale siempre con guiones; lo que no tiene 11 dígitos va tal cual', () => {
  assert.equal(cuilConGuiones('20294271067'), '20-29427106-7')
  assert.equal(cuilConGuiones('20-38218815-3'), '20-38218815-3')
  assert.equal(cuilConGuiones('2029427106'), '2029427106', 'uno corto no se completa ni se inventa')
  assert.equal(cuilConGuiones(null), null)
  const r = reporte([fila('a', 'Alvarez Bruno', sueldo())], [['a', { ...legajo('Alvarez Bruno', 1), cuil: '20294271067' }]])
  assert.equal(r.filas[0].cuil, '20-29427106-7')
})
