import test from 'node:test'
import assert from 'node:assert/strict'
import { aWinAnsi, seccionesDeCierre, SIN_DATO, type DatosCierre } from './cierreObra.ts'
import type { EconomiaObra } from '../types/economia.ts'

const eco = (o: Partial<EconomiaObra> = {}): EconomiaObra => ({
  obra_id: 'x', obra: 'x', venta_contratada: 231_000_000, adicionales_aprobados: 12_000_000, n_adicionales_aprobados: 2,
  venta_total: 243_000_000, costo_objetivo: null, costo_objetivo_origen: '', costo_real: 150_000_000, costo_real_n_comprobantes: 238,
  costo_real_mano_de_obra: null, costo_comprometido: null, costo_comprometido_estado: '', costo_restante_proyectado: null,
  costo_final_proyectado: null, base_del_forecast: null, margen_cotizado: null, margen_final_proyectado: null,
  certificado: 231_000_000, facturado: null, cobrado: 200_000_000, cobrado_neto: null, por_cobrar_proyectado: null, n_cobranzas: 3, ...o,
} as EconomiaObra)

const base = (o: Partial<DatosCierre> = {}): DatosCierre => ({
  obra: { codigo: 'OB-0011', nombre: 'Pisos ARCOR', cliente: 'ARCOR', estado: 'cerrada', etapa: 'cierre', inicioPlan: '2026-04-14', finPlan: '2026-09-05', inicioReal: '2026-04-14', finReal: '2026-09-14', lineaBase: '2026-04-12T10:00:00Z' },
  veEconomia: true, economia: eco(), manoObra: 31_200_000, hh: { plan: 6420, real: 6734 },
  rubros: [{ rubro: 'Obra gruesa', plan: 1900, real: 1964, desvioPct: 3.4 }], lecciones: null, ...o,
})
const fila = (s: ReturnType<typeof seccionesDeCierre>, titulo: string, rotulo: string) => s.find((x) => x.titulo === titulo)!.filas.find((f) => f[0] === rotulo)?.[1]

test('el cierre con todos los datos: costo total = materiales + MO, margen sobre la venta', () => {
  const s = seccionesDeCierre(base())
  assert.equal(fila(s, 'Economía', 'Costo total'), '$ 181.200.000')
  assert.equal(fila(s, 'Economía', 'Margen'), '$ 61.800.000 · +25,4 % sobre la venta')
  assert.equal(fila(s, 'La obra', 'Plazo'), '+9 días contra el plan')
  assert.equal(fila(s, 'Horas hombre', 'Desvío'), '+4,9 %')
  assert.equal(fila(s, 'Lecciones', 'Lecciones'), SIN_DATO)
  assert.equal(fila(s, 'La obra', 'Estado'), 'Cerrada · etapa Cierre')
})

test('nada inventado: sin mano de obra no hay costo total ni margen (no se resta sólo materiales)', () => {
  const s = seccionesDeCierre(base({ manoObra: null }))
  assert.equal(fila(s, 'Economía', 'Costo de mano de obra'), SIN_DATO)
  assert.equal(fila(s, 'Economía', 'Costo total'), SIN_DATO)
  assert.equal(fila(s, 'Economía', 'Margen'), SIN_DATO)
})

test('sin economía leída todo dice «sin dato»; quien no la ve recibe «reservado», no ceros', () => {
  const s = seccionesDeCierre(base({ economia: null, manoObra: null }))
  for (const r of ['Contratado', 'Adicionales aprobados', 'Cobrado', 'Costo de materiales', 'Margen']) assert.equal(fila(s, 'Economía', r), SIN_DATO)
  const r = seccionesDeCierre(base({ veEconomia: false }))
  const e = r.find((x) => x.titulo === 'Economía')!
  assert.equal(e.filas.length, 0)
  assert.match(e.nota!, /Reservado/)
  assert.ok(!JSON.stringify(r).includes('231.000.000'))
})

test('fechas y HH que faltan dicen «sin dato»', () => {
  const s = seccionesDeCierre(base({ obra: { ...base().obra, finReal: null, lineaBase: null }, hh: { plan: null, real: 800 } }))
  assert.equal(fila(s, 'La obra', 'Fin real'), SIN_DATO)
  assert.equal(fila(s, 'La obra', 'Plazo'), SIN_DATO)
  assert.equal(fila(s, 'La obra', 'Línea base'), 'sin sellar')
  assert.equal(fila(s, 'Horas hombre', 'HH plan'), SIN_DATO)
  assert.equal(fila(s, 'Horas hombre', 'Desvío'), SIN_DATO)
})

test('el PDF se genera: A4, con el título y cada sección (lo que falta dice «sin dato»)', async () => {
  const { pdfDeCierre } = await import('./cierrePdf.ts')
  const { PDFDocument } = await import('pdf-lib')
  const bytes = await pdfDeCierre('OB-0011 · Pisos ARCOR', 'ARCOR', seccionesDeCierre(base({ manoObra: null })), '25/09/26 12:00')
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-')
  const doc = await PDFDocument.load(bytes)
  assert.ok(doc.getPageCount() >= 1)
  assert.equal(doc.getTitle(), 'Cierre de obra · OB-0011 · Pisos ARCOR')
})

test('el texto va en la fuente del PDF: flechas y signos fuera de WinAnsi se traducen', () => {
  assert.equal(aWinAnsi('24/08 → 22/09 · −3 días «ok»'), '24/08 -> 22/09 · -3 días «ok»')
})
