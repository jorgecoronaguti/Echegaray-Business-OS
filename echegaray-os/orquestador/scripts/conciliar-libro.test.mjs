// EL PORTÓN, EN FRÍO — sin red, con un libro armado a mano.
//
// Lo que estos tests tienen que poder detectar es que el VEREDICTO esté mal: que dé por buena una
// diferencia (el defecto del portón informativo, que salía con código 0 con $120M de desvío) o que
// grite por una ventana mal calculada. Por eso el libro sintético se arma con los bordes ya evaluados
// y se compara contra números de CAJA escritos a mano: si la ventana se corre un día, el test se pone
// rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluarBorde, ventanasDeTramo, conciliar, libroEntra, libroSale, residuosDeclarados,
  rubrosDelCuadro, leerLibro, declaracionDeEndosos, FUENTE, TOLERANCIA, swapDeCargas,
} from './conciliar-libro.mjs'
import { ENDOSADO } from '../lib/libro-endosos.mjs'
import { LIBRO as MAPA_LIBRO } from '../lib/libro-sumas.mjs'
import { BORDES } from '../lib/caja-calendario.mjs'
import { serialDe, isoDeSerial, eomonth } from '../lib/libro-extractores-fechas.mjs'

// Un miércoles de agosto, para que TODAY()+14 y el fin de mes no caigan juntos.
const HOY = serialDe(2026, 8, 5)
const CORTE = serialDe(2026, 8, 1)

test('los cinco bordes se evalúan con la MISMA aritmética que sus expresiones', () => {
  const v = BORDES.map(([, e]) => evaluarBorde(e, HOY))
  assert.deepEqual(v.slice(0, 3), [HOY, HOY + 7, HOY + 14])
  // "Resto de este mes": MAX(TODAY()+14; fin de mes + 1). El borde es EXCLUIDO: para que el 31/08
  // caiga ADENTRO del mes, el borde es el 01/09 (contrato del 06/08 — antes el último día del mes
  // se escapaba al tramo siguiente).
  assert.equal(isoDeSerial(v[3]), '2026-09-01')
  assert.equal(isoDeSerial(v[4]), '2026-10-01')
  assert.equal(v[5], Infinity, '"Más adelante" no tiene techo, y una ventana necesita dos')
})

test('el MAX de los bordes es un MAX de verdad: a fin de mes gana TODAY()+14', () => {
  // El 28/08: +14 = 11/09, que pasa el fin de agosto. Sin el MAX el borde retrocedería y el tramo
  // "Resto de este mes" quedaría ANTES que "Semana que viene" — dos tramos contando el mismo cheque.
  const fin = serialDe(2026, 8, 28)
  assert.equal(evaluarBorde(BORDES[3][1], fin), fin + 14)
  assert.ok(evaluarBorde(BORDES[3][1], fin) >= evaluarBorde(BORDES[2][1], fin), 'los bordes son crecientes')
  assert.equal(evaluarBorde(BORDES[4][1], fin), eomonth(fin, 1) + 1, 'el borde excluido es el día siguiente al fin de mes')
})

test('un borde que este portón no sabe evaluar ROMPE — no compara contra una ventana inventada', () => {
  assert.throws(() => evaluarBorde('WORKDAY(TODAY();3)', HOY), /no sé evaluar el borde/)
})

test('las ventanas: UNA sola por tramo, piso MAX(corte;hoy), y el Vencido abre en [0, hoy)', () => {
  // MODELO DE LA PORTADA (05/08): lo REAL vive en el saldo del banco y se excluye por ESTADO, no por
  // fecha. Por eso la ventana es una para todas las fuentes y el Vencido junta todo lo no-real viejo.
  const hoy = 46239; const corte = 46237
  const v0 = ventanasDeTramo(0, hoy, corte)
  assert.equal(v0.entra.desde, 0); assert.equal(v0.entra.hasta, hoy)
  assert.deepEqual(v0.entra, v0.sale, 'una sola ventana: entra y sale miran lo mismo')
  const v1 = ventanasDeTramo(1, hoy, corte)
  assert.equal(v1.sale.desde, Math.max(corte, hoy), 'el piso del tramo presente es MAX(corte; hoy)')
  assert.equal(v1.sale.hasta, hoy + 7)
})

