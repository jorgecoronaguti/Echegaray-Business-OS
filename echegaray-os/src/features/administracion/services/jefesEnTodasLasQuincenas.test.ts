import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { quincenaDe } from './quincena.ts'
import { armarCuadros, type DatosDeCuadros, type PersonaDeLiquidacion } from './liquidacionCuadros.ts'
import { rotuloDelMensual, ROTULO_IMPORTE_NO_CARGADO } from './cobroMensual.ts'
import { getQuincenaPorObra } from './jornadaPorObraService.ts'
import { armarQuincenaPorObra } from './quincenaPorObra.ts'

// LOS JEFES DE OBRA SON JEFES EN TODAS LAS QUINCENAS (dueño, 15/09/2026): «¿por qué quitás como jefe de obra
// a las personas que sí lo fueron? Te dije que solamente no consideraras sus horas».
//
// LOS DOS DEFECTOS QUE ESTE ARCHIVO ATRAPA, los dos vistos en producción sobre agosto:
//
//  1. LIQUIDACIÓN decidía «jefe» por la TARIFA: Oficina era quien tenía neto mensual vigente. Los jefes lo
//     tienen desde el 01/09, así que en 01–15/08 y 16–31/08 salían en «OBREROS · QUINCENAL», «sin tarifa».
//  2. HORAS pedía el puesto sólo de quien tenía asignación o registros en la quincena. Maldonado, en el
//     plantel de 16–31/08 sin ninguna de las dos, quedaba afuera del mapa y caía con los obreros.

const AGO2 = quincenaDe('2026-08-20')
const MALDONADO = 'maldonado'
const NIEVAS = 'nievas'

const jefe = (id: string, nombre: string): PersonaDeLiquidacion =>
  ({ id, nombre, cuil: null, enLaEmpresa: true, esJefe: true, conActividad: true })

const datos = (extra: Partial<DatosDeCuadros> = {}): DatosDeCuadros => ({
  quincena: AGO2,
  personas: [jefe(MALDONADO, 'MALDONADO BATISTA EMILIANO MIGUEL')],
  tarifas: [],
  horas: new Map([[MALDONADO, { horas: 44, presentesSinHoras: 0 }]]),
  recibos: [],
  adelantos: [],
  redondeos: new Map(),
  ...extra,
})

const cuadro = (cs: ReturnType<typeof armarCuadros>, grupo: string) => cs.find((c) => c.grupo === grupo)!

test('LIQUIDACIÓN: un jefe SIN tarifa va a Oficina, no a Obreros, y dice «mensual · importe no cargado»', () => {
  const cs = armarCuadros(datos())
  assert.deepEqual(cuadro(cs, 'obreros').lineas.map((l) => l.personaId), [], 'el jefe cayó a obreros por no tener tarifa')
  const [l] = cuadro(cs, 'oficina').lineas
  assert.equal(l?.personaId, MALDONADO)
  assert.equal(l.esJefe, true)
  assert.equal(l.horas, 44, 'sus horas se ven aunque no cuenten en la obra')
  assert.equal(l.cobra, null, 'sin neto mensual ni importe cargado no se inventa un sueldo')
  // «LOS JEFES DE OBRA COBRAN POR MES, NO PREGUNTES MÁS» (dueño, 15/09/2026): dato faltante, no «sin tarifa».
  assert.equal(l.modalidad, 'mensual')
  assert.equal(l.sinTarifa, false)
  assert.equal(rotuloDelMensual(l), ROTULO_IMPORTE_NO_CARGADO)
})

test('LIQUIDACIÓN: un jefe con tarifa POR HORA sigue siendo jefe', () => {
  const cs = armarCuadros(datos({
    tarifas: [{ persona_id: MALDONADO, desde: '2026-07-01', valor_hora: 9050, neto_mensual: null, origen: 'x' }],
  }))
  assert.equal(cuadro(cs, 'obreros').lineas.length, 0)
  assert.equal(cuadro(cs, 'oficina').lineas[0]?.esJefe, true)
})

test('LIQUIDACIÓN: sin neto mensual, COBRA es el importe que cargó la planilla, con su origen a la vista', () => {
  const [l] = cuadro(armarCuadros(datos({ importesCargados: new Map([[MALDONADO, 398200]]) })), 'oficina').lineas
  assert.equal(l.cobra, 398200)
  assert.equal(l.origenTarifa, 'importe cargado de la planilla')
  assert.equal(l.sinTarifa, false, 'el jefe cobra por mes: no se le pide tarifa (dueño, 15/09/2026)')
  assert.equal(rotuloDelMensual(l), 'mensual · importe cargado de la planilla')
})

