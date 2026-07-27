import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extraerPredicciones, registrarFoto, FUENTES } from './registro-aprendizaje.mjs'

// ─── Fotos de ejemplo con la forma REAL que produce cada motor ───────────────

const fotoModelo = {
  fecha: '26/07/2026',
  disponible: { estado: 'ok', caja_hoy: 1000000, cobranzas_por_cobrar_mes: 500000, cobranzas_vencidas: 200000, vencimientos_7dias: 1500000, proyeccion_7dias: -300000 },
  comprometido: { estado: 'ok', saldo_total: 8000000, vencido: 4700000 },
  deuda_comercial: { estado: 'ok', vencido: 5351225 },
  colchon_total: -900000,
}

const fotoPlan = {
  fecha: '26/07/2026', estado: 'ok',
  posicion: { colchon_total: -900000, vencido_fiscal: 4700000, vencido_comercial: 5351225 },
  horizontes: {
    dias_7: { resumen: { saldo_proyectado_final: -1200000, costo_financiero_total: 45000, linea_maxima_usada: 3000000 } },
    dias_30: { resumen: { saldo_proyectado_final: 500000, costo_financiero_total: 120000, linea_maxima_usada: 6000000 } },
  },
}

const fotoEstrategia = {
  fecha: '26/07/2026', estado: 'ok',
  horizonte_gobernante: { clave: 'dias_7', titulo: 'Próximos 7 días' },
  diagnostico_liquidez: { colchon_total: -900000 },
  costo_financiero_esperado: 45000,
  eleccion: { elegida: 'cubrir_bache_con_descubierto' },
  nivel_confianza: { nivel: 'medio' },
}

const fotoCalendario = {
  desde: '2026-07-26', hasta: '2026-07-28', caja_inicial: 1000000,
  dias: [
    { fecha: '2026-07-26', saldo_final: 1000000, ingresos: 0, egresos: 0, riesgo: 'bajo' },
    { fecha: '2026-07-27', saldo_final: -500000, ingresos: 0, egresos: 1500000, riesgo: 'alto' },
    { fecha: '2026-07-28', saldo_final: -500000, ingresos: 0, egresos: 0, riesgo: 'alto' },
  ],
  // El payload real trae también el modelo adentro: NO debe re-extraerse (una-fuente).
  modelo: fotoModelo,
  recomendaciones: [{ prioridad: 'alta', titulo: 'x' }],
}

// ─── Núcleo puro: qué se extrae de cada foto ─────────────────────────────────

test('del MODELO saca la posición de hoy y los baches, con horizonte donde corresponde', () => {
  const ps = extraerPredicciones('modelo', fotoModelo)
  const byM = Object.fromEntries(ps.map((p) => [p.metrica, p]))
  assert.equal(byM.caja_hoy.valor, 1000000)
  assert.equal(byM.colchon_total.valor, -900000)
  assert.equal(byM.vencimientos_7dias.horizonte, 'dias_7')
  assert.equal(byM.proyeccion_7dias.valor, -300000) // un negativo se preserva tal cual
  assert.equal(byM.cobranzas_por_cobrar_mes.horizonte, 'mes')
  assert.equal(byM.deuda_comercial_vencida.valor, 5351225)
  assert.ok(ps.every((p) => p.clave.startsWith('modelo:')))
})

test('un bloque del modelo en "sin dato" congela la métrica en NULL, nunca inventa un número', () => {
  const foto = { ...fotoModelo, disponible: { estado: 'sin dato', motivo: 'sin acceso al Sheet' } }
  const ps = extraerPredicciones('modelo', foto)
  const caja = ps.find((p) => p.metrica === 'caja_hoy')
  assert.equal(caja.valor, null)
  assert.equal(caja.estado, 'sin_dato')
  // El colchón no depende de ese bloque: sigue con su valor real.
  assert.equal(ps.find((p) => p.metrica === 'colchon_total').valor, -900000)
})

test('del PLAN saca la posición global y, por horizonte, saldo proyectado y costo financiero', () => {
  const ps = extraerPredicciones('plan', fotoPlan, { horizonte: 'dias_7' })
  const pos = ps.find((p) => p.metrica === 'colchon_total' && p.clave === 'plan:colchon_total')
  assert.equal(pos.valor, -900000)
  assert.equal(pos.horizonte, 'dias_7') // hereda el horizonte pedido en la corrida
  const s30 = ps.find((p) => p.clave === 'plan:dias_30:saldo_proyectado_final')
  assert.equal(s30.valor, 500000)
  assert.equal(s30.horizonte, 'dias_30')
  assert.ok(ps.find((p) => p.clave === 'plan:dias_7:costo_financiero_total').valor === 45000)
})

test('de la ESTRATEGIA congela lo medible y la estrategia elegida como predicción categórica', () => {
  const ps = extraerPredicciones('estrategia', fotoEstrategia)
  const costo = ps.find((p) => p.metrica === 'costo_financiero_esperado')
  assert.equal(costo.valor, 45000)
  assert.equal(costo.horizonte, 'dias_7')
  const elegida = ps.find((p) => p.metrica === 'estrategia_elegida')
  assert.equal(elegida.unidad, 'texto')
  assert.equal(elegida.valor, null) // texto: el valor vive en detalle, no se fuerza un número
  assert.equal(elegida.estado, 'ok') // texto con detalle NO es un gap
  assert.equal(elegida.detalle.elegida, 'cubrir_bache_con_descubierto')
})