// ── Un libro sintético: cada fuente con un movimiento en un tramo conocido ────────────────────────
const mov = (o) => ({ signo: -1, importe: 0, rubro: 'Materiales Civil', estado: 'PROYECTADO', ...o })
const LIBRO = [
  // Tramo 0 (vencido: [corte, hoy) para lo que sale)
  mov({ fecha: serialDe(2026, 8, 3), importe: 1000, origen: FUENTE.compras }),
  mov({ fecha: serialDe(2026, 8, 3), importe: 200, origen: FUENTE.compras, signo: 1 }), // nota de crédito
  mov({ fecha: serialDe(2026, 7, 20), importe: 5000, origen: FUENTE.cheques, estado: 'COMPROMETIDO' }),
  // Posterior al corte y por lo tanto DENTRO de la ventana: el calendario igual no lo cuenta.
  mov({ fecha: serialDe(2026, 8, 3), importe: 900, origen: FUENTE.banco, estado: 'REAL' }), // excluido
  mov({ fecha: serialDe(2026, 8, 2), importe: 777, origen: FUENTE.compras, rubro: 'SIN CLASIFICAR' }), // excluido
  mov({ fecha: serialDe(2026, 7, 15), importe: 400, origen: FUENTE.cobranzas, signo: 1, estado: 'VENCIDO' }),
  // Tramo 1 (esta semana: [hoy, hoy+7))
  mov({ fecha: HOY + 2, importe: 3000, origen: FUENTE.nomina, rubro: 'Nómina · Jornales de obra' }),
  mov({ fecha: HOY + 3, importe: 250, origen: FUENTE.cartera, signo: 1, estado: 'COMPROMETIDO' }),
  // Tramo 3 (resto del mes)
  mov({ fecha: serialDe(2026, 8, 20), importe: 6000, origen: FUENTE.impuestos, rubro: 'Impuestos' }),
  mov({ fecha: serialDe(2026, 8, 25), importe: 111, origen: FUENTE.tarjeta, estado: 'COMPROMETIDO' }),
  // Un cobro ya REAL: NO entra — está adentro del saldo del que arranca la escalera.
  mov({ fecha: HOY + 1, importe: 999999, origen: FUENTE.cobranzas, signo: 1, estado: 'REAL' }),
]

/** Lo que mostraría CAJA si contara exactamente lo mismo. */
const CAJA_QUE_CIERRA = [
  // CAMBIO DE CONTRATO (05/08): la portada publica el NETO del tramo, no entra/sale por separado.
  { rotulo: 'Vencido — ya pasó la fecha', neto: 400 - (1000 - 200 + 5000) },
  { rotulo: 'Esta semana', neto: 250 - 3000 },
  { rotulo: 'Semana que viene', neto: 0 },
  { rotulo: 'Resto de este mes', neto: 0 - 6111 },
  { rotulo: 'El mes que viene', neto: 0 },
  { rotulo: 'Más adelante', neto: 0 },
]

test('VEREDICTO: un libro que cuenta lo mismo que el calendario cierra y habilita la migración', () => {
  const r = conciliar(LIBRO, CAJA_QUE_CIERRA, { hoy: HOY, corte: CORTE })
  assert.equal(r.cierra, true, JSON.stringify(r.filas.map((f) => [f.rotulo, f.delta])))
  assert.ok(r.peor < TOLERANCIA)
})

