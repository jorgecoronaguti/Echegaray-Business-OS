// LA PORTADA DE CAJA, VERIFICADA EN FRÍO. Sin red, sin base, sin escribir una celda.
//
// ═══ ESTE ARCHIVO SE REESCRIBIÓ ENTERO (05/08/2026) — CONTRATO NUEVO, NO AJUSTE ═══
//
// Los tests que estaban acá medían el diseño de bloques apilados: el titular de tres cifras, el
// calendario en las columnas C·D·E, la cobertura 30/60/90, las dos líneas de veredicto de los
// controles. Ese diseño ya no existe: la pestaña es una PORTADA de cinco tarjetas más cuatro bloques,
// y un test que verifica un layout retirado no protege nada — sólo obliga a mantenerlo.
//
// LO QUE NO SE PERDIÓ, Y ES LA MITAD DEL VALOR DE ESTE ARCHIVO: cada invariante que costó plata sigue
// verificado, traducido al layout nuevo. El anti-doble-conteo del total, el arqueo que se re-emite en
// su fila nueva, la coma como separador en es-AR, la columna de prosa que no vuelve, los rangos con
// nombre que no se reapuntan antes de escribir, y el corte de la corrida cuando la escritura se frena
// (esos dos, en scripts/caja-pestana-escritura.test.mjs: no verifican QUÉ dice la pestaña sino CÓMO se
// escribe).
// Las fórmulas de las tarjetas y de los avisos se verifican en lib/caja-tarjetas.test.mjs y
// lib/caja-avisos.test.mjs; los bloques que se mudaron al anexo, en lib/caja-anexo.test.mjs.
import test from 'node:test'
import assert from 'node:assert/strict'
import { grilla, rescatar } from './caja-pestana.mjs'
import {
  FILAS_MAXIMAS, ANCHO, ANCHOS, COLS_PLATA, COLS_TARJETA, COL_PROSA, esTituloDeBloque,
} from '../lib/caja-grilla.mjs'
import { CUENTAS } from '../lib/caja-disponibilidades.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'
import { terminoLibro, LIBRO } from '../lib/libro-sumas.mjs'
import { NO_REAL, FIN_DE_MES } from '../lib/caja-tarjetas.mjs'
import { BORDES } from '../lib/caja-calendario.mjs'
import { ANEXO } from '../lib/caja-anexo-nombres.mjs'

/** Una celda VACÍA de la grilla. El generador no escribe cadena vacía: escribe el centinela VACIO, que
 *  le dice al portón "esta celda es MÍA y está vacía" (una celda ajena y vacía se preserva). */
const vacia = (s) => s === '' || s === VACIO

// `filasCal` son las filas de "Impuestos y Financieros" donde viven el IVA y el IIBB a pagar. En la
// corrida real las ubica el script POR RÓTULO; acá son dos números cualesquiera porque lo que el test
// verifica es que sean OBLIGATORIAS: sin esa pestaña el libro no ve el egreso más grande del año.
const REFS = { bancoRaw: '_BANCO_RAW', cheques: 'Cheques Emitidos', tarjeta: 'Tarjeta de Credito', chequesRaw: '_CHEQUES_RAW', filasCal: { iva: 18, iibb: 19 } }
const construir = () => grilla(new Map(), REFS)

/** La fila (1-based) cuyo rótulo en la columna indicada matchea. */
const filaDe = (g, re, col = 0) => g.filas.findIndex((f) => re.test(String(f?.[col] ?? '').trim())) + 1
const celda = (g, fila, col) => String(g.filas[fila - 1]?.[col] ?? '')

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// UNA PANTALLA. EL OBJETIVO ES UN NÚMERO Y SE MIDE
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('LA PORTADA ENTRA EN UNA PANTALLA: no pasa del tope declarado', () => {
  // El dueño pidió la caja nueva cuatro veces. Las tres primeras se respondió con defectos corregidos
  // y con tamaño; la cuarta fue explícita sobre la FORMA: *"debe ocupar prácticamente una pantalla
  // completa sin desplazarse"*. Sin un tope MEDIDO la pestaña vuelve a crecer bloque a bloque, que es
  // exactamente cómo llegó a 143 filas.
  const g = construir()
  assert.ok(g.filas.length <= FILAS_MAXIMAS,
    `CAJA quedó en ${g.filas.length} filas y el tope es ${FILAS_MAXIMAS}. Si hace falta un bloque nuevo, algo tiene que irse a _CAJA_ANEXO.`)
})

test('NI UNA FILA EN BLANCO: el hueco es un defecto medido, no un separador', () => {
  const g = construir()
  const enBlanco = g.filas
    .map((f, i) => ({ fila: i + 1, algo: (f || []).some((c, j) => j !== COL_PROSA && !vacia(c) && c !== undefined) }))
    .filter((x) => !x.algo)
  assert.deepEqual(enBlanco.map((x) => x.fila), [], 'volvieron las filas en blanco')
})

