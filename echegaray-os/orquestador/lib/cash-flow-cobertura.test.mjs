// EL CONTROL QUE NO EXISTÍA — y el defecto exacto que atrapa.
//
// El 13/08/2026 el Cash Flow Mensual tenía Materiales y Estructura cargados sólo hasta agosto y vacíos
// de septiembre a diciembre. Sobre ese flujo se decidió una compra de rodados. NINGÚN test se puso
// rojo, porque el control de cobertura que existía medía `CUADRO` de `cash-flow-lineas.mjs` — el
// diseño de bloques retirado el 06/08 — y no el libro del que cuelgan las dos vistas de hoy.
//
// El test central de este archivo es `huecosDeCobertura`: con un libro donde Estructura se corta en
// agosto tiene que gritar, y con uno que llega a diciembre tiene que callarse. Si alguien saca el
// extractor de estructura del generador, el primero se pone rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAPA, DUENOS, HORIZONTE, ROLES_SUMADOS, duenoDe, rubrosDelCuadro,
  fuentesSumadas, pestanasSumadasSegunMapa, verificarCobertura,
  coberturaPorRubro, huecosDeCobertura, problemasDeRol,
} from './cash-flow-cobertura.mjs'
import { RUBROS_INGRESO, RUBROS_EGRESO } from './cash-flow-rubros.mjs'
import { serialDe, fechaDeSerial } from './libro-extractores-fechas.mjs'

const ANIO = 2026
const CTX = { anio: ANIO, mesDesde: 8, fechaDe: fechaDeSerial }

/** Un movimiento con lo mínimo que el control mira. No usa `movimiento()`: acá se prueba el control. */
const mov = (rubro, mes, { estado = 'PROYECTADO', importe = 1000, pestana = 'x' } = {}) =>
  ({ rubro, estado, importe, signo: -1, fecha: serialDe(ANIO, mes, 10), origen: { pestana } })

/** Un libro que cubre TODO lo que tiene que llegar a diciembre. */
const libroCompleto = () => {
  const out = []
  for (const d of DUENOS.filter((x) => x.horizonte === HORIZONTE.diciembre)) {
    for (let m = 8; m <= 12; m++) out.push(mov(d.rubro, m))
  }
  return out
}

// ══ 1 · QUE CADA LÍNEA TENGA DUEÑO — la verificación estática ═════════════════════════════════════

test('TODA línea del cuadro tiene dueño y horizonte declarados, con su porqué', () => {
  const problemas = verificarCobertura()
  assert.deepEqual(problemas, [], problemas.join('\n'))
})

test('agregar una línea al cuadro sin declarar su dueño rompe el control', () => {
  // No se puede mutar la lista congelada, así que se prueba la función que decide: un rubro que el
  // cuadro abriría y que DUENOS no nombra tiene que quedar sin dueño.
  assert.equal(duenoDe('Rubro inventado que nadie declaró'), null)
  for (const r of rubrosDelCuadro()) assert.ok(duenoDe(r), `"${r}" quedó sin dueño`)
  assert.deepEqual(rubrosDelCuadro(), [...RUBROS_INGRESO, ...RUBROS_EGRESO])
})

test('cada dueño nombra una pestaña del mapa, y una que SÍ se suma', () => {
  const sumadas = pestanasSumadasSegunMapa()
  for (const d of DUENOS) {
    assert.ok(MAPA.some((m) => m.pestania === d.dueno), `${d.rubro}: "${d.dueno}" no está en el mapa`)
    assert.ok(sumadas.has(d.dueno), `${d.rubro}: "${d.dueno}" no aporta plata al libro`)
  }
})

// ══ 2 · EL DEFECTO DEL 13/08: la línea que se corta ═══════════════════════════════════════════════