test('VEREDICTO: una diferencia de un solo tramo abre el portón y NO se compensa entre tramos', () => {
  const caja = CAJA_QUE_CIERRA.map((t, i) => (i === 1 ? { ...t, neto: t.neto - 1_000_000 } : t))
  const r = conciliar(LIBRO, caja, { hoy: HOY, corte: CORTE })
  assert.equal(r.cierra, false)
  assert.equal(Math.round(r.filas[1].delta), -1_000_000)
  // El desglose por fuente tiene que decir DÓNDE mirar: el tramo 1 sale de la nómina.
  assert.equal(r.filas[1].salePorFuente.nomina, 3000)
})

test('VEREDICTO: dos errores que se cancelan ENTRE tramos no pasan — el neto es por tramo', () => {
  const caja = CAJA_QUE_CIERRA.map((t, i) => {
    if (i === 1) return { ...t, neto: t.neto - 500 }
    if (i === 3) return { ...t, sale: t.sale - 500 }
    return t
  })
  assert.equal(conciliar(LIBRO, caja, { hoy: HOY, corte: CORTE }).cierra, false)
})

test('el cheque viejo no debitado pesa — en el tramo Vencido, como todo lo no-real con fecha pasada', () => {
  const hoy = 46239; const corte = 46237
  const cheque = mov({ fecha: 46212, signo: -1, importe: 657000, estado: 'COMPROMETIDO', origen: 'Cheques Emitidos' })
  const compraReal = mov({ fecha: 46212, signo: -1, importe: 999999, estado: 'REAL', origen: 'Compras' })
  const v0 = ventanasDeTramo(0, hoy, corte)
  const sale = libroSale([cheque, compraReal], v0)
  assert.equal(sale.porFuente.cheques, 657000, 'el papel firmado y no debitado va a salir: pesa')
  assert.equal(Math.abs(sale.porFuente.compras), 0, 'la compra REAL ya salió por el banco: excluida por ESTADO, no por fecha')
})

test('una nota de crédito proyectada cuenta UNA vez: entra por libroEntra y NO resta además en libroSale', () => {
  const hoy = 46239; const corte = 46237
  const v1 = ventanasDeTramo(1, hoy, corte)
  const nc = mov({ fecha: hoy + 2, signo: 1, importe: 21359, estado: 'PROYECTADO', origen: 'Compras' })
  const compra = mov({ fecha: hoy + 2, signo: -1, importe: 100000, estado: 'PROYECTADO', origen: 'Compras' })
  const entra = libroEntra([nc, compra], v1)
  const sale = libroSale([nc, compra], v1)
  assert.equal(entra.porFuente.otros, 21359, 'la NC entra: es plata que vuelve')
  assert.equal(sale.porFuente.compras, 100000)
  assert.equal(entra.total - sale.total, 21359 - 100000, 'el neto cuenta cada fila una vez, con su signo')
})

test('ENTRA: todo lo no-real que entra — y un cobro REAL nunca, está en el saldo', () => {
  const hoy = 46239; const corte = 46237
  const v1 = ventanasDeTramo(1, hoy, corte)
  const esperado = mov({ fecha: hoy + 3, signo: 1, importe: 500000, estado: 'PROYECTADO', origen: 'Cobranzas' })
  const enCartera = mov({ fecha: hoy + 3, signo: 1, importe: 200000, estado: 'COMPROMETIDO', origen: '_CHEQUES_RAW' })
  const cobrado = mov({ fecha: hoy + 3, signo: 1, importe: 999999, estado: 'REAL', origen: 'Cobranzas' })
  const r = libroEntra([esperado, enCartera, cobrado], v1)
  assert.equal(r.total, 700000, 'los $999.999 cobrados ya están adentro del saldo')
  assert.equal(r.porFuente.cobranzas, 500000)
  assert.equal(r.porFuente.cartera, 200000)
})

