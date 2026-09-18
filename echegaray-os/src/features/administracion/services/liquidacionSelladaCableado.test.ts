// EL CABLEADO DEL SERVICIO, PROBADO LLAMANDO AL SERVICIO — no leyendo su texto (auditor, 18/09/2026).
//
// El auditor mutó `getLiquidacionDeLaQuincena` de dos maneras y 64 tests siguieron en verde; sólo lo custodiaba el E2E:
//
//   M1  pasarle a `cuadroSellado` las líneas VIVAS como si fueran las selladas.
//   M3  que el plantel deje de incluir a quien tiene línea sellada.
//
// Acá se llama a la función de verdad con un cliente Supabase FALSO que devuelve filas fijas por tabla. La tarifa
// vigente ($4.000) y las horas vivas (8 h) difieren de lo sellado (9 h × $4.300 = $38.700): si el servicio vuelve a
// armar la cerrada con lo vivo, da $32.000 y este archivo se pone rojo. El segundo caso es alguien con línea sellada
// que el plantel de hoy excluye (cuadrilla de subcontratista): se le pagó en esa quincena y el pie tiene que sumarlo.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getLiquidacionDeLaQuincena } from './liquidacionQuincenaService.ts'
import { quincenaDe } from './quincena.ts'

type Fila = Record<string, unknown>

/**
 * UN CLIENTE SUPABASE DE MENTIRA, lo justo para leer. Cada `from(tabla)` devuelve sus filas fijas y aplica los filtros
 * que cambian el resultado (`eq`, `not … is null`); los de rango se ignoran porque las filas ya son de la ventana.
 * `range` corta como PostgREST para que la paginación de `registros_hh` termine.
 */
