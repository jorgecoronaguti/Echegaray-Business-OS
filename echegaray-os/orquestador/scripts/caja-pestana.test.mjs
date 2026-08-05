// LA GRILLA DE CAJA, VERIFICADA EN FRÍO. Sin red, sin base, sin escribir una celda.
//
// POR QUÉ EXISTE (31/07). El bloque de disponibilidades tiene una propiedad que no se puede ver
// leyendo una fórmula sola: que el TOTAL no cuente el mismo peso dos veces. El total es
// `SUM(E7:E13)`, así que basta con que dos filas de ese rango aporten el mismo dinero para que la
// empresa se crea más líquida de lo que está — y ninguna fórmula individual da error. Sólo se ve
// mirando la grilla ENTERA, que es lo que hace este test.
//
// Antes esto no se podía testear: importar caja-pestana.mjs ejecutaba main() y reescribía la pestaña
// REAL. Ahora `grilla` se exporta y `main()` corre sólo si se invoca el archivo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { grilla, rescatar } from './caja-pestana.mjs'
import { lineasDeCaja, conceptosFueraDelCalendario } from '../lib/calendario-egresos.mjs'
import { CUENTAS } from '../lib/caja-disponibilidades.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'
import { MARCAS } from '../lib/cheques-cobertura.mjs'

/** Una celda VACÍA de la grilla. El generador no escribe '': escribe el centinela VACIO, que le dice
 *  al portón "esta celda es MÍA y está vacía" (una celda ajena y vacía se preserva). Ver
 *  lib/preservar-anotaciones.mjs — el centinela existe porque clearValues borraba trabajo del dueño. */
const vacia = (s) => s === '' || s === VACIO

// `filasCal` son las filas de "Impuestos y Financieros" donde viven el IVA y el IIBB a pagar. En la
// corrida real las ubica main() POR RÓTULO; acá son dos números cualesquiera porque lo que el test
// verifica es la FORMA de la fórmula, no el contenido de esa pestaña. Que sean obligatorias es el
// punto: sin ellas el generador rompe (ver el test de más abajo) en vez de escribir $0 de IVA.
const REFS = { bancoRaw: '_BANCO_RAW', cheques: 'Cheques Emitidos', chequesRaw: '_CHEQUES_RAW', filasCal: { iva: 18, iibb: 19 } }
const CARTERA = { origen: 'test', enCartera: [], endosados: [] }
const construir = () => grilla(new Map(), REFS, CARTERA)

/** La fila (1-based) cuyo rótulo en la columna A matchea. */
const filaDe = (g, re) => g.filas.findIndex((f) => re.test(String(f?.[0] ?? '').trim())) + 1
const celda = (g, fila, col) => String(g.filas[fila - 1]?.[col] ?? '')

test('la grilla se puede construir sin red, sin base y sin escribir nada', () => {
  const g = construir()
  assert.ok(g.filas.length > 50, 'la pestaña tiene que tener sus bloques')
  assert.ok(g.d0 > 0 && g.d1 >= g.d0, 'el bloque de disponibilidades tiene principio y fin')
})

test('"Caja en pesos" es la PRIMERA fila del bloque, y su saldo en pesos suma el neto de efectivo', () => {
  const g = construir()
  const fCaja = filaDe(g, /^caja en pesos$/i)
  assert.equal(fCaja, g.d0, 'el arqueo tiene que seguir siendo la fila ancla del bloque')
  const fNeto = filaDe(g, /^movimientos de efectivo posteriores al arqueo$/i)
  assert.ok(fNeto > 0, 'la línea del neto tiene que existir')

  // DESDE EL 01/08 el saldo vivo está en la columna de ORIGEN (C), no en la de pesos: la fila se
  // comporta como cualquier cuenta —importe en su moneda × tipo de cambio— en vez de mostrar el
  // arqueo en cero al lado de quince millones.
  const origen = celda(g, fCaja, 2)
  assert.match(origen, /^=/, '"Caja en pesos" tiene que ser una FÓRMULA, no un número pegado')
  assert.ok(origen.includes(`$C$${fNeto}`),
    `el saldo tiene que sumar la celda del neto ($C$${fNeto}); dice: ${origen}`)
  assert.match(origen, /CAJA_ARQUEO_ARS/, 'y partir del arqueo declarado, citado por nombre')
  const pesos = celda(g, fCaja, 4)
  assert.match(pesos, new RegExp(`C${fCaja}\\*IF\\(D${fCaja}`), 'y valuarse como cualquier otra cuenta')
})

test('el ARQUEO no se pisa: sin nada leído sus celdas ni se emiten, así la fusión preserva el conteo', () => {
  const g = construir()
  // Desde el 01/08 el conteo físico vive en su propio bloque (4.10). Cuando NO se pudo leer nada de la
  // pestaña —que es este caso: `construir()` pasa un mapa vacío— el generador escribe el rótulo y la
  // moneda y NO emite el importe ni la fecha: una celda ausente la preserva la fusión, mientras que el
  // centinela VACIO la borraría. Es la diferencia entre "esta celda es mía y va vacía" y "esta celda
  // es tuya y no la toco". Cuando SÍ se leyó, el conteo se re-emite para viajar con su bloque — ver el
  // test del 03/08 al final del archivo, que es el defecto que dejó la caja física en cero.
  for (const f of [g.fArqArs, g.fArqUsd]) {
    assert.ok(f > 0, 'el bloque del arqueo declarado tiene que existir')
    // NO ALCANZA CON `vacia()`: el centinela VACIO pasa por vacío y significa "es mía y va vacía",
    // o sea que la fusión la LIMPIA. La primera versión de este test decía vacia() y dejó pasar un
    // generador que le borraba el conteo al dueño en la primera corrida — lo cazó el render en frío.
    // La celda de carga tiene que ser `undefined`: ausente, que es lo único que la fusión preserva.
    for (const col of [2, 5]) {
      assert.equal(g.filas[f - 1][col], undefined,
        `la celda ${col} del arqueo tiene que estar AUSENTE (ni valor ni centinela VACIO): la carga el dueño`)
    }
  }
})

test('EL ANTI-DOBLE-CONTEO: la fila del neto no aporta valor en pesos', () => {
  const g = construir()
  const fNeto = filaDe(g, /^movimientos de efectivo posteriores al arqueo$/i)
  const pesosNeto = celda(g, fNeto, 4)
  assert.doesNotMatch(pesosNeto, /=?\$?C\$?\d+/,
    `la fila del neto NO puede poner su importe en la columna de pesos: el total es SUM y contaría `
    + `el mismo efectivo dos veces (una en "Caja en pesos" y otra acá). Dice: ${pesosNeto}`)
})

test('el total sigue sumando el bloque entero y descontando los valores a depositar', () => {
  const g = construir()
  const fTotal = filaDe(g, /^total disponibilidades$/i)
  const total = celda(g, fTotal, 4)
  assert.ok(total.includes(`SUM(E${g.d0}:E${g.d1})`), `el total tiene que barrer todo el bloque: ${total}`)
  const fCartera = filaDe(g, /^valores a depositar/i)
  assert.ok(total.includes(`-E${fCartera}`), 'y seguir restando los echeq en custodia (percibido)')
})

test('exactamente UNA fila del bloque aporta el efectivo: ninguna otra referencia al neto en pesos', () => {
  const g = construir()
  const fNeto = filaDe(g, /^movimientos de efectivo posteriores al arqueo$/i)
  // Cuántas celdas de la COLUMNA DE PESOS, dentro del bloque, mencionan la celda del neto.
  let n = 0
  for (let f = g.d0; f <= g.d1; f++) {
    for (const col of [2, 4]) if (celda(g, f, col).includes(`$C$${fNeto}`) || celda(g, f, col) === `=C${fNeto}`) n++
  }
  assert.equal(n, 1, 'el neto de efectivo tiene que entrar al total por una sola puerta')
})