test('LOS DOS PANELES COMPARTEN LAS MISMAS FILAS: es lo que hace que entre en una pantalla', () => {
  // Si algún día alguien "ordena" la pestaña apilando los bloques, el alto se duplica y el rediseño se
  // deshace sin que ninguna fórmula cambie. El invariante verificable es que las filas de datos tengan
  // contenido de los DOS lados.
  const g = construir()
  for (let f = g.d0; f <= Math.min(g.d1, g.lad1); f++) {
    assert.ok(!vacia(celda(g, f, 0)), `la fila ${f} perdió el panel izquierdo`)
    assert.ok(!vacia(celda(g, f, 5)), `la fila ${f} perdió el panel derecho`)
  }
  assert.equal(g.lad0, g.d0, 'los dos paneles arrancan en la misma fila')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LAS CUATRO TARJETAS — LA PORTADA (el orden JPM del 06/08: operativo · invertido · comprometido · proyectado)
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('LAS CINCO TARJETAS ESTÁN, EN ORDEN, Y CADA UNA OCUPA SUS TRES RENGLONES', () => {
  // RIESGO y CUELLO no aparecen: los borró el dueño (huellas selladas en sheet_huella_celda) y la
  // quinta columna de tarjetas (I) queda vacía. El piso sigue en el cierre de la escalera.
  const g = construir()
  // 13/08: las dos del medio se renombraron. El dueño no entendía la suya —*"no sé si es algo q
  // tengo q cubrir o ya está cubierto"*, *"la 'libre disponibilidad' es negativo lo cual me
  // confunde"*— y el defecto era del RÓTULO: los números están bien y no se tocó ninguna fórmula.
  const esperados = ['CAJA DISPONIBLE', 'FALTA PAGAR ESTE MES', 'SI NO COBRÁS MÁS ESTE MES', 'CAJA INVERTIDA', 'SALDO AL CIERRE']
  esperados.forEach((rot, i) => {
    const col = COLS_TARJETA[i]
    assert.equal(celda(g, g.fRotulos, col), rot, `la tarjeta ${i + 1} tiene que ser "${rot}" en la columna ${col}`)
    assert.match(celda(g, g.fCifras, col), /^=/, `la cifra de "${rot}" tiene que ser una fórmula, nunca un número`)
    assert.match(celda(g, g.fContexto, col), /^=/, `"${rot}" sin línea de contexto es un número mudo`)
  })
  // Y NINGUNA CELDA MÁS EN ESAS TRES FILAS: una tarjeta ocupa dos columnas combinadas, y algo escrito
  // en la columna de la derecha queda TAPADO por el merge — un dato invisible es peor que uno feo.
  for (const f of [g.fRotulos, g.fCifras, g.fContexto]) {
    for (let c = 0; c < ANCHO; c++) {
      if (COLS_TARJETA.includes(c)) continue
      assert.ok(vacia(g.filas[f - 1][c]), `fila ${f} col ${c}: queda tapada por la combinación de la tarjeta`)
    }
  }
})

test('LAS CIFRAS DE LAS TARJETAS SALEN DEL LIBRO O DE LA PROPIA PESTAÑA, nunca de una cuenta nueva', () => {
  // Es la regla que puso el dueño: todo número de plata es una fórmula sobre `_MOVIMIENTOS` armada con
  // `terminoLibro`, o una referencia a un rango con nombre que ya existe. Se compara contra lo que
  // produce la función y no contra un literal escrito acá: un literal sería una segunda fuente de
  // verdad que queda en verde midiendo el contrato viejo.
  const g = construir()
  const val = (i) => celda(g, g.fCifras, COLS_TARJETA[i])
  assert.equal(val(0), `=$C$${g.fCierre}`, 'la caja disponible es EL TOTAL del panel de cuentas, no una suma nueva')
  // 6ª directiva (idioma único): el titular es el MES − lo pagado; los 7 días viven en el contexto.
  assert.equal(val(1), `=${terminoLibro({ signo: -1, estados: NO_REAL, hasta: FIN_DE_MES, medida: 'magnitud' })}`)
  // 06/08 (4ª directiva del dueño): LIBRE = el piso de la escalera, referenciado de su fila de
  // cierre. El porqué vive en caja-tarjetas.mjs; acá sólo se fija que la grilla pase las celdas.
  assert.equal(val(2), '=N($A$3)-N($C$3)', 'LIBRE = disponible − comprometida, la definición del dueño')
  assert.equal(val(3), `=N($C$${g.fBalanzArs})+N($C$${g.fBalanzUsd})`,
    'INVERTIDO referencia las filas Balanz del panel, no una segunda fuente')
  // La enumeración final: SALDO AL CIERRE = disponible − comprometida + cobros del mes.
  assert.equal(val(4), `=N($A$3)-N($C$3)+${terminoLibro({ signo: 1, estados: NO_REAL, hasta: FIN_DE_MES, medida: 'magnitud' })}`)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL PANEL DE CUENTAS — QUE EL TOTAL NO CUENTE LA MISMA PLATA DOS VECES
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('las cuentas del plan siguen estando, y el rótulo es el ancla', () => {
  const g = construir()
  for (const c of CUENTAS) {
    assert.ok(filaDe(g, new RegExp(`^${c.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) > 0,
      `falta la cuenta "${c.nombre}": CAJA ubica por RÓTULO, si cambia se rompe todo lo que la lee`)
  }
})

test('EL ANTI-DOBLE-CONTEO: el neto de efectivo entra al total por UNA sola puerta', () => {
  // El total es un SUM del bloque: si dos filas aportaran el mismo efectivo, la empresa se creería más
  // líquida de lo que está y ninguna fórmula daría error.
  const g = construir()
  let n = 0
  for (let f = g.d0; f <= g.fCierre; f++) {
    for (const col of COLS_PLATA) if (celda(g, f, col).includes('ANEXO_EFECTIVO_NETO')) n++
  }
  assert.equal(n, 1, 'el neto de efectivo tiene que entrar al total por una sola puerta')
})

test('el total barre el bloque entero y descuenta TODAS las filas ‖: cartera y Balanz (operativo)', () => {
  // La orden del 06/08: la caja disponible es SÓLO banco y efectivo. Lo invertido se ve, se valúa y
  // NO suma — como los invested balances en el panel de JPM. El total queda más conservador, y es el
  // número correcto para decidir un pago: la comitente no cubre un cheque mañana.
  const g = construir()
  const total = celda(g, g.fCierre, 2)
  assert.ok(total.includes(`SUM(C${g.d0}:C${g.d1})`), `el total tiene que barrer todo el bloque: ${total}`)
  assert.ok(total.includes(`-C${g.fCartera}`), 'y seguir restando los echeq en custodia: no son caja de hoy')
  assert.ok(total.includes(`-C${g.fBalanzArs}`), 'y restar Balanz ARS: está invertido, no disponible')
  assert.ok(total.includes(`-C${g.fBalanzUsd}`), 'y restar Balanz USD: está invertido, no disponible')
  // Y NINGUNA RESTA MÁS: son exactamente las tres filas ‖ (cartera + Balanz ARS + Balanz USD). Una
  // cuarta resta sería una cuenta excluida en silencio; una de menos, plata contada dos veces.
  assert.equal((total.match(/-C\d+/g) || []).length, 3, `el total resta otra cosa: ${total}`)
})

test('EL RÓTULO DEL TOTAL ES EL QUE BUSCAN LOS OTROS MÓDULOS, y por eso no lleva flecha adelante', () => {
  // `cash-briefing` corta las cuentas con /^total disponibilidades/i y `ubicarCaja` hace lo mismo. Con
  // la flecha del diseño anterior ninguno de los dos lo encontraba y los dos caían a su respaldo EN
  // SILENCIO: el briefing volvía a sumar las filas a mano, que es de donde salió una vez una caja de
  // $384.000.000 que no existía.
  const g = construir()
  assert.match(celda(g, g.fCierre, 0), /^Total disponibilidades/,
    'el rótulo del total arranca en "Total disponibilidades" o dos módulos dejan de encontrarlo')
})

test('la caja en dólares se lleva en dólares y se valúa aparte', () => {
  // "U$S 15.000" cobrados en efectivo entraban al cajón de PESOS como $15.000: el importe correcto en
  // la moneda equivocada, que no da error y está mal por tres órdenes de magnitud. Desde la fusión
  // del conteo (07/08), B es el conteo A MANO y la valuación —conteo + cobros USD en efectivo,
  // convertida— vive en C.
  const g = construir()
  const f = filaDe(g, /^Efectivo en dólares$/)
  assert.ok(f > 0 && g.usd.includes(f), 'la fila en dólares tiene que estar declarada para pintarse "U$S"')
  const c = celda(g, f, 2)
  assert.match(c, new RegExp(`^=\\(N\\(B${f}\\)\\+`), 'C arranca del conteo tipeado en B')
  assert.match(c, /"USD"/, 'suma sólo los cobros marcados en dólares')
  assert.match(c, /\*TIPO_CAMBIO_USD$/, 'y recién al final se valúa a pesos')
})

test('la fecha de la posición vive en la fila del total y es la MÁS RECIENTE del bloque', () => {
  // Se publicaba apuntando a "la última fila del bloque" — que tenía fecha sólo porque la cartera
  // estaba última. Al agregar filas, la última pasó a ser una sin fecha: EOMONTH de una celda vacía da
  // 31/12/1899 y las dos filas más importantes de los dos cash flow quedaron VACÍAS los doce meses.
  const g = construir()
  const fecha = celda(g, g.fCierre, 3)
  assert.ok(fecha.startsWith('=') && /MAX\(/.test(fecha), 'la fecha de la posición tiene que ser calculada')
  assert.ok(fecha.includes(`$D$${g.d0}:$D$${g.d1}`), `tiene que ser el MAX de las fechas del bloque; dice: ${fecha}`)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA ESCALERA DE VENCIMIENTOS
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('LOS SEIS TRAMOS, Y SU NETO SALE DEL LIBRO — no de seis fuentes con seis criterios', () => {
  // El diseño anterior sumaba por su cuenta cheques, jornales, oficina, impuestos y cobranzas en cada
  // tramo. Dos listas de la misma plata clasificadas por ejes distintos dieron $41.704.351 de
  // desacuerdo sobre el mismo mes, y el que veía de MENOS era el que produce el PISO.
  const g = construir()
  assert.equal(g.lad1 - g.lad0 + 1, BORDES.length, 'los seis tramos con borde temporal')
  BORDES.forEach(([rotulo], k) => {
    const f = g.lad0 + k
    assert.equal(celda(g, f, 5), rotulo, `el tramo ${k} perdió su rótulo`)
    assert.ok(celda(g, f, 7).includes(`${LIBRO.pestana}!`), `el neto del tramo "${rotulo}" no lee el libro`)
    for (const e of NO_REAL) assert.ok(celda(g, f, 7).includes(`="${e}"`), `el tramo "${rotulo}" no ve los ${e}`)
  })
})

test('EL PRIMER TRAMO ABRE EN EL SERIAL 0: un cheque viejo sin presentar no puede desaparecer', () => {
  // Si "Vencido" arrancara en el corte del extracto, un cheque librado hace un mes y todavía no
  // debitado no caería en ningún tramo: el piso subiría sin que se haya pagado nada. Con el libro esto
  // es seguro porque lo que ya salió está marcado REAL, y REAL está excluido de todos los tramos.
  const g = construir()
  assert.equal(celda(g, g.lad0, 7), `=${terminoLibro({ desde: '0', hasta: 'TODAY()', estados: NO_REAL })}`,
    'el tramo Vencido tiene que abrir en el serial 0 y cerrar hoy')
  assert.ok(celda(g, g.lad0 + 1, 7).includes('CAJA_FECHA_SALDO'),
    'y sólo el primero: el resto arranca en su borde, nunca antes del corte del extracto')
})

test('LA POSICIÓN ACUMULADA ES UNA CADENA QUE ARRANCA EN LA DISPONIBILIDAD', () => {
  const g = construir()
  assert.equal(celda(g, g.lad0, 8), `=CAJA_TOTAL_DISPONIBLE+$H${g.lad0}`,
    'el primer tramo parte de la caja de hoy, citada por su rango con nombre')
  for (let f = g.lad0 + 1; f <= g.lad1; f++) {
    assert.equal(celda(g, f, 8), `=$I${f - 1}+$H${f}`, `la fila ${f} rompe la cadena de la posición acumulada`)
  }
})

test('el piso es el MÍNIMO de la cadena, con su fecha y con la punta de abajo al lado', () => {
  const g = construir()
  assert.equal(celda(g, g.fCierre, 8), `=MIN($I$${g.lad0}:$I$${g.lad1})`, 'el piso es el mínimo del recorrido')
  assert.match(celda(g, g.fCierre, 6), /^=IFERROR\(INDEX\(\$G\$/, 'y la fecha del piso sale del mismo MATCH')
  // LA PUNTA DE ABAJO ES EXACTA, NO EL PISO MENOS UN TOTAL: se recalcula el mínimo restando en cada
  // tramo lo incierto ACUMULADO hasta ese borde. Restarle al piso todo lo incierto le cargaría plata
  // que sale DESPUÉS del punto más bajo, y una banda inflada se ignora igual que una alarma que suena
  // siempre.
  const banda = celda(g, g.fCierre, 7)
  const terminos = [...banda.matchAll(/\$I(\d+)-\(/g)].map((m) => Number(m[1]))
  assert.deepEqual(terminos, Array.from({ length: BORDES.length }, (_, k) => g.lad0 + k),
    'los términos tienen que ser las filas de los tramos, en orden y sin saltarse ninguno')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ALERTAS Y ACCIONES, EN SU LUGAR DE LA GRILLA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('CUATRO ALERTAS A LA IZQUIERDA Y TRES ACCIONES A LA DERECHA, todas condicionales', () => {
  const g = construir()
  const alertas = []
  const acciones = []
  for (let f = g.fAviso0; f <= g.fAviso1; f++) {
    if (!vacia(celda(g, f, 0))) alertas.push(celda(g, f, 0))
    if (!vacia(celda(g, f, 5))) acciones.push(celda(g, f, 5))
  }
  assert.equal(alertas.length, 4)
  assert.equal(acciones.length, 3)
  for (const a of [...alertas, ...acciones]) assert.match(a, /^=IF\(/, 'un aviso de texto vale hasta la corrida siguiente')
})

test('LOS CONTROLES DEL ANEXO NO DESAPARECIERON: cada uno está citado en una alerta', () => {
  // La mudanza al anexo es de UBICACIÓN, no de cobertura. Si un control se cayera del anexo y nadie lo
  // citara acá, la pestaña quedaría más linda y más ciega — que es lo que no puede pasar.
  const g = construir()
  const bloque = g.filas.slice(g.fAviso0 - 1, g.fAviso1).map((f) => f.join(' ')).join(' ')
  for (const n of ['ANEXO_DIF_ECHEQ', 'ANEXO_DIF_CONCILIACION', 'ANEXO_EFECTIVO_SIN_EXPLICAR',
    'ANEXO_VENCIDO_SIN_CONCILIAR', 'ANEXO_OFICINA_SIN_CANAL', 'ANEXO_CHEQUES_SIN_MARCA', 'ANEXO_CHEQUES_SIN_FECHA']) {
    assert.ok(bloque.includes(n), `el control ${n} no está citado en ninguna alerta: se perdió al mudarse`)
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// NI UN NÚMERO PEGADO EN UNA CELDA DE PLATA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * LAS ÚNICAS EXCEPCIONES, DECLARADAS POR ESCRITO — no en silencio, que es donde se cuela el agujero.
 *
 * · El ARQUEO: son las dos celdas de captura de todo el archivo. Salen AUSENTES (la fusión preserva lo
 *   que el dueño tipeó) o con el número que él escribió.
 * · La cuenta en dólares del banco: el extracto en dólares NO tiene réplica en el archivo (`_BANCO_RAW`
 *   es la cuenta en pesos), así que su saldo sale de la transcripción declarada en banco-santander.mjs
 *   con su fecha de corte al lado, y la regla de "fecha vieja" lo pinta. Un dato viejo DECLARADO es
 *   mejor que un #REF! que rompe el total.
 * · Las dos filas de Balanz (06/08): la plataforma no tiene réplica en el archivo. El saldo es el
 *   APORTE probado por el extracto de Santander del 05/08 ($22,53M + U$S 15.000), no la posición
 *   total — gap declarado en banco-santander.mjs BALANZ; se reemplaza cuando llegue su extracto.
 */
// Las filas "Efectivo en …" llevan en B el CONTEO tipeado por el dueño (número, no fórmula): es la
// única captura de la pestaña desde que el arqueo se fusionó en la fila viva (07/08).
const PEGADO_DECLARADO = new Set(['Santander · cta cte USD', 'Efectivo en pesos', 'Efectivo en dólares',
  'Balanz · inversiones ARS ‖ invertido', 'Balanz · inversiones USD ‖ invertido'])

test('CERO NÚMEROS PEGADOS: toda celda de plata es una fórmula', () => {
  // Es la Regla de Oro número 5 del dueño, medida sobre la grilla entera y no bloque por bloque. Un
  // número pegado sólo cambia cuando corre el agente, y el timer de este archivo ya estuvo detenido
  // semanas: la pestaña seguiría mostrando la caja de hace diez días sin que nada avise.
  const g = construir()
  // LA BANDA DE LAS TARJETAS Y EL ENCABEZADO NO SON ZONA DE DATOS: llevan texto a propósito y el
  // formateador les devuelve el formato de TEXTO fila por fila. La fila de las CIFRAS sí se audita, y
  // se audita entera: son las cinco celdas más miradas del archivo.
  const bandas = new Set([g.fRotulos, g.fContexto, g.fCab])
  for (const [i, fila] of g.filas.entries()) {
    if (bandas.has(i + 1)) continue
    if (PEGADO_DECLARADO.has(String(fila[0] ?? '').trim())) continue
    for (const c of COLS_PLATA) {
      const v = fila[c]
      if (v === undefined || vacia(v)) continue
      assert.ok(String(v).startsWith('='),
        `fila ${i + 1} col ${String.fromCharCode(65 + c)}: "${String(v).slice(0, 40)}" es un número pegado en una celda de plata`)
    }
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL ARQUEO — LA ÚNICA CAPTURA DE TODO EL ARCHIVO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('sin nada leído, el CONTEO sale AUSENTE: sin dato no se sobrescribe', () => {
  // NO ALCANZA CON `vacia()`: el centinela VACIO pasa por vacío y significa "es mía y va vacía", o sea
  // que la fusión la LIMPIA. La primera versión de este test decía vacia() y dejó pasar un generador
  // que le borraba el conteo al dueño en la primera corrida.
  //
  // 16/08: LA COLUMNA B SIGUE SIENDO SUYA Y LA D DEJÓ DE SERLO. El dueño borró la fecha a propósito
  // ("no te guíes en eso sino en lo q marca los timestamps del código") y desde entonces `D7` y `D8`
  // estaban vacías. Ahora las deriva el centinela: la B es la única celda de captura de la fila.
  const g = construir()
  for (const f of [g.fArqArs, g.fArqUsd]) {
    assert.ok(f > 0, 'las dos filas del arqueo tienen que existir')
    assert.equal(g.filas[f - 1][1], undefined,
      'el IMPORTE del conteo tiene que estar AUSENTE (ni valor ni centinela VACIO): lo carga el dueño')
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LAS FECHAS DE SALDO QUE FALTABAN (16/08/2026)
//
// El dueño: *"no completaste las fechas de saldos"*. `D7` y `D8` —las dos filas de efectivo, el 40% del
// disponible— estaban VACÍAS desde que él borró la celda donde las tipeaba. Dos consecuencias medidas:
// la fila más importante del panel no decía de cuándo era, y el aviso de congelado de la tarjeta no
// podía dispararse NUNCA sobre ellas porque su condición arranca con `ISNUMBER($D$n)`.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('LAS DOS FILAS DE EFECTIVO PUBLICAN SU FECHA, y sale del centinela — no de TODAY() ni de una celda tipeada', () => {
  const g = construir()
  const fecha = (f) => String(g.filas[f - 1][3] ?? '')
  assert.equal(fecha(g.fArqArs), `=IF(ISNUMBER(${ANEXO.conteoArsDia});${ANEXO.conteoArsDia};"")`)
  assert.equal(fecha(g.fArqUsd), `=IF(ISNUMBER(${ANEXO.conteoUsdDia});${ANEXO.conteoUsdDia};"")`)
  for (const f of [g.fArqArs, g.fArqUsd]) {
    // UN `TODAY()` ACÁ AFIRMA QUE SE CONTÓ HOY, todos los días. Es el defecto que el dueño ya señaló
    // tres veces en esta misma columna ("aún noto desactualizadas las fechas").
    assert.doesNotMatch(fecha(f), /TODAY\(\)/, 'la fecha del conteo no puede salir del reloj de la corrida')
    // Y LA GUARDA: sin ella, con la celda del anexo vacía la fecha se dibujaría como el serial 0, o sea
    // 30/12/1899 — el mismo defecto que la tarjeta ya evita en el otro extremo de la cuenta.
    assert.match(fecha(f), /^=IF\(ISNUMBER\(/, 'sin la guarda, una celda vacía se dibuja como 30/12/1899')
  }
})

test('la fecha del conteo NO se le vuelve a pedir al dueño: la tipeada se descarta', () => {
  // Él la borró y lo dijo con todas las letras. Si el rescate volviera a re-emitirla, la celda
  // amarilla reaparecería y el mecanismo entero volvería a depender de que alguien la escriba.
  const cargado = new Map([['Efectivo en pesos', { saldo: 12000000, fecha: 46233, origen: '', quien: '' }]])
  const g = grilla(cargado, REFS)
  assert.equal(g.filas[g.fArqArs - 1][1], 12000000, 'el CONTEO del dueño sí viaja: es su dato')
  assert.equal(g.filas[g.fArqArs - 1][3], `=IF(ISNUMBER(${ANEXO.conteoArsDia});${ANEXO.conteoArsDia};"")`,
    'su FECHA ya no: la derivan los timestamps del código')
})

test('EL RESCATE LEE LA MISMA COLUMNA EN LA QUE EL GENERADOR ESCRIBE EL ARQUEO', () => {
  // ═══ EL DEFECTO QUE ESTE TEST CAZA, Y QUE ESTUVO VIVO HASTA HOY (05/08) ═══
  //
  // `rescatar` mapea las columnas por el TEXTO del encabezado: busca la primera que arranque en
  // "saldo|importe|cotiza". En el diseño anterior el encabezado decía "En su moneda" en la columna
  // donde el dueño tipea y "Saldo en pesos" dos columnas más allá, así que el rescate leía la columna
  // CALCULADA —siempre vacía en la fila del arqueo— y el conteo no viajaba nunca. El test que había no
  // lo vio porque construía el encabezado A MANO, con un texto que el generador no escribe.
  //
  // Acá el encabezado sale de la GRILLA REAL. Un mock de encabezado es una segunda fuente de verdad.
  const g = construir()
  const cel = (valor, numero = null) => ({ valor, numero, formula: null, formato: null })
  const grid = [
    g.filas[g.fCab - 1].map((c) => cel(String(c ?? ''))),
    // El rótulo VIEJO a propósito: es de los que pueden seguir escritos en el archivo real (la fila
    // del arqueo eliminada el 07/08). El rescate tiene que traducirlo por ALIAS a la fila viva — si
    // no, la fusión del conteo lo pierde.
    [cel('Arqueo en pesos — conteo a mano'), cel('0', 0), cel(''), cel('30/07/2026', 46233)],
  ]
  const cargado = rescatar(grid)
  assert.equal(cargado.get('Efectivo en pesos')?.saldo, 0, 'el importe tipeado tiene que viajar')
  assert.equal(cargado.get('Efectivo en pesos')?.fecha, 46233, 'y su fecha también: sin fecha no hay ventana')
})

test('con el conteo ya cargado, el arqueo se RE-EMITE en su fila nueva (no se queda en la vieja)', () => {
  // La fusión preserva por POSICIÓN. Una corrida metió cuatro filas arriba, el bloque bajó, el conteo
  // se quedó en la fila vieja y los rangos con nombre se republicaron en una celda vacía: la caja
  // física ($39,28M) se fue a cero sin un solo #ERROR.
  const cargado = new Map([
    ['Efectivo en pesos', { saldo: 0, fecha: 46233, origen: '', quien: '' }],
    ['Efectivo en dólares', { saldo: 15000, fecha: 46233, origen: '', quien: '' }],
  ])
  const g = grilla(cargado, REFS)
  assert.equal(g.filas[g.fArqArs - 1][1], 0, 'el importe 0 es un dato, no un vacío')
  assert.equal(g.filas[g.fArqUsd - 1][1], 15000)
})

test('SÓLO EL ARQUEO ES AMARILLO: el color no puede mentir sobre quién es dueño de la celda', () => {
  // El diseño anterior pintaba de amarillo "Caja en pesos" y "Caja en dólares", que son CALCULADAS.
  // Amarillo significa "acá podés escribir", y escribir ahí borraba una fórmula.
  const g = construir()
  assert.deepEqual(g.amarillas, [g.fArqArs, g.fArqUsd])
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LEGIBILIDAD Y FORMATO — SE MIDE, NO SE OPINA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('LA NUMERACIÓN DE BLOQUES ES CONSECUTIVA Y SIN HUECOS, mirando LAS DOS columnas de título', () => {
  const g = construir()
  const raiz = []
  for (const f of g.filas) {
    for (const c of [0, 5]) {
      if (!esTituloDeBloque(f?.[c])) continue
      const m = String(f[c]).match(/"?(\d+) · /)
      if (m) raiz.push(Number(m[1]))
    }
  }
  assert.deepEqual(raiz, [1, 2, 3, 4], `bloques con hueco: ${raiz.join(' ')}`)
})

test('CADA BLOQUE CON FUENTE PROPIA DECLARA SU FECHA, y es calculada', () => {
  // La pestaña mezcla un arqueo del 04/08, un extracto del 05/08 y un resumen de tarjeta del 22/07. Es
  // legítimo —una fuente viva no le presta su frescura a una congelada— pero tiene que estar DICHO. Los
  // bloques 3 y 4 se derivan de los de arriba: inventarles una fecha sería peor que no tenerla.
  const g = construir()
  for (const c of [0, 5]) {
    assert.ok(String(g.filas[g.fBloques12 - 1][c] ?? '').startsWith('='),
      `el título del bloque de la columna ${c} tiene que traer su frescura calculada`)
    assert.ok(!String(g.filas[g.fBloques34 - 1][c] ?? '').startsWith('='),
      'un bloque derivado no declara frescura: sería una fecha inventada')
  }
})

test('ninguna fórmula usa la coma como separador de ARGUMENTOS (en es_AR va `;`; la coma es decimal)', () => {
  const g = construir()
  for (const [i, fila] of g.filas.entries()) {
    for (const [j, c] of fila.entries()) {
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

test('NINGUNA fórmula lleva su explicación PEGADA con guion largo fuera de un literal', () => {
  // Una celda quedó en #ERROR! y el generador había dicho "ninguna celda en error": tenía la fórmula Y
  // su explicación pegadas. Eso no parsea.
  const g = construir()
  for (const [i, fila] of (g.filas || []).entries()) {
    for (const [j, c] of (fila || []).entries()) {
      const s = String(c ?? '')
      if (!s.startsWith('=')) continue
      assert.ok(!/\s—\s/.test(sinLits(s)), `fila ${i + 1} col ${j}: explicación pegada fuera de comillas.\n  ${s.slice(0, 140)}`)
    }
  }
})

test('NINGÚN RÓTULO FIJO SE CORTA: el texto entra en el ancho de su columna', () => {
  // `auditar-pantalla.mjs` marcó seis textos cortados sobre la pestaña escrita. Un rótulo cortado se
  // lee como basura y hace desconfiar de la fila entera. Se mide con el ancho REAL de cada columna
  // (~5,75px por carácter) y sólo sobre el texto FIJO: lo que produce una fórmula no se puede medir sin
  // evaluarla. Los títulos de bloque quedan afuera: desbordan libres sobre columnas vacías.
  const g = construir()
  const cabe = (px) => Math.floor(px / 5.75)
  for (const [i, f] of g.filas.entries()) {
    for (const col of [0, 5]) {
      const v = f[col]
      if (typeof v !== 'string' || vacia(v) || v.startsWith('=') || esTituloDeBloque(v)) continue
      assert.ok(v.length <= cabe(ANCHOS[col]),
        `fila ${i + 1} col ${String.fromCharCode(65 + col)}: ${v.length} caracteres en ${ANCHOS[col]}px (entran ${cabe(ANCHOS[col])}).\n  "${v}"`)
    }
  }
})

test('LA GRILLA ENTRA EN UNA PANTALLA A LO ANCHO, y la columna que decide es la ancha', () => {
  assert.equal(ANCHOS.length, ANCHO, 'un ancho por columna, o la última se queda con el default')
  assert.ok(ANCHOS.reduce((a, b) => a + b, 0) <= 1140, 'el total tiene que entrar sin scroll horizontal')
  // La columna del aire entre paneles es lo más angosto que hay: si crece, deja de ser aire y se lee
  // como una columna vacía, que el auditor de pantalla reporta como hueco.
  assert.ok(ANCHOS[4] <= 24, 'la E es aire, no una columna')
  assert.ok(ANCHOS[8] > ANCHOS[6], 'la I es la posición acumulada: el número que decide de la escalera')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA COLUMNA DE PROSA NO VUELVE (03/08)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// La corrida del 03/08 le escribió al dueño 66 celdas de prosa. Él las borra siempre —textual: "esas
// aclaraciones de mierda yo siempre las saco"— y ya lo había pedido en julio. Volvió por un MERGE: se
// rescataron generadores de una rama anterior a esa decisión. Por eso el control es de grilla y no de
// revisión: un merge no lee las decisiones, lee los tests.

test('la grilla no lleva NI UNA celda de prosa, y la columna sale con el centinela', () => {
  const g = construir()
  for (const [i, f] of g.filas.entries()) {
    assert.equal(f[COL_PROSA], VACIO,
      `fila ${i + 1}: la columna de prosa tiene que salir con el centinela para que la fusión limpie las viejas`)
  }
})

test('SIN EL CALENDARIO FISCAL NO HAY PESTAÑA: una fuente que falta no puede leerse como un cero', () => {
  // Es la propiedad que costó $41,7M: no fue una fórmula mal escrita, fue un concepto que nadie sumó y
  // nada avisó. Sin la pestaña de impuestos el libro no ve el IVA/IIBB y el piso sube sin que se haya
  // pagado nada, sin un solo #ERROR.
  assert.throws(() => grilla(new Map(), { ...REFS, filasCal: undefined }), /Impuestos y Financieros/)
})

test('BALANZ ESTÁ EN LA CAJA, DISCRIMINADO: se ve, se valúa, y el rótulo declara que no suma', () => {
  // El 05/08 salieron del banco $22.530.000 y U$S 15.000 hacia Balanz. El banco los descuenta de su
  // saldo: sin estas dos filas, mover plata a la inversión la hacía desaparecer de la empresa. Desde
  // el 06/08 llevan el ‖ (orden del dueño): son INVERTIDO, no disponible — la fila se muestra con su
  // valuación y su fecha, el total no la suma y la tarjeta INVERTIDO la cita.
  const g = construir()
  const fArs = filaDe(g, /^Balanz · inversiones ARS ‖ invertido$/)
  const fUsd = filaDe(g, /^Balanz · inversiones USD ‖ invertido$/)
  assert.equal(fArs, g.fBalanzArs, 'la fila declarada es la que lleva el rótulo')
  assert.equal(fUsd, g.fBalanzUsd)
  assert.ok(fArs > 0, 'falta la fila Balanz ARS')
  assert.ok(fUsd > 0, 'falta la fila Balanz USD')
  assert.equal(g.filas[fArs - 1][1], 22530000, 'el aporte ARS probado por el extracto del 05/08')
  assert.equal(g.filas[fUsd - 1][1], 15000, 'el aporte USD probado por la base 25.413 de la cta USD')
  assert.ok(g.usd.includes(fUsd), 'la fila USD se declara para valuarse con TIPO_CAMBIO_USD')
  assert.equal(celda(g, fUsd, 2), `=IF(ISNUMBER(B${fUsd});B${fUsd}*TIPO_CAMBIO_USD;"")`)
  // CADA CUENTA SE FECHA CON SU PROPIA FUENTE: Balanz es del 05/08, no del corte global de julio.
  assert.equal(celda(g, fArs, 3), '2026-08-05')
  assert.equal(celda(g, fUsd, 3), '2026-08-05')
})

test('LA CUENTA USD DEL BANCO QUEDÓ AL 05/08: depósito 15.400 − 15.000 a Balanz = 981,39', () => {
  // Las dos patas están probadas por el impuesto 25.413 del extracto de pesos (bases usd 15.400 y
  // 15.000). Fechar este saldo con el corte global de julio afirmaría una frescura que no es la suya.
  const g = construir()
  const f = filaDe(g, /^Santander · cta cte USD$/)
  assert.equal(g.filas[f - 1][1], 981.39)
  assert.equal(celda(g, f, 3), '2026-08-05')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA FECHA MÁS VIEJA DE LAS FILAS QUE SUMAN (14/08/2026)
//
// La tarjeta CAJA DISPONIBLE decía "al 14/08" copiando la fecha del total, que es un MAX. Adentro de
// ese total había $1.463.926 de "Santander · cta cte USD" fechados el 05/08. El MAX es correcto para
// el total —es hasta cuándo llega el dato más nuevo— y es una mentira como frescura del conjunto.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('la tarjeta DISPONIBLE mira la fecha MÁS VIEJA de las filas que suman, no sólo el MAX del total', () => {
  const g = construir()
  const contexto = g.tarjetas.find((t) => t.clave === 'disponible').contexto
  assert.match(contexto, /MIN\(/, 'sin el MIN, un corte de nueve días desaparece adentro del MAX del total')
  assert.match(contexto, /▲ /, 'y tiene que decirlo con la marca que sí se dibuja en el PDF')
  // 15/08: y CON EL MONTO. "parte al 05/08" no se puede decidir — sobre $18.270.071, "parte" tanto
  // puede ser $500.000 como $15.000.000. La grilla tiene que pasarle a la tarjeta el saldo de cada
  // fila junto a su fecha, o la frase vuelve a ser un adjetivo.
  // 16/08: y con la PREPOSICIÓN que dice que ese monto está ADENTRO del titular. "▲ $1,4M congelado
  // al 05/08" al lado de $18.270.071 se lee como un segundo importe de otro origen — el dueño lo leyó
  // así, textual: "confunde ese importe de origen q has diferenciado".
  assert.match(contexto, /M de este total son del /,
    'la tarjeta dice cuánta plata viene de esa fecha Y que es una parte del número de arriba')
  const enElMonto = (contexto.match(/N\(\$C\$\d+\)/g) ?? [])
  assert.ok(enElMonto.length > 0, 'sin las celdas de saldo, el monto congelado no se puede sumar')
})

test('el MIN de la tarjeta EXCLUYE las filas ‖ que el total resta: avisaría por plata que no está adentro', () => {
  const g = construir()
  const contexto = g.tarjetas.find((t) => t.clave === 'disponible').contexto
  const enElMin = new Set((contexto.match(/MIN\(([^)]*)\)/)?.[1] ?? '').split(';').map((s) => s.trim()))
  assert.ok(enElMin.size > 0, 'el MIN quedó vacío: el test estaría felicitando sin mirar nada')
  for (const f of g.noSuman) {
    assert.ok(!enElMin.has(`$D$${f}`),
      `la fila ${f} NO suma al total (‖) y su fecha entró al MIN: la tarjeta avisaría por plata que no rotula`)
  }
  // Y la prueba de vida por el otro lado: la cuenta del banco en pesos SÍ suma y SÍ tiene que estar.
  assert.ok(enElMin.has(`$D$${g.fBancoPesos}`), 'la cuenta en pesos suma al total y su fecha quedó fuera del MIN')
})