function clienteFalso(tablas: Record<string, Fila[]>, rpc: Record<string, unknown> = {}): SupabaseClient {
  const consulta = (tabla: string) => {
    let filas = [...(tablas[tabla] ?? [])]
    let desde = 0, hasta = Infinity
    const b: Record<string, unknown> = {}
    const encadena = (fn?: (...a: unknown[]) => void) => (...a: unknown[]) => { fn?.(...a); return proxy }
    for (const m of ['select', 'lte', 'gte', 'lt', 'gt', 'order', 'limit', 'is', 'in', 'ilike', 'like', 'or', 'filter']) b[m] = encadena()
    b.eq = encadena((c, v) => { filas = filas.filter((f) => f[c as string] === v) })
    b.not = encadena((c, op, v) => { if (op === 'is' && v === null) filas = filas.filter((f) => f[c as string] != null) })
    b.range = encadena((a, z) => { desde = Number(a); hasta = Number(z) })
    const resultado = () => ({ data: filas.slice(desde, hasta + 1), error: null, count: filas.length })
    b.maybeSingle = () => Promise.resolve({ data: filas[0] ?? null, error: null })
    b.single = () => Promise.resolve({ data: filas[0] ?? null, error: null })
    b.then = (ok: (r: unknown) => unknown, mal?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(ok, mal)
    const proxy: unknown = new Proxy(b, { get: (t, k) => (k in t ? t[k as string] : encadena()) })
    return proxy
  }
  return {
    from: consulta,
    rpc: (nombre: string) => Promise.resolve({ data: rpc[nombre] ?? null, error: null }),
  } as unknown as SupabaseClient
}

const Q = quincenaDe('2026-03-16')

const linea = (persona_id: string, x: Fila): Fila => ({
  persona_id, efectivo_redondeado: null, adelanto: 0, ya_transferido: 0, por_banco: 0,
  pagado_banco: null, pagado_efectivo: null, pagada_en: null, ...x,
})

function tablas(): Record<string, Fila[]> {
  return {
    persona_directorio: [
      { id: 'bazan', nombre_completo: 'BAZAN JUAN', en_la_empresa: false, puesto: null, fecha_ingreso: null, fecha_egreso: null, subcontrato_id: null },
      // CUADRILLA DE UN SUBCONTRATISTA: `plantelDeLaQuincena` la saca del plantel propio, pero en marzo se le pagó.
      { id: 'sub', nombre_completo: 'SUBCONTRATO PEREZ', en_la_empresa: false, puesto: null, fecha_ingreso: null, fecha_egreso: null, subcontrato_id: 'sc1' },
    ],
    persona_legajo: [
      { id: 'bazan', nombre_completo: 'BAZAN JUAN', cuil: null, convenio_colectivo: null, categoria: null, en_la_empresa: false },
      { id: 'sub', nombre_completo: 'SUBCONTRATO PEREZ', cuil: null, convenio_colectivo: null, categoria: null, en_la_empresa: false },
    ],
    // LA TARIFA DE HOY NO ES LA SELLADA: $4.000 vigente, $4.300 sellado.
    persona_tarifa: [{ persona_id: 'bazan', desde: '2026-01-01', valor_hora: 4000, neto_mensual: null, origen: 'hoy' }],
    // LAS HORAS DE HOY NO SON LAS SELLADAS: 8 vivas, 9 selladas.
    registros_hh: [{ id: 'r1', persona_id: 'bazan', fecha: '2026-03-17', horas: 8, tipo_hora: 'normal', notas: null, fuente_legacy: null, actualizado_por: 'u' }],
    liquidacion_quincena: [{
      id: 'q', grupo: 'obreros', estado: 'cerrada', cerrada_en: '2026-09-09T20:14:50Z', desde: Q.desde, hasta: Q.hasta,
      liquidacion_linea: [
        linea('bazan', { horas: 9, valor_hora: 4300, cobra: 38700, en_efectivo: 38700, total: 38700, pagado_banco: 0, pagado_efectivo: 38700 }),
        linea('sub', { horas: 10, valor_hora: 5000, cobra: 50000, en_efectivo: 50000, total: 50000 }),
      ],
    }],
  }
}

test('LA CERRADA SALE DE LO SELLADO, NO DE LA TARIFA NI DE LAS HORAS DE HOY (mutación M1)', async () => {
  const liq = await getLiquidacionDeLaQuincena(clienteFalso(tablas()), Q)
  assert.deepEqual(liq.errores, [])
  const obreros = liq.cuadros.find((c) => c.grupo === 'obreros')!
  const bazan = obreros.lineas.find((l) => l.personaId === 'bazan')!
  assert.equal(bazan.valorHora, 4300, 'MUTACIÓN M1: la tarifa vigente ($4.000) disfrazada de sellada')
  assert.equal(bazan.horas, 9, 'MUTACIÓN M1: las horas vivas (8) en una quincena cerrada')
  assert.equal(bazan.cobra, 38700, 'MUTACIÓN M1: 8 h × $4.000 = $32.000 en vez de lo sellado')
  assert.equal(bazan.sello?.valorHora, 4300, 'el «Se liquidó a» lee el sello')
  // LO PAGADO REGISTRADO DA SALDO 0; SIN REGISTRO, NO SE AFIRMA SALDO.
  assert.equal(bazan.pagoSinRegistrar, false)
  assert.equal(bazan.pago.saldoTotal, 0)
})

test('QUIEN TIENE LÍNEA SELLADA ESTÁ EN EL PLANTEL Y EN EL CUADRO, AUNQUE HOY NO SEA PLANTEL PROPIO (mutación M3)', async () => {
  const liq = await getLiquidacionDeLaQuincena(clienteFalso(tablas()), Q)
  assert.ok(liq.plantel.includes('sub'), 'MUTACIÓN M3: el plantel deja afuera a alguien pagado en esa quincena')
  const obreros = liq.cuadros.find((c) => c.grupo === 'obreros')!
  const sub = obreros.lineas.find((l) => l.personaId === 'sub')
  assert.ok(sub, 'su línea sellada está en el cuadro')
  assert.equal(sub!.cobra, 50000)
  // EL PIE = SUMA DE LO SELLADO.
  assert.equal(obreros.lineas.reduce((a, l) => a + (l.cobra ?? 0), 0), 88700)
  // SIN LO PAGADO REGISTRADO, NINGÚN SALDO QUE NADIE PUEDA PROBAR.
  assert.equal(sub!.pagoSinRegistrar, true)
  assert.equal(sub!.pago.saldoTotal, null, 'un saldo de $50.000 sobre una quincena cerrada sería una alarma sin prueba')
  assert.equal(sub!.pago.aPagarEfectivo, null)
})

test('LA ABIERTA SIGUE VIVA: con la cabecera abierta, la tarifa y las horas de hoy', async () => {
  const t = tablas()
  ;(t.liquidacion_quincena[0] as Fila).estado = 'abierta'
  const liq = await getLiquidacionDeLaQuincena(clienteFalso(t), Q)
  const bazan = liq.cuadros.find((c) => c.grupo === 'obreros')!.lineas.find((l) => l.personaId === 'bazan')!
  assert.equal(bazan.valorHora, 4000)
  assert.equal(bazan.horas, 8)
  assert.equal(bazan.sello, null)
  assert.equal(bazan.pagoSinRegistrar, false)
})