test('EL DEFECTO: Estructura cortada en agosto GRITA, con los meses que faltan', () => {
  const libro = libroCompleto().filter((m) => !(m.rubro === 'Estructura' && fechaDeSerial(m.fecha).getUTCMonth() + 1 > 8))
  const avisos = huecosDeCobertura(libro, CTX)
  const estructura = avisos.find((a) => a.rubro === 'Estructura')
  assert.ok(estructura, 'la línea se corta en agosto y el control no dice nada: es el defecto del 13/08')
  assert.equal(estructura.nivel, 'HUECO')
  assert.match(estructura.texto, /9, 10, 11, 12/)
  assert.match(estructura.texto, /Dueño: Estructura/)
})

test('con el libro completo, ninguna línea de horizonte DICIEMBRE grita', () => {
  const huecos = huecosDeCobertura(libroCompleto(), CTX).filter((a) => a.nivel === 'HUECO')
  assert.deepEqual(huecos, [], huecos.map((h) => h.texto).join('\n'))
})

test('un mes SUELTO en el medio también es un hueco: no alcanza con que llegue diciembre', () => {
  // El caso que un control de "último mes" dejaría pasar: hay dato en diciembre pero octubre está en
  // cero. Un mes vacío en el medio del cuadro es plata que no se ve igual que una línea cortada.
  const libro = libroCompleto().filter((m) => !(m.rubro === 'Impuestos' && fechaDeSerial(m.fecha).getUTCMonth() + 1 === 10))
  const aviso = huecosDeCobertura(libro, CTX).find((a) => a.rubro === 'Impuestos')
  assert.ok(aviso)
  assert.match(aviso.texto, /faltan los meses 10/)
})

test('lo REAL de un mes FUTURO no tapa un hueco: es un dato roto, no una cobertura', () => {
  // Es exactamente lo que hacía parecer llena la línea de Estructura: agosto tenía facturas reales y
  // el resto del año nada. Un cuadro que mira "¿hay plata?" en vez de "¿hay proyección?" no lo ve.
  const libro = libroCompleto()
    .filter((m) => m.rubro !== 'Estructura')
    .concat([8, 9, 10, 11, 12].map((m) => mov('Estructura', m, { estado: 'REAL' })))
  const aviso = huecosDeCobertura(libro, CTX).find((a) => a.rubro === 'Estructura')
  assert.ok(aviso, 'cuatro meses de plata REAL en el futuro no prueban que la línea esté proyectada')
  assert.match(aviso.texto, /9, 10, 11, 12/)
  // Agosto SÍ queda cubierto: es el mes en curso y lo pagado lo cubre igual de bien que lo pendiente.
  assert.ok(!/faltan los meses 8/.test(aviso.texto))
})

test('el mes EN CURSO ya pagado NO es un hueco — el falso positivo que apaga el control', () => {
  // Medido el 13/08/2026: los sueldos de administración de agosto salieron el día 3, así que el mes
  // no tenía un solo movimiento pendiente y el control lo reportaba como hueco. Una línea al día
  // marcada en rojo enseña a saltear la lista entera, y ahí se pierde el grito que sí importa.
  const libro = libroCompleto()
    .filter((m) => m.rubro !== 'Nómina · Sueldos administración')
    .concat([mov('Nómina · Sueldos administración', 8, { estado: 'REAL' })])
    .concat([9, 10, 11, 12].map((m) => mov('Nómina · Sueldos administración', m)))
  assert.ok(!huecosDeCobertura(libro, CTX).some((a) => a.rubro === 'Nómina · Sueldos administración'))
})

test('lo que NO debe llegar a diciembre no se reporta como hueco — pedirle más sería inventar', () => {
  // Cobranzas se corta cuando se termina lo vendido; exigirle noviembre es pedirle que fabrique ventas.
  const libro = libroCompleto().concat([mov('Cobranzas', 8, { estado: 'PROYECTADO' })])
  const avisos = huecosDeCobertura(libro, CTX)
  assert.ok(!avisos.some((a) => a.rubro === 'Cobranzas'))
  assert.equal(duenoDe('Cobranzas').horizonte, HORIZONTE.cargado)
  assert.equal(duenoDe('Materiales Civil').horizonte, HORIZONTE.cargado)
})

