// LA GRILLA DE CAJA, VERIFICADA EN FRÍO. Sin red, sin base, sin escribir una celda.
//
// POR QUÉ EXISTE (31/07). El bloque de disponibilidades tiene una propiedad que no se puede ver leyendo
// una fórmula sola: que el TOTAL no cuente el mismo peso dos veces. Basta con que dos filas del rango
// aporten el mismo dinero para que la empresa se crea más líquida de lo que está — y ninguna fórmula
// individual da error. Sólo se ve mirando la grilla ENTERA.
//
// QUÉ SE MUDÓ (05/08/2026). El anexo de CAJA vive ahora en `_CAJA_ANEXO`. Los invariantes de esos
// bloques —el desglose del efectivo, la nómina por canal, la cartera, los vencidos, los controles del
// calendario— NO se borraron: están en lib/caja-anexo.test.mjs. Un invariante que se muda de archivo y
// no se muda de test es un invariante que se perdió.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { grilla, rescatar } from './caja-pestana.mjs'
import { FILAS_MAXIMAS } from '../lib/caja-grilla.mjs'
import { lineasDeCaja, conceptosFueraDelCalendario } from '../lib/calendario-egresos.mjs'
import { CUENTAS } from '../lib/caja-disponibilidades.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'
import { MARCAS } from '../lib/cheques-cobertura.mjs'

/** Una celda VACÍA de la grilla. El generador no escribe '': escribe el centinela VACIO, que le dice al
 *  portón "esta celda es MÍA y está vacía" (una celda ajena y vacía se preserva). */
const vacia = (s) => s === '' || s === VACIO

// `filasCal` son las filas de "Impuestos y Financieros" donde viven el IVA y el IIBB a pagar. En la
// corrida real las ubica el script POR RÓTULO; acá son dos números cualesquiera porque lo que el test
// verifica es la FORMA de la fórmula. Que sean obligatorias es el punto: sin ellas el generador rompe.
const REFS = { bancoRaw: '_BANCO_RAW', cheques: 'Cheques Emitidos', tarjeta: 'Tarjeta de Credito', chequesRaw: '_CHEQUES_RAW', filasCal: { iva: 18, iibb: 19 } }
const construir = () => grilla(new Map(), REFS)