test('del CALENDARIO saca el saldo proyectado por CADA día concreto, con su fecha_objetivo', () => {
  const ps = extraerPredicciones('calendario', fotoCalendario)
  const dias = ps.filter((p) => p.metrica === 'saldo_final_proyectado')
  assert.equal(dias.length, 3)
  const d27 = dias.find((p) => p.fecha_objetivo === '2026-07-27')
  assert.equal(d27.valor, -500000)
  assert.equal(d27.detalle.egresos, 1500000)
  // NO re-extrae el modelo que viene dentro del payload (una-fuente: eso lo registra fuente 'modelo').
  assert.ok(ps.every((p) => p.clave.startsWith('calendario:')))
  assert.ok(!ps.some((p) => p.metrica === 'caja_hoy'))
})

// ─── Idempotencia por corrida ────────────────────────────────────────────────

test('extraer es determinista: la misma foto da exactamente la misma lista', () => {
  for (const [fuente, foto] of [['modelo', fotoModelo], ['plan', fotoPlan], ['estrategia', fotoEstrategia], ['calendario', fotoCalendario]]) {
    const a = extraerPredicciones(fuente, foto)
    const b = extraerPredicciones(fuente, foto)
    assert.deepEqual(a, b)
  }
})

test('dentro de una corrida las claves son ÚNICAS: no hay dos predicciones que colisionen', () => {
  for (const [fuente, foto] of [['modelo', fotoModelo], ['plan', fotoPlan], ['estrategia', fotoEstrategia], ['calendario', fotoCalendario]]) {
    const claves = extraerPredicciones(fuente, foto).map((p) => p.clave)
    assert.equal(new Set(claves).size, claves.length, `claves duplicadas en ${fuente}`)
  }
})

// ─── Fotos degradadas: se registra el hueco, no un cuadro de ceros ───────────

test('foto en "sin dato" (contrato del motor) se congela como UN gap, no como ceros inventados', () => {
  const ps = extraerPredicciones('plan', { estado: 'sin dato', motivo: 'no se pudo armar el calendario' })
  assert.equal(ps.length, 1)
  assert.equal(ps[0].metrica, '_foto')
  assert.equal(ps[0].estado, 'sin_dato')
  assert.equal(ps[0].valor, null)
  assert.match(ps[0].detalle.motivo, /calendario/)
})

test('foto ausente se registra como sin_foto: también es historia', () => {
  const ps = extraerPredicciones('estrategia', null)
  assert.equal(ps.length, 1)
  assert.equal(ps[0].estado, 'sin_foto')
})

test('una fuente desconocida es un error de programación, no un registro silencioso', () => {
  assert.throws(() => extraerPredicciones('inventada', {}), /fuente desconocida/)
})

// ─── Borde con I/O: append-only e idempotencia por corrida contra un fake ────

function fakeDb() {
  const rows = []
  return {
    rows,
    query: async (sql, params) => {
      // Sólo entiende el INSERT ... ON CONFLICT (corrida_id, clave) DO NOTHING de esta capa.
      const [corrida_id, fuente, clave] = params
      const existe = rows.some((r) => r.corrida_id === corrida_id && r.clave === clave)
      if (!existe) rows.push({ corrida_id, fuente, clave, valor: params[6], estado: params[8], calculado_en: params[10] })
      return { rows: [] }
    },
  }
}

test('registrarFoto es append-only: re-registrar la MISMA corrida no duplica ni pisa', async () => {
  const db = fakeDb()
  const r1 = await registrarFoto(db, { fuente: 'modelo', foto: fotoModelo, corridaId: 'c-1', calculadoEn: '2026-07-26T10:00:00Z' })
  const n = db.rows.length
  assert.equal(r1.n_predicciones, n)
  const r2 = await registrarFoto(db, { fuente: 'modelo', foto: fotoModelo, corridaId: 'c-1', calculadoEn: '2026-07-26T10:00:00Z' })
  assert.equal(db.rows.length, n, 're-registrar la misma corrida no agrega filas')
  assert.equal(r2.corrida_id, 'c-1')
})

test('dos corridas distintas del mismo motor CONVIVEN: eso es el histórico', async () => {
  const db = fakeDb()
  await registrarFoto(db, { fuente: 'modelo', foto: fotoModelo, corridaId: 'c-1' })
  const n = db.rows.length
  await registrarFoto(db, { fuente: 'modelo', foto: { ...fotoModelo, colchon_total: -1 }, corridaId: 'c-2' })
  assert.equal(db.rows.length, 2 * n, 'una corrida nueva no pisa la anterior')
  const colchones = db.rows.filter((r) => r.clave === 'modelo:colchon_total').map((r) => r.valor)
  assert.deepEqual(colchones.sort((a, b) => a - b), [-900000, -1].sort((a, b) => a - b))
})

test('sin corridaId, registrarFoto mina uno nuevo por llamada', async () => {
  const db = fakeDb()
  const a = await registrarFoto(db, { fuente: 'estrategia', foto: fotoEstrategia })
  const b = await registrarFoto(db, { fuente: 'estrategia', foto: fotoEstrategia })
  assert.notEqual(a.corrida_id, b.corrida_id)
})

test('registrar una foto sin dato deja el gap y reporta estado_foto sin_dato', async () => {
  const db = fakeDb()
  const r = await registrarFoto(db, { fuente: 'plan', foto: { estado: 'sin dato', motivo: 'x' }, corridaId: 'c-1' })
  assert.equal(r.estado_foto, 'sin_dato')
  assert.equal(db.rows.length, 1)
})

test('FUENTES son exactamente las cuatro del motor', () => {
  assert.deepEqual([...FUENTES].sort(), ['calendario', 'estrategia', 'modelo', 'plan'])
})
