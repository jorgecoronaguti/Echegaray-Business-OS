// EL CONTRATO QUE EL REDISEÑO DE LA PESTAÑA NO PUEDE ROMPER: LO QUE LEEN LOS DOS CASH FLOW.
//
// «Jornales por Quincena» se rediseña —bloques que se van, columnas que se funden, secciones que se
// renumeran— y nada de eso puede mover un peso de las líneas «Nómina · Jornales de obra» y
// «Nómina · Sueldos administración». Entre la pestaña y esas líneas hay exactamente dos eslabones, y
// acá se fija cada uno:
//
//   1. LA GEOMETRÍA. `rangosDeJornales` decide qué CELDAS ve cada rango con nombre. Si un nombre pasa
//      a apuntar a la columna de al lado, el Cash Flow sigue devolviendo un número —plausible y de
//      otra cosa— sin una sola celda en rojo. Es el modo de falla que este repositorio ya pagó dos
//      veces: la fila 3 → 41 del rediseño de julio, y la N desalineada ocho filas de agosto
//      ($70.431.250 de deuda salidos de una celda vacía).
//   2. LA AGREGACIÓN. `libro-extractores-nomina` convierte esas columnas en movimientos. Un cambio
//      de estado o un renglón partido de más mueve el total del año o el del proyectado.
//
// ═══ POR QUÉ SE AFIRMA LA FUENTE DE CADA COLUMNA Y NO UN HASH DE LA GRILLA ═══
//
// Un snapshot congelado se pone rojo con cualquier cambio —también con los que no mueven un peso— y
// entonces se actualiza sin leerlo, que es como un control deja de controlar. Lo que de verdad no
// puede cambiar es DE DÓNDE sale cada columna: `JORNALES_REAL_TOTAL` de la AB del espejo y no de la
// AA (el 08/09 esa sola letra eran $43M), `OFICINA_PAGADO` de la Z de `_J_OFICINA`, `DIRECCION_PAGADO`
// de la O de Compras. Eso se afirma acá, columna por columna, y sobrevive al rediseño sin diluirse.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  grilla, rangosDeJornales, cabeceraDelRegistro, recuperarPagadoEl, claveDeFecha,
} from './jornales-pestana.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'
import { isoASerial } from '../lib/jornales-fixture.mjs'
import {
  deJornalesQuincenas, deOficina, deDireccion, RUBRO_JORNALES, RUBRO_ADMINISTRACION,
} from '../lib/libro-extractores-nomina.mjs'

// La misma forma que usan el resto de los tests de la pestaña: dos quincenas cerradas, dos
// proyectadas y dos meses de oficina cargados. Alcanza para que los veinte rangos tengan celdas.
const bloques = [{ filaFecha: 6, inicio: 7, fin: 20 }, { filaFecha: 30, inicio: 31, fin: 44 }]
const pendientes = [{ desde: new Date(2026, 7, 1) }, { desde: new Date(2026, 7, 16) }]
const bloquesOfi = [{ mes: 6, inicio: 5, fin: 8 }, { mes: 7, inicio: 12, fin: 15 }]

/** El centinela se lee como lo que significa: «esta celda es del generador y va vacía». */
const texto = (c) => String(c ?? '').split(VACIO).join('«vacía»')

/**
 * DE DÓNDE TIENE QUE SALIR CADA RANGO CON NOMBRE.
 *
 * `todas` se exige en las N celdas del rango; `alguna` alcanza con una (los bloques mensuales tienen
 * meses sin cargar, que van con el centinela a propósito). Un rango sin regla acá es un rango que
 * nadie está protegiendo: por eso el primer test exige que las dos listas coincidan exactamente.
 */
