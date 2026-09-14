// LA COLUMNA `Vencido` DABA CERO TENIENDO COBRANZAS VENCIDAS — EL TEST QUE LO ATRAPA.
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE (14/08/2026) ═══
//
// El dueño: *"la columna de 'vencido' … esta contemplando mal … si hay cobranzas q estan vencidas"*.
// Una auditoría anterior había dado la columna por buena razonando sobre el dato equivocado
// —"ninguna de las 44 pendientes tiene fecha anterior a hoy"— y tenía razón EN ESE DATO: la `Fecha
// cobro` de una fila pendiente es la fecha en que se espera cobrar, y se re-escribe cada vez que
// pasa. Medir contra ella es preguntarle al deudor cuándo piensa pagar y creerle todos los días.
//
// LOS TESTS DE ACÁ NO MIRAN LA FORMA DE LA FÓRMULA: la EVALÚAN sobre las 91 filas reales de
// Cobranzas (`cobranzas-fixture.mjs`) y comparan NÚMEROS. Es la única manera de que "vuelve a dar
// cero" se ponga rojo: una aserción de texto sobre la fórmula pasa igual con el reloj equivocado.
//
// ═══ 14/09/2026: LA REGLA DE LA PESTAÑA CAMBIÓ ═══
//
// El dueño: «vencido» = «col q», y «Sí, misma regla en OBRAS». La columna `Vencido` de OBRAS ahora
// es la columna U de Cobranzas (Pendiente y Q < hoy). Los tests de la grilla la EVALÚAN sobre la foto
// y la comparan contra el gemelo `estadoDeCobro`, que es otra implementación de la misma regla.
//
// MUTACIÓN PROBADA: volver `obras-grilla.mjs` a `critVencido(abierto(cob, 'fechaEmision'), …)` pone
// rojos los tres tests de «LA COLUMNA U EN OBRAS». Los tests de reparto por antigüedad de abajo
// prueban las funciones puras de este archivo, que ya no deciden qué está vencido.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PLAZO_COBRO_DIAS, TRAMOS_ANTIGUEDAD, diasDeAtraso, tramoDe, repartirPorAntiguedad,
  critPorVencer, critVencido, critTramo,
} from './cobranzas-vencido.mjs'
import { grillaObras, REFS_OBRAS, ANO, serialISO } from './obras-grilla.mjs'
import { comoHoja, FILAS, COLUMNAS } from './cobranzas-fixture.mjs'
import { evaluarFormula, hojaDeGrilla } from './evaluar-formula-sheet.mjs'
import { OBRAS_FUTURAS } from './obras-datos.mjs'
import { estadoDeCobro } from './cobranza-estado-de-cobro.mjs'

/** El día del pedido del dueño. Se fija: un test que depende de la fecha de hoy caduca solo. */
const HOY = new Date(Date.UTC(2026, 7, 14))
const TC = 1492.283

const g = grillaObras({ obras: OBRAS_FUTURAS, clientes: ['LA ESTRELLA /ALIMENTOS DEL SUR SAS', 'San Francisco', 'MESSINA', 'ARCOR', 'Quattropani - Melisa García SAS', 'LIRIO DANIEL RAMIRO', 'ADDATO', 'MACRO CONSTRUCCIONES SRL'] })
const cel = (ref) => {
  const [, L, n] = /^([A-Z]+)(\d+)$/.exec(ref)
  return g.filas[Number(n) - 1]['ABCDEFGHI'.indexOf(L)]
}
const val = (ref) => evaluarFormula(String(cel(ref)), {
  hoja: hojaDeGrilla(g.filas), hojas: { Cobranzas: comoHoja() }, nombres: { TIPO_CAMBIO_USD: TC }, hoy: HOY,
})
/** La misma celda evaluada con otro «hoy»: la foto es del 14/08 y ese día nada Pendiente tenía Q pasada. */
const valEn = (ref, hoy) => evaluarFormula(String(cel(ref)), {
  hoja: hojaDeGrilla(g.filas), hojas: { Cobranzas: comoHoja() }, nombres: { TIPO_CAMBIO_USD: TC }, hoy,
})
const redondo = (x) => Math.round(Number(x) * 100) / 100
/** Serial de Sheets → `YYYY-MM-DD`. */
const isoDeSerial = (s) => new Date(Date.UTC(1899, 11, 30) + Number(s) * 86_400_000).toISOString().slice(0, 10)

