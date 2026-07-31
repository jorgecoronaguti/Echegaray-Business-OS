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
import { grilla } from './caja-pestana.mjs'
import { CUENTAS } from '../lib/caja-disponibilidades.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'

/** Una celda VACÍA de la grilla. El generador no escribe '': escribe el centinela VACIO, que le dice
 *  al portón "esta celda es MÍA y está vacía" (una celda ajena y vacía se preserva). Ver
 *  lib/preservar-anotaciones.mjs — el centinela existe porque clearValues borraba trabajo del dueño. */
const vacia = (s) => s === '' || s === VACIO

const REFS = { bancoRaw: '_BANCO_RAW', cheques: 'Cheques Emitidos', chequesRaw: '_CHEQUES_RAW' }
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

  const pesos = celda(g, fCaja, 4)
  assert.match(pesos, /^=/, '"Caja en pesos" tiene que ser una FÓRMULA, no un número pegado')
  assert.ok(pesos.includes(`$C$${fNeto}`),
    `el saldo en pesos del arqueo tiene que sumar la celda del neto ($C$${fNeto}); dice: ${pesos}`)
  assert.ok(pesos.includes(`$C$${fCaja}`), 'y tiene que seguir partiendo del arqueo que el dueño tipea')
})

test('el ARQUEO (columna de origen) NO se toca: sigue siendo la celda de carga del dueño', () => {
  const g = construir()
  const fCaja = filaDe(g, /^caja en pesos$/i)
  // Sin nada cargado previamente, la celda del arqueo queda VACÍA para que él la complete. Si acá
  // apareciera una fórmula, el conteo físico habría quedado pisado por una suma automática.
  const arqueo = celda(g, fCaja, 2)
  assert.doesNotMatch(arqueo, /^=/, 'la columna de origen del arqueo NO puede ser una fórmula: la tipea el dueño')
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
  for (let f = g.d0; f <= g.d1; f++) if (celda(g, f, 4).includes(`$C$${fNeto}`) || celda(g, f, 4) === `=C${fNeto}`) n++
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
  assert.match(celda(g, fPag, 2), /^=-\(/)
  assert.match(celda(g, fDep, 2), /^=-\(/)
})

test('la alerta 4.6 lee el ARQUEO CRUDO, no el saldo en pesos (que ahora mezcla otra ventana)', () => {
  const g = construir()
  const fArq = filaDe(g, /^arqueo declarado de caja física$/i)
  assert.ok(fArq > 0, 'la fila del arqueo declarado tiene que estar en el bloque de trazabilidad')
  const v = celda(g, fArq, 4)
  assert.ok(v.includes(`$C$${g.d0}`), `tiene que leer la columna de origen (el conteo físico): ${v}`)
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
