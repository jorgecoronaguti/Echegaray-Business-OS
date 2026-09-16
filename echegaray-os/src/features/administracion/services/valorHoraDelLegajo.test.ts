import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  rotuloDeValorHora, tarifaVigenteDelLegajo, variacionDeTarifa,
  type EntradaDelRotulo, type TarifaDelLegajo,
} from './valorHoraDelLegajo.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//  1. Que el legajo escriba «sin $/h cargado» a quien SÍ tiene tarifa pero el que mira no puede
//     verla. El jefe de obra abre esta pantalla y la RLS de `persona_tarifa` (`liquida_sueldos()`)
//     le devuelve CERO FILAS SIN ERROR: sin el permiso como dato de entrada, «no puedo ver» y «no
//     hay» se dibujan exactamente igual, y el aviso ámbar manda a cargar una tarifa que ya existe.
//  2. Que la variación compare contra la tarifa equivocada: la más nueva de la lista en vez de la
//     anterior a la vigente, o una fila con fecha futura, o un neto mensual contra un $/h.
//  3. Que un sueldo mensual se publique como si fuera un valor por hora («$1.800.000» sin «/ mes»
//     al lado de un $/h de $6.979 es la diferencia entre un jefe y un error de carga).
//  4. Que el básico del CCT 76/75 se rotule «piso UOCRA» sin que nadie haya firmado esa escala para
//     el convenio del legajo — la misma trampa que `exposicionConvenio.ts` ya evita.

const HOY = '2026-09-15'

const porHora = (desde: string, valorHora: number, origen = 'acuerdo con el dueño'): TarifaDelLegajo =>
  ({ desde, valorHora, netoMensual: null, origen })

const mensual = (desde: string, netoMensual: number): TarifaDelLegajo =>
  ({ desde, valorHora: null, netoMensual, origen: 'jefes cobran por mes' })

const entrada = (extra: Partial<EntradaDelRotulo> = {}): EntradaDelRotulo => ({
  puedeVer: true, tarifas: [], recibo: null, piso: null, categoria: 'oficial', hoy: HOY, ...extra,
})

test('el $/h vigente es el del tramo que ya empezó, con su variación contra el anterior', () => {
  const r = rotuloDeValorHora(entrada({
    tarifas: [porHora('2026-08-01', 5974), porHora('2026-09-01', 6979)],
  }))
  assert.equal(r.pactado.rotulo, '$/h negro')
  assert.equal(r.pactado.valor, '$6.979')
  assert.equal(r.pactado.detalle, 'desde 01/09/2026 (+16,8 % vs 5.974)')
  assert.equal(r.pactado.tono, 'normal')
})

test('una tarifa con fecha futura no es lo que se cobra hoy', () => {
  const tarifas = [porHora('2026-09-01', 6979), porHora('2026-10-01', 8000)]
  assert.equal(tarifaVigenteDelLegajo(tarifas, HOY)?.desde, '2026-09-01')
  const r = rotuloDeValorHora(entrada({ tarifas }))
  assert.equal(r.pactado.valor, '$6.979')
})

test('la variación se mide contra la anterior a la vigente, no contra la más nueva de la lista', () => {
  const tarifas = [porHora('2026-07-01', 4000), porHora('2026-08-01', 5974), porHora('2026-09-01', 6979)]
  const v = variacionDeTarifa(tarifas, tarifas[1])
  assert.deepEqual(v, { texto: '+49,4 %', anterior: 4000 })
})

test('una baja lleva el signo menos y no se confunde con un alza', () => {
  const r = rotuloDeValorHora(entrada({
    tarifas: [porHora('2026-08-01', 7000), porHora('2026-09-01', 6700)],
  }))
  assert.equal(r.pactado.detalle, 'desde 01/09/2026 (−4,3 % vs 7.000)')
})

test('el jefe mensual publica el sueldo POR MES, no un $/h', () => {
  const r = rotuloDeValorHora(entrada({ tarifas: [mensual('2026-09-01', 1800000)] }))
  assert.equal(r.pactado.rotulo, 'pactado mensual')
  assert.equal(r.pactado.valor, '$1.800.000 / mes')
  assert.equal(r.pactado.detalle, 'desde 01/09/2026')
})

test('pasar de jornal a mensual no es una variación: no se inventa un porcentaje', () => {
  const tarifas = [porHora('2026-08-01', 6979), mensual('2026-09-01', 1800000)]
  assert.equal(variacionDeTarifa(tarifas, tarifas[1]), null)
  assert.equal(rotuloDeValorHora(entrada({ tarifas })).pactado.detalle, 'desde 01/09/2026')
})