/** La foto, leída por NOMBRE de columna: contar comas se rompe cuando entra una columna nueva. */
const col = (f, L) => f[1 + COLUMNAS.indexOf(L)]

/** Las cobranzas PENDIENTES de la foto, con el mismo universo que la pestaña. */
const pendientes = FILAS.filter((f) => !['Cobrado', 'CANCELAR'].includes(String(col(f, 'O')).trim())
  && Number(col(f, 'Q')) >= serialISO(`${ANO}-01-01`) && Number(col(f, 'Q')) <= serialISO(`${ANO}-12-31`))

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL DEFECTO, MEDIDO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('EL RELOJ VIEJO ESTABA CONDENADO A CERO: ninguna pendiente tiene fecha de COBRO ya pasada', () => {
  // Esto es lo que veía el auditor que dio la columna por buena, y es cierto. Lo que no es cierto es
  // la conclusión: que la fecha de cobro no haya pasado NO significa que no haya deuda vencida — la
  // fecha de cobro de una fila pendiente se corre hacia adelante y por construcción nunca queda atrás.
  const hoySerial = serialISO('2026-08-14')
  const conFechaPasada = pendientes.filter((f) => Number(col(f, 'Q')) > 0 && Number(col(f, 'Q')) < hoySerial)
  assert.equal(conFechaPasada.length, 0, 'con el reloj viejo la columna no puede dar otra cosa que cero')
  assert.equal(pendientes.length, 44, 'y sin embargo hay 44 cobranzas pendientes')
})

