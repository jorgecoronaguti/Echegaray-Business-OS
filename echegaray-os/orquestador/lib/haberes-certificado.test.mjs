// El certificado de haberes: la transcripción, la clasificación y el cargador idempotente.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  aCentavos, leerCertificadoCsv, verificarTotal, conClaves, clasificar, resumenPorClase, sumaCentavos,
  quincenaQuePaga, mesQuePaga, quincenaDelBloque,
  TOTAL_CERTIFICADO_2026_CENTAVOS, FILAS_CERTIFICADO_2026, FUENTE_CERTIFICADO_2026,
} from './haberes-certificado.mjs'
import { prepararCertificado, escribir, CSV_POR_DEFECTO } from '../scripts/haberes-certificado-cargar.mjs'

const CSV = readFileSync(new URL(`../../${CSV_POR_DEFECTO}`, import.meta.url), 'utf8')

test('la transcripción del certificado suma el IMPORTE TOTAL del pie: 127 acreditaciones, $43.587.035,27, 32 CUIL', () => {
  const f = leerCertificadoCsv(CSV)
  assert.equal(f.length, FILAS_CERTIFICADO_2026)
  assert.equal(sumaCentavos(f), 4_358_703_527)
  assert.equal(TOTAL_CERTIFICADO_2026_CENTAVOS, 4_358_703_527)
  assert.equal(new Set(f.map((x) => x.cuil)).size, 32)
})

test('los importes se leen en centavos exactos y lo ilegible se rechaza, no se redondea', () => {
  assert.equal(aCentavos('5190.74'), 519074)
  assert.equal(aCentavos('200000.00'), 20000000)
  assert.equal(aCentavos('1.5'), 150)
  assert.throws(() => aCentavos('1.234'))
  assert.throws(() => aCentavos('1,5'))
})

test('si falta una fila o cambia un centavo, el cargador se niega a escribir', () => {
  const lineas = CSV.trim().split('\n')
  const sinUna = lineas.slice(0, -1).join('\n')
  assert.throws(() => prepararCertificado(sinUna), /NO SE ESCRIBE/)
  const unCentavo = CSV.replace('2026-01-16;5190.74', '2026-01-16;5190.75')
  assert.notEqual(unCentavo, CSV)
  assert.throws(() => prepararCertificado(unCentavo), /NO SE ESCRIBE: la suma da 43587035.28/)
  assert.equal(verificarTotal(leerCertificadoCsv(CSV), { totalCentavos: TOTAL_CERTIFICADO_2026_CENTAVOS, filas: 127 }).ok, true)
})

test('reglas de fecha: la quincena calendario que paga el lote y el mes del mensual', () => {
  assert.deepEqual(quincenaQuePaga('2026-01-16'), { desde: '2026-01-01', hasta: '2026-01-15' })
  assert.deepEqual(quincenaQuePaga('2026-08-14'), { desde: '2026-08-01', hasta: '2026-08-15' })
  assert.deepEqual(quincenaQuePaga('2026-04-30'), { desde: '2026-04-16', hasta: '2026-04-30' })
  assert.deepEqual(quincenaQuePaga('2026-02-28'), { desde: '2026-02-16', hasta: '2026-02-28' })
  assert.equal(quincenaQuePaga('2026-03-22'), null, 'entre el 21 y el 24 la regla no contesta')
  assert.deepEqual(quincenaDelBloque('2026-05-04'), { desde: '2026-05-01', hasta: '2026-05-15' })
  assert.deepEqual(quincenaDelBloque('2026-08-17'), { desde: '2026-08-16', hasta: '2026-08-31' })
  assert.deepEqual(mesQuePaga('2026-01-13'), { desde: '2025-12-01', hasta: '2025-12-31' })
  assert.deepEqual(mesQuePaga('2026-07-01'), { desde: '2026-06-01', hasta: '2026-06-30' })
  assert.deepEqual(mesQuePaga('2026-07-31'), { desde: '2026-07-01', hasta: '2026-07-31' })
})

// ── clasificación con un padrón y una planilla chicos ─────────────────────────────────────────────
const P = (id, cuil, egreso = null, ingreso = '2025-01-01') => ({ id, cuil, fecha_egreso: egreso, fecha_ingreso: ingreso })
const J = (persona_id, pestana, d, h, por_banco = null, ya_transferido = null) =>
  ({ persona_id, pestana, quincena_desde: d, quincena_hasta: h, por_banco, ya_transferido })