test('sin tarifa lo dice en ámbar, y nunca escribe $0', () => {
  const r = rotuloDeValorHora(entrada({ tarifas: [] }))
  assert.equal(r.pactado.valor, null)
  assert.equal(r.pactado.falta, 'sin $/h cargado')
  assert.equal(r.pactado.tono, 'warn')
  assert.equal(r.hayHistorial, false)
})

test('SIN PERMISO NO ES SIN DATO: los tres números dicen «sin permiso» y ninguno acusa falta de carga', () => {
  const r = rotuloDeValorHora(entrada({
    puedeVer: false,
    // La RLS ya devolvió vacío; que además llegue lleno no cambia nada: el permiso manda.
    tarifas: [porHora('2026-09-01', 6979)],
    recibo: { periodo: 'Q2-08/2026', categoria: 'OFICIAL', valorHora: 6348 },
    piso: { valorHora: 6348, desde: '2026-08-01', fuente: 'convenio_escala', origen: 'convenio' },
  }))
  for (const d of [r.pactado, r.recibo, r.piso]) {
    assert.equal(d.valor, null)
    assert.equal(d.falta, 'sin permiso')
    assert.equal(d.tono, 'falta')
  }
  assert.notEqual(r.pactado.falta, 'sin $/h cargado')
  assert.equal(r.hayHistorial, false)
  assert.deepEqual(r.historial, [])
})

test('el $/h del recibo viaja con la categoría DEL RECIBO y su período', () => {
  const r = rotuloDeValorHora(entrada({
    categoria: 'medio_oficial',
    recibo: { periodo: 'Q2-08/2026', categoria: 'OFICIAL', valorHora: 6348 },
  }))
  assert.equal(r.recibo.valor, '$6.348')
  assert.equal(r.recibo.detalle, 'OFICIAL (Q2-08/2026)')
})

test('sin recibo se dice, en gris: es un dato que no está, no uno que falta cargar acá', () => {
  const r = rotuloDeValorHora(entrada({ recibo: null }))
  assert.equal(r.recibo.falta, 'sin recibo cargado')
  assert.equal(r.recibo.tono, 'falta')
})

test('la escala firmada se llama piso; el CCT que nadie firmó, no', () => {
  const firmado = rotuloDeValorHora(entrada({
    piso: { valorHora: 6348, desde: '2026-08-01', fuente: 'convenio_escala · acuerdo 08/2026', origen: 'convenio' },
  }))
  assert.equal(firmado.piso.rotulo, 'piso UOCRA')
  assert.equal(firmado.piso.valor, '$6.348')
  assert.equal(firmado.piso.detalle, 'oficial')

  const referencia = rotuloDeValorHora(entrada({
    piso: { valorHora: 6348, desde: '2026-08-01', fuente: 'uocra_escala · CCT 76/75', origen: 'cct' },
  }))
  assert.equal(referencia.piso.rotulo, 'básico CCT 76/75')
  assert.match(referencia.piso.titulo ?? '', /Nadie firmó/)
})

test('sin escala no dice «cumple»: dice que no se puede comparar', () => {
  const r = rotuloDeValorHora(entrada({ piso: null }))
  assert.equal(r.piso.valor, null)
  assert.equal(r.piso.falta, 'sin escala cargada')
})

test('el historial va de lo más nuevo a lo más viejo, con la variación de cada salto', () => {
  const r = rotuloDeValorHora(entrada({
    tarifas: [porHora('2026-07-01', 4000, 'sheet:_J_OBREROS'), porHora('2026-09-01', 6979), porHora('2026-08-01', 5974)],
  }))
  assert.equal(r.hayHistorial, true)
  assert.deepEqual(r.historial.map((f) => f.desde), ['01/09/2026', '01/08/2026', '01/07/2026'])
  assert.deepEqual(r.historial.map((f) => f.variacion), ['+16,8 % vs 5.974', '+49,4 % vs 4.000', null])
  assert.equal(r.historial[2].origen, 'sheet:_J_OBREROS')
})

test('con una sola tarifa no se ofrece un historial que repite el número de arriba', () => {
  const r = rotuloDeValorHora(entrada({ tarifas: [porHora('2026-09-01', 6979)] }))
  assert.equal(r.hayHistorial, false)
  assert.equal(r.historial.length, 1)
})
