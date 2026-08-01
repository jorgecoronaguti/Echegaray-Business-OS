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
  // El signo va DESPUÉS de la guarda de arqueo (01/08): `=IF(NOT(ISNUMBER(...));0;-(...))`.
  assert.match(celda(g, fPag, 2), /;-\(/)
  assert.match(celda(g, fDep, 2), /;-\(/)
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

test('LA DESCARGA: una quincena con fecha en "Pagado el" sale del calendario', () => {
  // Es el mecanismo entero en una condición. Mientras "Pagado el" esté vacía la quincena PESA; cuando
  // el dueño escribe la fecha, deja de pesar — su salida ya está en el extracto del banco, y sumarla
  // otra vez la contaría dos veces.
  const g = construir()
  const sale = String(g.filas[g.cal0 - 1]?.[3] ?? '')
  assert.match(sale, /\(JORNALES_REAL_PAGADO=""\)/,
    'sólo pesa la que NO tiene fecha de pago real: eso es la descarga y el anti-doble-conteo')
  // La proyección no lleva esa condición: una quincena que todavía no existe no puede estar pagada.
  // SE AÍSLA SU TÉRMINO, no "todo lo que sigue": el corte hasta el final de la fórmula daba falso
  // positivo en cuanto se sumó un tercer término (la oficina, que sí tiene una columna PAGADO). Mirar
  // "de acá hasta el final" es la misma trampa que anclar en la posición.
  const termino = (nombre) => sale.split('+SUMPRODUCT(').find((t) => t.includes(nombre)) ?? ''
  const proy = termino('JORNALES_PROY_PAGO')
  assert.ok(proy.includes('JORNALES_PROY_PAGO'), 'el término de la proyección se pudo aislar')
  assert.ok(!proy.includes('JORNALES_REAL_PAGADO'), 'la proyección no se filtra por pagada: no tiene sentido')
})

test('LA OFICINA TAMBIÉN SALE DE ESTA CAJA: el calendario la suma, y de la misma fuente que el cash flow', () => {
  // El dueño: "no estás considerando oficina... por ende podría estar mal en caja". Eran ~$3,4M por mes
  // que salen del mismo banco y que el piso proyectado no veía.
  const g = construir()
  const sale = String(g.filas[g.cal0 - 1]?.[3] ?? '')
  assert.match(sale, /OFICINA_PAGO/, 'la oficina entra al calendario')
  assert.match(sale, /N\(OFICINA_PAGADO\)\+N\(OFICINA_PROYECTADO\)/, 'un mes está pagado o proyectado, nunca los dos')
  assert.match(sale, /OFICINA_PAGO>=CAJA_FECHA_SALDO/, 'antes del corte del extracto manda el banco, igual que la obra')
  assert.ok(!/Compras!/.test(sale.slice(sale.indexOf('OFICINA_PAGO'))), 'la nómina sale de la planilla de sueldos, no de Compras')
})

test('la fecha que ubica el jornal en el tramo es la de PAGO, nunca la de cierre', () => {
  const g = construir()
  const sale = String(g.filas[g.cal0 - 1]?.[3] ?? '')
  assert.ok(!sale.includes('JORNALES_REAL_HASTA'), 'HASTA es el devengamiento, no la caja')
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

test('el control del horizonte mide las DOS fuentes, o daría rojo para siempre', () => {
  // Al sumar los jornales al calendario, un control que resta sólo los cheques queda en rojo por una
  // diferencia CORRECTA. Un control que da rojo siempre es un control que nadie lee.
  const g = construir()
  const fila = g.filas.slice(g.cal0 - 1, g.calFin + 4).find((f) => /^ +· control:/.test(String(f?.[0] ?? '')))
  assert.ok(fila, 'el control existe')
  assert.match(String(fila[3]), /JORNALES_REAL_TOTAL/, 'resta la nómina cerrada sin pagar')
  assert.match(String(fila[3]), /JORNALES_PROY_TOTAL/, 'y la proyectada')
  assert.match(String(fila[3]), /OFICINA_PROYECTADO/, 'y la oficina, que también entra al calendario')
  assert.match(String(fila[0]), /cheques.*nómina.*oficina/i, 'y el rótulo dice las tres cosas que mide')
})

test('ANTES DEL CORTE MANDA EL BANCO: las quincenas viejas sin marcar NO son deuda', () => {
  // Sin esta condición el calendario mostraba $106M en "Vencido": las trece quincenas del año que
  // nadie marcó como pagadas, porque la columna "Pagado el" es nueva. No tener el dato NO es deber la
  // plata — y la de una quincena pagada antes del corte ya está descontada del saldo del banco.
  const g = construir()
  for (const f of g.filas.slice(g.cal0 - 1, g.cal0 - 1 + 6)) {
    assert.match(String(f[3]), /JORNALES_REAL_PAGO>=CAJA_FECHA_SALDO/,
      'sólo entra la nómina cuyo pago cae en o después del corte del extracto')
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
  assert.match(monto, /^=IF\(\$F\$\d+<>"";0;/)
  // Y NO lleva monto: sin ancla, cualquier cifra se lee como saldo de caja y no lo es. Medido contra
  // el archivo real, el neto con la ventana abierta da −$47.033.903 (el acumulado del año, no un
  // saldo). El problema se nombra y se instruye; la plata aparece sola al cargar la fecha.
  assert.ok(!/'Cobranzas'!|JORNALES_REAL/.test(monto), 'la alerta no puede publicar un monto sin ancla')
  const instruccion = celda(g, f, 7)
  assert.match(instruccion, /Cargá la fecha del arqueo/)
})

test('la alerta del arqueo apunta a la celda REAL donde se carga la fecha', () => {
  const g = construir()
  const fArqueo = filaDe(g, /^Caja en pesos/)
  const monto = celda(g, filaDe(g, /falta la fecha del arqueo/i), 2)
  assert.match(monto, new RegExp(`\\$F\\$${fArqueo}<>""`), 'tiene que mirar la fecha de la fila del arqueo, no una fila fija')
})


// ═══ LA NÓMINA COMPLETA: OFICINA Y LA EXTRACCIÓN (01/08) ═══
//
// El dueño: "¿ese es el valor que se refleja en cash flow y por ende lo que se debería restar en caja
// cada vez que se haya pagado?". Era no: OFICINA_* lo consumía sólo el CALENDARIO, así que un sueldo
// de administración pagado no bajaba ninguna disponibilidad. Y la caja física sólo sabía BAJAR hacia
// el banco (depósito) y nunca subir desde él (extracción), una asimetría que sólo puede dar de menos.

test('la oficina DESCARGA los dos canales, cada uno del suyo', () => {
  const g = construir()
  const bco = celda(g, filaDe(g, /sueldos de administración por transferencia/i), 2)
  assert.match(bco, /OFICINA_BANCO/)
  assert.ok(!bco.includes('OFICINA_EFECTIVO'), 'lo que salió en billetes no puede salir también del banco')
  const efvo = celda(g, filaDe(g, /sueldos de administración en efectivo/i), 2)
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