const A = (cuil, fecha, pesos) => ({ nombre: 'X', cuil, fecha, centavos: Math.round(pesos * 100) })

const lote = (fecha, n, extra = []) => [...Array.from({ length: n }, (_, i) => A(`2000000000${i}`, fecha, 1000)), ...extra]
const loteP = (n) => Array.from({ length: n }, (_, i) => P(`l${i}`, `2000000000${i}`))

test('quincena al peso con la columna BANCO del bloque; adelanto con ADELANTO BANCO', () => {
  const [q, ad] = clasificar({
    acreditaciones: [A('20111111111', '2026-07-17', 252200), A('20111111111', '2026-08-28', 200000)],
    personas: [P('a', '20-11111111-1')],
    planilla: [J('a', 'Obreros 26', '2026-07-01', '2026-07-15', 252200),
      J('a', 'Obreros 26', '2026-08-17', '2026-08-31', 192887.48, 200000)],
  })
  assert.equal(q.clase, 'quincena'); assert.equal(q.periodo_desde, '2026-07-01'); assert.equal(q.confianza, 'coincide_planilla')
  assert.equal(ad.clase, 'adelanto_quincena'); assert.equal(ad.periodo_desde, '2026-08-16')
})

test('liquidación final sólo con fecha de egreso confirmada, pago posterior y dentro de 30 días', () => {
  const r = clasificar({
    acreditaciones: [A('20222222222', '2026-04-09', 575437.76), A('20333333333', '2026-08-13', 239790.94),
      A('20444444444', '2026-01-16', 40867.60), A('20555555555', '2026-05-06', 77600)],
    personas: [P('s', '20222222222', '2026-03-31'), P('n', '20333333333', null), P('v', '20444444444', '2025-12-03'),
      P('c', '20555555555', '2026-05-15')],
    planilla: [],
  })
  assert.deepEqual(r.map((x) => x.clase), ['liquidacion_final', 'a_confirmar', 'a_confirmar', 'a_confirmar'])
  assert.equal(r[0].periodo_desde, null, 'una final no paga ninguna quincena')
  assert.match(r[1].evidencia, /sin fecha de egreso/)
  assert.match(r[2].evidencia, /44 días/)
  assert.match(r[3].evidencia, /anterior a su baja/)
})

test('la coincidencia con la planilla gana a la final: el sueldo de enero de quien se fue el 28/01', () => {
  const [g] = clasificar({
    acreditaciones: [A('27432212950', '2026-02-05', 961729.11)],
    personas: [P('g', '27432212950', '2026-01-28')],
    planilla: [J('g', 'Oficina 26', '2026-01-16', '2026-01-31', 961729.11)],
  })
  assert.equal(g.clase, 'sueldo_mensual'); assert.equal(g.periodo_desde, '2026-01-01')
})

test('mensual sin coincidencia: regla de fecha, declarada; y fuera de su ventana en la empresa queda a confirmar', () => {
  const r = clasificar({
    acreditaciones: [A('20359232668', '2026-06-03', 1360865.60), A('20403679764', '2026-01-13', 1000)],
    personas: [P('m', '20359232668'), P('jp', '20403679764', null, '2026-02-07')],
    planilla: [J('m', 'Oficina 26', '2026-06-01', '2026-06-15'), J('jp', 'Oficina 26', '2026-06-01', '2026-06-15')],
  })
  assert.equal(r[0].clase, 'sueldo_mensual'); assert.equal(r[0].periodo_desde, '2026-05-01'); assert.equal(r[0].confianza, 'regla_fecha')
  assert.equal(r[1].clase, 'a_confirmar')
})

test('por lote: figura en el bloque aunque la planilla anote otro banco; suelto o fuera del bloque, a confirmar', () => {
  const r = clasificar({
    acreditaciones: lote('2026-04-30', 5, [A('20382188153', '2026-04-30', 394700), A('20341935351', '2026-04-30', 40867.60)]),
    personas: [...loteP(5), P('al', '20382188153'), P('co', '20341935351')],
    planilla: [J('al', 'Obreros 26', '2026-04-16', '2026-04-30', 317100)],
  })
  const al = r.find((x) => x.cuil === '20382188153')
  const co = r.find((x) => x.cuil === '20341935351')
  assert.equal(al.clase, 'quincena'); assert.equal(al.confianza, 'regla_fecha'); assert.match(al.evidencia, /317100/)
  assert.equal(co.clase, 'a_confirmar'); assert.match(co.evidencia, /no figura en el bloque/)
})

