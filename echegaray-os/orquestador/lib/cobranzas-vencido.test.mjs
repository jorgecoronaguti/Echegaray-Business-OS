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
// PARA VERIFICAR QUE ESTE TEST SIRVE: cambiar en `obras-grilla.mjs` el `critVencido(…fechaEmision…)`
// por el criterio viejo (`;fechaCobro;"<"&TODAY()`) y correrlo. Tiene que ponerse rojo diciendo que
// la columna publica $0 con 10 cobranzas vencidas en la fuente.

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
const redondo = (x) => Math.round(Number(x) * 100) / 100

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

test('CON EL RELOJ CORRECTO HAY 10 COBRANZAS VENCIDAS POR $50.594.878 — el número que el dueño sabía', () => {
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

test('LA COLUMNA `Vencido` DE LA PESTAÑA YA NO PUBLICA CERO: se evalúa la fórmula sobre la foto', () => {
  // ═══ ÉSTE ES EL TEST QUE SE PONE ROJO SI ALGUIEN REVIERTE EL ARREGLO ═══
  //
  // No mira el texto de la fórmula: la CORRE sobre las 91 filas reales. Con el criterio viejo
  // (`fechaCobro < TODAY()`) las nueve celdas dan 0 y este test falla en la primera aserción.
  const filasCliente = []
  for (let f = g.fClientes[0]; f <= g.fClientes[1]; f++) filasCliente.push(f)
  const porCliente = Object.fromEntries(filasCliente.map((f) => [String(cel(`A${f}`)), redondo(val(`F${f}`))]))
  const total = filasCliente.reduce((s, f) => s + val(`F${f}`), 0)
  assert.ok(total > 0, `LA COLUMNA VENCIDO VOLVIÓ A DAR CERO teniendo ${pendientes.length} cobranzas pendientes `
    + 'y 10 vencidas en la fuente — el reloj está midiendo contra la fecha equivocada otra vez')
  assert.equal(redondo(total), 50_594_877.83, 'y es exactamente lo que la fuente dice que está vencido')
  // A QUIÉN RECLAMARLE, que es para lo que sirve la columna. Los cuatro clientes con deuda vencida:
  assert.deepEqual(porCliente, {
    'LA ESTRELLA /ALIMENTOS DEL SUR SAS': 8_234_758.25,
    'San Francisco': 0,
    MESSINA: 24_910_816.27,
    ARCOR: 17_449_303.31,
    'Quattropani - Melisa García SAS': 0,
    'LIRIO DANIEL RAMIRO': 0,
    ADDATO: 0,
    'MACRO CONSTRUCCIONES SRL': 0,
  })
})

test('EL TITULAR DE CARTERA CIERRA CONTRA LA "Resta" DEL CUADRO DE CLIENTES, POR OTRO CAMINO', () => {
  // Los cinco tramos filtran por fecha de emisión; la Resta se calcula como "todo lo no cancelado
  // menos lo cobrado". Dos rutas independientes al mismo número: si difieren, hay una cobranza que
  // no cayó en ningún tramo, y el escritor aborta antes de publicar dos carteras distintas.
  const f = g.fCartera
  const tramos = ['C', 'D', 'E', 'F', 'G'].map((c) => val(`${c}${f}`))
  assert.equal(redondo(val(`I${f}`)), redondo(tramos.reduce((s, x) => s + x, 0)), 'el total es la suma de sus tramos')
  assert.equal(redondo(val(`I${f}`)), redondo(val(`E${g.fTotClientes}`)), 'y da la Resta del cuadro de clientes')
  assert.equal(redondo(val(`I${f}`)), 357_487_077.82)
  // El % que publica la B es el de lo vencido sobre el total: la cifra que decide si hay problema.
  assert.equal(redondo(val(`B${f}`) * 100), 14.15, '14,15% de la cartera está vencida')
})

test('LA SUMA DE LO VENCIDO POR CLIENTE ES LO VENCIDO DE LA CARTERA: los dos cuadros no se contradicen', () => {
  // Dos cuadros de la misma pestaña que publican el mismo hecho con fórmulas distintas. Si uno filtra
  // por cliente y el otro no, un cliente que la lista derivada no supiera ubicar los haría diferir —
  // y el lector tendría dos números y ninguna forma de saber cuál creer.
  let porCliente = 0
  for (let f = g.fClientes[0]; f <= g.fClientes[1]; f++) porCliente += val(`F${f}`)
  const enCartera = ['D', 'E', 'F', 'G'].reduce((s, c) => s + val(`${c}${g.fCartera}`), 0)
  assert.equal(redondo(porCliente), redondo(enCartera))
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

test('la pestaña cita la fecha de EMISIÓN y NUNCA la de cobro para decidir si algo está vencido', () => {
  // El defecto original, fijado como regla: si alguien vuelve a apuntar la alarma a la fecha de
  // cobro, la columna vuelve a dar cero y ninguna aserción de número lo diría tan claro como ésta.
  const emision = `'Cobranzas'!$${REFS_OBRAS.cob.fechaEmision}$${REFS_OBRAS.cob.desde}`
  for (let f = g.fClientes[0]; f <= g.fClientes[1]; f++) {
    const v = String(cel(`F${f}`))
    assert.ok(v.includes(`${emision}:$${REFS_OBRAS.cob.fechaEmision};"<"&(TODAY()-${PLAZO_COBRO_DIAS})`),
      `F${f}: lo vencido se mide contra la fecha de emisión más el plazo`)
    // La fecha de cobro sigue estando, pero SÓLO como ventana del año: nunca como el corte de hoy.
    assert.ok(!v.includes(`$${REFS_OBRAS.cob.fechaCobro};"<"&TODAY()`), `F${f}: el reloj viejo volvió`)
  }
})