test('el desglose del efectivo está y no suma: los tres sumandos se ven en la columna de origen', () => {
  const g = construir()
  const fCob = filaDe(g, /\(\+\) cobrado en efectivo después del arqueo/i)
  const fPag = filaDe(g, /\(−\) pagado en efectivo después del arqueo/i)
  const fDep = filaDe(g, /\(−\) depositado en el banco después del arqueo/i)
  for (const [nombre, f] of [['cobrado', fCob], ['pagado', fPag], ['depositado', fDep]]) {
    assert.ok(f > 0, `falta el renglón del desglose: ${nombre}`)
    assert.match(celda(g, f, 2), /^=/, `${nombre}: el desglose tiene que ser fórmula`)
    assert.ok(vacia(celda(g, f, 4)), `${nombre}: el desglose NO puede aportar valor en pesos`)
  }
  // Los dos que descargan la caja van negativos, para que el desglose se lea sumando de arriba abajo.
  // El signo va DESPUÉS de la guarda de arqueo (01/08): `=IF(NOT(ISNUMBER(...));0;-(...))`.
  assert.match(celda(g, fPag, 2), /;-\(/)
  assert.match(celda(g, fDep, 2), /;-\(/)
})

test('la alerta 4.6 lee el ARQUEO CRUDO, no el saldo en pesos (que ahora mezcla otra ventana)', () => {
  const g = construir()
  const fArq = filaDe(g, /^arqueo declarado de caja física$/i)
  assert.ok(fArq > 0, 'la fila del arqueo declarado tiene que estar en el bloque de trazabilidad')
  const v = celda(g, fArq, 4)
  // Desde el 01/08 el conteo vive en el bloque 4.10 y se cita por nombre, no por la fila del bloque 1
  // (que ahora muestra el saldo VIVO, con movimientos posteriores que están fuera de esta ventana).
  assert.match(v, /CAJA_ARQUEO_ARS/, `tiene que leer el conteo físico declarado: ${v}`)
  assert.doesNotMatch(v, new RegExp(`=E${g.d0}\\b`),
    'no puede leer el saldo en pesos: desde el cambio incluye movimientos posteriores al arqueo, '
    + 'que están fuera de la ventana de esta alerta — mezclar las dos daría un faltante falso')
})

// ═══ LA COMA EN es_AR ES EL SEPARADOR DECIMAL, NO EL DE ARGUMENTOS ═══
//
// Este test empezó siendo "ninguna coma" y encontró un falso positivo que enseña la regla real: la
// fila del ritmo de gasto divide por `30,44` (los días promedio de un mes), y en un archivo es-AR eso
// es el NÚMERO 30,44 y está perfecto. Prohibir toda coma habría obligado a romper un número correcto.
//
// La regla que importa es la otra: una coma entre ARGUMENTOS (donde va `;`) deja #ERROR! en la celda,
// y ya rompió CAJA y la ARRAYFORMULA de Compras. Se distinguen por el contexto: dígito-coma-dígito es
// un decimal; cualquier otra coma es un separador mal escrito.
test('ninguna fórmula usa la coma como separador de ARGUMENTOS (en es_AR va `;`; la coma es decimal)', () => {
  const g = construir()
  for (const [i, fila] of g.filas.entries()) {
    for (const [j, c] of fila.entries()) {
      // La columna de origen (7) es PROSA, y algunas de sus notas citan la fórmula que explican: esa
      // prosa lleva comas de castellano y no es una fórmula. Se revisan las columnas de datos.
      if (j >= 7) continue
      const s = String(c ?? '')
      if (!s.startsWith('=')) continue
      // Fuera los textos entre comillas y fuera los decimales legítimos (12,5 · 30,44).
      const sospechosas = s.replace(/"[^"]*"/g, '""').replace(/(?<=\d),(?=\d)/g, '')
      assert.doesNotMatch(sospechosas, /,/,
        `fila ${i + 1} col ${j}: coma usada como separador de argumentos, va a dar #ERROR! en es-AR:\n  ${s}`)
    }
  }
})

test('las cuentas del bloque siguen siendo las del plan de cuentas (el rótulo es el ancla)', () => {
  const g = construir()
  for (const c of CUENTAS) assert.ok(filaDe(g, new RegExp(`^${c.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) > 0,
    `falta la cuenta "${c.nombre}": CAJA ubica por RÓTULO, si cambia se rompe todo lo que la lee`)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL MONTO Y SU FECHA NO SE PUEDEN SEPARAR (31/07)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ PASÓ. Los dos cash flow abren su saldo con dos nombres de CAJA: CAJA_TOTAL_DISPONIBLE (cuánto) y
// CAJA_FECHA_SALDO (a qué fecha). El segundo se publicaba apuntando a "la última fila del bloque,
// columna F" — que tenía fecha sólo porque la cartera estaba última. Al agregar las tres filas de
// efectivo posteriores al arqueo, la última pasó a ser "(−) depositado en el banco", que no lleva
// fecha. EOMONTH de una celda vacía da 31/12/1899, así que la comparación por mes nunca acertaba y las
// dos filas más importantes del cuadro —"Efectivo al inicio" y "al cierre"— quedaron VACÍAS los doce
// meses. Sin error. CAJA lo cantaba en "lo que no cierra" por $108,5M y nadie lo había leído.
//
// Es la SEGUNDA vez que `d1` ("la última fila") rompe algo por crecer el bloque: la primera fue la
// alerta de echeqs. Por eso la fecha pasa a ser un dato CALCULADO en la fila del total.
test('LA FECHA DE LA POSICIÓN VIVE EN LA FILA DEL TOTAL, y es la más reciente del bloque', () => {
  const g = construir()
  const fecha = celda(g, g.fTotal, 5)
  assert.match(fecha, /^=/, 'la fecha de la posición tiene que ser CALCULADA, no un día pegado a mano')
  assert.ok(fecha.includes(`$F$${g.d0}:$F$${g.d1}`),
    `tiene que ser el MAX de las fechas del bloque ($F$${g.d0}:$F$${g.d1}); dice: ${fecha}`)
  assert.ok(/MAX\(/.test(fecha), 'la posición vale a la fecha del dato MÁS RECIENTE que la compone')
})

test('la última fila del bloque NO sirve como ancla de fecha — por eso ya no se usa', () => {
  const g = construir()
  // La prueba de que el ancla vieja estaba podrida: hoy la última fila del bloque no tiene fecha.
  // Si alguien reordena el bloque y vuelve a poner una fila con fecha al final, este test seguiría
  // pasando; lo que garantiza el arreglo es el test de arriba (la fecha vive en la fila del total).
  assert.ok(vacia(celda(g, g.d1, 5)),
    'la última fila del bloque no lleva fecha: cualquier nombre anclado ahí queda apuntando a una celda vacía')
  assert.notEqual(g.fTotal, g.d1, 'el total está DEBAJO del bloque, no es su última fila')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// UNA FÓRMULA NO PUEDE VIVIR EN LA COLUMNA DE PROSA (31/07)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// H114 quedó en #ERROR! y el generador había dicho "✓ ninguna celda en error". La celda tenía la
// fórmula del detalle Y su explicación pegadas: `=IFERROR(TEXTJOIN(…);"") — Cheques con fecha de pago
// dentro de la ventana…`. Eso no parsea. Y como la columna de origen es la que el localizador es-AR
// recorre cambiando comas por punto y coma, la prosa terminó escrita "Si el banco ya los cobró; hay
// que marcarlos": los punto y coma se comieron las comas del castellano, que era la pista de que algo
// se estaba tratando como fórmula sin serlo.
//
// El invariante NO es "sin fórmulas en la columna de prosa": la fila 49 tiene un `=CONCATENATE(…)`
// legítimo que CONSTRUYE la prosa con un número vivo, y eso es exactamente lo que se quiere. Lo que
// no puede pasar es que haya TEXTO SUELTO DESPUÉS de que la fórmula cierra: ahí ya no hay una fórmula,
// hay dos cosas pegadas, y Sheets no parsea ninguna.

/** Saca los literales de texto de una fórmula: lo de adentro es prosa legítima y no se audita. */
const sinLits = (s) => String(s).replace(/"(?:[^"]|"")*"/g, '«»')

test('NINGUNA fórmula lleva su explicación PEGADA con " — " fuera de un literal', () => {
  // Ésa es la firma exacta del defecto: el generador arma sus notas con `\`${algo} — ${nota}\``, y el
  // día que ese idioma se aplicó sobre una FÓRMULA en vez de sobre un texto, la celda quedó con
  // `=IFERROR(TEXTJOIN(…);"") — Cheques con fecha de pago…` y Sheets no pudo parsear nada.
  //
  // Un `—` DENTRO de comillas es prosa que la fórmula devuelve, y es correcto (la fila 49 construye su
  // explicación con CONCATENATE). Afuera de comillas, en una fórmula, no puede haber prosa.
  const g = construir()
  for (const [i, fila] of (g.filas || []).entries()) {
    for (const [j, c] of (fila || []).entries()) {
      const s = String(c ?? '')
      if (!s.startsWith('=')) continue
      assert.ok(!/\s—\s/.test(sinLits(s)),
        `fila ${i + 1} col ${j}: la fórmula tiene una explicación pegada con " — " fuera de comillas. `
        + `La celda queda en #ERROR!, y en una columna de prosa el localizador es-AR además le cambia `
        + `las comas del castellano por ";".\n  ${s.slice(0, 140)}`)
    }
  }
})

test('las filas "· cuáles son" ponen la lista en la columna E, donde el formateador le da WRAP', () => {
  const g = construir()
  const filas = g.filas.filter((f) => /· cuáles son/.test(String(f?.[0] ?? '')))
  assert.ok(filas.length > 0, 'la pestaña tiene al menos un detalle accionable de conciliación')
  for (const f of filas) {
    assert.match(String(f[4] ?? ''), /^=/, 'la lista de cheques es una FÓRMULA y va en la columna E')
    assert.ok(!String(f[7] ?? '').startsWith('='), 'la explicación va aparte, como texto')
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CALENDARIO VE LAS OBLIGACIONES DE NÓMINA, NO SÓLO LOS CHEQUES (31/07)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// El dueño: "necesito q resuelvas lo q te pedi de lo q se paga en jornales por quincena... cdo se
// efectiviza el pago, necesito marcarlo y q haga las descargas correspondientes".
//
// El calendario de vencimientos leía UNA sola fuente: "Cheques Emitidos". Medido: el "piso proyectado
// de caja" daba $70.643.236 ignorando los ~$14M por mes de jornales, que es el egreso más grande de la
// empresa. Con el egreso más grande afuera, el piso no es un piso.
test('cada tramo del calendario suma los jornales, no sólo los cheques', () => {
  const g = construir()
  // Los SEIS tramos con borde temporal. Se excluye "Sin fecha de pago cargada", que por diseño es sólo
  // de cheques: un jornal siempre tiene fecha de pago calculada (el lote del banco o el parámetro), así
  // que no puede caer en el cajón de los que no tienen fecha.
  // Los seis primeros del calendario son los tramos con borde temporal. Después vienen "Sin fecha",
  // el total del horizonte y su control, que tienen fórmula pero no son tramos.
  const conSale = g.filas.slice(g.cal0 - 1, g.cal0 - 1 + 6)
  assert.equal(conSale.length, 6, 'los seis tramos con borde temporal')
  for (const f of conSale) {
    const sale = String(f[3])
    assert.match(sale, /JORNALES_REAL_PAGO/, 'el tramo tiene que ver la quincena cerrada sin pagar')
    assert.match(sale, /JORNALES_PROY_PAGO/, 'y la proyectada')
    assert.match(sale, /Cheques Emitidos|K\$2|I\$2/, 'sin perder los cheques, que ya estaban')
  }
})

test('LA DESCARGA: una quincena ya pagada no vuelve a pesar en el calendario', () => {
  // MISMO DEFECTO, OTRO MECANISMO (04/08). Antes la descarga era una condición escrita a mano en esta
  // pestaña: `(JORNALES_REAL_PAGADO="")`, o sea "sólo pesa la que nadie marcó como pagada". Desde que
  // la columna sale de la definición única, la descarga son DOS propiedades de `formulaJornales`, y
  // juntas cubren más casos que la condición vieja:
  //
  //   1. la fecha que ubica la quincena es la de PAGO REAL si existe (fechaDeCajaDeQuincena), y
  //   2. la ventana del tramo empieza en CAJA_FECHA_SALDO.
  //
  // Una quincena marcada como pagada el 28/07 con el extracto cortado al 04/08 cae ANTES del piso de
  // la ventana y no entra en ningún tramo: su plata ya está descontada del saldo del banco. Si se
  // quitara cualquiera de las dos, las quincenas viejas volverían al tramo "Vencido" — que es
  // exactamente los $106M de deuda inexistente que este test cuida.
  const g = construir()
  const sale = String(g.filas[g.cal0 - 1]?.[3] ?? '')
  assert.match(sale, /IF\(ISNUMBER\(JORNALES_REAL_PAGADO\);JORNALES_REAL_PAGADO;/,
    'lo PAGADO manda sobre lo previsto: si se pagó, se pagó')
  assert.match(sale, /JORNALES_REAL_HASTA\)\)>=CAJA_FECHA_SALDO/,
    'y la ventana arranca en el corte del extracto: lo anterior ya está dentro del saldo')
  // La proyección no mira PAGADO: una quincena que todavía no existe no puede estar pagada. SE AÍSLA
  // SU TÉRMINO, no "todo lo que sigue" — mirar hasta el final de la fórmula es la misma trampa que
  // anclar en la posición, y ahora la fórmula tiene diecinueve sumandos detrás.
  const proy = sale.split('+SUMPRODUCT(').find((t) => t.includes('JORNALES_PROY_PAGO')) ?? ''
  assert.ok(proy.includes('JORNALES_PROY_PAGO'), 'el término de la proyección se pudo aislar')
  assert.ok(!proy.includes('JORNALES_REAL_PAGADO'), 'la proyección no se filtra por pagada: no tiene sentido')
})

test('LA OFICINA TAMBIÉN SALE DE ESTA CAJA: el calendario la suma, y de la misma fuente que el cash flow', () => {
  // El dueño: "no estás considerando oficina... por ende podría estar mal en caja". Eran ~$3,4M por mes
  // que salen del mismo banco y que el piso proyectado no veía.
  // Y DESDE EL 04/08 TAMBIÉN LA DIRECCIÓN, que es la otra mitad de la misma línea: $9.000.000 de
  // retiros con fecha 10/08 que el calendario no veía porque leía OFICINA_* y no DIRECCION_*.
  const g = construir()
  const sale = String(g.filas[g.cal0 - 1]?.[3] ?? '')
  assert.match(sale, /OFICINA_PAGO/, 'la oficina entra al calendario')
  assert.match(sale, /DIRECCION_PAGO/, 'y los retiros de Dirección, la otra mitad de la nómina de administración')
  assert.match(sale, /IF\(ISNUMBER\(OFICINA_PAGADO\);OFICINA_PAGADO;0\)\+IF\(ISNUMBER\(OFICINA_PROYECTADO\)/,
    'un mes está pagado o proyectado, nunca los dos')
  assert.match(sale, /OFICINA_PAGO>=CAJA_FECHA_SALDO/, 'antes del corte del extracto manda el banco, igual que la obra')
  // El término de la oficina se acota al SUYO: desde donde empieza hasta el siguiente sumando. Medir
  // "todo lo que viene después" hacía fallar el test en cuanto se sumó otro término de Compras — y
  // ahora los términos de Compras son doce.
  const iOfi = sale.indexOf('SUMPRODUCT(ISNUMBER(OFICINA_PAGO)')
  const sig = sale.indexOf('+SUM', iOfi + 1)
  const terminoOficina = sale.slice(iOfi, sig < 0 ? undefined : sig)
  assert.ok(!/Compras!/.test(terminoOficina), 'la nómina sale de la planilla de sueldos, no de Compras')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL PISO CUENTA LA MISMA PLATA QUE EL CASH FLOW — NI MÁS NI MENOS (04/08)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// El calendario tenía su propia lista de egresos (cheques + nómina) y el cash flow otra (rubros de
// Compras). Con dos listas de la misma plata, el mismo mes daba $41.704.351 distinto en cada vista, y
// el que veía de MENOS era el que produce el PISO PROYECTADO — el número con el que se decide cuánto
// plazo fijo tomar. Un piso más alto que el real hace colocar plata que hace falta el 11/08.
//
// Ahora la columna sale de `expresionSaleEnVentana`: el MISMO cuadro. Estos tres tests cuidan las tres
// formas en que eso se puede romper: que falte una línea, que una línea se cuente dos veces, y que una
// línea sin fuente desaparezca en silencio en vez de romper.
test('NINGUNA línea de egreso del cuadro se cae del calendario: los tramos suman las diecinueve', () => {
  const g = construir()
  const egresos = lineasDeCaja().filter(({ signo }) => signo === -1)
  assert.ok(egresos.length >= 19, `el cuadro tiene ${egresos.length} líneas de egreso: si bajó, algo se perdió`)
  // Cada línea deja una huella reconocible en la fórmula: su rubro de Compras, su rango con nombre o
  // la pestaña de la que sale. Se verifica sobre TODOS los tramos, no sobre uno: un tramo que se
  // arme distinto de los otros es el bug de doble conteo que ya costó $11,7M.
  // Las dos líneas de nómina NO salen de Compras aunque tengan `rubro`: su fuente es la planilla de
  // jornales (ver formulaJornales/formulaAdministracion), así que su huella es el rango con nombre.
  const POR_PLANILLA = { 'Nómina · Jornales de obra': 'JORNALES_REAL_TOTAL', 'Nómina · Sueldos administración': 'DIRECCION_PAGO' }
  const huella = ({ linea }) => (POR_PLANILLA[linea.rubro] ?? (linea.rubro ? `"${linea.rubro}"`
    : linea.soloSub ? `"${linea.soloSub}"`
      : linea.cheques ? (linea.inst === 'cheques' ? 'Cheques Emitidos' : 'Tarjeta de Credito')
        : linea.calendarioImpuestos ? 'Impuestos y Financieros' : null))
  for (const f of g.filas.slice(g.cal0 - 1, g.cal0 - 1 + 6)) {
    const sale = String(f[3] ?? '')
    for (const l of egresos) {
      const h = huella(l)
      // Las tres sin huella son las que valen cero DECLARADO (descubierto, comisiones, impuesto al
      // cheque): su ausencia de la fórmula es el punto, y la cubre el test del control de más abajo.
      if (!h) continue
      assert.ok(sale.includes(h), `el tramo "${f[0]}" no ve "${l.linea.nombre}" (buscaba ${h})`)
    }
  }
})

test('EL DOBLE CONTEO QUE NO PUEDE VOLVER: los cheques entran sólo si NO tienen factura cargada', () => {
  // Medido el 04/08: $43.380.472 de cheques librados cuya factura YA está en Compras. Como la columna
  // suma Compras entera por rubro, sumar además el cheque cuenta esa plata dos veces — el cheque es el
  // INSTRUMENTO y la factura es la OBLIGACIÓN. El cuadro llama a esa línea "Cheques sin factura
  // cargada" y esto verifica que la fórmula haga honor al rótulo.
  const g = construir()
  for (const f of g.filas.slice(g.cal0 - 1, g.cal0 - 1 + 6)) {
    const sale = String(f[3] ?? '')
    for (const inst of ['Cheques Emitidos', 'Tarjeta de Credito']) {
      const i = sale.indexOf(`'${inst}'`)
      assert.ok(i > 0, `el tramo "${f[0]}" tiene que ver ${inst}`)
      const termino = sale.slice(sale.lastIndexOf('SUMPRODUCT(', i), i + 400)
      assert.ok(termino.includes('FALTA cargar la factura'),
        `el término de ${inst} suma cheques SIN filtrar por la marca de cobertura: eso los cuenta dos veces`)
    }
  }
  // Y el parche del 04/08 que sumaba a mano la deuda de Compras "no pagada con cheque" no puede
  // volver: era un SUBCONJUNTO de lo que ya trae el cuadro, así que contaba esa plata dos veces.
  for (const f of g.filas.slice(g.cal0 - 1, g.cal0 - 1 + 6)) {
    assert.ok(!String(f[3]).includes('Compras!$X$4:$X="Pendiente"'),
      'el filtro por estado/medio de pago duplica los rubros de Compras que ya vienen del cuadro')
  }
})

test('EL OTRO DOBLE CONTEO: un cheque YA DEBITADO no vuelve a restarse — ya está en el saldo', () => {
  // ═══ EL DEFECTO DE $12.188.441 (05/08/2026) ═══
  //
  // El calendario parte del SALDO DEL BANCO y abre su primer tramo desde el serial 0, para no perder un
  // cheque viejo que sigue sin presentarse. Esa apertura sólo es correcta junto con el filtro de
  // debitado: sin él, el tramo "Vencido" volvía a restar 10 cheques ($11.631.542) y 2 cuotas de tarjeta
  // ($556.899) que el banco ya había debitado y que el saldo de partida YA tenía descontados. El piso
  // proyectado quedaba $12.188.441 por debajo del real, y un piso falsamente bajo frena colocaciones
  // que sí se podían hacer.
  //
  // El invariante estaba ESCRITO en el comentario de `DESDE_SIEMPRE` desde el 04/08 ("si el banco no lo
  // debitó, no salió de la cuenta") y la fórmula implementaba sólo la mitad que abre la ventana.
  const g = construir()
  const COL_DEBITADO = { 'Cheques Emitidos': 'K', 'Tarjeta de Credito': 'J' }
  for (const f of g.filas.slice(g.cal0 - 1, g.cal0 - 1 + 6)) {
    const sale = String(f[3] ?? '')
    for (const [inst, colDeb] of Object.entries(COL_DEBITADO)) {
      const i = sale.indexOf(`'${inst}'`)
      const termino = sale.slice(sale.lastIndexOf('SUMPRODUCT(', i), i + 600)
      assert.ok(termino.includes(`UPPER('${inst}'!$${colDeb}$`) && termino.includes('<>"SI"'),
        `el tramo "${f[0]}" resta ${inst} sin excluir lo ya debitado: esa plata ya salió y está en el saldo`)
    }
  }
})

test('UNA LÍNEA SIN FUENTE ROMPE, no desaparece: sin las filas del calendario fiscal no hay pestaña', () => {
  // Es la propiedad que costó $41,7M: no fue una fórmula mal escrita, fue un concepto que nadie sumó
  // y nada avisó. `formulaCalendarioImpuestosSemana` exige las filas del IVA/IIBB ubicadas por rótulo;
  // sin ellas la referencia sería a una fila muerta y devolvería $0 de IVA SIN UN SOLO #ERROR.
  assert.throws(() => grilla(new Map(), { ...REFS, filasCal: undefined }, CARTERA),
    /Impuestos y Financieros/,
    'el generador tiene que romper antes que escribir un calendario ciego al IVA')
})

test('la fecha que ubica el jornal en el tramo es la de PAGO, nunca la de cierre', () => {
  const g = construir()
  const sale = String(g.filas[g.cal0 - 1]?.[3] ?? '')
  // HASTA (el cierre de la quincena) es el DEVENGAMIENTO, no la caja, y no puede decidir el tramo.
  // Aparece una sola vez y en un solo lugar: como último recurso del IF, para que una quincena sin
  // ninguna fecha no desaparezca del cuadro. Que exista ese fallback está declarado en
  // jornales-fecha-pago.mjs; que gobierne el tramo sería el defecto que este test cuida.
  assert.match(sale, /IF\(ISNUMBER\(JORNALES_REAL_PAGO\);JORNALES_REAL_PAGO;JORNALES_REAL_HASTA\)/,
    'el cierre es el ÚLTIMO recurso, detrás de la fecha pagada y de la prevista')
  assert.ok(!/\(JORNALES_REAL_HASTA[>=<]/.test(sale), 'HASTA nunca compara contra el borde del tramo')
  assert.ok(!sale.includes('JORNALES_REAL_DESDE'))
})

test('la fila "Sin fecha de pago cargada" queda sólo para los cheques, y eso es correcto', () => {
  // Un jornal siempre tiene fecha de pago: sale del lote del banco si ya pasó, o del parámetro si no.
  // Meterlo en el cajón de "sin fecha" sería inventar un caso que no existe.
  const g = construir()
  const fila = g.filas.slice(g.cal0 - 1, g.calFin).find((f) => /Sin fecha de pago/.test(String(f?.[0] ?? '')))
  assert.ok(fila, 'la fila existe')
  assert.ok(!String(fila[3]).includes('JORNALES'), 'no se le agregan jornales')
})

test('EL CONTROL NO SE MIDE CONTRA LO QUE PRODUCE: nombra los conceptos que el calendario no ve', () => {
  // EL CONTROL QUE ESTABA ACÁ ERA EL DEFECTO. Medía `horizonte − cheques − nómina − oficina`, o sea el
  // calendario menos las mismas tres fuentes que el calendario sumaba: no podía dar otra cosa que
  // cero. Y su cero se leyó como "está todo bien" mientras al piso le faltaban $77M.
  //
  // El de ahora sale de `conceptosFueraDelCalendario`, que mide contra el CUADRO CONTABLE COMPLETO y
  // publica el NOMBRE de lo que queda afuera. Si mañana alguien agrega una línea de egreso al cuadro
  // y no la resuelve, aparece acá con su nombre en vez de evaporarse.
  const g = construir()
  const fila = g.filas.find((f) => /no ubica en el tiempo/.test(String(f?.[0] ?? '')))
  assert.ok(fila, 'el control existe')
  const ciegos = conceptosFueraDelCalendario(
    lineasDeCaja().filter(({ signo }) => signo === -1).map(({ linea }) => linea.nombre))
  assert.equal(ciegos.length, 0, 'el universo medido es el cuadro entero: contra sí mismo no falta nada')
  // Los tres que hoy no tienen fuente con fecha están NOMBRADOS en la pestaña, no escondidos.
  const listado = String(fila[4] ?? '')
  for (const n of ['descubierto', 'Comisiones', 'Impuesto al cheque']) {
    assert.ok(listado.includes(n), `el control tiene que nombrar "${n}"; dice: ${listado}`)
  }
  assert.equal(fila[3], 0, 'y declarar su monto: un cero con nombre es una limitación, un cero mudo es un bug')
  assert.ok(!/cheques.*nómina.*oficina/i.test(String(fila[0])),
    'el control viejo se medía contra sus propias fuentes: no puede volver')
})

test('EL RIESGO DECLARADO: si cheques-cobertura no corrió, la pestaña lo dice en vez de mostrar $0', () => {
  // El término de cheques lee la MARCA que escribe `cheques-cobertura`. Si ese agente no corrió, la
  // columna está vacía, el término da $0 y el piso SUBE sin que se haya pagado nada — el mismo modo de
  // falla, "cero sin avisar", que este trabajo entero vino a matar. Este control lo hace visible.
  const g = construir()
  const fila = g.filas.find((f) => /riesgo: cheques no debitados SIN marca/.test(String(f?.[0] ?? '')))
  assert.ok(fila, 'el control de cobertura existe')
  assert.match(String(fila[3]), /\$M\$2:\$M\$400=""/, 'cuenta los cheques que todavía no tienen marca')
  assert.match(String(fila[3]), /<>"SI"/, 'entre los NO debitados: un cheque ya debitado no le importa al calendario')
})

test('ANTES DEL CORTE MANDA EL BANCO: las quincenas viejas sin marcar NO son deuda', () => {
  // Sin esta condición el calendario mostraba $106M en "Vencido": las trece quincenas del año que
  // nadie marcó como pagadas, porque la columna "Pagado el" es nueva. No tener el dato NO es deber la
  // plata — y la de una quincena pagada antes del corte ya está descontada del saldo del banco.
  //
  // DESDE EL 04/08 EL PISO ES DE TODA LA COLUMNA, no sólo de la nómina: cada sumando arranca en
  // CAJA_FECHA_SALDO, así que una factura de Compras con fecha anterior al corte tampoco vuelve a
  // restar. Es la misma regla aplicada a los diecinueve conceptos en vez de a tres.
  const g = construir()
  for (const f of g.filas.slice(g.cal0 - 1, g.cal0 - 1 + 6)) {
    const sale = String(f[3])
    assert.match(sale, /JORNALES_REAL_HASTA\)\)>=(MAX\()?CAJA_FECHA_SALDO/,
      'sólo entra la nómina cuyo pago cae en o después del corte del extracto')
    assert.match(sale, /Compras!\$AD\$4:\$AD;">="&(MAX\()?CAJA_FECHA_SALDO/,
      'y lo mismo Compras: lo anterior al corte ya está descontado del saldo del banco')
  }
})

test('EL CALENDARIO PROYECTA LOS DOS LADOS, o su piso es falso', () => {
  // El dueño: "esos de 727k no es real". El calendario proyectaba la nómina hasta diciembre del lado que
  // SALE y del lado que ENTRA sólo miraba la cartera de cheques. Proyectar un lado y no el otro no es
  // prudencia: es un cuadro desbalanceado que asusta con un número que no es un piso.
  const g = construir()
  for (const f of g.filas.slice(g.cal0 - 1, g.cal0 - 1 + 6)) {
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

test('EL DESASTRE DEL 31/07: si la escritura se saltea, NO se formatea ni se mueven los nombres', () => {
  // El dueño: "desastre lo q estás haciendo en caja". La guarda hacía bien su trabajo —con la pestaña
  // candada no se escribe— pero el resultado se ignoraba y la corrida seguía: `formatear` pintaba la
  // geometría de la grilla NUEVA sobre los valores VIEJOS (cuatro filas de corrimiento: "Sale" con
  // formato de número, "Queda después" con formato de FECHA) y `publicar` reapuntaba
  // CAJA_TOTAL_DISPONIBLE y CAJA_FECHA_SALDO a dos celdas VACÍAS. Con el total y la fecha de corte en
  // cero, todo cheque y toda quincena pasan el filtro ">=CAJA_FECHA_SALDO" y el calendario infla.
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
  // Y los nombres se publican después de formatear, así que el mismo return los cubre.
  assert.ok(src.indexOf('await publicar(', corte) > corte, 'publicar queda del lado protegido por el return')
})

// ═══ LA NÓMINA SALE DE LA CAJA POR LOS DOS CANALES (01/08) ═══
//
// El dueño, sobre el 31/07: cobranzas en efectivo, compras, y jornales pagados 50% en efectivo y 50%
// por transferencia. Ni una mitad ni la otra bajaba ninguna disponibilidad: la nómina no es una compra
// ni un cheque, así que no entraba en ninguna de las dos líneas que existían. Aparecía sólo en el
// CALENDARIO, y con el filtro "sin pagar" — al registrarse el pago salía de la proyección y no entraba
// a ningún lado. La plata se pagaba y no salía de la pestaña.

test('la nómina en efectivo DESCARGA la caja física, y se ve en su propio renglón', () => {
  const g = construir()
  const f = filaDe(g, /jornales pagados en efectivo después del arqueo/i)
  assert.ok(f > 0, 'el renglón de la nómina en efectivo tiene que existir')
  const origen = celda(g, f, 2)
  assert.match(origen, /;-\(/, 'descarga: va restando')
  assert.match(origen, /^=IF\(NOT\(ISNUMBER\(/, 'y guardada por el arqueo, como los otros tres renglones')
  assert.match(origen, /JORNALES_REAL_ADELANTO/)
  assert.match(origen, /JORNALES_REAL_RECIBO/)
  assert.ok(!origen.includes('JORNALES_REAL_BANCO'), 'lo que salió por banco no puede salir también del cajón')
  // El desglose se VE y no SUMA: la columna de pesos va vacía, como los otros tres sumandos.
  assert.ok(vacia(celda(g, f, 4)), 'un renglón del desglose que aporte pesos duplicaría el efectivo')
})

test('la nómina por transferencia DESCARGA el banco, y se ve en su propio renglón', () => {
  const g = construir()
  const f = filaDe(g, /jornales pagados por transferencia después del corte/i)
  assert.ok(f > 0, 'el renglón de la nómina por banco tiene que existir')
  const origen = celda(g, f, 2)
  assert.match(origen, /^=-\(/)
  assert.match(origen, /JORNALES_REAL_BANCO/)
  assert.ok(!/ADELANTO|RECIBO/.test(origen), 'lo que salió en billetes no puede salir también del banco')
  assert.ok(vacia(celda(g, f, 4)))
})

test('los dos netos incorporan la nómina: el desglose no puede decir algo que el total no dice', () => {
  const g = construir()
  const neto = celda(g, filaDe(g, /^Movimientos de efectivo posteriores al arqueo/), 2)
  assert.match(neto, /JORNALES_REAL_ADELANTO/, 'el neto de efectivo tiene que restar la nómina en billetes')
  const netoBanco = celda(g, filaDe(g, /^Movimientos posteriores al corte del extracto/), 2)
  assert.match(netoBanco, /JORNALES_REAL_BANCO/, 'el neto bancario tiene que restar el lote de haberes')
})

// ═══ UN CERO POR FALTA DE DATO NO SE ESCRIBE IGUAL QUE UN CERO MEDIDO (01/08) ═══

test('sin fecha de arqueo, la alerta dice CUÁNTO efectivo está quedando afuera', () => {
  const g = construir()
  const f = filaDe(g, /falta la fecha del arqueo/i)
  assert.ok(f > 0, 'la alerta tiene que estar en el bloque "LO QUE NO CIERRA"')
  const monto = celda(g, f, 2)
  // Con arqueo cargado la alerta se apaga sola: existe sólo mientras existe el problema.
  assert.match(monto, /^=IF\(CAJA_ARQUEO_ARS_FECHA<>"";0;/)
  // Y NO lleva monto: sin ancla, cualquier cifra se lee como saldo de caja y no lo es. Medido contra
  // el archivo real, el neto con la ventana abierta da −$47.033.903 (el acumulado del año, no un
  // saldo). El problema se nombra y se instruye; la plata aparece sola al cargar la fecha.
  assert.ok(!/'Cobranzas'!|JORNALES_REAL/.test(monto), 'la alerta no puede publicar un monto sin ancla')
  // LA INSTRUCCIÓN YA NO VIAJA EN LA PLANILLA (03/08). Estaba en la columna H —"Cargá el conteo y su
  // fecha en el bloque 4.10…"— y era una de las 66 celdas que el dueño borra siempre. Lo que queda es
  // el rótulo, que nombra el problema y el bloque donde se resuelve sin un párrafo al lado del monto.
  assert.match(String(g.filas[f - 1][0]), /falta la fecha del arqueo/i)
  assert.ok(vacia(g.filas[f - 1][7]), 'la alerta no puede volver a llevar su explicación en la columna H')
})

test('la alerta del arqueo cita el ancla POR NOMBRE, no por número de fila', () => {
  const g = construir()
  const monto = celda(g, filaDe(g, /falta la fecha del arqueo/i), 2)
  // Antes decía `$F$7`. Citar el ancla por posición ataba seis fórmulas a que esa fila no se moviera
  // nunca — y este mismo cambio la movió. Con el nombre, el bloque se puede reordenar sin romper nada.
  assert.match(monto, /CAJA_ARQUEO_ARS_FECHA/)
  assert.doesNotMatch(monto, /\$F\$\d+/)
})


// ═══ LA NÓMINA COMPLETA: OFICINA Y LA EXTRACCIÓN (01/08) ═══
//
// El dueño: "¿ese es el valor que se refleja en cash flow y por ende lo que se debería restar en caja
// cada vez que se haya pagado?". Era no: OFICINA_* lo consumía sólo el CALENDARIO, así que un sueldo
// de administración pagado no bajaba ninguna disponibilidad. Y la caja física sólo sabía BAJAR hacia
// el banco (depósito) y nunca subir desde él (extracción), una asimetría que sólo puede dar de menos.

test('la oficina DESCARGA los dos canales, cada uno del suyo', () => {
  const g = construir()
  const bco = celda(g, filaDe(g, /sueldos de OFICINA por transferencia/i), 2)
  assert.match(bco, /OFICINA_BANCO/)
  assert.ok(!bco.includes('OFICINA_EFECTIVO'), 'lo que salió en billetes no puede salir también del banco')
  const efvo = celda(g, filaDe(g, /sueldos de OFICINA en efectivo/i), 2)
  // El efectivo sale POR DIFERENCIA (Pagado − Banco): así los dos canales suman siempre lo pagado.
  assert.match(efvo, /N\(OFICINA_PAGADO\)-N\(OFICINA_BANCO\)/)
  assert.match(efvo, /ISNUMBER\(OFICINA_BANCO\)/, 'con la celda vacía no se asume "todo efectivo"')
  assert.match(efvo, /^=IF\(NOT\(ISNUMBER\(/, 'guardada por el arqueo como el resto del desglose')
})

test('la extracción SUMA al cajón — es el espejo del depósito, que resta', () => {
  const g = construir()
  const f = filaDe(g, /extraído del banco después del arqueo/i)
  assert.ok(f > 0)
  const c = celda(g, f, 2)
  assert.match(c, /extraccion/)
  assert.ok(!/;-\(/.test(c), 'la extracción CARGA la caja: no lleva signo negativo')
  assert.ok(vacia(celda(g, f, 4)), 'el desglose no aporta pesos')
})

test('el canal no declarado se NOMBRA, no se adivina', () => {
  const g = construir()
  const f = filaDe(g, /sin declarar por qué canal/i)
  assert.ok(f > 0, 'tiene que estar en el bloque LO QUE NO CIERRA')
  const monto = celda(g, f, 2)
  assert.match(monto, /OFICINA_PAGADO/)
  assert.match(monto, /\(1-ISNUMBER\(OFICINA_BANCO\)\)/, 'sólo los meses SIN canal declarado')
  // Y no se reparte mitad y mitad porque suele ser así: eso sería fabricar el dato.
  assert.ok(!/0[,.]5|\/2/.test(monto))
})

test('los dos netos incorporan la oficina', () => {
  const g = construir()
  assert.match(celda(g, filaDe(g, /^Movimientos de efectivo posteriores al arqueo/), 2), /OFICINA_PAGADO/)
  assert.match(celda(g, filaDe(g, /^Movimientos posteriores al corte del extracto/), 2), /OFICINA_BANCO/)
})

// ═══ LA CAJA EN DÓLARES (01/08) ═══
//
// "U$S 15.000" cobrados en efectivo entraban al cajón de PESOS como $15.000: el importe correcto en
// la moneda equivocada, que no da error y está mal por dos órdenes de magnitud.

test('la caja en dólares existe, lleva su moneda y se valúa al tipo de cambio', () => {
  const g = construir()
  const f = filaDe(g, /^Caja en dólares/)
  assert.ok(f > 0, 'tiene que haber una fila de caja en dólares')
  assert.equal(celda(g, f, 1), 'USD', 'la columna de moneda dice USD')
  assert.match(celda(g, f, 2), /"USD"/, 'suma sólo los cobros marcados en dólares')
  assert.match(celda(g, f, 3), /TIPO_CAMBIO_USD/, 'y trae el tipo de cambio')
  assert.match(celda(g, f, 4), new RegExp(`C${f}\\*IF\\(D${f}`), 'y se valúa como cualquier otra cuenta')
})

test('el cajón en PESOS ya no se come los dólares', () => {
  const g = construir()
  const neto = celda(g, filaDe(g, /^Movimientos de efectivo posteriores al arqueo/), 2)
  assert.match(neto, /"<>USD"/, 'la línea de pesos excluye explícitamente los cobros en dólares')
})

test('pesos y dólares son una PARTICIÓN: ningún cobro en efectivo queda afuera ni entra dos veces', () => {
  const g = construir()
  const pesos = celda(g, filaDe(g, /^Movimientos de efectivo posteriores al arqueo/), 2)
  const usd = celda(g, filaDe(g, /^Caja en dólares/), 2)
  assert.match(pesos, /"<>USD"/)
  assert.match(usd, /;"USD";/)
})

// ═══ LA COLUMNA H NO VUELVE (03/08) ═══
//
// EL DEFECTO. La corrida de hoy le escribió al dueño 66 celdas de prosa en la columna H de CAJA
// ("Arqueo de caja (columna de al lado, se carga a…", "Extracto bancario · Santander Empresas",
// "Cobranzas: forma de cobro Efectivo Y estado…"). Él las borra siempre —textual: "esas aclaraciones
// de mierda yo siempre las saco"— y ya lo había pedido en julio para Impuestos y Cargas Sociales.
//
// Volvió por un MERGE: se rescataron generadores de una rama del 01/08, anterior a esa decisión.
// Por eso el control es de grilla y no de revisión: un merge no lee las decisiones, lee los tests.

test('la grilla no lleva NI UNA celda de prosa en la columna H', () => {
  const g = construir()
  const conTexto = g.filas
    .map((f, i) => ({ fila: i + 1, v: f[7] }))
    .filter((x) => !vacia(x.v) && x.v !== undefined)
  assert.deepEqual(conTexto, [],
    'volvió la columna "de dónde sale". El generador escribe el DATO; la explicación va en el código.\n'
    + conTexto.slice(0, 8).map((x) => `  fila ${x.fila}: ${String(x.v).slice(0, 70)}`).join('\n'))
})

test('la columna H se emite con el centinela: la intención queda DECLARADA, no implícita', () => {
  const g = construir()
  // Una celda AUSENTE significa "no es mía, no la toco"; el centinela VACIO significa "es mía y va
  // vacía". La columna de prosa es del generador, así que sale declarada. (Borrar lo que ya está en la
  // planilla no lo hace esto: lo frena lib/no-borrar.mjs, sin bypass y a propósito.)
  for (const f of g.filas) assert.equal(f[7], VACIO, 'la columna de prosa tiene que salir con el centinela')
})

// ═══ EL ARQUEO VIAJA CON SU BLOQUE (03/08) ═══
//
// EL DEFECTO. La misma corrida dejó sin FECHA las dos filas del arqueo. La causa: sus celdas salían
// AUSENTES para que la fusión preservara lo tipeado… y la fusión preserva por POSICIÓN. Al crecer la
// grilla, el bloque bajó de la fila 148 a la 152, el conteo del dueño se quedó en la 148 y los rangos
// con nombre se republicaron en la 152 vacía: CAJA_ARQUEO_ARS_FECHA quedó en blanco y $39,28M de
// disponibilidades se fueron a cero sin un solo #ERROR.

test('con el conteo ya cargado, el arqueo se RE-EMITE en su fila nueva (no se queda en la vieja)', () => {
  const cargado = new Map([
    ['Caja en pesos — contado', { saldo: 0, fecha: 46233, origen: '', quien: '' }],
    ['Caja en dólares — contado', { saldo: 15000, fecha: 46233, origen: '', quien: '' }],
  ])
  const g = grilla(cargado, REFS, CARTERA)
  // El importe 0 es un dato, no un vacío: es exactamente lo que el dueño tenía cargado el 03/08.
  assert.equal(g.filas[g.fArqArs - 1][2], 0, 'el conteo en pesos tiene que viajar con su bloque')
  assert.equal(g.filas[g.fArqArs - 1][5], 46233, 'y su fecha también — sin fecha no hay ventana')
  assert.equal(g.filas[g.fArqUsd - 1][2], 15000)
  assert.equal(g.filas[g.fArqUsd - 1][5], 46233)
  // LA FECHA VIAJA COMO NÚMERO DE SERIE, no como "30/07/2026": el texto depende del locale del
  // archivo (es_AR) y ya vació una pestaña entera por leerse como dd/mm/yy.
  assert.equal(typeof g.filas[g.fArqArs - 1][5], 'number')
})

test('sin nada leído, el arqueo sigue saliendo AUSENTE: sin dato no se sobrescribe', () => {
  const g = construir()
  for (const f of [g.fArqArs, g.fArqUsd]) {
    for (const col of [2, 5]) assert.equal(g.filas[f - 1][col], undefined)
  }
})

test('el rescate LEE el bloque 4.10: sin esto el conteo no tiene de dónde viajar', () => {
  // La forma exacta que devuelve readSheetGrid para el bloque 4.10 del archivo real (03/08). El
  // encabezado que manda es el del bloque 4.8 —"Concepto · Cotización · … · Fecha"—, que es el último
  // antes del arqueo: de ahí salen los índices de columna, por RÓTULO y no por letra.
  const cel = (valor, numero = null, formula = null) => ({ valor, numero, formula, formato: null })
  const grid = [
    [cel('Concepto'), cel(''), cel('Cotización'), cel(''), cel(''), cel('Fecha')],
    [cel('4.10 · ARQUEO DECLARADO DE LA CAJA FÍSICA')],
    [cel('Caja en pesos — contado'), cel('ARS'), cel('0', 0), cel(''), cel(''), cel('30/07/2026', 46233)],
    [cel('Caja en dólares — contado'), cel('USD'), cel('U$S 15.000,00', 15000), cel(''), cel(''), cel('30/07/2026', 46233)],
  ]
  const cargado = rescatar(grid)
  assert.equal(cargado.get('Caja en pesos — contado')?.saldo, 0)
  assert.equal(cargado.get('Caja en pesos — contado')?.fecha, 46233)
  assert.equal(cargado.get('Caja en dólares — contado')?.saldo, 15000)
  // Y la grilla lo devuelve a su fila nueva, que es el punto entero del arreglo.
  const g = grilla(cargado, REFS, CARTERA)
  assert.equal(g.filas[g.fArqArs - 1][5], 46233)
})

// ═══ UN NOMBRE NO SE REAPUNTA A UNA GRILLA QUE NO SE ESCRIBIÓ (03/08) ═══
//
// EL DAÑO, MEDIDO. Los cinco rangos con nombre de CAJA se publicaban ANTES de escribir, contra la
// grilla que el generador PENSABA escribir. El 03/08 el portón frenó la escritura —la pestaña era
// del dueño— y la pestaña quedó con su layout viejo mientras los nombres se iban cuatro filas abajo:
// `CAJA_ARQUEO_ARS` y `TIPO_CAMBIO_USD` cayeron en celdas vacías y el total de disponibilidades pasó
// de $123,79M a $80,91M. Sin un solo #REF!, y con el diff de la pestaña en CERO celdas: el contenido
// no se tocó, se movieron los punteros.
//
// El bootstrap (que el nombre EXISTA antes de escribir la fórmula que lo usa) se resuelve creando
// sólo los que faltan. Crear no puede reapuntar nada.

test('ANTES de escribir sólo se CREAN los que faltan: ninguno se reapunta', async () => {
  const { requestsDeRangos, RANGOS_DE_CAJA } = await import('./caja-pestana.mjs')
  const g = { fTC: 136, fArqArs: 148, fArqUsd: 149 }
  // Los cinco ya existen, apuntando a cualquier lado.
  const existentes = RANGOS_DE_CAJA.map((r, i) => ({ name: r.nombre, namedRangeId: `id${i}`, range: { startRowIndex: 999 } }))
  const reqs = requestsDeRangos(7, g, existentes, { soloFaltantes: true })
  assert.equal(reqs.length, 0, 'con todos los nombres ya creados, antes de escribir no se toca ninguno')
})

test('ANTES de escribir, el que NO existe sí se crea — si no, #NAME? en la primera corrida', async () => {
  const { requestsDeRangos } = await import('./caja-pestana.mjs')
  const g = { fTC: 136, fArqArs: 148, fArqUsd: 149 }
  const reqs = requestsDeRangos(7, g, [], { soloFaltantes: true })
  assert.equal(reqs.length, 5, 'arranque en frío: se crean los cinco')
  assert.ok(reqs.every((r) => r.addNamedRange), 'sólo se AGREGAN, nunca se reapunta')
})

test('DESPUÉS de escribir sí se reapuntan los cinco a la grilla escrita', async () => {
  const { requestsDeRangos, RANGOS_DE_CAJA } = await import('./caja-pestana.mjs')
  const g = { fTC: 136, fArqArs: 148, fArqUsd: 149 }
  const existentes = RANGOS_DE_CAJA.map((r, i) => ({ name: r.nombre, namedRangeId: `id${i}`, range: { startRowIndex: 999 } }))
  const reqs = requestsDeRangos(7, g, existentes)
  assert.equal(reqs.length, 5)
  const arq = reqs.find((r) => r.updateNamedRange?.namedRange?.name === 'CAJA_ARQUEO_ARS')
  assert.equal(arq.updateNamedRange.namedRange.range.startRowIndex, 147, 'fila 148, 0-based')
  const tc = reqs.find((r) => r.updateNamedRange?.namedRange?.name === 'TIPO_CAMBIO_USD')
  assert.equal(tc.updateNamedRange.namedRange.range.startRowIndex, 135, 'fila 136, 0-based')
})

test('el generador NO publica rangos en el camino de la escritura frenada', async () => {
  // La prueba es del CÓDIGO: la llamada sin `soloFaltantes` tiene que estar DESPUÉS del `return`
  // que corta cuando la pestaña es del dueño. Si alguien la vuelve a subir, esto se pone rojo.
  const src = readFileSync(new URL('./caja-pestana.mjs', import.meta.url), 'utf8')
  const corte = src.indexOf('escritura?.bloqueada || escritura?.editadaPorHumano')
  const soloFaltantes = src.indexOf('soloFaltantes: true')
  const reapunta = src.indexOf('reapuntados a la grilla RECIÉN ESCRITA')
  assert.ok(corte > 0 && soloFaltantes > 0 && reapunta > 0, 'las tres marcas tienen que existir')
  assert.ok(soloFaltantes < corte, 'la creación de los que faltan va ANTES del corte')
  assert.ok(reapunta > corte, 'el reapuntado va DESPUÉS del corte: si la escritura se frena, no se llega')
})

// ═══ EL RÓTULO DICE OFICINA PORQUE ES OFICINA (03/08) ═══
//
// Estas filas leen `OFICINA_*` —el bloque de `_J_OFICINA`, dos personas— y decían "sueldos de
// administración". El dueño separó los dos grupos y les puso criterios distintos: **oficina son 2
// empleados, 50% banco y 50% efectivo; administración cobra TODA por banco.** Con el rótulo viejo,
// alguien que busca administración la encuentra en un cuadro donde no está, y una diferencia de
// oficina se lee como un faltante de administración.

test('las filas de oficina se llaman OFICINA, no administración', () => {
  const g = construir()
  for (const re of [/sueldos de OFICINA por transferencia/i, /sueldos de OFICINA en efectivo/i]) {
    const f = filaDe(g, re)
    assert.ok(f >= 0, `falta la fila ${re}`)
  }
  const textos = g.filas.map((f) => String(f?.[0] ?? ''))
  const malRotuladas = textos.filter((t) => /sueldos de administraci[oó]n/i.test(t))
  assert.deepEqual(malRotuladas, [], 'ninguna fila que lee OFICINA_* puede llamarse "de administración"')
})

// ═══ EL TITULAR CONTESTA LAS DOS PREGUNTAS DEL DUEÑO (04/08) ═══
//
// Textual: "el concepto piso proyectado en caja es super confuso, ¿qué es? ¿lo puedo usar para
// invertir o qué?" y "¿cuánto me va a quedar a fin de mes al cubrir todas las obligaciones?".
// No son el mismo número y el titular publicaba uno solo, sin decir cuál. Además tenía pegado el
// crédito no utilizado, que no es plata propia (NIC 7: el uso del descubierto es financiación).

test('el titular publica los cuatro números que se deciden, y ninguno es capacidad de endeudarse', () => {
  const g = construir()
  const titulos = g.filas[g.fTitulos - 1].filter((x) => !vacia(x) && String(x || '').trim())
  assert.equal(titulos.length, 4)
  assert.match(titulos[0], /DISPONIBILIDADES/)
  assert.match(titulos[1], /PISO DE CAJA/)
  assert.match(titulos[2], /CIERRE DE ESTE MES/)
  assert.match(titulos[3], /COLOCABLE/)
  // EL DEFECTO QUE ESTO ATRAPA: "CRÉDITO NO UTILIZADO" al lado de las disponibilidades. Un margen de
  // tarjeta y un acuerdo en descubierto sin usar no son un activo: son un compromiso del banco.
  for (const t of titulos) assert.ok(!/CR[ÉE]DITO|AIRE|DESCUBIERTO/i.test(t), `"${t}" no va en el titular de caja`)
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
  // El piso sale de la fila del mínimo del horizonte.
  const fPeor = filaDe(g, /el punto más bajo del horizonte/i)
  assert.equal(piso, `=$F$${fPeor}`)
  // Lo que queda a fin de mes sale de la posición acumulada del tramo que cierra el mes, ANCLADA A SU
  // RÓTULO: si alguien inserta un tramo, esto se rompe acá y no en silencio en la pestaña.
  const fila = Number(String(finMes).match(/\$F\$(\d+)/)[1])
  assert.equal(String(g.filas[fila - 1][0]).trim(), 'Resto de este mes')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA BANDA DEL PISO — el piso solo se lee como certeza, y con él se decide un plazo fijo
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el piso no se publica solo: al lado va la punta de abajo y el ancho de la banda', () => {
  const g = construir()
  const fPeor = filaDe(g, /el punto más bajo del horizonte/i)
  const fPeorCaso = filaDe(g, /si NINGUNO de los no verificados tuviera su factura/i)
  const fAncho = filaDe(g, /ancho de la banda/i)
  assert.ok(fPeorCaso > fPeor, 'la punta de abajo tiene que ir pegada al piso, no perdida en otro bloque')
  assert.equal(celda(g, fAncho, 5), `=$F${fPeor}-$F${fPeorCaso}`, 'el ancho tiene que salir de las dos puntas, no ser otro cálculo')
})

test('la punta de abajo es un MÍNIMO por tramo, no el piso menos un total', () => {
  // POR QUÉ IMPORTA: restarle al piso TODO lo incierto le carga plata que sale después del punto más
  // bajo. El peor caso quedaría más abajo de lo que puede estar, y una banda inflada se ignora igual
  // que una alarma que suena siempre.
  const g = construir()
  const f = celda(g, filaDe(g, /si NINGUNO de los no verificados tuviera su factura/i), 5)
  assert.ok(f.startsWith('=MIN('), 'dejó de ser un mínimo por tramo')
  // Un término por tramo, y cada uno resta lo incierto acumulado hasta el borde de ESE tramo.
  // (`$F` a secas no sirve para contar: las columnas de monto de Cheques Emitidos también son $F.)
  const terminos = [...f.matchAll(/\$F(\d+)-\(/g)].map((m) => Number(m[1]))
  const primero = filaDe(g, /Vencido — ya pasó la fecha/)
  const ultimo = filaDe(g, /^Más adelante$/)
  assert.deepEqual(terminos, Array.from({ length: ultimo - primero + 1 }, (_, i) => primero + i),
    'los términos tienen que ser las filas de los tramos, en orden y sin saltarse ninguno')
})

test('la banda cuenta lo que NO se puede afirmar, y sólo eso', () => {
  const g = construir()
  const f = celda(g, filaDe(g, /si NINGUNO de los no verificados tuviera su factura/i), 5)
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Los dos grupos sin verificar: sin N° de comprobante, y los que el OS todavía no miró (marca vacía).
  assert.match(f, new RegExp(esc(`="${MARCAS.sinNumero}"`)))
  assert.match(f, /\$M\$2:\$M\$400=""/)
  // Y NO los verificados ni los inferidos: ésos tienen evidencia y viven del lado de arriba. Si la
  // marca ✓ entrara acá, la banda contaría como incierta plata que ya viaja dentro de su rubro y
  // además la restaría dos veces.
  assert.ok(!f.includes(MARCAS.ok), 'metió los verificados en la banda de lo que no se puede afirmar')
  assert.ok(!f.includes(MARCAS.inferido), 'metió los inferidos en la banda: entonces el cruce de respaldo no sirve para nada')
  assert.ok(!f.includes(MARCAS.falta), 'los "FALTA" ya los suma el calendario: contarlos acá los restaría dos veces')
})

test('el riesgo de los no marcados se parte en "falta correr el agente" y "falta el dato"', () => {
  // Eran $38.377.479 en un solo renglón rojo. Medido: el 90,6% sólo necesitaba que corriera el
  // agente y el 9,4% necesitaba que una persona cargara el N° de comprobante. Verlos juntos hacía
  // leer un agujero de $38,4M donde el trabajo humano pendiente era $3,6M.
  const g = construir()
  const fCon = filaDe(g, /de los cuales, con N° de comprobante ya cargado/i)
  const fSin = filaDe(g, /de los cuales, SIN N° de comprobante/i)
  assert.ok(fCon > 0 && fSin > 0, 'el riesgo volvió a ser un solo renglón inaccionable')
  const [con, sin] = [celda(g, fCon, 3), celda(g, fSin, 3)]
  // Los dos miran la MISMA población (no debitados, sin marca) y se parten por el N° de comprobante.
  for (const f of [con, sin]) {
    assert.match(f, /\$M\$2:\$M\$400=""/)
    assert.match(f, /UPPER\('Cheques Emitidos'!\$K\$2:\$K\$400\)<>"SI"/)
    assert.match(f, /\$H\$2:\$H\$400/, 'la partición tiene que mirar la columna del N° de comprobante')
  }
  // Complementarios: el que tiene número y el que no. Si los dos usaran la misma condición, uno de
  // los dos renglones sería siempre cero y nadie se enteraría.
  assert.notEqual(con, sin)
  assert.ok(sin.includes('(1-('), 'el renglón "sin N°" tiene que ser la negación del otro')
})

test('lo colocable descuenta la caja mínima y nunca es negativo', () => {
  const g = construir()
  const colocable = g.filas[g.fCifras - 1].filter((x) => !vacia(x) && String(x || '').trim())[3]
  const fMin = filaDe(g, /^caja mínima deseada$/i)
  assert.ok(fMin > 0, 'la caja mínima tiene que existir para poder restarla')
  // EL DEFECTO: publicar el piso entero como colocable invita a inmovilizar la reserva operativa.
  assert.ok(String(colocable).includes(`E${fMin}`), 'lo colocable tiene que restar la caja mínima')
  assert.ok(String(colocable).includes('MAX(0;'), 'un colocable negativo se lee como "conseguí esto"')
  // Y sin caja mínima cargada NO publica un número: publicaría el piso entero.
  assert.ok(/^=IF\(N\(E\d+\)<=0;"";/.test(String(colocable)))
})

test('cada titular trae su pie, y el pie de la fecha es una fórmula (no una fecha escrita)', () => {
  const g = construir()
  const pies = g.filas[g.fCifras].filter((x) => !vacia(x) && String(x || '').trim())
  assert.equal(pies.length, 4)
  for (const p of pies) assert.ok(!/^@/.test(String(p)), `marcador sin resolver en el pie: ${p}`)
  // El pie del piso y el de lo colocable citan CUÁNDO cae ese punto: sin la fecha, el piso no dice
  // por cuánto tiempo se puede inmovilizar, que es exactamente lo que el dueño preguntó.
  const fCuando = filaDe(g, /cuándo ocurre/i)
  assert.ok(String(pies[1]).includes(`$F$${fCuando}`), 'el pie del piso tiene que decir cuándo cae')
  assert.ok(String(pies[3]).includes(`$F$${fCuando}`), 'el pie de lo colocable tiene que dar el plazo')
  // Y el del cierre de mes lee la fecha REAL del tramo, no un "31/08" escrito a mano.
  assert.ok(/=".*"&\$G\$\d+/.test(String(pies[2])), 'el pie del cierre de mes tiene que leer la fecha del tramo')
})

test('no queda ningún marcador @ sin resolver en toda la grilla', () => {
  const g = construir()
  for (const [i, f] of g.filas.entries()) {
    for (const c of f || []) {
      if (typeof c === 'string' && /^@[A-Z]/.test(c)) assert.fail(`fila ${i + 1}: marcador vivo "${c}"`)
    }
  }
})

test('LO QUE EL CALENDARIO EXCLUYE A PROPÓSITO SE PUBLICA CON SU MONTO', () => {
  // Una exclusión invisible es indistinguible de un olvido. Los $12.188.441 de cheques ya debitados
  // se dejan afuera porque el saldo del banco ya los tiene descontados — y eso tiene que poder
  // leerse en la pestaña, con su número, al lado del control hermano que mide los sin marca.
  const g = construir()
  const f = filaDe(g, /ya debitados y sin factura/)
  assert.ok(f > 0, 'la exclusión tiene que estar declarada en el calendario')
  const v = String(g.filas[f - 1][3])
  assert.ok(v.includes('="SI"'), 'mide justamente los DEBITADOS, que es lo que el término excluye')
  assert.ok(v.includes('FALTA cargar la factura'), 'y sólo los que no tienen factura en Compras')
  // NO puede entrar en ningún total: es la medida de lo que este bloque decide no contar.
  assert.ok(f > g.calTotal, 'va DEBAJO del total del horizonte, fuera de su rango de suma')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA LEGIBILIDAD SE MIDE, NO SE OPINA (05/08/2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('LA NUMERACIÓN DE BLOQUES ES CONSECUTIVA Y SIN HUECOS, arriba y en el anexo', () => {
  // El dueño: un cuadro que va "1, 2, 3, 4, 8, 9" desorienta — parece que faltan bloques. Al subir el
  // arqueo y fusionar dos pares del anexo, la numeración vieja quedaba con cuatro huecos.
  const g = construir()
  const rot = g.filas.map((f) => String(f?.[0] ?? '').trim())
  const raiz = rot.map((t) => t.match(/^(\d+) · /)?.[1]).filter(Boolean).map(Number)
  assert.deepEqual(raiz, [1, 2, 3, 4, 5, 6, 7], `bloques con hueco: ${raiz.join(', ')}`)
  const sub = rot.map((t) => t.match(/^7\.(\d+) · /)?.[1]).filter(Boolean).map(Number)
  assert.deepEqual(sub, [1, 2, 3, 4, 5, 6, 7], `sub-bloques con hueco: ${sub.join(', ')}`)
  // Y ningún rótulo puede quedar con la numeración vieja: un "4.6" suelto manda a buscar un bloque
  // que ya no existe.
  for (const t of rot) assert.ok(!/^4\.\d+ · /.test(t), `quedó un rótulo viejo: ${t}`)
})

test('EL ARQUEO ES CAPTURA Y VA ARRIBA: el dueño no baja nueve conciliaciones para tipear', () => {
  // Es la ÚNICA celda de la pestaña donde se escribe a mano, y su fecha es el ancla de la que cuelga
  // todo el efectivo del bloque 1 (sin ella la caja física vale $0 por diseño). Estaba última.
  const g = construir()
  assert.ok(g.fArq0 < filaDe(g, /^3 · CALENDARIO/), 'el arqueo tiene que estar antes del calendario')
  assert.ok(g.fArq0 < g.fCtrl0, 'el arqueo no puede vivir dentro del anexo de controles')
  // Y LA MUDANZA NO PISA NADA: sin lectura previa las dos celdas de carga siguen AUSENTES, que es lo
  // único que la fusión preserva (el centinela VACIO las borraría). Es la propiedad que hace segura
  // la mudanza: el conteo del dueño viaja a la fila nueva o no se toca, nunca se pierde.
  for (const f of [g.fArqArs, g.fArqUsd]) {
    for (const col of [2, 5]) {
      assert.equal(g.filas[f - 1][col], undefined, 'la celda de carga del arqueo se preserva, no se pisa')
    }
  }
})

test('EL "$" ES DEL TOTAL: el cuerpo va sin símbolo y sólo las filas de cierre lo llevan', () => {
  // Regla 1 de formato-statement.mjs. CAJA repetía el signo pesos en cada celda de las dos columnas
  // de plata: un símbolo que aparece en todas las filas no distingue nada, y la fila donde SÍ se
  // cierra la cuenta deja de destacarse.
  const g = construir()
  assert.ok(g.totales.length >= 5, 'tienen que existir filas de total identificadas')
  // El ancla es el TEXTO, nunca la posición: agregar un bloque no puede romper la lista.
  for (const f of g.totales) assert.match(String(g.filas[f - 1][0]), /^\s*(⇒|Total|TOTAL)/)
  // Y las filas del cuerpo NO están: si entrara una, volvería el "$" repetido.
  const fCuenta = filaDe(g, /^Caja en pesos$/)
  assert.ok(fCuenta > 0 && !g.totales.includes(fCuenta))
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

test('LA COBERTURA SALE DE LA MISMA DEFINICIÓN QUE EL CALENDARIO, no de una cuenta nueva', () => {
  // Una segunda definición de "obligaciones" es exactamente lo que costó los $41,7M de desacuerdo
  // entre CAJA y el Cash Flow. Los tres horizontes usan la expresión del cuadro del cash flow.
  const g = construir()
  const tramo0 = String(g.filas[g.cal0 - 1][3])
  for (let f = g.fCobDesde; f <= g.fCobHasta; f++) {
    const sale = String(g.filas[f - 1][2])
    assert.ok(sale.startsWith(tramo0.slice(0, 60)), `la fila ${f} no usa el cuadro del cash flow`)
    assert.ok(sale.includes('TODAY()+'), 'la ventana tiene que ser de 30, 60 o 90 días')
    // Y arranca en el corte del extracto: lo ya vencido pesa en las tres ventanas.
    assert.ok(sale.includes('CAJA_FECHA_SALDO'))
    // Los recursos son caja + cartera + cobranzas esperadas, no la caja sola.
    const recursos = String(g.filas[f - 1][4])
    assert.ok(recursos.includes(`$E$${g.fNeta}`) && recursos.includes('Cobranzas!'))
    // Sin obligaciones no se inventa una cobertura infinita.
    assert.ok(String(g.filas[f - 1][6]).startsWith(`=IF(C${f}<=0;"";`))
  }
})

test('EL CERO DEL BLOQUE DE VENCIDOS NO PUEDE QUEDAR MUDO', () => {
  // "Está todo conciliado" y "hace tres semanas que nadie carga un movimiento" se dibujan igual.
  const g = construir()
  const dicta = String(g.filas[g.fVencDicta - 1][4])
  const fUlt = filaDe(g, /Último cobro efectivamente registrado/)
  assert.ok(fUlt > 0, 'sin la fecha del último cobro no se puede distinguir orden de silencio')
  assert.ok(dicta.includes(`$F$${fUlt}`), 'el veredicto tiene que MIRAR esa fecha')
  assert.ok(dicta.includes('TODAY()-$F$'), 'y medir cuántos días pasaron')
  assert.ok(/no se registra un cobro/.test(dicta))
  // Y si Cobranzas no tiene ninguna fecha usable, tampoco festeja: lo dice.
  assert.ok(dicta.includes('NOT(ISNUMBER('))
})

test('los estados de Cobranzas NO se suman entre sí en el cuadro de vencidos', () => {
  // Regla literal de finanzas-tesoreria-construccion. Un "Pendiente" vencido se reclama; un
  // "Proyectado" vencido se reproyecta. Sumarlos en una fila borra la diferencia.
  const g = construir()
  const filas = g.filas.filter((f) => /^Cobros en "/.test(String(f?.[0] ?? ''))).map((f) => String(f[2]))
  assert.equal(filas.length, 3, 'una fila por estado esperado: Pendiente, Facturado, Proyectado')
  for (const f of filas) {
    const cuantos = ['Pendiente', 'Proyectado', 'Facturado', 'Cobrado', 'CANCELAR'].filter((e) => f.includes(`="${e}"`))
    assert.equal(cuantos.length, 1, `una fila suma ${cuantos.length} estados: ${cuantos.join('+')}`)
  }
})