/** La fila (1-based) cuyo rótulo en la columna A matchea. */
const filaDe = (g, re) => g.filas.findIndex((f) => re.test(String(f?.[0] ?? '').trim())) + 1
const celda = (g, fila, col) => String(g.filas[fila - 1]?.[col] ?? '')

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL OBJETIVO DEL REDISEÑO ES UN NÚMERO, Y SE MIDE (05/08/2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// El dueño pidió la caja nueva tres veces después de dos rondas de mejoras. El diagnóstico no era de
// defectos: era de TAMAÑO. 143 filas es la vista del analista; el CFO decide con cuatro cifras y un
// calendario. Sin un tope MEDIDO, la pestaña vuelve a crecer bloque a bloque — que es exactamente
// cómo llegó a 143.

test('CAJA ENTRA EN UNA PANTALLA: no pasa de 45 filas', () => {
  const g = construir()
  assert.ok(g.filas.length <= FILAS_MAXIMAS,
    `CAJA quedó en ${g.filas.length} filas. El tope es ${FILAS_MAXIMAS}: si hace falta un bloque nuevo, `
    + 'algo tiene que irse a _CAJA_ANEXO. Dejarla crecer es cómo llegó a 143.')
})

test('NI UNA FILA EN BLANCO: el hueco es un defecto medido, no un separador', () => {
  // `auditar-pantalla.mjs` reportaba "hueco: 5 filas en blanco (66 a 70)". En una pestaña de 45 filas
  // una fila vacía cuesta lo mismo que una de datos y no separa mejor que un título de bloque.
  const g = construir()
  const enBlanco = g.filas
    .map((f, i) => ({ fila: i + 1, algo: (f || []).some((c, j) => j !== 7 && !vacia(c) && c !== undefined) }))
    .filter((x) => !x.algo)
  assert.deepEqual(enBlanco.map((x) => x.fila), [], 'volvieron las filas en blanco')
})

test('la grilla se puede construir sin red, sin base y sin escribir nada', () => {
  const g = construir()
  assert.ok(g.filas.length > 40, 'la pestaña tiene que tener sus bloques')
  assert.ok(g.d0 > 0 && g.d1 >= g.d0, 'el bloque de disponibilidades tiene principio y fin')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL BLOQUE 1 — QUE EL TOTAL NO CUENTE LA MISMA PLATA DOS VECES
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('"Caja en pesos" es la PRIMERA fila del bloque y suma el neto de efectivo del anexo', () => {
  const g = construir()
  const fCaja = filaDe(g, /^caja en pesos$/i)
  assert.equal(fCaja, g.d0, 'el arqueo tiene que seguir siendo la fila ancla del bloque')
  const origen = celda(g, fCaja, 2)
  assert.match(origen, /^=/, '"Caja en pesos" tiene que ser una FÓRMULA, no un número pegado')
  assert.match(origen, /CAJA_ARQUEO_ARS/, 'parte del arqueo declarado, citado por nombre')
  // EL NETO SE MUDÓ AL ANEXO Y SE CITA POR NOMBRE. Antes era `$C$<fila del neto>`: una referencia por
  // celda a una fila que ahora vive en otra pestaña. El nombre es lo que hace posible la mudanza.
  assert.match(origen, /ANEXO_EFECTIVO_NETO/, 'el neto de efectivo entra por su rango con nombre')
  assert.match(celda(g, fCaja, 4), new RegExp(`C${fCaja}\\*IF\\(D${fCaja}`), 'y se valúa como cualquier otra cuenta')
})

test('EL ANTI-DOBLE-CONTEO: el neto de efectivo entra al total por UNA sola puerta', () => {
  // El total es un SUM del bloque: si dos filas aportaran el mismo efectivo, la empresa se creería más
  // líquida de lo que está y ninguna fórmula daría error.
  const g = construir()
  let n = 0
  for (let f = g.d0; f <= g.fTotal; f++) {
    for (const col of [2, 4]) if (celda(g, f, col).includes('ANEXO_EFECTIVO_NETO')) n++
  }
  assert.equal(n, 1, 'el neto de efectivo tiene que entrar al total por una sola puerta')
})

test('el total sigue sumando el bloque entero y descontando los valores a depositar', () => {
  const g = construir()
  const total = celda(g, g.fTotal, 4)
  assert.ok(total.includes(`SUM(E${g.d0}:E${g.d1})`), `el total tiene que barrer todo el bloque: ${total}`)
  const fCartera = filaDe(g, /^valores a depositar/i)
  assert.ok(total.includes(`-E${fCartera}`), 'y seguir restando los echeq en custodia (percibido)')
})

test('LA FECHA DE LA POSICIÓN VIVE EN LA FILA DEL TOTAL, y es la más reciente del bloque', () => {
  // Se publicaba apuntando a "la última fila del bloque, columna F" — que tenía fecha sólo porque la
  // cartera estaba última. Al agregar tres filas, la última pasó a ser una sin fecha: EOMONTH de una
  // celda vacía da 31/12/1899 y las dos filas más importantes de los dos cash flow quedaron VACÍAS los
  // doce meses. Sin error, sin aviso.
  const g = construir()
  const fecha = celda(g, g.fTotal, 5)
  assert.match(fecha, /^=/, 'la fecha de la posición tiene que ser CALCULADA, no un día pegado a mano')
  assert.ok(fecha.includes(`$F$${g.d0}:$F$${g.d1}`), `tiene que ser el MAX de las fechas del bloque; dice: ${fecha}`)
  assert.ok(/MAX\(/.test(fecha), 'la posición vale a la fecha del dato MÁS RECIENTE que la compone')
  assert.notEqual(g.fTotal, g.d1, 'el total está DEBAJO del bloque, no es su última fila')
})

test('los cheques emitidos NO restan de la disponibilidad, y el rótulo lo DICE', () => {
  // "Total disponibilidades" y "Disponibilidad neta" daban el MISMO número con esta línea en el medio.
  // Cualquiera lee que se resta — y no se resta, porque un cheque librado que el banco no debitó NO
  // salió de la cuenta (percibido). Que no se reste es correcto; que no se diga es lo que hace desconfiar.
  const g = construir()
  const f = filaDe(g, /^Cheques emitidos pendientes de debitar/)
  assert.ok(f > 0, 'la línea memo tiene que existir')
  assert.match(String(g.filas[f - 1][0]), /no restan/, 'el rótulo tiene que decir que no se resta')
  assert.ok(vacia(celda(g, f, 4)), 'y no puede aportar valor en pesos: entraría al SUM del bloque')
  assert.ok(f > g.fTotal, 'va DEBAJO del total, fuera de su rango de suma')
})

test('la caja en dólares existe, lleva su moneda y se valúa al tipo de cambio', () => {
  // "U$S 15.000" cobrados en efectivo entraban al cajón de PESOS como $15.000: el importe correcto en
  // la moneda equivocada, que no da error y está mal por dos órdenes de magnitud.
  const g = construir()
  const f = filaDe(g, /^Caja en dólares$/)
  assert.ok(f > 0, 'tiene que haber una fila de caja en dólares')
  assert.equal(celda(g, f, 1), 'USD', 'la columna de moneda dice USD')
  assert.match(celda(g, f, 2), /"USD"/, 'suma sólo los cobros marcados en dólares')
  assert.match(celda(g, f, 3), /TIPO_CAMBIO_USD/, 'y trae el tipo de cambio')
  assert.match(celda(g, f, 4), new RegExp(`C${f}\\*IF\\(D${f}`), 'y se valúa como cualquier otra cuenta')
})

test('las cuentas del bloque siguen siendo las del plan de cuentas (el rótulo es el ancla)', () => {
  const g = construir()
  for (const c of CUENTAS) {
    assert.ok(filaDe(g, new RegExp(`^${c.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) > 0,
      `falta la cuenta "${c.nombre}": CAJA ubica por RÓTULO, si cambia se rompe todo lo que la lee`)
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL ARQUEO — LA ÚNICA CELDA DE CAPTURA DE TODO EL ARCHIVO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('sin nada leído, el arqueo sale AUSENTE: sin dato no se sobrescribe', () => {
  // NO ALCANZA CON `vacia()`: el centinela VACIO pasa por vacío y significa "es mía y va vacía", o sea
  // que la fusión la LIMPIA. La primera versión de este test decía vacia() y dejó pasar un generador
  // que le borraba el conteo al dueño en la primera corrida — lo cazó el render en frío.
  const g = construir()
  for (const f of [g.fArqArs, g.fArqUsd]) {
    assert.ok(f > 0, 'el bloque del arqueo tiene que existir')
    for (const col of [2, 5]) {
      assert.equal(g.filas[f - 1][col], undefined,
        `la celda ${col} del arqueo tiene que estar AUSENTE (ni valor ni centinela VACIO): la carga el dueño`)
    }
  }
})

test('con el conteo ya cargado, el arqueo se RE-EMITE en su fila nueva (no se queda en la vieja)', () => {
  // La fusión preserva por POSICIÓN. Una corrida metió cuatro filas arriba, el bloque bajó de la 148 a
  // la 152, el conteo se quedó en la 148 y los rangos con nombre se republicaron en la 152 vacía:
  // CAJA_ARQUEO_ARS_FECHA quedó en blanco y $39,28M se fueron a cero sin un solo #ERROR.
  const cargado = new Map([
    ['Caja en pesos — contado', { saldo: 0, fecha: 46233, origen: '', quien: '' }],
    ['Caja en dólares — contado', { saldo: 15000, fecha: 46233, origen: '', quien: '' }],
  ])
  const g = grilla(cargado, REFS)
  assert.equal(g.filas[g.fArqArs - 1][2], 0, 'el importe 0 es un dato, no un vacío')
  assert.equal(g.filas[g.fArqArs - 1][5], 46233, 'y su fecha también — sin fecha no hay ventana')
  assert.equal(g.filas[g.fArqUsd - 1][2], 15000)
  // LA FECHA VIAJA COMO NÚMERO DE SERIE, no como "30/07/2026": el texto depende del locale (es_AR) y ya
  // vació una pestaña entera por leerse como dd/mm/yy.
  assert.equal(typeof g.filas[g.fArqArs - 1][5], 'number')
})

test('el rescate LEE el bloque del arqueo: sin esto el conteo no tiene de dónde viajar', () => {
  const cel = (valor, numero = null, formula = null) => ({ valor, numero, formula, formato: null })
  const grid = [
    [cel('Cuenta'), cel('Moneda'), cel('Saldo en su moneda'), cel(''), cel(''), cel('Fecha del saldo')],
    [cel('2 · ARQUEO DE LA CAJA FÍSICA — LO ÚNICO QUE SE CARGA A MANO')],
    [cel('Caja en pesos — contado'), cel('ARS'), cel('0', 0), cel(''), cel(''), cel('30/07/2026', 46233)],
    [cel('Caja en dólares — contado'), cel('USD'), cel('U$S 15.000,00', 15000), cel(''), cel(''), cel('30/07/2026', 46233)],
  ]
  const cargado = rescatar(grid)
  assert.equal(cargado.get('Caja en pesos — contado')?.saldo, 0)
  assert.equal(cargado.get('Caja en pesos — contado')?.fecha, 46233)
  assert.equal(cargado.get('Caja en dólares — contado')?.saldo, 15000)
  const g = grilla(cargado, REFS)
  assert.equal(g.filas[g.fArqArs - 1][5], 46233)
})

test('EL ARQUEO ES CAPTURA Y VA ARRIBA: el dueño no baja nueve conciliaciones para tipear', () => {
  const g = construir()
  assert.ok(g.fArq0 < filaDe(g, /^3 · CALENDARIO/), 'el arqueo tiene que estar antes del calendario')
  assert.ok(g.fArq0 < g.fCtrl0, 'el arqueo no puede vivir dentro del bloque de controles')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CALENDARIO — EL PISO CUENTA LA MISMA PLATA QUE EL CASH FLOW, NI MÁS NI MENOS (04/08)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// El calendario tenía su propia lista de egresos (cheques + nómina) y el cash flow otra (rubros de
// Compras). Con dos listas de la misma plata, el mismo mes daba $41.704.351 distinto en cada vista, y
// el que veía de MENOS era el que produce el PISO PROYECTADO — el número con el que se decide cuánto
// plazo fijo tomar. Un piso más alto que el real hace colocar plata que hace falta el 11/08.

test('NINGUNA línea de egreso del cuadro se cae del calendario: los tramos suman las diecinueve', () => {
  const g = construir()
  const egresos = lineasDeCaja().filter(({ signo }) => signo === -1)
  assert.ok(egresos.length >= 19, `el cuadro tiene ${egresos.length} líneas de egreso: si bajó, algo se perdió`)
  // Las dos líneas de nómina NO salen de Compras aunque tengan `rubro`: su fuente es la planilla de
  // jornales, así que su huella es el rango con nombre.
  const POR_PLANILLA = { 'Nómina · Jornales de obra': 'JORNALES_REAL_TOTAL', 'Nómina · Sueldos administración': 'DIRECCION_PAGO' }
  const huella = ({ linea }) => (POR_PLANILLA[linea.rubro] ?? (linea.rubro ? `"${linea.rubro}"`
    : linea.soloSub ? `"${linea.soloSub}"`
      : linea.cheques ? (linea.inst === 'cheques' ? 'Cheques Emitidos' : 'Tarjeta de Credito')
        : linea.calendarioImpuestos ? 'Impuestos y Financieros' : null))
  for (const f of g.filas.slice(g.cal0 - 1, g.cal1)) {
    const sale = String(f[3] ?? '')
    for (const l of egresos) {
      const h = huella(l)
      // Las tres sin huella son las que valen cero DECLARADO (descubierto, comisiones, impuesto al
      // cheque): su ausencia es el punto, y la cubre el control del anexo.
      if (!h) continue
      assert.ok(sale.includes(h), `el tramo "${f[0]}" no ve "${l.linea.nombre}" (buscaba ${h})`)
    }
  }
})

test('EL DOBLE CONTEO QUE NO PUEDE VOLVER: los cheques entran sólo si NO tienen factura cargada', () => {
  // Medido el 04/08: $43.380.472 de cheques librados cuya factura YA está en Compras. Como la columna
  // suma Compras entera por rubro, sumar además el cheque cuenta esa plata dos veces — el cheque es el
  // INSTRUMENTO y la factura la OBLIGACIÓN.
  const g = construir()
  for (const f of g.filas.slice(g.cal0 - 1, g.cal1)) {
    const sale = String(f[3] ?? '')
    for (const inst of ['Cheques Emitidos', 'Tarjeta de Credito']) {
      const i = sale.indexOf(`'${inst}'`)
      assert.ok(i > 0, `el tramo "${f[0]}" tiene que ver ${inst}`)
      const termino = sale.slice(sale.lastIndexOf('SUMPRODUCT(', i), i + 400)
      assert.ok(termino.includes('FALTA cargar la factura'),
        `el término de ${inst} suma cheques SIN filtrar por la marca de cobertura: eso los cuenta dos veces`)
    }
    assert.ok(!sale.includes('Compras!$X$4:$X="Pendiente"'),
      'el filtro por estado/medio de pago duplica los rubros de Compras que ya vienen del cuadro')
  }
})

test('EL OTRO DOBLE CONTEO: un cheque YA DEBITADO no vuelve a restarse — ya está en el saldo', () => {
  // El calendario parte del SALDO DEL BANCO y abre su primer tramo desde el serial 0, para no perder un
  // cheque viejo que sigue sin presentarse. Esa apertura sólo es correcta junto con el filtro de
  // debitado: sin él, "Vencido" volvía a restar 10 cheques ($11.631.542) y 2 cuotas ($556.899) que el
  // banco ya había debitado. El piso quedaba $12.188.441 por debajo del real — y un piso falsamente
  // bajo no es "conservador": frena colocaciones que sí se podían hacer.
  const g = construir()
  const COL_DEBITADO = { 'Cheques Emitidos': 'K', 'Tarjeta de Credito': 'J' }
  for (const f of g.filas.slice(g.cal0 - 1, g.cal1)) {
    const sale = String(f[3] ?? '')
    for (const [inst, colDeb] of Object.entries(COL_DEBITADO)) {
      const i = sale.indexOf(`'${inst}'`)
      const termino = sale.slice(sale.lastIndexOf('SUMPRODUCT(', i), i + 600)
      assert.ok(termino.includes(`UPPER('${inst}'!$${colDeb}$`) && termino.includes('<>"SI"'),
        `el tramo "${f[0]}" resta ${inst} sin excluir lo ya debitado: esa plata ya salió y está en el saldo`)
    }
  }
})

test('cada tramo del calendario suma los jornales, no sólo los cheques', () => {
  // El calendario leía UNA sola fuente: "Cheques Emitidos". Medido: el piso daba $70.643.236 ignorando
  // los ~$14M por mes de jornales, que es el egreso más grande de la empresa.
  const g = construir()
  const tramos = g.filas.slice(g.cal0 - 1, g.cal1)
  assert.equal(tramos.length, 6, 'los seis tramos con borde temporal')
  for (const f of tramos) {
    const sale = String(f[3])
    assert.match(sale, /JORNALES_REAL_PAGO/, 'el tramo tiene que ver la quincena cerrada sin pagar')
    assert.match(sale, /JORNALES_PROY_PAGO/, 'y la proyectada')
    assert.match(sale, /Cheques Emitidos|K\$2|I\$2/, 'sin perder los cheques, que ya estaban')
  }
})

test('LA DESCARGA: una quincena ya pagada no vuelve a pesar en el calendario', () => {
  const g = construir()
  const sale = String(g.filas[g.cal0 - 1]?.[3] ?? '')
  assert.match(sale, /IF\(ISNUMBER\(JORNALES_REAL_PAGADO\);JORNALES_REAL_PAGADO;/,
    'lo PAGADO manda sobre lo previsto: si se pagó, se pagó')
  assert.match(sale, /JORNALES_REAL_HASTA\)\)>=CAJA_FECHA_SALDO/,
    'y la ventana arranca en el corte del extracto: lo anterior ya está dentro del saldo')
  // La proyección no mira PAGADO: una quincena que todavía no existe no puede estar pagada. SE AÍSLA SU
  // TÉRMINO — mirar hasta el final de la fórmula es la misma trampa que anclar en la posición.
  const proy = sale.split('+SUMPRODUCT(').find((t) => t.includes('JORNALES_PROY_PAGO')) ?? ''
  assert.ok(proy.includes('JORNALES_PROY_PAGO'), 'el término de la proyección se pudo aislar')
  assert.ok(!proy.includes('JORNALES_REAL_PAGADO'), 'la proyección no se filtra por pagada: no tiene sentido')
})

test('LA OFICINA TAMBIÉN SALE DE ESTA CAJA, y de la misma fuente que el cash flow', () => {
  // El dueño: "no estás considerando oficina... por ende podría estar mal en caja". Eran ~$3,4M por mes
  // que salen del mismo banco. Y también la DIRECCIÓN: $9.000.000 de retiros con fecha 10/08 que el
  // calendario no veía porque leía OFICINA_* y no DIRECCION_*.
  const g = construir()
  const sale = String(g.filas[g.cal0 - 1]?.[3] ?? '')
  assert.match(sale, /OFICINA_PAGO/, 'la oficina entra al calendario')
  assert.match(sale, /DIRECCION_PAGO/, 'y los retiros de Dirección, la otra mitad de la nómina de administración')
  assert.match(sale, /IF\(ISNUMBER\(OFICINA_PAGADO\);OFICINA_PAGADO;0\)\+IF\(ISNUMBER\(OFICINA_PROYECTADO\)/,
    'un mes está pagado o proyectado, nunca los dos')
  const iOfi = sale.indexOf('SUMPRODUCT(ISNUMBER(OFICINA_PAGO)')
  const sig = sale.indexOf('+SUM', iOfi + 1)
  assert.ok(!/Compras!/.test(sale.slice(iOfi, sig < 0 ? undefined : sig)),
    'la nómina sale de la planilla de sueldos, no de Compras')
})

test('ANTES DEL CORTE MANDA EL BANCO: las quincenas viejas sin marcar NO son deuda', () => {
  // Sin esta condición el calendario mostraba $106M en "Vencido": las trece quincenas del año que nadie
  // marcó como pagadas, porque la columna "Pagado el" es nueva. No tener el dato NO es deber la plata.
  const g = construir()
  for (const f of g.filas.slice(g.cal0 - 1, g.cal1)) {
    const sale = String(f[3])
    assert.match(sale, /JORNALES_REAL_HASTA\)\)>=(MAX\()?CAJA_FECHA_SALDO/)
    assert.match(sale, /Compras!\$AD\$4:\$AD;">="&(MAX\()?CAJA_FECHA_SALDO/,
      'lo anterior al corte ya está descontado del saldo del banco')
  }
})

test('EL CALENDARIO PROYECTA LOS DOS LADOS, o su piso es falso', () => {
  // El dueño: "esos de 727k no es real". Se proyectaba la nómina hasta diciembre del lado que SALE y del
  // lado que ENTRA sólo se miraba la cartera de cheques. Proyectar un lado y no el otro no es prudencia:
  // es un cuadro desbalanceado que asusta con un número que no es un piso.
  const g = construir()
  for (const f of g.filas.slice(g.cal0 - 1, g.cal1)) {
    const entra = String(f[2] ?? '')
    assert.match(entra, /Cobranzas!\$O\$5/, 'el tramo mira el estado de Cobranzas')
    assert.match(entra, /Cobranzas!\$Q\$5/, 'y la fecha de cobro')
    assert.match(entra, /_CHEQUES_RAW/, 'sin perder la cartera, que ya estaba')
    // Lo COBRADO no entra (ya está en el banco) y lo ENDOSADO tampoco (se le dio a un tercero).
    assert.match(entra, /<>"cobrado"/)
    assert.match(entra, /<>"endosado"/)
    // ISNUMBER sobre la fecha: una fecha como TEXTO caería en varios tramos.
    assert.match(entra, /ISNUMBER\(Cobranzas!\$Q\$5/)
  }
})

test('la fecha que ubica el jornal en el tramo es la de PAGO, nunca la de cierre', () => {
  const g = construir()
  const sale = String(g.filas[g.cal0 - 1]?.[3] ?? '')
  assert.match(sale, /IF\(ISNUMBER\(JORNALES_REAL_PAGO\);JORNALES_REAL_PAGO;JORNALES_REAL_HASTA\)/,
    'el cierre es el ÚLTIMO recurso, detrás de la fecha pagada y de la prevista')
  assert.ok(!/\(JORNALES_REAL_HASTA[>=<]/.test(sale), 'HASTA nunca compara contra el borde del tramo')
})

test('UNA LÍNEA SIN FUENTE ROMPE, no desaparece: sin las filas del calendario fiscal no hay pestaña', () => {
  // Es la propiedad que costó $41,7M: no fue una fórmula mal escrita, fue un concepto que nadie sumó y
  // nada avisó. Una referencia a una fila muerta devolvería $0 de IVA SIN UN SOLO #ERROR.
  assert.throws(() => grilla(new Map(), { ...REFS, filasCal: undefined }), /Impuestos y Financieros/,
    'el generador tiene que romper antes que escribir un calendario ciego al IVA')
})

test('el universo del control de conceptos ciegos es el CUADRO, no las fuentes del calendario', () => {
  // EL CONTROL QUE ESTABA ACÁ ERA EL DEFECTO. Medía `horizonte − cheques − nómina − oficina`: el
  // calendario menos las mismas tres fuentes que el calendario sumaba, así que no podía dar otra cosa
  // que cero — y ese cero se leyó como "está todo bien" mientras al piso le faltaban $77M.
  const ciegos = conceptosFueraDelCalendario(
    lineasDeCaja().filter(({ signo }) => signo === -1).map(({ linea }) => linea.nombre))
  assert.equal(ciegos.length, 0, 'el universo medido es el cuadro entero: contra sí mismo no falta nada')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL TITULAR Y LA BANDA DEL PISO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el titular publica los cuatro números que se deciden, y ninguno es capacidad de endeudarse', () => {
  // "El concepto piso proyectado en caja es super confuso, ¿qué es? ¿lo puedo usar para invertir o
  // qué?" y "¿cuánto me va a quedar a fin de mes?". No son el mismo número y el titular publicaba uno
  // solo. Además tenía pegado el crédito no utilizado, que no es plata propia (NIC 7: el uso del
  // descubierto es actividad de FINANCIACIÓN).
  const g = construir()
  const titulos = g.filas[g.fTitulos - 1].filter((x) => !vacia(x) && String(x || '').trim())
  assert.equal(titulos.length, 4)
  assert.match(titulos[0], /DISPONIBLE HOY/)
  assert.match(titulos[1], /PISO DE CAJA/)
  assert.match(titulos[2], /CIERRE DE ESTE MES/)
  assert.match(titulos[3], /COLOCABLE/)
  for (const t of titulos) {
    assert.ok(!/^"?CR[ÉE]DITO|AIRE TOTAL|DESCUBIERTO/i.test(t), `"${t}" no va en el titular de caja`)
    // EL RÓTULO TRAE SU DEFINICIÓN EN LA MISMA CELDA (con salto de línea), porque una fila entera de
    // pies cuesta más de lo que aporta en una pestaña con presupuesto de 45 filas.
    assert.ok(String(t).startsWith('='), 'el rótulo es una fórmula: su definición lleva datos vivos')
    assert.ok(String(t).includes('CHAR(10)'), 'rótulo y definición van en la misma celda, en dos líneas')
  }
})

test('las cuatro cifras del titular son REFERENCIAS al detalle, nunca un número', () => {
  const g = construir()
  const cifras = g.filas[g.fCifras - 1].filter((x) => !vacia(x) && String(x || '').trim())
  assert.equal(cifras.length, 4)
  for (const c of cifras) {
    assert.ok(String(c).startsWith('='), `el titular "${c}" tendría que ser una fórmula`)
    assert.ok(!/^@/.test(String(c)), `quedó un marcador sin resolver: ${c}`)
  }
})

test('el piso y lo que queda a fin de mes son DOS celdas distintas del calendario', () => {
  const g = construir()
  const [, piso, finMes] = g.filas[g.fCifras - 1].filter((x) => !vacia(x) && String(x || '').trim())
  assert.notEqual(piso, finMes, 'si apuntan a la misma celda, el titular vuelve a contestar una sola pregunta')
  assert.equal(piso, `=$C$${g.fPeor}`, 'el piso sale de la línea que lo calcula con su banda')
  // Lo que queda a fin de mes sale de la posición acumulada del tramo que cierra el mes, ANCLADA A SU
  // RÓTULO: si alguien inserta un tramo, esto se rompe acá y no en silencio en la pestaña.
  const fila = Number(String(finMes).match(/\$F\$(\d+)/)[1])
  assert.equal(String(g.filas[fila - 1][0]).trim(), 'Resto de este mes')
})

test('el piso no se publica solo: en la misma línea van la punta de abajo y el ancho de la banda', () => {
  // El piso solo se lee como CERTEZA, y con él se decide un plazo fijo. Hay dos grupos de cheques cuya
  // cobertura no se sabe: con el piso a secas, esa ignorancia se lee como dato.
  const g = construir()
  assert.ok(g.fPeor > 0)
  assert.match(celda(g, g.fPeor, 2), /^=MIN\(\$F/, 'la punta de arriba es el mínimo del recorrido')
  assert.match(celda(g, g.fPeor, 3), /^=MIN\(/, 'la de abajo también es un MÍNIMO por tramo')
  assert.equal(celda(g, g.fPeor, 4), `=$C${g.fPeor}-$D${g.fPeor}`, 'el ancho sale de las dos puntas, no es otro cálculo')
  assert.match(celda(g, g.fPeor, 6), /cae en/, 'y dice en qué tramo cae, o el piso no da un plazo')
})

test('la punta de abajo es un MÍNIMO por tramo, no el piso menos un total', () => {
  // Restarle al piso TODO lo incierto le carga plata que sale DESPUÉS del punto más bajo: el peor caso
  // quedaría más abajo de lo que puede estar, y una banda inflada se ignora igual que una alarma que
  // suena siempre.
  const g = construir()
  const f = celda(g, g.fPeor, 3)
  const terminos = [...f.matchAll(/\$F(\d+)-\(/g)].map((m) => Number(m[1]))
  assert.deepEqual(terminos, Array.from({ length: g.cal1 - g.cal0 + 1 }, (_, i) => g.cal0 + i),
    'los términos tienen que ser las filas de los tramos, en orden y sin saltarse ninguno')
})

test('la banda cuenta lo que NO se puede afirmar, y sólo eso', () => {
  const g = construir()
  const f = celda(g, g.fPeor, 3)
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  assert.match(f, new RegExp(esc(`="${MARCAS.sinNumero}"`)), 'los cheques sin N° de comprobante')
  assert.match(f, /\$M\$2:\$M\$400=""/, 'y los que el OS todavía no miró')
  // Los verificados y los inferidos tienen evidencia y viven del lado de arriba: si entraran, la banda
  // contaría como incierta plata que ya viaja dentro de su rubro y además la restaría dos veces.
  assert.ok(!f.includes(MARCAS.ok), 'metió los verificados en la banda de lo que no se puede afirmar')
  assert.ok(!f.includes(MARCAS.inferido), 'metió los inferidos: entonces el cruce de respaldo no sirve para nada')
  assert.ok(!f.includes(MARCAS.falta), 'los "FALTA" ya los suma el calendario: contarlos acá los restaría dos veces')
})

test('lo colocable descuenta la caja mínima y nunca es negativo', () => {
  const g = construir()
  const colocable = g.filas[g.fCifras - 1].filter((x) => !vacia(x) && String(x || '').trim())[3]
  // LA CAJA MÍNIMA SE CITA POR NOMBRE Y EL NOMBRE APUNTA A SU FUENTE (`01_Valores Iniciales`): ni CAJA
  // ni el anexo la copian, así que no puede haber dos versiones del mismo parámetro.
  assert.ok(String(colocable).includes('CAJA_MINIMA'), 'lo colocable tiene que restar la caja mínima')
  assert.ok(String(colocable).includes('MAX(0;'), 'un colocable negativo se lee como "conseguí esto"')
  // Y sin caja mínima cargada NO publica un número: publicaría el piso entero, que es el error más caro
  // posible en esta celda.
  assert.ok(/^=IF\(N\(CAJA_MINIMA\)<=0;"";/.test(String(colocable)))
})

test('no queda ningún marcador @ sin resolver en toda la grilla', () => {
  const g = construir()
  for (const [i, f] of g.filas.entries()) {
    for (const c of f || []) {
      if (typeof c === 'string' && /^@[A-Z]/.test(c)) assert.fail(`fila ${i + 1}: marcador vivo "${c}"`)
    }
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA COBERTURA, LA CONCENTRACIÓN Y LOS VEREDICTOS
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('LA COBERTURA SALE DE LA MISMA DEFINICIÓN QUE EL CALENDARIO, no de una cuenta nueva', () => {
  // Una segunda definición de "obligaciones" es exactamente lo que costó los $41,7M de desacuerdo entre
  // CAJA y el Cash Flow.
  const g = construir()
  const tramo0 = String(g.filas[g.cal0 - 1][3])
  for (let f = g.fCobDesde; f <= g.fCobHasta; f++) {
    const sale = String(g.filas[f - 1][2])
    assert.ok(sale.startsWith(tramo0.slice(0, 60)), `la fila ${f} no usa el cuadro del cash flow`)
    assert.ok(sale.includes('TODAY()+'), 'la ventana tiene que ser de 30, 60 o 90 días')
    assert.ok(sale.includes('CAJA_FECHA_SALDO'), 'arranca en el corte: lo ya vencido pesa en las tres ventanas')
    const recursos = String(g.filas[f - 1][4])
    assert.ok(recursos.includes('CAJA_TOTAL_DISPONIBLE') && recursos.includes('Cobranzas!'),
      'los recursos son caja + cartera + cobranzas esperadas, no la caja sola')
    assert.ok(String(g.filas[f - 1][6]).startsWith(`=IF(C${f}<=0;"";`),
      'sin obligaciones no se inventa una cobertura infinita')
  }
})

test('el crédito no utilizado va DEBAJO de la cobertura y se cita por nombre, no se recalcula', () => {
  const g = construir()
  assert.ok(g.fCredito > g.fCobHasta, 'el crédito no es efectivo: no puede ir pegado a un saldo')
  const fila = g.filas[g.fCredito - 1]
  assert.match(String(fila[0]), /NO es efectivo/, 'el rótulo tiene que decirlo')
  for (const n of ['ANEXO_TARJETA_DISPONIBLE', 'ANEXO_ACUERDO', 'ANEXO_AIRE']) {
    assert.ok(fila.some((c) => String(c).includes(n)), `falta ${n}: el detalle vive en el anexo y se cita por nombre`)
  }
})

test('un RÓTULO CALCULADO no se combina como si fuera un párrafo', () => {
  // Las cinco filas del ranking llevan una fórmula larga en la columna del rótulo con B y E vacías:
  // cumplían la condición de "explicación", se fusionaban a lo ancho y tapaban el importe de al lado.
  const g = construir()
  for (let f = g.fCli0; f <= g.fCli1; f++) {
    const t = String(g.filas[f - 1][0])
    assert.ok(t.length > 120 && t.startsWith('='), 'el rótulo del ranking es una fórmula larga')
    assert.ok(String(g.filas[f - 1][2] ?? '').trim(), 'y tiene un importe al lado: por eso no es prosa')
  }
})

test('LOS CONTROLES NO DESAPARECIERON: cada uno sigue nombrado en el veredicto de CAJA', () => {
  // La mudanza al anexo es de UBICACIÓN, no de cobertura. Si un control se cayera del anexo y nadie lo
  // citara acá, la pestaña quedaría más linda y más ciega — que es exactamente lo que no puede pasar.
  const g = construir()
  const bloque = g.filas.slice(g.fCtrl0 - 1, g.fCtrl1).map((f) => f.join(' ')).join(' ')
  for (const n of ['ANEXO_DIF_ECHEQ', 'ANEXO_DIF_CONCILIACION', 'ANEXO_EFECTIVO_SIN_EXPLICAR',
    'ANEXO_VENCIDO_SIN_CONCILIAR', 'ANEXO_OFICINA_SIN_CANAL', 'ANEXO_CHEQUES_SIN_MARCA', 'ANEXO_CHEQUES_SIN_FECHA']) {
    assert.ok(bloque.includes(n), `el control ${n} no está citado en el veredicto: se perdió al mudarse`)
  }
  // Y EL VEREDICTO NOMBRA AL CULPABLE: un total agrupado sin decir cuál manda es el "número mudo" que
  // este archivo persigue desde el 21/07.
  for (let f = g.fCtrl0 + 1; f <= g.fCtrl1; f++) {
    assert.match(celda(g, f, 6), /^=IF\(MAX\(/, 'el veredicto tiene que decir CUÁL de los controles manda')
    assert.match(celda(g, f, 6), /"\$#,##0"/, 'y con su monto')
  }
})

test('la varianza previsto-contra-real está en la primera pantalla, no en el anexo', () => {
  // Es KPI de primer orden en cualquier tesorería y en este archivo no existía en ninguna parte.
  const g = construir()
  const f = filaDe(g, /previsto contra real/i)
  assert.ok(f > 0, 'la varianza tiene que estar en CAJA')
  assert.ok(f < g.fCob0, 'y pegada al calendario, que es de donde sale')
  assert.equal(celda(g, f, 2), `=$C${g.cal0}`, 'lo previsto que entraba es el tramo Vencido')
  assert.equal(celda(g, f, 3), `=$D${g.cal0}`, 'y lo previsto que salía, el mismo tramo')
  assert.match(celda(g, f, 4), /ANEXO_VENCIDO_SIN_CONCILIAR/, 'el desvío es lo que sigue sin marcarse')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LEGIBILIDAD Y FORMATO — SE MIDE, NO SE OPINA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('LA NUMERACIÓN DE BLOQUES ES CONSECUTIVA Y SIN HUECOS', () => {
  // Un cuadro que va "1, 2, 3, 4, 8, 9" desorienta: parece que faltan bloques.
  const g = construir()
  const rot = g.filas.map((f) => String(f?.[0] ?? '').trim())
  const raiz = rot.map((t) => t.match(/^(\d+) · /)?.[1]).filter(Boolean).map(Number)
  assert.deepEqual(raiz, [1, 2, 3, 4, 5, 6], `bloques con hueco: ${raiz.join(', ')}`)
  // Y ningún rótulo puede quedar con la numeración vieja: un "7.3" suelto manda a buscar un bloque que
  // ya no existe en esta pestaña.
  for (const t of rot) assert.ok(!/^\d+\.\d+ · /.test(t), `quedó un rótulo del anexo viejo: ${t}`)
})

test('EL "$" ES DEL TOTAL: el cuerpo va sin símbolo y sólo las filas de cierre lo llevan', () => {
  const g = construir()
  assert.ok(g.totales.length >= 3, 'tienen que existir filas de total identificadas')
  // El ancla es el TEXTO, nunca la posición: agregar un bloque no puede romper la lista.
  for (const f of g.totales) assert.match(String(g.filas[f - 1][0]), /^\s*(⇒|Total|TOTAL)/)
  const fCuenta = filaDe(g, /^Caja en pesos$/)
  assert.ok(fCuenta > 0 && !g.totales.includes(fCuenta))
})

test('CADA BLOQUE DECLARA LA FECHA DE SU FUENTE, y es una fórmula', () => {
  // La pestaña mezcla un arqueo del 04/08, un extracto del 05/08 y un resumen de tarjeta del 22/07. Es
  // legítimo —una fuente viva no le presta su frescura a una congelada— pero tiene que estar DICHO.
  const g = construir()
  const bloques = g.filas.map((f, i) => ({ i, t: String(f?.[0] ?? '') })).filter((x) => /^\d+ · /.test(x.t))
  assert.ok(bloques.length >= 5)
  const conFecha = bloques.filter((b) => String(g.filas[b.i][6] ?? '').trim() && !vacia(g.filas[b.i][6]))
  assert.equal(conFecha.length, bloques.length, 'todos los bloques tienen que declarar de cuándo es su dato')
  // Los tres que dependen de una fuente con corte lo hacen con una FÓRMULA: una fecha escrita a mano
  // declara la frescura de la CORRIDA, no la del dato, y con el pipeline detenido eso es una mentira.
  const vivos = conFecha.filter((b) => String(g.filas[b.i][6]).startsWith('='))
  assert.ok(vivos.length >= 3, 'la fecha de las fuentes con corte tiene que ser calculada, no escrita')
})

test('ninguna fórmula usa la coma como separador de ARGUMENTOS (en es_AR va `;`; la coma es decimal)', () => {
  // Este test empezó siendo "ninguna coma" y encontró un falso positivo que enseña la regla real: la
  // fila del ritmo de gasto divide por `30,44` y en un archivo es-AR eso es el NÚMERO 30,44. La regla
  // que importa es la otra: una coma entre ARGUMENTOS deja #ERROR! en la celda.
  const g = construir()
  for (const [i, fila] of g.filas.entries()) {
    for (const [j, c] of fila.entries()) {
      if (j >= 7) continue
      const s = String(c ?? '')
      if (!s.startsWith('=')) continue
      const sospechosas = s.replace(/"[^"]*"/g, '""').replace(/(?<=\d),(?=\d)/g, '')
      assert.doesNotMatch(sospechosas, /,/,
        `fila ${i + 1} col ${j}: coma usada como separador de argumentos, va a dar #ERROR! en es-AR:\n  ${s}`)
    }
  }
})

/** Saca los literales de texto de una fórmula: lo de adentro es prosa legítima y no se audita. */
const sinLits = (s) => String(s).replace(/"(?:[^"]|"")*"/g, '«»')

test('NINGUNA fórmula lleva su explicación PEGADA con " — " fuera de un literal', () => {
  // H114 quedó en #ERROR! y el generador había dicho "✓ ninguna celda en error": la celda tenía la
  // fórmula del detalle Y su explicación pegadas. Eso no parsea, y en la columna de prosa el
  // localizador es-AR además le cambia las comas del castellano por ";".
  const g = construir()
  for (const [i, fila] of (g.filas || []).entries()) {
    for (const [j, c] of (fila || []).entries()) {
      const s = String(c ?? '')
      if (!s.startsWith('=')) continue
      assert.ok(!/\s—\s/.test(sinLits(s)),
        `fila ${i + 1} col ${j}: la fórmula tiene una explicación pegada con " — " fuera de comillas.\n  ${s.slice(0, 140)}`)
    }
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA COLUMNA H NO VUELVE (03/08)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// La corrida del 03/08 le escribió al dueño 66 celdas de prosa en la columna H. Él las borra siempre
// —textual: "esas aclaraciones de mierda yo siempre las saco"— y ya lo había pedido en julio para
// Impuestos y Cargas Sociales. Volvió por un MERGE: se rescataron generadores de una rama anterior a
// esa decisión. Por eso el control es de grilla y no de revisión: un merge no lee las decisiones, lee
// los tests.

test('la grilla no lleva NI UNA celda de prosa en la columna H', () => {
  const g = construir()
  const conTexto = g.filas.map((f, i) => ({ fila: i + 1, v: f[7] })).filter((x) => !vacia(x.v) && x.v !== undefined)
  assert.deepEqual(conTexto, [],
    'volvió la columna "de dónde sale". El generador escribe el DATO; la explicación va en el código.\n'
    + conTexto.slice(0, 8).map((x) => `  fila ${x.fila}: ${String(x.v).slice(0, 70)}`).join('\n'))
})

test('la columna H se emite con el centinela: la intención queda DECLARADA, no implícita', () => {
  // Una celda AUSENTE significa "no es mía, no la toco"; el centinela VACIO significa "es mía y va
  // vacía". La columna de prosa es del generador, así que sale declarada — y así la fusión limpia las
  // 66 que quedaron de las corridas viejas.
  const g = construir()
  for (const f of g.filas) assert.equal(f[7], VACIO, 'la columna de prosa tiene que salir con el centinela')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LOS RANGOS CON NOMBRE — UN NOMBRE NO SE REAPUNTA A UNA GRILLA QUE NO SE ESCRIBIÓ (03/08)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// EL DAÑO, MEDIDO. Los rangos se publicaban ANTES de escribir, contra la grilla que el generador
// PENSABA escribir. El 03/08 el portón frenó la escritura —la pestaña era del dueño— y la pestaña quedó
// con su layout viejo mientras los nombres se iban cuatro filas abajo: `CAJA_ARQUEO_ARS` cayó en una
// celda vacía y el total pasó de $123,79M a $80,91M. Sin un solo #REF!, y con el diff de la pestaña en
// CERO celdas: el contenido no se tocó, se movieron los punteros.

const G_FALSA = { fArqArs: 15, fArqUsd: 16, fBancoPesos: 8, fCartera: 10 }

test('ANTES de escribir sólo se CREAN los que faltan: ninguno se reapunta', async () => {
  const { requestsDeRangos, RANGOS_DE_CAJA } = await import('./caja-pestana.mjs')
  const existentes = RANGOS_DE_CAJA.map((r, i) => ({ name: r.nombre, namedRangeId: `id${i}`, range: { startRowIndex: 999 } }))
  assert.equal(requestsDeRangos(7, G_FALSA, existentes, { soloFaltantes: true }).length, 0,
    'con todos los nombres ya creados, antes de escribir no se toca ninguno')
})

test('ANTES de escribir, el que NO existe sí se crea — si no, #NAME? en la primera corrida', async () => {
  const { requestsDeRangos, RANGOS_DE_CAJA } = await import('./caja-pestana.mjs')
  const reqs = requestsDeRangos(7, G_FALSA, [], { soloFaltantes: true })
  assert.equal(reqs.length, RANGOS_DE_CAJA.length, 'arranque en frío: se crean todos')
  assert.ok(reqs.every((r) => r.addNamedRange), 'sólo se AGREGAN, nunca se reapunta')
})

test('DESPUÉS de escribir sí se reapuntan todos a la grilla escrita', async () => {
  const { requestsDeRangos, RANGOS_DE_CAJA } = await import('./caja-pestana.mjs')
  const existentes = RANGOS_DE_CAJA.map((r, i) => ({ name: r.nombre, namedRangeId: `id${i}`, range: { startRowIndex: 999 } }))
  const reqs = requestsDeRangos(7, G_FALSA, existentes)
  assert.equal(reqs.length, RANGOS_DE_CAJA.length)
  const arq = reqs.find((r) => r.updateNamedRange?.namedRange?.name === 'CAJA_ARQUEO_ARS')
  assert.equal(arq.updateNamedRange.namedRange.range.startRowIndex, 14, 'fila 15, 0-based')
})

test('TIPO_CAMBIO_USD ya NO lo publica CAJA: su bloque se mudó al anexo', async () => {
  // Dos escritores sobre el mismo nombre es cómo un rango termina apuntando a una celda vacía. El
  // bloque del tipo de cambio vive en `_CAJA_ANEXO`, así que el anexo es su único dueño.
  const { RANGOS_DE_CAJA } = await import('./caja-pestana.mjs')
  assert.ok(!RANGOS_DE_CAJA.some((r) => r.nombre === 'TIPO_CAMBIO_USD'),
    'dos generadores publicando el mismo nombre es la receta del rango que miente')
})

test('EL DESASTRE DEL 31/07: si la escritura se saltea, NO se formatea ni se mueven los nombres', () => {
  // La guarda hacía bien su trabajo —con la pestaña candada no se escribe— pero el resultado se
  // ignoraba: `formatear` pintaba la geometría de la grilla NUEVA sobre los valores VIEJOS y `publicar`
  // reapuntaba los nombres a celdas vacías. Con el total y la fecha de corte en cero, todo cheque y toda
  // quincena pasan el filtro ">=CAJA_FECHA_SALDO" y el calendario infla.
  //
  // Se verifica sobre el FUENTE porque es una secuencia de efectos sobre Google, no una función pura:
  // un test que llamara a las mismas funciones mockeadas probaría el mock, no el orden.
  const src = readFileSync(new URL('./caja-pestana.mjs', import.meta.url), 'utf8')
  const i = src.indexOf('const escritura = await escribirPreservando')
  assert.ok(i > 0, 'el resultado de la escritura se guarda en una variable, no se descarta')
  const corte = src.indexOf('await formatear(', i)
  assert.ok(corte > i, 'formatear viene después de escribir')
  const entre = src.slice(i, corte)
  assert.match(entre, /escritura\?\.bloqueada \|\| escritura\?\.editadaPorHumano/, 'se consulta el skip')
  assert.match(entre, /\n\s+return\n/, 'y se CORTA la corrida antes de formatear')
  assert.ok(src.indexOf('await publicar(', corte) > corte, 'publicar queda del lado protegido por el return')
})

test('el generador NO publica rangos en el camino de la escritura frenada', () => {
  const src = readFileSync(new URL('./caja-pestana.mjs', import.meta.url), 'utf8')
  const corte = src.indexOf('escritura?.bloqueada || escritura?.editadaPorHumano')
  const soloFaltantes = src.indexOf('soloFaltantes: true')
  const reapunta = src.indexOf('reapuntados a la grilla RECIÉN ESCRITA')
  assert.ok(corte > 0 && soloFaltantes > 0 && reapunta > 0, 'las tres marcas tienen que existir')
  assert.ok(soloFaltantes < corte, 'la creación de los que faltan va ANTES del corte')
  assert.ok(reapunta > corte, 'el reapuntado va DESPUÉS del corte: si la escritura se frena, no se llega')
})

test('CAJA no se escribe si falta la pestaña del anexo: sería media pantalla en #NAME?', () => {
  const src = readFileSync(new URL('./caja-pestana.mjs', import.meta.url), 'utf8')
  const i = src.indexOf('PESTANA_ANEXO)')
  const escribe = src.indexOf('escribirPreservando(google')
  assert.ok(i > 0 && i < escribe, 'la guarda tiene que estar ANTES de escribir')
  assert.match(src.slice(i, i + 500), /throw new Error/, 'y romper, no seguir con los controles en error')
})


test('TEXTO EN UNA COLUMNA DE PLATA: sólo los encabezados, y el formateador los declara', () => {
  // `auditar-pantalla.mjs` reportaba 4 defectos `texto_en_numero` — el caso real era F52 "Esta semana",
  // un rótulo de tramo caído en la columna de la posición acumulada. Un texto en una celda con formato
  // de moneda no da error: se dibuja raro y hace desconfiar de toda la fila.
  //
  // La única excepción legítima es el ENCABEZADO de una tabla, y tiene que ser exactamente eso: una fila
  // que el formateador YA CONOCE y a la que le devuelve el formato de TEXTO. Cualquier otra constante en
  // C, D o E es el defecto — y esta lista es la misma que usa `formatear`, así que agregar un encabezado
  // sin declararlo pone este test en rojo en vez de dejar cuatro celdas mal dibujadas en la planilla.
  const g = construir()
  const cabeceras = new Set([g.cab1, g.cabCli, filaDe(g, /^Tramo$/), filaDe(g, /^Horizonte$/)])
  for (const [i, f] of g.filas.entries()) {
    for (const col of [2, 3, 4]) {
      const v = f[col]
      if (typeof v !== 'string' || vacia(v) || v.startsWith('=') || !Number.isNaN(Number(v))) continue
      assert.ok(cabeceras.has(i + 1),
        `fila ${i + 1} col ${String.fromCharCode(65 + col)}: "${v}" es texto en una columna de plata y no es un encabezado declarado`)
    }
  }
})

test('la fila que declara la fecha de su bloque NO usa la columna de fechas', () => {
  // La columna F es de FECHAS en el bloque de cuentas y de PLATA en el calendario. La declaración de
  // frescura de cada bloque va en la G, que es la columna de texto: puesta en la F heredaría el formato
  // de su columna y una frase se dibujaría como un importe — o, si queda vacía, como el 30/12/1899.
  const g = construir()
  for (const [i, f] of g.filas.entries()) {
    if (!/^\d+ · /.test(String(f[0] ?? ''))) continue
    assert.ok(vacia(f[5]), `el bloque de la fila ${i + 1} declara su fecha en la columna F, que no es de texto`)
    assert.ok(!vacia(f[6]), `el bloque de la fila ${i + 1} no declara de cuándo es su dato`)
  }
})