const FUENTE = {
  // ── OBRA · las quincenas cerradas. Todo sale del espejo de la planilla JORNALES.
  JORNALES_REAL_DESDE: { todas: /^='_J_OBREROS'!F\d+$/ },
  JORNALES_REAL_HASTA: { todas: /^=IFERROR\(INDEX\('_J_OBREROS'!F\d+:U\d+;/ },
  // La fecha de caja: el lote del banco si existe, y el parámetro si no. Nunca la de cierre.
  JORNALES_REAL_PAGO: { todas: /'_BANCO_RAW'.+JORNALES_DESFASE_PAGO/s },
  // AB = «TOTAL SEMANA». Con AA (el efectivo entregado) el año publicaba $90,4M contra $133,5M.
  JORNALES_REAL_TOTAL: { todas: /^=SUM\('_J_OBREROS'!AB\d+:AB\d+\)$/ },
  JORNALES_REAL_PERSONAS: { todas: /^=COUNT\('_J_OBREROS'!A\d+:A\d+\)$/ },
  // LA COLUMNA DEL DUEÑO. El generador NO emite el centinela ahí: emitirlo le borró sus fechas tres
  // veces. La cadena vacía significa «no es mía, preservá lo que haya».
  JORNALES_REAL_PAGADO: { todas: /^$/ },
  JORNALES_REAL_BANCO: { todas: /^=SUM\('_J_OBREROS'!X\d+:X\d+\)$/ },
  JORNALES_REAL_ADELANTO: { todas: /^=SUM\('_J_OBREROS'!Y\d+:Y\d+\)\+SUM\('_J_OBREROS'!Z\d+:Z\d+\)$/ },
  JORNALES_REAL_RECIBO: { todas: /^=SUM\('_J_OBREROS'!AA\d+:AA\d+\)$/ },

  // ── OBRA · las quincenas que faltan. La primera fecha es literal (arranca donde termina lo
  // cargado) y las demás encadenan; el cierre lo pone la regla de calendario, nunca una constante.
  JORNALES_PROY_DESDE: { todas: /^(\d{2}\/\d{2}\/\d{4}|=B\d+\+1)$/ },
  JORNALES_PROY_HASTA: { todas: /^=IF\(DAY\(A\d+\)<16;DATE\(YEAR\(A\d+\);MONTH\(A\d+\);15\);EOMONTH\(A\d+;0\)\)$/ },
  JORNALES_PROY_PAGO: { todas: /'_BANCO_RAW'.+JORNALES_DESFASE_PAGO/s },
  // EL PLANTEL POR SU ESCALÓN, POR HORAS Y POR DÍAS — nunca el TOTAL de las tres nóminas: oficina y
  // dirección viajan por sus propios nombres y sumarlas acá las contaría dos veces ($50,2M).
  JORNALES_PROY_TOTAL: { todas: /NETWORKDAYS\.INTL\(A\d+;B\d+/ },

  // ── OFICINA · la planilla `_J_OFICINA`, mes por mes. Z es el total y W el lote del banco.
  OFICINA_PAGO: { todas: /'_BANCO_RAW'.+EOMONTH\(DATE\(2026;\d+;1\);0\)/s },
  OFICINA_PAGADO: { alguna: /^=SUM\('_J_OFICINA'!Z\d+:Z\d+\)/ },
  OFICINA_BANCO: { alguna: /^=SUM\('_J_OFICINA'!W\d+:W\d+\)/ },
  // base × factor de escalón. Es lo que alimenta la línea de administración de los dos Cash Flow.
  OFICINA_PROYECTADO: { alguna: /^=\$C\$\d+\*/ },

  // ── DIRECCIÓN · los retiros de los socios, desde Compras (K el nombre, O el importe, AD la fecha).
  DIRECCION_PAGO: { todas: /'Compras'!\$AD\$\d+:\$AD/ },
  DIRECCION_PAGADO: { todas: /'Compras'!\$O\$\d+:\$O/ },
  DIRECCION_PROYECTADO: { todas: /^=IF\(N\(\$B\$\d+\)=0;/ },
}

/** Lo que cada rango con nombre selecciona hoy, celda por celda. */
function seleccion(g) {
  const out = new Map()
  for (const d of rangosDeJornales(g)) {
    const celdas = []
    for (let r = d.r0; r <= d.r1; r++) celdas.push(texto(g.filas[r - 1]?.[d.c0]))
    out.set(d.nombre, { celdas, encabezado: d.ancla.texto, ancla: d.ancla, r0: d.r0, r1: d.r1, col: d.c0 })
  }
  return out
}

test('EL CONTRATO: cada rango con nombre lee la MISMA fuente que leía antes del rediseño', () => {
  const sel = seleccion(grilla({ bloques, pendientes, bloquesOfi }))
  assert.deepEqual([...sel.keys()].sort(), Object.keys(FUENTE).sort(),
    'cambió la LISTA de rangos publicados: un nombre que desaparece deja su línea del Cash Flow en #NAME?')
  for (const [nombre, regla] of Object.entries(FUENTE)) {
    const { celdas } = sel.get(nombre)
    assert.ok(celdas.length > 0, `${nombre}: el rango quedó sin celdas`)
    if (regla.todas) {
      for (const [i, c] of celdas.entries()) {
        assert.match(c, regla.todas, `${nombre}, celda ${i + 1} de ${celdas.length}`)
      }
    }
    if (regla.alguna) {
      assert.ok(celdas.some((c) => regla.alguna.test(c)),
        `${nombre}: ninguna de las ${celdas.length} celdas sale de su fuente.\n  ${celdas.map((c) => c.slice(0, 80)).join('\n  ')}`)
    }
  }
})

test('el encabezado bajo el que cae cada rango es el que la grilla escribe de verdad', () => {
  // El ancla es lo que impide que un nombre pase a leer la columna de al lado sin dar error: si el
  // encabezado declarado y el emitido se separan, `verificarRangos` lo frena antes de publicar.
  const g = grilla({ bloques, pendientes, bloquesOfi })
  for (const [nombre, d] of seleccion(g)) {
    const emitido = String(g.filas[d.ancla.fila - 1]?.[d.ancla.col] ?? '').trim()
    assert.equal(emitido, d.encabezado,
      `${nombre}: el rango dice caer bajo «${d.encabezado}» y en la fila ${d.ancla.fila} hay «${emitido}»`)
  }
})

// ═══ EL SEGUNDO ESLABÓN: LOS VALORES YA LEÍDOS → LAS DOS LÍNEAS DEL CASH FLOW ═══
//
// Los importes son un reparto sintético que SUMA los totales medidos en el Cash Flow Mensual el
// 09/09/2026, y están acá para que el número declarado en la orden de trabajo viva en un test y no
// en un mensaje: jornales de obra 131.082.858 real y 58.308.813 proyectado; sueldos de administración
// 33.330.363 real y 46.820.400 proyectado (oficina + dirección).
const REAL_OBRA = 131_082_858
const PROY_OBRA = 58_308_813
const REAL_ADM = 33_330_363
const PROY_ADM = 46_820_400

const ser = (iso) => isoASerial(iso)
const suma = (ms, rubro, ...estados) => ms
  .filter((m) => m.rubro === rubro && estados.includes(m.estado))
  .reduce((a, m) => a + m.importe, 0)

test('los cuatro totales que publican los Cash Flow salen enteros de los rangos con nombre', () => {
  const corte = ser('2026-09-09')
  // OBRA. Dos quincenas cerradas y marcadas por el dueño (REAL) y dos proyectadas.
  const jornales = deJornalesQuincenas({
    reales: {
      pago: [ser('2026-08-03'), ser('2026-08-18')],
      hasta: [ser('2026-07-31'), ser('2026-08-15')],
      banco: [0, 0],
      pagado: [ser('2026-08-03'), ser('2026-08-18')],
      total: [REAL_OBRA - 31_082_858, 31_082_858],
    },
    proyectadas: {
      pago: [ser('2026-10-02'), ser('2026-10-19')],
      hasta: [ser('2026-09-30'), ser('2026-10-15')],
      total: [PROY_OBRA - 8_308_813, 8_308_813],
    },
  }, corte, { aviso: () => {} })
  assert.equal(suma(jornales, RUBRO_JORNALES, 'REAL'), REAL_OBRA)
  assert.equal(suma(jornales, RUBRO_JORNALES, 'PROYECTADO'), PROY_OBRA)

  // ADMINISTRACIÓN = oficina + dirección, la misma línea. Cada bloque aporta un mes pagado y uno
  // proyectado: si algún día los dos extractores empezaran a emitir el mismo mes, esta suma se
  // duplicaría y el test lo dice.
  const ofi = deOficina({
    pago: [ser('2026-06-30'), ser('2026-10-02')],
    pagado: [20_000_000, 0],
    proyectado: [0, 20_000_000],
  }, corte, { aviso: () => {} })
  const dir = deDireccion({
    pago: [ser('2026-07-31'), ser('2026-10-02')],
    pagado: [REAL_ADM - 20_000_000, 0],
    proyectado: [0, PROY_ADM - 20_000_000],
  }, corte, { aviso: () => {} })
  const adm = [...ofi, ...dir]
  assert.equal(suma(adm, RUBRO_ADMINISTRACION, 'REAL'), REAL_ADM)
  assert.equal(suma(adm, RUBRO_ADMINISTRACION, 'PROYECTADO'), PROY_ADM)
})

test('un mes con PAGADO y PROYECTADO a la vez no se cuenta dos veces: gana el hecho, y se grita', () => {
  // Es la mutación que rompe la línea de administración sin dar error: el Sheet los SUMA.
  const avisos = []
  const ms = deOficina({
    pago: [ser('2026-06-30')], pagado: [1_000_000], proyectado: [900_000],
  }, ser('2026-09-09'), { aviso: (m) => avisos.push(m) })
  assert.equal(ms.reduce((a, m) => a + m.importe, 0), 1_000_000)
  assert.equal(avisos.length, 1)
})

// ═══ LA MIGRACIÓN DE LAYOUT NO PUEDE PERDER LAS FECHAS DEL DUEÑO ═══
//
// «Pagado el» es la columna que él carga a mano y la que dispara el descuento en CAJA. El generador
// no la escribe: la COPIA de la pestaña vieja a la grilla nueva, emparejando por la cabecera del
// registro. El rediseño del 09/09/2026 renombró la primera columna («Quincena» → «Desde») y corrió
// «Pagado el» de la N a la M — o sea que la pestaña que está en Drive tiene el ancla vieja.
//
// EL DEFECTO QUE ESTO ATRAPA: con la cabecera clavada a «Quincena» + última columna, esa pestaña no
// se reconoce, el código cae a copiar por número de fila y cada fecha aterriza en la quincena de
// otra. Ya pasó dos veces con este mismo mecanismo, las dos con pérdida de trabajo del dueño.
test('el ancla de «Pagado el» reconoce la pestaña VIEJA y la nueva, y dice en qué columna estaba', () => {
  // El layout de hasta el 08/09: catorce columnas, «Quincena» en la A y «Pagado el» en la N.
  const viejo = [
    ['Jornales por quincena'], [], [],
    ['Quincena', 'Hasta', 'Se paga el', 'Días hábiles', 'Personas', 'Hs previstas', 'Hs reales',
      'Banco', 'Adelanto', 'Total recibo', 'TOTAL', 'Σ $/hora', 'Estado', 'Pagado el'],
    ['=x', '=y', '', '', '', '', '', '', '', '', '', '', '', 46237],
  ]
  assert.deepEqual(cabeceraDelRegistro(viejo), { fila: 3, col: 13 },
    'no reconoció la cabecera del layout que está en Drive: las fechas del dueño se copiarían por número de fila')

  // Y el de hoy: trece columnas, «Desde» en la A y «Pagado el» en la M.
  const g = grilla({ bloques, pendientes, bloquesOfi })
  const b = cabeceraDelRegistro(g.filas)
  assert.ok(b, 'no reconoció su propia cabecera')
  assert.equal(b.fila + 2, g.f0, 'la cabecera no es la fila de arriba de la primera quincena')
  assert.equal(g.filas[b.fila][b.col], 'Pagado el')

  // Sin cabecera reconocible devuelve null y el llamador avisa en vez de adivinar.
  assert.equal(cabeceraDelRegistro([['otra cosa'], []]), null)
  assert.equal(cabeceraDelRegistro([]), null)
})

// ═══ LAS FECHAS DEL DUEÑO NO PUEDEN QUEDAR DUPLICADAS NI HUÉRFANAS ═══
//
// MEDIDO EN EL DRY DEL 09/09/2026: «18 fechas de Pagado el copiadas» y, a la vez, el auditor de
// patrón marcando las filas 132–139 con `N="18/05/2026"` como filas sin concepto. Las dos cosas eran
// ciertas: la copia por POSICIÓN las llevaba a las filas nuevas y la cola las PROTEGÍA en las viejas
// («columna ajena»), que con la grilla más corta quedaban debajo del footprint del generador. Una
// fecha huérfana fuera de toda quincena la puede leer CAJA como un pago que ya salió.
//
// La cura es emparejar por la QUINCENA —su fecha de cierre, lo único que la identifica y no se mueve
// con el layout— y negarse a escribir si queda una sola sin atribuir.
test('cada fecha de «Pagado el» vuelve a SU quincena, aunque el layout haya cambiado entero', () => {
  // La pestaña vieja: catorce columnas, «Quincena» en la A, «Pagado el» en la N, y sus dos fechas.
  const previo = [
    ['Jornales por quincena'], [], [],
    ['Quincena', 'Hasta', 'Se paga el', 'Días hábiles', 'Personas', 'Hs previstas', 'Hs reales',
      'Banco', 'Adelanto', 'Total recibo', 'TOTAL', 'Σ $/hora', 'Estado', 'Pagado el'],
    ['15/07/2026', '31/07/2026', '', '', '', '', '', '', '', '', '', '', '', '03/08/2026'],
    ['01/08/2026', '15/08/2026', '', '', '', '', '', '', '', '', '', '', '', '18/08/2026'],
  ]
  const cab = cabeceraDelRegistro(previo)
  const r = recuperarPagadoEl(previo, cab)
  assert.equal(r.total, 2)
  assert.deepEqual(r.sinClave, [], 'las dos fechas tenían su cierre al lado y tienen que emparejar')
  assert.equal(r.porClave.get('2026-07-31'), '03/08/2026')
  assert.equal(r.porClave.get('2026-08-15'), '18/08/2026')

  // EL MISMO CIERRE ESCRITO DE OTRA FORMA ES EL MISMO CIERRE. Google renderiza «31/7/2026» o el
  // serial según el formato que tenga la celda ese día: comparar cadenas es cómo dos fechas iguales
  // dejan de serlo y una quincena pierde su pago.
  assert.equal(claveDeFecha('31/7/2026'), '2026-07-31')
  assert.equal(claveDeFecha('31/07/26'), '2026-07-31')
  assert.equal(claveDeFecha(46234), claveDeFecha('31/07/2026'))
  assert.equal(claveDeFecha(''), null)
  assert.equal(claveDeFecha('cerrada · a pagar'), null)
})

test('una fecha que no se puede atribuir a ninguna quincena NO se borra: se declara y frena la corrida', () => {
  // El caso del dry: copias huérfanas de un layout anterior, debajo de la grilla, sin nada al lado.
  // Si el generador las limpiara «porque están fuera del footprint» estaría borrando trabajo del
  // dueño; si las dejara, CAJA leería un pago que no pertenece a ninguna quincena. La única salida
  // honesta es no escribir y decir dónde están.
  const previo = [
    ['Jornales por quincena'], [], [],
    ['Quincena', 'Hasta', 'Se paga el', '', '', '', '', '', '', '', '', '', '', 'Pagado el'],
    ['15/07/2026', '31/07/2026', '', '', '', '', '', '', '', '', '', '', '', '03/08/2026'],
    [], [],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '18/05/2026'],
  ]
  const r = recuperarPagadoEl(previo, cabeceraDelRegistro(previo))
  assert.equal(r.total, 2)
  assert.equal(r.porClave.size, 1)
  assert.deepEqual(r.sinClave, [{ fila: 8, valor: '18/05/2026' }],
    'la fecha huérfana tiene que salir declarada, con su fila, para que alguien la mire')

  // ═══ Y LO QUE NO ES UNA FECHA NO CUENTA COMO MARCA SUYA (09/09/2026) ═══
  //
  // El dry se negó a escribir por «31 fechas que no puedo atribuir». No eran fechas: la columna
  // «Estado» rinde frases como «pagada el 18/5» y un layout desplazado las dejó en la columna de al
  // lado. Contar cualquier celda con un dígito adentro convertía residuo del generador en trabajo del
  // dueño y frenaba la corrida con una razón falsa. «Pagado el» es una columna de FECHAS.
  const conEstado = [
    ['Jornales por quincena'], [], [],
    ['Quincena', 'Hasta', 'Se paga el', '', '', '', '', '', '', '', '', '', '', 'Pagado el'],
    ['15/07/2026', '31/07/2026', '', '', '', '', '', '', '', '', '', '', '', 'pagada el 18/5'],
    ['01/08/2026', '15/08/2026', '', '', '', '', '', '', '', '', '', '', '', 'cerrada · a pagar'],
    ['16/08/2026', '31/08/2026', '', '', '', '', '', '', '', '', '', '', '', '03/09/2026'],
  ]
  const re = recuperarPagadoEl(conEstado, cabeceraDelRegistro(conEstado))
  assert.equal(re.total, 1, 'sólo la fecha cuenta: las dos frases son residuo, no marcas del dueño')
  assert.deepEqual(re.sinClave, [], 'ninguna fecha real quedó sin atribuir: la corrida no tiene por qué frenarse')
  assert.equal(re.noEsFecha.length, 2, 'el residuo se declara para poder limpiarlo, no se cuenta como suyo')
  assert.equal(re.porClave.get('2026-08-31'), '03/09/2026')

  // Y una misma quincena con DOS fechas distintas —el layout duplicado a medio limpiar— también
  // frena: elegir una de las dos sería inventar cuál es la buena.
  const dup = [
    ['Jornales por quincena'], [], [],
    ['Quincena', 'Hasta', 'Se paga el', '', '', '', '', '', '', '', '', '', '', 'Pagado el'],
    ['15/07/2026', '31/07/2026', '', '', '', '', '', '', '', '', '', '', '', '03/08/2026'],
    ['15/07/2026', '31/07/2026', '', '', '', '', '', '', '', '', '', '', '', '05/08/2026'],
  ]
  const rd = recuperarPagadoEl(dup, cabeceraDelRegistro(dup))
  assert.equal(rd.sinClave.length, 1, 'dos fechas para la misma quincena tienen que frenar la corrida')
  // La MISMA fecha repetida no frena: es la copia duplicada, y las dos dicen lo mismo.
  const igual = [...dup]
  igual[5] = ['15/07/2026', '31/07/2026', '', '', '', '', '', '', '', '', '', '', '', '03/08/2026']
  assert.deepEqual(recuperarPagadoEl(igual, cabeceraDelRegistro(igual)).sinClave, [])
})