test('(regla del 14/08, retirada) el reparto por emisión + 30 sobre la foto: 10 filas por $50.594.878', () => {
  // La misma foto, medida desde la fecha de EMISIÓN más el plazo. La deuda más vieja se emitió el
  // 31/12/2024 (MESSINA, "PLANTA DE BSA - 26M3 A FAVOR H-17") y su fecha de cobro dice 06/09/2026.
  const r = repartirPorAntiguedad(
    pendientes.map((f) => ({ emision: Number(col(f, 'C')), importe: Number(col(f, 'M')) })),
    serialISO('2026-08-14'),
  )
  assert.equal(redondo(r.vencido), 50_594_877.83, 'lo vencido')
  assert.equal(redondo(r.total), 357_487_077.82, 'sobre el total pendiente que publica la pestaña')
  assert.equal(r.sinFecha, 0, 'ninguna pendiente sin fecha de emisión: el reparto es completo')
  assert.equal(redondo(r.porVencer + r.vencido), redondo(r.total), 'los tramos reparten TODO')
  // Y el reparto por antigüedad, que es lo que decide a quién se le reclama primero.
  assert.deepEqual(Object.fromEntries(Object.entries(r.tramos).map(([k, v]) => [k, redondo(v)])), {
    '1–30': 31_174_127.01, '31–60': 3_488_735, '61–90': 0, '+90': 15_932_015.83,
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA COLUMNA U EN OBRAS (dueño, 14/09/2026: «Sí, misma regla en OBRAS»)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Lo vencido de la foto según el GEMELO, en el año de la pestaña. Otra implementación de la regla. */
function vencidoSegunGemelo(hoy) {
  const filas = FILAS.filter((f) => Number(col(f, 'Q')) > 0
    && estadoDeCobro(col(f, 'O'), isoDeSerial(col(f, 'Q')), hoy) === 'vencido'
    && isoDeSerial(col(f, 'Q')).startsWith(String(ANO)))
  const plata = filas.reduce((s, f) => s + Number(col(f, 'M')) * (col(f, 'AA') === 'USD' ? TC : 1), 0)
  return { n: filas.length, plata }
}

test('LA COLUMNA U EN OBRAS: el 14/08 la foto no tiene nada Pendiente con Q pasada, y la pestaña dice 0', () => {
  // Con emisión + 30 esta celda daba $50.594.877,83: si alguien vuelve al reloj de la emisión, rojo.
  assert.equal(vencidoSegunGemelo('2026-08-14').n, 0)
  assert.equal(redondo(val(`G${g.fAno}`)), 0)
})

test('LA COLUMNA U EN OBRAS: el 01/09 la celda del año es exactamente lo que dice el gemelo', () => {
  const esperado = vencidoSegunGemelo('2026-09-01')
  assert.equal(esperado.n, 14, 'la foto cambió: sin filas vencidas este test no prueba nada')
  assert.equal(redondo(valEn(`G${g.fAno}`, new Date(Date.UTC(2026, 8, 1)))), redondo(esperado.plata))
  // Un Facturado con Q pasada no entra: la foto tiene uno, y la regla sólo vence lo Pendiente.
  const facturada = FILAS.find((f) => col(f, 'O') === 'Facturado')
  assert.ok(facturada, 'la foto dejó de tener una fila Facturado')
  assert.equal(estadoDeCobro('Facturado', isoDeSerial(col(facturada, 'Q')), '2027-01-01'), 'otro')
})

test('LA COLUMNA U EN OBRAS: las obras no suman más que el año, que sale de la fuente entera', () => {
  // Las obras declaradas son un subconjunto de lo que se factura: MESSINA vende trabajos fuera de sus
  // obras. Si el año sumara las obras, el vencido bajaría solo cada vez que una obra sale de la lista.
  const hoy = new Date(Date.UTC(2026, 8, 1))
  const enObras = g.bloques.reduce((s, b) => s + valEn(`G${b.fProt}`, hoy), 0)
  assert.ok(enObras > 0, 'ninguna obra con vencido el 01/09: el reparto no se probó')
  assert.ok(valEn(`G${g.fAno}`, hoy) >= enObras - 1, 'las obras publican más vencido que el año')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LAS PIEZAS DEL CRITERIO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('el plazo es el que el propio Cobranzas usa en sus fórmulas: 30 días', () => {
  // No es una política inventada acá. Siete de las 44 filas pendientes derivan su fecha de cobro como
  // `=P+30`. Si algún día el archivo declara un plazo por cliente, esta constante se retira.
  assert.equal(PLAZO_COBRO_DIAS, 30)
  assert.equal(diasDeAtraso(100, 140), 10, 'emitida el día 100, hoy 140: 10 días de atraso')
  assert.equal(diasDeAtraso(100, 130), 0, 'justo el día del vencimiento todavía no está vencida')
  assert.equal(diasDeAtraso(100, 120), -10)
})

test('los tramos NO dejan un hueco ni se solapan: un día no puede caer en dos ni en ninguno', () => {
  // Un borde mal puesto no da error: mueve plata de un tramo a otro y el total sigue cerrando, que
  // es como un cuadro de antigüedad miente sin que nadie lo note.
  assert.equal(tramoDe(0), null, 'el día del vencimiento todavía no está vencido')
  assert.equal(tramoDe(-5), null)
  const vistos = new Map()
  for (let d = 1; d <= 400; d++) {
    const t = tramoDe(d)
    assert.ok(t !== null, `${d} días de atraso no cae en ningún tramo`)
    vistos.set(t, (vistos.get(t) ?? 0) + 1)
  }
  assert.deepEqual([...vistos.keys()], TRAMOS_ANTIGUEDAD.map((t) => t.clave), 'los cuatro, en orden')
  assert.equal(tramoDe(30), '1–30')
  assert.equal(tramoDe(31), '31–60')
  assert.equal(tramoDe(90), '61–90')
  assert.equal(tramoDe(91), '+90')
  assert.equal(tramoDe(10_000), '+90', 'el último tramo es abierto: nada se cae por arriba')
})

test('UNA FILA SIN FECHA DE EMISIÓN NO SE CUENTA COMO VENCIDA DESDE 1899: sale aparte y se declara', () => {
  // Una celda de fecha vacía vale 0, y 0 es menor que cualquier corte. Sin la guarda, una fila que
  // alguien cargue mañana sin fecha aparecería como la deuda más vieja de la empresa — y el importe
  // sería real, así que el número se leería como un hallazgo.
  const r = repartirPorAntiguedad([
    { emision: 0, importe: 1_000_000 },
    { emision: 46_000, importe: 500_000 },
  ], 46_248)
  assert.equal(r.sinFecha, 1_000_000, 'se cuenta aparte, con nombre')
  assert.equal(r.vencido, 500_000, 'y no engorda la alarma')
  assert.equal(r.total, 1_500_000)
  assert.notEqual(r.porVencer + r.vencido, r.total, 'el cuadro NO cierra: es lo que hace abortar al escritor')
  // Y la fórmula del Sheet lleva la misma guarda, en los dos criterios que podrían levantarla.
  assert.ok(critVencido('X:X').includes('X:X;">"&0'), 'lo vencido exige emisión > 0')
  assert.ok(critTramo('X:X', { desde: 90, hasta: null }).includes('X:X;">"&0'), 'y el tramo abierto también')
})

test('los criterios salen en locale es-AR y con TODAY() adentro: la cartera envejece sola', () => {
  // Si el corte se tipeara en el generador, la cartera sólo envejecería cuando alguien se acuerde de
  // correrlo — o sea, nunca el día que importa. Y una coma en vez de `;` no da un número mal: da
  // "Formula parse error" y la celda queda en #ERROR! en la cara del dueño.
  for (const c of [critPorVencer('X:X'), critVencido('X:X'), ...TRAMOS_ANTIGUEDAD.map((t) => critTramo('X:X', t))]) {
    assert.ok(c.startsWith(';'), 'el fragmento se pega dentro de un SUMIFS ya empezado')
    assert.ok(c.includes('TODAY()'), 'el corte lo calcula Sheets, no el generador')
    assert.ok(!/,/.test(c), 'ninguna coma: en es-AR el separador es `;`')
  }
  assert.equal(critPorVencer('X:X', 30), ';X:X;">="&(TODAY()-30)')
  assert.equal(critTramo('X:X', TRAMOS_ANTIGUEDAD[1], 30), ';X:X;"<"&(TODAY()-60);X:X;">="&(TODAY()-90)')
})

test('la pestaña mide lo vencido con la columna U: estado Pendiente y fecha de COBRO, nunca la emisión', () => {
  // 07/09/2026: «Vencido» está en la G. Las filas que se recorren son las OBRAS más el cierre del año.
  // 14/09/2026: la regla pasó de emisión + 30 a la columna U de Cobranzas, por decisión del dueño.
  const ref = (L) => `'Cobranzas'!$${L}$${REFS_OBRAS.cob.desde}:$${L}`
  const filas = [g.fAno, ...g.bloques.map((b) => b.fProt)]
  assert.ok(filas.length > 1, 'hay obras y hay cierre de año: si no, este test no prueba nada')
  for (const f of filas) {
    const v = String(cel(`G${f}`))
    assert.ok(v.includes(`${ref(REFS_OBRAS.cob.estado)};"Pendiente"`), `G${f}: sólo vence lo Pendiente`)
    assert.ok(v.includes(`${ref(REFS_OBRAS.cob.fechaCobro)};"<"&TODAY()`), `G${f}: el corte es la fecha de cobro`)
    assert.ok(!v.includes(`$${REFS_OBRAS.cob.fechaEmision};"<"&(TODAY()-`), `G${f}: volvió el reloj de la emisión`)
  }
})