test('las exclusiones tienen nombre y monto: nada se descuenta en silencio', () => {
  const v = ventanasDeTramo(0, HOY, CORTE)
  const r = residuosDeclarados(LIBRO, v)
  assert.equal(r.banco, 900, 'el calendario declara $0 por tramo para los cargos sin factura')
  assert.equal(r.comprasSinRubroDelCuadro, 777)
  assert.deepEqual(r.rubrosSueltos, ['SIN CLASIFICAR'])
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL SWAP DE CARGAS SOCIALES (06/08) — el portón tiene que NOMBRARLO, no absorberlo.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('el swap se declara con las DOS cifras: lo que aporta la cadena y lo que dejó de aportar Compras', () => {
  const v = ventanasDeTramo(1, HOY, CORTE) // "Esta semana": [hoy, hoy+7)
  const libro = [
    mov({ fecha: HOY + 5, importe: 8569345, origen: FUENTE.cargas, rubro: 'Nómina · Cargas sociales' }),
    // Otro tramo: no puede sumar en éste.
    mov({ fecha: HOY + 36, importe: 7608663, origen: FUENTE.cargas, rubro: 'Nómina · Cargas sociales' }),
  ]
  const reemplazadas = [
    { fecha: HOY + 5, total: 8000000 },
    { fecha: HOY + 6, total: 700000 },
    { fecha: HOY + 36, total: 6500000 },
  ]
  const s = swapDeCargas(libro, v, reemplazadas)
  assert.equal(s.cadena, 8569345, 'la cadena aporta lo que dice el libro, en la ventana del tramo')
  assert.equal(s.plano, 8700000, 'y lo reemplazado se mide de Compras, no del libro: en el libro ya no está')
  assert.equal(s.delta, 8569345 - 8700000)
})

test('EL SWAP NO SE COMPENSA CONTRA EL VEREDICTO: el Δ del tramo se sigue midiendo igual', () => {
  // Fabricar el cero sería sumarle al lado que falta lo que se excluyó. Acá se prueba lo contrario: con
  // un swap declarado enorme, un tramo descuadrado sigue descuadrando exactamente lo mismo.
  const caja = CAJA_QUE_CIERRA.map((t, i) => (i === 1 ? { ...t, neto: t.neto - 1_000_000 } : t))
  const conSwap = conciliar(LIBRO, caja, {
    hoy: HOY, corte: CORTE, cargasReemplazadas: [{ fecha: HOY + 2, total: 41_530_186 }],
  })
  const sinSwap = conciliar(LIBRO, caja, { hoy: HOY, corte: CORTE })
  assert.deepEqual(conSwap.filas.map((f) => f.delta), sinSwap.filas.map((f) => f.delta))
  assert.equal(conSwap.cierra, false)
  assert.equal(conSwap.filas[1].swapCargas.plano, 41_530_186, 'el monto excluido tiene que quedar a la vista')
})

test('las cargas tienen su propio renglón en el desglose: adentro de "otros" el swap es invisible', () => {
  const v = ventanasDeTramo(1, HOY, CORTE)
  const libro = [mov({ fecha: HOY + 2, importe: 1234, origen: FUENTE.cargas })]
  const s = libroSale(libro, v)
  assert.equal(s.porFuente.cargas, 1234)
  assert.equal(Math.abs(s.porFuente.otros), 0)
  assert.equal(s.total, 1234, 'la fuente nueva tiene que seguir sumando al total del tramo')
})

test('los rubros que se comparan salen del CUADRO, no de una lista copiada acá', () => {
  const rubros = rubrosDelCuadro()
  assert.ok(rubros.has('Materiales Civil') && rubros.has('Impuestos') && rubros.has('Estructura'))
  assert.ok(!rubros.has('SIN CLASIFICAR'), 'no es una línea de ninguna actividad: el calendario no lo ve')
})

test('si CAJA muestra otra cantidad de tramos que BORDES, ROMPE en vez de comparar de a pares', () => {
  assert.throws(() => conciliar(LIBRO, CAJA_QUE_CIERRA.slice(0, 3), { hoy: HOY, corte: CORTE }),
    /no están hablando del mismo calendario/)
})

test('si el borde de la pestaña no coincide con el calculado, no cierra aunque los deltas den cero', () => {
  const caja = CAJA_QUE_CIERRA.map((t, i) => (i === 0 ? { ...t, hasta: HOY - 1 } : t))
  const r = conciliar(LIBRO, caja, { hoy: HOY, corte: CORTE })
  assert.equal(r.bordesEnDesacuerdo.length, 1)
  assert.equal(r.cierra, false, 'si no miran el mismo día, ninguna comparación vale')
})

test('LA COLUMNA NUEVA AL FINAL NO CORRE NINGÚN ÍNDICE: el portón sigue leyendo lo que cree leer', () => {
  // EL DEFECTO QUE ESTO ATRAPA. `leerLibro` toma la fila POR ÍNDICE (origen es el 13) y la pestaña
  // acaba de ganar una columna, `Cliente`. Puesta al final no mueve nada; puesta en el medio —al lado
  // de `Obra`, que es donde se leería mejor— corre `Origen`, `Fila` y `Clave` un lugar, y el portón
  // sigue conciliando sin dar un solo error: contra el campo equivocado, que es el peor resultado.
  const fila = [46000, -1, 250000, 'ARS', 'Alumetal', 'Materiales Civil', 'operativa', 'PROYECTADO',
    'transferencia', 'Alumetal', '30111111119', '0001-00000001', 'Galpon 9', 'Compras', 42,
    'comp:30111111119:1:S', 'LA ESTRELLA']
  assert.equal(fila.length, Object.keys(MAPA_LIBRO.col).length, 'la fila de prueba tiene que tener el ancho real del libro')
  const [m] = leerLibro([fila])
  assert.equal(m.fecha, 46000)
  assert.equal(m.signo, -1)
  assert.equal(m.importe, 250000)
  assert.equal(m.rubro, 'Materiales Civil')
  assert.equal(m.estado, 'PROYECTADO')
  assert.equal(m.instrumento, 'transferencia')
  assert.equal(m.origen, 'Compras', 'si esto dice "Galpon 9" o 42, la columna nueva se metió en el medio')
  // Y `Cliente` es la ÚLTIMA: el día que alguien la mueva, el assert de arriba se pone rojo.
  assert.equal(MAPA_LIBRO.col.cliente, 'Q')
  assert.equal(fila.indexOf('LA ESTRELLA'), fila.length - 1)
})

test('LA EXCLUSIÓN POR ENDOSO NO MUEVE NINGÚN Δ — por eso el portón la NOMBRA con su monto', () => {
  // Los dos echeq de LA ESTRELLA se excluyen del libro porque no van a acreditar nunca. Eran
  // movimientos REAL, y la escalera sólo mira lo NO-REAL: el Δ de todos los tramos sigue en cero y
  // este portón los daría por buenos sin enterarse. Son $20.000.000 que están en una pestaña del
  // archivo y no están en el libro — si no se nombran, desaparecen.
  const filas = [[], [], [],
    ['recibido', '90020099', 'Santander', 'Alimentos Del Sur SA', '', 46234, 10000000, 'Depositado'],
    ['recibido', '90020100', 'Santander', 'Alimentos Del Sur SA', '', 46249, 10000000, ENDOSADO],
    ['recibido', '90020101', 'Santander', 'Alimentos Del Sur SA', '', 46265, 10000000, ENDOSADO],
  ]
  const d = declaracionDeEndosos(filas)
  assert.equal(d.total, 20000000, 'el monto es lo que hace verificable la exclusión')
  assert.deepEqual(d.valores.map((v) => v.numero), ['90020100', '90020101'])
  assert.equal(declaracionDeEndosos([]).total, 0, 'sin endosos, la línea dice $0 y no desaparece')
})