test('un CUIL que no está en el padrón se guarda sin persona y no se clasifica', () => {
  const [x] = clasificar({ acreditaciones: [A('20999999999', '2026-07-17', 1)], personas: [], planilla: [] })
  assert.equal(x.persona_id, null); assert.equal(x.clase, 'a_confirmar'); assert.match(x.evidencia, /no está en el padrón/)
})

test('dos giros idénticos el mismo día a la misma persona son dos claves, no una', () => {
  const [a, b] = conClaves([A('20111111111', '2026-01-16', 1), A('20111111111', '2026-01-16', 1)], FUENTE_CERTIFICADO_2026)
  assert.notEqual(a.clave, b.clave)
})

// ── el cargador contra una base falsa que imita la UNIQUE (clave) y el upsert ────────────────────
function baseFalsa({ conUnique = true } = {}) {
  const filas = []
  return {
    filas,
    async query(sql, params) {
      if (/^\s*insert/i.test(sql)) {
        const [cuil, , fecha, centavos, , clase, , , , , fuente, clave] = params
        const i = conUnique ? filas.findIndex((f) => f.clave === clave) : -1
        const fila = { cuil, fecha, centavos: Number(centavos), clase, fuente, clave }
        if (i >= 0) filas[i] = fila; else filas.push(fila)
        return { rowCount: 1 }
      }
      if (/^\s*delete/i.test(sql)) {
        const [fuente, claves] = params
        let n = 0
        for (let i = filas.length - 1; i >= 0; i--) {
          if (filas[i].fuente === fuente && !claves.includes(filas[i].clave)) { filas.splice(i, 1); n++ }
        }
        return { rowCount: n }
      }
      const de = filas.filter((f) => f.fuente === params[0])
      return { rows: [{ n: de.length, centavos: de.reduce((s, f) => s + f.centavos, 0) }] }
    },
  }
}

const clasificadasDelCertificado = (cert) => cert.acreditaciones.map((a) => ({
  ...a, persona_id: null, clase: 'a_confirmar', periodo_desde: null, periodo_hasta: null, confianza: null, evidencia: 't',
}))

test('correr el cargador dos veces no duplica: 127 filas y $43.587.035,27 las dos veces', async () => {
  const cert = prepararCertificado(CSV)
  const db = baseFalsa()
  const c = clasificadasDelCertificado(cert)
  const r1 = await escribir(db, cert, c)
  const r2 = await escribir(db, cert, c)
  assert.deepEqual([r1.filas, r2.filas], [127, 127])
  assert.equal(db.filas.length, 127)
  assert.equal(r2.centavos, 4_358_703_527)
})

test('si la escritura duplicara (sin UNIQUE), la relectura lo detecta y tira: la transacción se deshace', async () => {
  const cert = prepararCertificado(CSV)
  const db = baseFalsa({ conUnique: false })
  const c = clasificadasDelCertificado(cert)
  await escribir(db, cert, c)
  await assert.rejects(() => escribir(db, cert, c), /la base quedó con 254 filas/)
})

test('una carga vieja de la misma fuente con otra clave se borra: el certificado es la foto entera', async () => {
  const cert = prepararCertificado(CSV)
  const db = baseFalsa()
  db.filas.push({ cuil: '20000000000', fecha: '2026-01-01', centavos: 100, clase: 'x', fuente: cert.fuente, clave: 'vieja' })
  const r = await escribir(db, cert, clasificadasDelCertificado(cert))
  assert.equal(r.borradas, 1); assert.equal(r.filas, 127)
})

test('sobre el certificado real, las clases suman el total (el resumen no pierde ni inventa plata)', () => {
  const cert = prepararCertificado(CSV)
  const r = resumenPorClase(clasificadasDelCertificado(cert))
  assert.equal(Object.values(r).reduce((s, x) => s + x.centavos, 0), TOTAL_CERTIFICADO_2026_CENTAVOS)
})