test('LIQUIDACIÓN: el neto mensual vigente le gana al importe cargado', () => {
  const [l] = cuadro(armarCuadros(datos({
    quincena: quincenaDe('2026-09-05'),
    tarifas: [{ persona_id: MALDONADO, desde: '2026-09-01', valor_hora: null, neto_mensual: 1800000, origen: 'acuerdo' }],
    importesCargados: new Map([[MALDONADO, 398200]]),
  })), 'oficina').lineas
  assert.equal(l.cobra, 1800000)
  assert.equal(l.origenTarifa, 'acuerdo')
})

test('LIQUIDACIÓN: quien no es jefe y no tiene neto mensual sigue en Obreros', () => {
  const cs = armarCuadros(datos({ personas: [{ ...jefe('acosta', 'ACOSTA'), esJefe: false }], horas: new Map([['acosta', { horas: 40, presentesSinHoras: 0 }]]) }))
  assert.deepEqual(cuadro(cs, 'oficina').lineas, [])
  assert.equal(cuadro(cs, 'obreros').lineas[0]?.personaId, 'acosta')
})

/**
 * Un cliente de mentira que RESPETA `.in()` y `.eq()`: el defecto de Horas era justamente pedir el puesto
 * con `.in('id', <subconjunto>)`, y un doble que ignora el filtro lo habría dejado pasar en verde.
 */
function clienteFalso(tablas: Record<string, Record<string, unknown>[]>): SupabaseClient {
  const cadena = (filas: Record<string, unknown>[]) => {
    let vivas = filas
    const eslabon: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: vivas, error: null }).then(ok),
      in: (col: string, vals: unknown[]) => { vivas = vivas.filter((f) => vals.includes(f[col])); return eslabon },
      eq: (col: string, v: unknown) => { vivas = vivas.filter((f) => !(col in f) || f[col] === v); return eslabon },
    }
    for (const m of ['select', 'gte', 'lte', 'not', 'is', 'neq', 'or', 'order', 'limit', 'range']) eslabon[m] = () => eslabon
    return eslabon
  }
  return {
    from: (tabla: string) => cadena(tablas[tabla] ?? []),
    rpc: async () => ({ data: false, error: null }),
  } as unknown as SupabaseClient
}

test('HORAS: el jefe del plantel SIN asignación ni horas en la quincena tiene fila, y es jefe', async () => {
  const directorio = [
    { id: MALDONADO, nombre_completo: 'MALDONADO BATISTA EMILIANO MIGUEL', en_la_empresa: true, fecha_ingreso: '2025-05-26', fecha_egreso: null, puesto: 'JEFE DE OBRA', especialidad: null, categoria: null },
    { id: NIEVAS, nombre_completo: 'NIEVAS VILLEGAS JUAN PABLO', en_la_empresa: true, fecha_ingreso: '2026-02-07', fecha_egreso: null, puesto: 'JEFE DE OBRA', especialidad: null, categoria: null },
  ]
  const supabase = clienteFalso({
    persona_directorio: directorio,
    persona_plantel: directorio,
    obra_canonica: [{ id: 'pisos', nombre: 'PISOS', estado: 'activa', cliente_texto: null }],
    // Nievas tiene una asignación vigente en la quincena; Maldonado no tiene ninguna, ni horas.
    obra_asignacion: [{ id: 'a1', obra_id: 'pisos', persona_id: NIEVAS, rol: 'integrante', desde: '2026-08-01', hasta: null, cuadrilla: null, cuadrilla_rel: null }],
  })
  const r = await getQuincenaPorObra(supabase, AGO2.desde, AGO2.hasta)
  assert.equal(r.error, null)
  const filas = armarQuincenaPorObra({ ...r.data!, dias: ['2026-08-17'], hoy: '2026-09-15' })
  const esJefe = Object.fromEntries(filas.map((f) => [f.persona.id, f.esJefe]))
  assert.equal(esJefe[MALDONADO], true, 'el jefe fuera de asignaciones y registros cayó con los obreros')
  assert.equal(esJefe[NIEVAS], true)
})