test('el hueco DECLARADO sigue apareciendo en cada corrida hasta que tenga fuente', () => {
  // El medio aguinaldo de diciembre: estacional, hoy sólo entra si alguien lo tipea. No se rellena
  // con un promedio mensual —lo repartiría en doce meses donde sale en uno— pero tampoco se calla.
  const sac = huecosDeCobertura(libroCompleto(), CTX).find((a) => a.rubro === 'Nómina · SAC')
  assert.ok(sac, 'un hueco declarado que deja de reportarse es un hueco olvidado')
  assert.equal(sac.nivel, 'DECLARADO')
  assert.match(sac.texto, /ESTACIONAL/)
})

// ══ 3 · ANTI-DOBLE-CONTEO: los roles, medidos contra el libro real ════════════════════════════════

test('el libro no puede traer plata de una pestaña DERIVADA', () => {
  const derivada = MAPA.find((m) => m.rol === 'DERIVADA')
  const problemas = problemasDeRol([mov('Materiales Civil', 9, { pestana: derivada.pestania })])
  assert.equal(problemas.length, 1)
  assert.match(problemas[0], /doble conteo/)
})

test('una fuente nueva sin rol declarado se grita: es gobierno, no estética', () => {
  const problemas = problemasDeRol([mov('Estructura', 9, { pestana: 'Pestaña Nueva' })])
  assert.equal(problemas.length, 1)
  assert.match(problemas[0], /no la declara FUENTE\/PARTICION/)
})

test('un libro que sale de las pestañas declaradas no reporta ningún problema de rol', () => {
  const libro = [...pestanasSumadasSegunMapa()].map((p, i) => mov(RUBROS_EGRESO[i % RUBROS_EGRESO.length], 9, { pestana: p }))
  assert.deepEqual(problemasDeRol(libro), [])
})

test('fuentesSumadas se mide sobre los movimientos, no sobre un cuadro de fórmulas', () => {
  // El control anterior derivaba esta lista del `CUADRO` retirado y por eso seguía verde midiendo
  // un diseño que ya no se escribe en el archivo.
  assert.deepEqual([...fuentesSumadas([mov('Estructura', 9, { pestana: 'Estructura' }), mov('Impuestos', 9, { pestana: 'Compras' })])].sort(),
    ['Compras', 'Estructura'])
  assert.deepEqual([...fuentesSumadas([])], [])
})

// ══ 4 · LA TABLA QUE SE LE MUESTRA AL DUEÑO ═══════════════════════════════════════════════════════

test('coberturaPorRubro devuelve UNA fila por línea del cuadro, con su último mes y su monto', () => {
  const filas = coberturaPorRubro(libroCompleto(), CTX)
  assert.equal(filas.length, rubrosDelCuadro().length, 'la tabla tiene que listar TODAS, también las vacías')
  const estructura = filas.find((f) => f.rubro === 'Estructura')
  assert.equal(estructura.ultimoMes, 12)
  assert.equal(estructura.monto, 5000)
  const cobranzas = filas.find((f) => f.rubro === 'Cobranzas')
  assert.equal(cobranzas.ultimoMes, null, 'una línea sin movimientos se muestra vacía, no se omite')
  assert.equal(cobranzas.dueno, 'Cobranzas')
})

test('cada rol del mapa es uno de los cinco, y cada nota explica por qué no hay doble conteo', () => {
  const roles = new Set(['PARTICION', 'FUENTE', 'DERIVADA', 'ANCLA', 'INFORMATIVO'])
  for (const m of MAPA) {
    assert.ok(roles.has(m.rol), `${m.pestania}: rol inválido`)
    assert.ok(m.nota && m.nota.length > 40, `${m.pestania}: sin nota que justifique el rol`)
    assert.equal(ROLES_SUMADOS.has(m.rol), m.rol === 'PARTICION' || m.rol === 'FUENTE')
  }
})
