// LAS CINCO TARJETAS, VERIFICADAS EN FRÍO — SON LAS CELDAS MÁS MIRADAS DEL ARCHIVO.
//
// EL CONTRATO ES EL IDIOMA ÚNICO (6ª directiva del dueño, 06/08, la definitiva): las cinco hablan
// EL MES, y la última es la consecuencia de las otras — tengo + cobro − pago = termino. La historia
// de las cinco versiones anteriores de "LIBRE" vive en caja-tarjetas.mjs; este test fija que no
// vuelva ninguna: ni una tarjeta con ventana propia, ni un número que no se pueda derivar de los
// otros cuatro a simple vista.
//
// LO QUE SE VERIFICA ACÁ Y NO EN LA GRILLA: que cada fórmula sea EXACTAMENTE la que produce
// `terminoLibro` con los filtros correctos — comparada contra la función, no contra un literal.
import test from 'node:test'
import assert from 'node:assert/strict'
import { tarjetas, NO_REAL, DEUDA, PLAN, FIN_DE_MES } from './caja-tarjetas.mjs'
import { terminoLibro } from './libro-sumas.mjs'
import { ANCHOS, COLS_TARJETA } from './caja-grilla.mjs'

const REF = {
  total: '$C$15', fecha: '$D$15', invArs: '$C$11', invUsd: '$C$12', invFecha: '$D$11',
  pisoSimple: '$I$15', pisoFecha: '$G$15',
}
const T = () => tarjetas(REF)
const de = (clave) => T().find((t) => t.clave === clave)

test('son CINCO en el orden de la historia: tengo → debo pagar → voy a cobrar → invertido → termino', () => {
  assert.deepEqual(T().map((t) => t.clave), ['disponible', 'comprometida', 'libre', 'invertido', 'cierre'])
})

test('las cinco tienen rótulo, cifra y contexto: la forma de la tarjeta no se negocia', () => {
  for (const t of T()) {
    assert.ok(t.rotulo && t.rotulo === t.rotulo.toUpperCase(), `"${t.clave}" sin rótulo en versales`)
    assert.match(t.valor, /^=/, `la cifra de "${t.clave}" tiene que ser una fórmula`)
    assert.match(t.contexto, /^=/, `"${t.clave}" sin contexto es un número mudo`)
    assert.equal(t.especie, 'plata', `"${t.clave}": las cinco son plata`)
  }
})

test('NINGÚN rótulo ni contexto nombra un mes por su nombre: en septiembre mentiría', () => {
  for (const t of T()) {
    for (const s of [t.rotulo, t.contexto]) {
      assert.doesNotMatch(String(s), /enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/i,
        `"${t.clave}" quedó clavada a un mes: ${s}`)
    }
  }
})

test('CAJA DISPONIBLE es EL TOTAL del panel de cuentas — banco y caja, sin Balanz', () => {
  const t = de('disponible')
  assert.equal(t.valor, `=${REF.total}`)
  assert.match(t.contexto, /bancos y efectivo/)
})

test('LA DEUDA = lo COMPROMETIDO y lo VENCIDO del mes — el presupuesto NO entra', () => {
  // 16/08: este test decía `NO_REAL` (los tres estados) y por eso el defecto que el dueño reclamó
  // tres veces pasaba en verde. Lo REAL sigue afuera porque ya salió del saldo del banco; lo
  // PROYECTADO sale porque todavía no es de nadie. El detalle del corte, en caja-tarjetas-conceptos.
  //
  // LOS "7d" SE FUERON del contexto: el lugar lo ocupa el plan, que es el concepto que faltaba. El
  // mismo dato, con su fecha y su saldo al lado, está tres columnas a la derecha en el tramo "Esta
  // semana" de la escalera — que es su casa y donde se lo puede leer con su detalle.
  const c = de('comprometida')
  assert.equal(c.valor, `=${terminoLibro({ signo: -1, estados: DEUDA, hasta: FIN_DE_MES, medida: 'magnitud' })}`)
  assert.ok(!c.valor.includes('"REAL"'), 'lo REAL ya salió de la cuenta: no es obligación')
  assert.ok(!c.valor.includes('"PROYECTADO"'), 'el presupuesto no es deuda')
})

test('EL RÓTULO DE LA DEUDA NOMBRA EL CONCEPTO Y SU VENTANA REAL', () => {
  // 13/08, textual: *"la tarjeta 'caja comprometida' no sé si es algo q tengo q cubrir o ya está
  // cubierto"*. Un rótulo que empieza con "CAJA" nombra plata que se TIENE; ésta es plata que TIENE
  // QUE SALIR. Eso sigue valiendo.
  //
  // 16/08: "FALTA PAGAR ESTE MES" fallaba en las DOS mitades. "Falta pagar" sobre un número con
  // $38,0M de presupuesto adentro es falso; y "este mes" sobre una suma sin `desde` —que arrastra
  // meses anteriores— también, tanto que hacía falta una línea de contexto para desmentirlo. El
  // rótulo nuevo describe exactamente lo que la celda mide: deuda, atrasada y del mes.
  const c = de('comprometida')
  assert.equal(c.rotulo, 'DEUDA ATRASADA Y DEL MES')
  assert.doesNotMatch(c.rotulo, /^CAJA /, 'no es un cajón de plata que se tiene: es plata que hay que poner')
  assert.match(c.rotulo, /^DEUDA/, 'el rótulo tiene que contestar "¿lo tengo que cubrir?"')
  assert.match(c.rotulo, /ATRASADA/, 'la suma no lleva `desde`: arrastra lo impago de meses anteriores y hay que decirlo')
  // El estado del libro NO se usa como rótulo de un número que suma dos estados.
  assert.ok(!/^COMPROMETID[OA]\b/.test(c.rotulo),
    'el titular suma COMPROMETIDO + VENCIDO: nombrarlo con un solo estado lo vuelve falso')
})

test('EL CONTEXTO DE LA DEUDA publica lo pagado — los compromisos salen de esta tarjeta', () => {
  // "es comprometida y cuando se pagan los compromisos deben salir de ahí" (dueño, 07/08). Salen, y
  // sin lo pagado a la vista no se nota.
  //
  // 16/08 — LO QUE SE FUE ES "de $X": ese total del mes se armaba como `pagado + N($C$3)`, o sea
  // pagos REALES sumados a un titular que traía deuda Y presupuesto. Sumar dos cosas que no son la
  // misma no da un total: da un número que no existe, y era la comparación exacta que el dueño
  // señaló (*"de repente debemos mas en lo q falta del mes q lo q ya se ha pagado"*). Lo pagado se
  // publica solo, contra un titular que ahora sí es homogéneo.
  const c = de('comprometida')
  const pagado = terminoLibro({ signo: -1, estados: ['REAL'], desde: 'EOMONTH(TODAY();-1)+1', hasta: FIN_DE_MES, medida: 'magnitud' })
  assert.match(c.contexto, /pagaste/)
  assert.match(c.rotulo, /Y DEL MES/, 'la ventana la declara el rótulo')
  assert.ok(c.contexto.includes(pagado))
  assert.ok(!c.contexto.includes(`(${pagado}+N($C$3))`),
    'sumar pagos reales con deuda+presupuesto no da un total: da un número que no existe')
})

test('CON FRONTERA, COMPROMETIDA suma en vivo las pendientes que el libro todavía no incorporó', () => {
  // La asimetría que se comía la LIBRE: disponible lee Compras en vivo, la foto del libro no conoce
  // las compras cargadas después de la última regeneración. El término vivo arranca EN LA FILA
  // SIGUIENTE a la frontera, filtra Pendiente y fecha de caja dentro del mes, y suma el SALDO
  // (total − pagado). Una pagada nueva NO entra: ya salió del banco, sumarla sería doble conteo.
  const c = tarjetas({ ...REF, fronteraCompras: 833 }).find((t) => t.clave === 'comprometida')
  assert.match(c.valor, /\+SUMPRODUCT/)
  assert.ok(c.valor.includes('Compras!$X$834:$X$1334'), 'arranca en la fila siguiente a la frontera')
  assert.ok(c.valor.includes('="Pendiente"'), 'sólo pendientes: una pagada nueva ya salió del saldo')
  assert.ok(c.valor.includes(`<${FIN_DE_MES}`), 'sólo lo que cae dentro del mes')
  assert.ok(c.valor.includes('N(Compras!$O$834:$O$1334)-N(Compras!$T$834:$T$1334)'), 'el saldo, no el total')
  assert.ok(!c.valor.includes(','), 'locale es-AR: sin comas como separador de argumentos')
  // Y LA LIBRE LO HEREDA SOLA: sigue siendo la resta de las tarjetas vecinas, por referencia.
  const l = tarjetas({ ...REF, fronteraCompras: 833 }).find((t) => t.clave === 'libre')
  assert.equal(l.valor, '=N($A$3)-N($C$3)')
})

test('SIN FRONTERA, la tarjeta queda como era: falla hacia el comportamiento anterior', () => {
  // Una corrida vieja del generador o una lectura caída no pueden inventar un término a medias.
  const c = de('comprometida')
  assert.ok(!c.valor.includes('SUMPRODUCT((Compras'), 'sin frontera no hay término vivo')
})

test('LIBRE es la resta de sus dos vecinas — la definición textual del dueño', () => {
  // "disponible es toda la plata q hay, comprometida es lo q hay q pagar el resto del mes, POR
  // ENDE surge libre disponibilidad". Por referencia a A3 y C3: se verifica con los ojos. La
  // fórmula NO cambió el 13/08 — el número estaba bien y lo definió él; lo que cambió es el rótulo.
  const l = de('libre')
  assert.equal(l.valor, '=N($A$3)-N($C$3)')
})

test('EL RÓTULO DE LA LIBRE NOMBRA LA HIPÓTESIS QUE MIDE, no promete un saldo utilizable', () => {
  // 13/08, textual: *"la 'libre disponibilidad' es negativo lo cual me confunde"*. La celda compara
  // una foto de HOY contra el acumulado de lo que falta del mes sin netear los cobros de esos
  // mismos días: es un test de estrés, y un test de estrés rotulado como saldo disponible se lee
  // como quiebra. El nombre viejo además ya estaba ocupado adentro del OS: "saldo de libre
  // disponibilidad" es el término de ARCA para el IVA a favor (lib/iva-libre-disponibilidad.mjs).
  const l = de('libre')
  assert.equal(l.rotulo, 'SI NO COBRÁS MÁS ESTE MES')
  assert.doesNotMatch(l.rotulo, /LIBRE DISPONIBILIDAD/,
    'ese nombre significa otra cosa en este mismo sistema: el saldo de IVA a favor de ARCA')
})

test('EL CONTEXTO DE LA LIBRE PUBLICA EL MONTO A COBRAR, y sale de la MISMA fuente que el cierre', () => {
  // "se cubre con lo cobrado en el mes" era cierto, genérico e inverificable: no decía CON CUÁNTO.
  // El monto tiene que ser fórmula viva (se mueve con cada cobranza cargada) y tiene que ser
  // EXACTAMENTE el término que usa SALDO AL CIERRE, o dos tarjetas de la misma fila podrían decir
  // una que alcanza y la otra que no.
  const l = de('libre')
  const mesCobro = terminoLibro({ signo: 1, estados: NO_REAL, hasta: FIN_DE_MES, medida: 'magnitud' })
  assert.match(l.contexto, /^=/, 'el contexto es fórmula, nunca texto pegado')
  assert.ok(l.contexto.includes(mesCobro), 'el monto a cobrar sale del libro, con la definición del cierre')
  assert.ok(de('cierre').valor.includes(mesCobro), 'y es el MISMO término que suma SALDO AL CIERRE')
  assert.match(l.contexto, /a cobrar/, 'el monto se publica: "se cubre con lo cobrado" no dice con cuánto')
  // NINGÚN NÚMERO PEGADO (regla de oro 5), medido donde importa: adentro del TEXTO QUE SE DIBUJA. Un
  // "$160,8M" tipeado en la frase se ve idéntico al calculado y envejece sin avisar. Los patrones de
  // formato que viven dentro de TEXT() no cuentan: no se dibujan.
  for (const trozo of trozosDeSalida(l.contexto).filter((t) => /^".*"$/.test(t))) {
    assert.doesNotMatch(trozo, /\d/, `el contexto lleva un número escrito a mano: ${trozo}`)
  }
})

test('INVERTIDO cita las filas Balanz de la grilla — una sola fuente, nunca una segunda posición', () => {
  const t = de('invertido')
  assert.equal(t.valor, `=N(${REF.invArs})+N(${REF.invUsd})`)
  assert.match(t.contexto, /Balanz/)
  assert.ok(t.contexto.includes(REF.invFecha))
})

test('SALDO AL CIERRE es la CONSECUENCIA: disponible − comprometida + cobros del mes', () => {
  const t = de('cierre')
  assert.equal(t.rotulo, 'SALDO AL CIERRE')
  // 16/08 — Y RESTANDO EL PLAN. Cobrando los $151,8M los materiales proyectados SE COMPRAN: un cierre
  // que suma los cobros y no descuenta los $38,0M que se van a gastar publica plata que no va a estar.
  assert.equal(t.valor, `=N($A$3)-N($C$3)+${terminoLibro({ signo: 1, estados: NO_REAL, hasta: FIN_DE_MES, medida: 'magnitud' })}`
    + `-${terminoLibro({ signo: -1, estados: PLAN, hasta: FIN_DE_MES, medida: 'magnitud' })}`,
  'disponible y deuda por referencia; cobros y plan con las sumas únicas del libro')
  // EL PAR DE ESCENARIOS: la tarjeta del medio no cobra y no gasta, ésta cobra y gasta. La cláusula
  // condicional no se negocia — sin ella el número se lee como plata garantizada.
  assert.match(t.contexto, /cobrando y gastando/, 'sin los DOS supuestos, se leería como plata garantizada')
  assert.ok(t.contexto.includes('EOMONTH(TODAY();0)'), 'la fecha del cierre es calculada, no tipeada')
  assert.match(de('libre').rotulo, /SI NO COBRÁS/, 'el otro extremo del par: el mismo número sin cobrar nada')
  assert.ok(!t.valor.includes(REF.invArs) && !t.valor.includes(REF.invUsd),
    'lo invertido no entra: una comitente no paga un cheque, y el dueño lo quiso aparte')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE NO ENTRA EN LA CELDA NO SE LEE — Y NADIE SE ENTERA
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// La fila de contexto va con wrapStrategy CLIP, así que una frase larga NO desborda: se corta, y una
// frase cortada es peor que ninguna. El contexto de COMPROMETIDA medía 45 caracteres contra los 216px
// (C+D) que le da el diseño ≈ 37: llevaba semanas truncándose. No se vio porque el dueño ensanchó la
// columna C a mano hasta 252px — y `formatear` se la devuelve a 130 en la próxima corrida, así que el
// arreglo de él dura hasta que corra el generador. La medida se hace acá, en frío, y no en la pestaña.
//
// EL MODELO, DECLARADO: 5,75px por carácter (el mismo que usa caja-pestana.test.mjs, medido sobre
// textos ya cortados) y cada `TEXT(...)` se dibuja como un token de 5 caracteres ("$126", "$34,6",
// "31/08"). Es una aproximación, no una medición — por eso el presupuesto se usa entero y no al
// límite. Sólo se miden las tarjetas cuyo contexto NO tiene ramas: de un IF habría que elegir la más
// larga, y eso pide un parser que no vale lo que cuesta.
const PX_POR_CARACTER = 5.75
const ANCHO_DE_TOKEN = 5
const anchoDeTarjeta = (i) => ANCHOS[COLS_TARJETA[i]] + ANCHOS[COLS_TARJETA[i] + 1]

/**
 * Los pedazos que la celda DIBUJA: la concatenación de nivel cero. No alcanza con juntar todas las
 * comillas de la fórmula — adentro de un SUMPRODUCT hay "COMPROMETIDO", "PROYECTADO", "$#,##0.0" y
 * ninguno de esos se ve. Sin esta distinción el modelo medía 420px donde se dibujan 207.
 */
const trozosDeSalida = (formula) => {
  const s = String(formula).replace(/^=/, '')
  const out = []
  let buf = ''
  let nivel = 0
  let enTexto = false
  for (const ch of s) {
    if (ch === '"') enTexto = !enTexto
    else if (!enTexto && ch === '(') nivel++
    else if (!enTexto && ch === ')') nivel--
    else if (!enTexto && ch === '&' && nivel === 0) { out.push(buf.trim()); buf = ''; continue }
    buf += ch
  }
  return [...out, buf.trim()].filter(Boolean)
}
const largoDibujado = (formula) => trozosDeSalida(formula)
  .reduce((n, t) => n + (/^".*"$/s.test(t) ? t.length - 2 : ANCHO_DE_TOKEN), 0)

test('EL CONTEXTO DE CADA TARJETA ENTRA EN SU ANCHO: con CLIP, lo que sobra no se ve', () => {
  T().forEach((t, i) => {
    if (t.contexto.includes('IF(')) return
    const px = largoDibujado(t.contexto) * PX_POR_CARACTER
    assert.ok(px <= anchoDeTarjeta(i),
      `"${t.rotulo}": el contexto mide ≈${Math.round(px)}px y la tarjeta ${anchoDeTarjeta(i)}px — se va a cortar`)
  })
})

test('EL RÓTULO DE CADA TARJETA ENTRA EN SU ANCHO — en versales y en negrita, que es más ancho', () => {
  // Un rótulo cortado es peor que un contexto cortado: es lo primero que se lee y define qué es el
  // número. 6,5px por carácter para versales en negrita a 9pt.
  T().forEach((t, i) => {
    const px = t.rotulo.length * 6.5
    assert.ok(px <= anchoDeTarjeta(i),
      `"${t.rotulo}": el rótulo mide ≈${Math.round(px)}px y la tarjeta ${anchoDeTarjeta(i)}px`)
  })
})

test('NINGUNA fórmula usa la coma como separador de argumentos (es-AR)', () => {
  for (const t of T()) {
    for (const f of [t.valor, t.contexto]) {
      const sospechosas = f.replace(/"[^"]*"/g, '""').replace(/(?<=\d),(?=\d)/g, '')
      assert.doesNotMatch(sospechosas, /,/, `"${t.clave}" va a dar #ERROR! en es-AR:\n  ${f}`)
    }
  }
})

test('FALLA CERRADO: sin una referencia, rompe antes de escribir una celda en error', () => {
  assert.throws(() => tarjetas({ ...REF, invArs: '' }), /faltan las referencias/)
  assert.throws(() => tarjetas({ ...REF, total: '' }), /faltan las referencias/)
  assert.throws(() => tarjetas({ ...REF, pisoSimple: '' }), /faltan las referencias/)
  assert.throws(() => tarjetas(), /faltan las referencias/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA FRESCURA QUE EL `MAX` TAPABA (14/08/2026)
//
// La fila del total publica el MAX de las fechas de todas las cuentas y la tarjeta la copiaba: el
// 14/08 decía "al 14/08 · bancos y efectivo" con $1.463.926 de la cuenta en dólares fechados el 05/08,
// y $44.905.290 de Balanz también al 05/08 rotulados "liquidez T+1" sin un día encima. Es lo que
// `rotuloPorFuente` tiene prohibido en su propia cabecera: una fuente viva no le presta su frescura a
// una congelada. Si alguien saca `fechaVieja` o el aviso del invertido, estos tests se ponen rojos.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

// Las dos filas que el 15/08 están congeladas en el panel real: la cuenta en dólares ($1.447.698,
// pegada a mano al 05/08) y su vecina viva. `celdasQueSuman` es la lista de filas que SUMAN al total,
// con su saldo al lado de su fecha — el mismo par con el que la tarjeta avisa y suma.
const SUMAN = [{ monto: '$C$7', fecha: '$D$7' }, { monto: '$C$10', fecha: '$D$10' }]
const conFilas = (celdasQueSuman = SUMAN) => tarjetas({ ...REF, celdasQueSuman }).find((x) => x.clave === 'disponible')

test('DISPONIBLE avisa cuando la fecha MÁS VIEJA de las filas que suman quedó atrás', () => {
  const t = conFilas()
  assert.match(t.contexto, /MIN\(\$D\$7;\$D\$10\)/, 'la tarjeta tiene que mirar la más vieja, no sólo el MAX del total')
  assert.match(t.contexto, /▲/, 'la marca es ALERTA (▲): el ⚠ no se dibuja al exportar a PDF')
  assert.match(t.contexto, /TODAY\(\)-MIN\(\$D\$7;\$D\$10\)>7/, 'el umbral es el mismo DIAS_AVISO del resto del OS')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL DEFECTO DEL 15/08: "▲ parte al 05/08" NO SE PUEDE DECIDIR
//
// El dueño rechazó la tarjeta tres veces. El aviso decía que "parte" del total venía del 05/08 y no
// decía cuánta: sobre $18.270.071, "parte" puede ser $500.000 o $15.000.000, y la decisión de pagar
// cambia. Si alguien vuelve a dejar el aviso sin monto, este test se pone rojo.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('DISPONIBLE dice CUÁNTA PLATA está congelada, no "parte"', () => {
  const t = conFilas()
  assert.doesNotMatch(t.contexto, /parte al/, '"parte" no es un dato: no se puede decidir con él')
  // 16/08 — Y LA RELACIÓN CON EL TITULAR, QUE ES LA MITAD QUE FALTABA. "▲ $1,4M congelado al 05/08"
  // era cierto y se leía como un importe aparte: el dueño lo dijo así ("confunde ese importe de origen
  // q has diferenciado"). Sin la preposición, dos cifras pegadas no dicen si una está adentro de la
  // otra. Si alguien vuelve a sacarla, este test se pone rojo.
  assert.match(t.contexto, /M de este total son del /,
    'la frase tiene que declarar que ese monto es una PARTE del número de arriba')
  assert.doesNotMatch(t.contexto, /M congelado al/, 'la frase vieja no dice de dónde sale ese monto')
  // El monto se arma con la MISMA condición con la que se avisa, fila por fila: no es el total menos
  // lo vivo (una segunda definición del total) ni un número tipeado.
  for (const c of SUMAN) {
    assert.ok(t.contexto.includes(`IF(AND(ISNUMBER(${c.fecha});TODAY()-${c.fecha}>7);N(${c.monto});0)`),
      `la fila ${c.monto} tiene que aportar su saldo al monto congelado con su propia condición`)
  }
  assert.match(t.contexto, /TEXT\(\(IF\(AND\(ISNUMBER/, 'el monto se dibuja: sumarlo y no publicarlo no arregla nada')
})

test('UN PANEL SIN NINGUNA FECHA no publica "congelado al 30/12": MIN de vacías es 0, y 0 es número', () => {
  // El ISNUMBER solo NO alcanza: `MIN($D$7;$D$10)` con las dos celdas vacías devuelve 0, ISNUMBER(0)
  // es VERDADERO y TODAY()-0 son 126 años. La tarjeta dibujaría el serial 0 como fecha de 1899 al
  // lado de "$0,0M". Con el `>0` la rama no se prende y la frase queda en la de siempre.
  const t = conFilas()
  assert.match(t.contexto, /ISNUMBER\(MIN\(\$D\$7;\$D\$10\)\);MIN\(\$D\$7;\$D\$10\)>0;/,
    'falta el guardián del MIN vacío: un panel recién nacido publicaría una fecha de 1899')
})

test('DISPONIBLE no avisa de nada cuando no hay atraso: la frase del día bueno es la de siempre', () => {
  const t = conFilas([{ monto: '$C$7', fecha: '$D$7' }])
  // El aviso vive adentro de un IF y la rama del día bueno es LITERALMENTE la frase de siempre: un
  // aviso que aparece todos los días deja de leerse.
  assert.match(t.contexto, /;" · bancos y efectivo"\)/, 'sin atraso, la tarjeta vuelve sola a su frase base')
  assert.match(t.contexto, /"al "&TEXT\(\$D\$15;"dd\/mm"\)&/, 'la fecha publicada sigue siendo la del total')
})

test('DISPONIBLE sin `celdasQueSuman` queda EXACTAMENTE como antes: falla hacia atrás, no hacia una fecha inventada', () => {
  const t = tarjetas(REF).find((x) => x.clave === 'disponible')
  assert.doesNotMatch(t.contexto, /congelado/)
  assert.match(t.contexto, /"al "&TEXT\(\$D\$15;"dd\/mm"\)&" · bancos y efectivo"/)
})

test('INVERTIDO publica los días encima cuando la posición está vieja', () => {
  const t = tarjetas(REF).find((x) => x.clave === 'invertido')
  assert.match(t.contexto, /TODAY\(\)-\$D\$11>7/, 'compara contra el mismo umbral que la columna de fechas')
  assert.match(t.contexto, /▲ "&TEXT\(TODAY\(\)-\$D\$11;"0"\)&"d"/, 'dice cuántos días, no sólo que está vieja')
  assert.doesNotMatch(t.contexto, /hace/, 'el patrón del archivo es `▲ N` (formulaAntiguedad), no "hace N días"')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// BALANZ ES MANUAL DE FORMA PERMANENTE (15/08/2026)
//
// El dueño ordenó apagar el navegador de Balanz en la VM y quedó apagado (`echegaray-balanz-browser`
// y `echegaray-balanz-remoto`: stopped + disabled). No hay corrida futura que refresque esas dos
// filas. Una tarjeta que sólo publica la antigüedad promete por omisión que alguien la va a
// actualizar: mientras el navegador siga apagado, el origen del dato se dice TODOS los días.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('INVERTIDO declara que la posición se carga A MANO en sus tres ramas', () => {
  const t = tarjetas(REF).find((x) => x.clave === 'invertido')
  const ramas = t.contexto.split('IF(').length
  assert.ok(ramas >= 3, 'la tarjeta tiene tres estados: sin fecha, al día y vieja')
  // Una sola aparición de "a mano" dejaría alguna rama prometiendo frescura.
  assert.equal((t.contexto.match(/a mano/g) ?? []).length, 2,
    'las dos ramas con texto propio dicen "a mano"; la tercera lo hereda de la frase base')
  assert.doesNotMatch(t.contexto, /liquidez T\+1"/,
    'con 202px no entran las dos cosas: entre la naturaleza (cierta siempre) y el origen del dato, gana el origen')
})

test('INVERTIDO no inventa una antigüedad cuando la fecha no es un número', () => {
  const t = tarjetas(REF).find((x) => x.clave === 'invertido')
  assert.match(t.contexto, /IF\(NOT\(ISNUMBER\(\$D\$11\)\);"Balanz · a mano · sin fecha"/,
    'sin fecha, TODAY()-"" daría un número enorme y el aviso quedaría prendido para siempre')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL SALTO DE $55,6M A $125,9M — EL RÓTULO DICE "ESTE MES" Y EL 43% NO ERA DE ESTE MES (15/08/2026)
//
// Medido sobre el libro del 15/08: de los $125.943.171 del titular, $54.643.050 tienen fecha ANTERIOR
// al 1° del mes, y son SEIS quincenas de mayo, junio y julio que el libro sigue viendo impagas
// (`Jornales por Quincena`: la columna "Pagado el" quedó desalineada de sus quincenas). El número es
// el correcto —esa plata falta pagar— pero sin publicar el atraso, un salto así se lee como un error
// del sistema y termina en una investigación. La frase vieja además afirmaba un total del mes
// ("de $191M") que incluía tres meses anteriores: un número que no existe.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('LA DEUDA publica cuánto de ella NADIE PROBÓ — no se puede afirmar y cobrar a la vez', () => {
  // 16/08 — REEMPLAZA AL TEST DEL ATRASO. Aquél exigía publicar qué parte del titular tenía fecha
  // anterior al 1° del mes ($54,6M el 15/08). El "cuándo" nunca fue la pregunta: aquellos $54,6M eran
  // seis quincenas de jornales que el libro veía impagas, y lo que había que decir no es que fueran
  // viejas sino que **nadie probó que estén impagas**. Desde `estadoSinProbar` esas quincenas salen
  // VENCIDO, y eso es lo que la tarjeta publica: la misma explicación del salto, con la causa.
  //
  // El "atrasado" no se perdió: pasó al RÓTULO ("DEUDA ATRASADA Y DEL MES"), que es donde declarar la
  // ventana de una suma sin `desde` cuesta cero caracteres de contexto.
  const c = de('comprometida')
  const sinProbar = terminoLibro({ signo: -1, estados: ['VENCIDO'], hasta: FIN_DE_MES, medida: 'magnitud' })
  assert.ok(c.contexto.includes(sinProbar), 'la duda sale del MISMO término del libro que el titular')
  assert.match(c.contexto, /M sin probar/, 'y se dibuja: calcularla sin publicarla no le sirve a nadie')
  // MISMO `hasta` QUE EL TITULAR: con una ventana propia dejaría de ser una parte del número que
  // rotula, y las dos cifras podrían no cerrar.
  assert.ok(!sinProbar.includes('>='), 'la duda es un `hasta`, no una ventana propia')
  assert.ok(c.valor.includes(terminoLibro({ signo: -1, estados: DEUDA, hasta: FIN_DE_MES, medida: 'magnitud' })),
    'la duda se DECLARA, no se resta: o la plata ya salió y falta marcarla, o se debe')
})

test('SIN nada sin probar, el lugar lo ocupa lo pagado — y el plan sigue estando en las dos ramas', () => {
  const c = de('comprometida')
  const pagado = terminoLibro({ signo: -1, estados: ['REAL'], desde: 'EOMONTH(TODAY();-1)+1', hasta: FIN_DE_MES, medida: 'magnitud' })
  const plan = terminoLibro({ signo: -1, estados: PLAN, hasta: FIN_DE_MES, medida: 'magnitud' })
  assert.ok(c.contexto.includes(pagado), 'la rama tranquila conserva "pagaste $Y"')
  // EL PLAN NO ES CONDICIONAL. Es el concepto que el titular dejó afuera: si desapareciera en alguna
  // rama, ese día la tarjeta escondería $38,0M en vez de separarlos.
  assert.equal(c.contexto.split(plan).length - 1, 2, 'el plan se publica en LAS DOS ramas, no sólo en una')
  // El umbral es el mínimo que la frase sabe dibujar: por debajo diría "$0,0M sin probar".
  assert.match(c.contexto, /^=IF\(SUMPRODUCT.*>=100000;/, 'la alarma se prende con un monto legible, no con centavos')
})

test('LA LIBRE declara la SEGUNDA mitad de su supuesto: sin ingresos, no se gasta el plan', () => {
  // El rótulo declara una sola pata (no cobrás más) y la resta usa las dos. Hasta el 16/08 la frase
  // decía "pagás todo" y era cierta y estaba incompleta: lo que faltaba —y lo que hacía incoherente
  // al escenario— es que sin ingresos el plan de gasto tampoco se ejecuta.
  const l = de('libre')
  assert.equal(l.valor, '=N($A$3)-N($C$3)')
  assert.match(l.contexto, /sin el plan/, 'el supuesto de gasto tiene que estar escrito al lado del número')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL ANCHO DE LAS TARJETAS CON RAMAS — EL AGUJERO DEL TEST DE ARRIBA (14/08/2026)
//
// "EL CONTEXTO DE CADA TARJETA ENTRA EN SU ANCHO" se SALTEA toda tarjeta cuyo contexto tenga un `IF`,
// y las cinco lo tienen: el control que mide el corte no medía ninguna. Por eso "SI NO COBRÁS MÁS" y
// "SALDO AL CIERRE" llegaron a producción cortadas dos veces distintas.
//
// Acá se mide LA RAMA MÁS LARGA de las dos tarjetas que declaran frescura, que es donde el aviso nuevo
// puede empujar el texto por encima del ancho. Verificado al escribirlo: la versión con "hace" mide
// ≈213px contra los 202px de la tarjeta INVERTIDA — se cortaba en "▲ hace 9 dí".
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** Parte una expresión por un separador de NIVEL CERO, respetando paréntesis y comillas. */
const partir = (s, sep) => {
  const out = []; let buf = ''; let nivel = 0; let enTexto = false
  for (const ch of String(s)) {
    if (ch === '"') enTexto = !enTexto
    else if (!enTexto && ch === '(') nivel++
    else if (!enTexto && ch === ')') nivel--
    else if (!enTexto && ch === sep && nivel === 0) { out.push(buf); buf = ''; continue }
    buf += ch
  }
  return [...out, buf].map((x) => x.trim()).filter(Boolean)
}

/**
 * Cuántos caracteres DIBUJA la rama más larga de una fórmula con `IF`.
 *
 * El test de arriba se saltea toda fórmula con `IF` —o sea, las cinco tarjetas— porque "de un IF
 * habría que elegir la más larga, y eso pide un parser". El parser son veinte líneas y el agujero ya
 * costó dos textos cortados en producción: se escribe. Las ramas de un IF son EXCLUYENTES, así que se
 * toma el MÁXIMO; la condición no se dibuja y no se cuenta.
 */
const largoDeRama = (expr) => {
  const s = String(expr).trim().replace(/^=/, '')
  const partes = partir(s, '&')
  if (partes.length > 1) return partes.reduce((n, p) => n + largoDeRama(p), 0)
  const t = partes[0] ?? ''
  if (/^".*"$/s.test(t)) return t.length - 2
  const m = /^IF\((.*)\)$/s.exec(t)
  if (m) return Math.max(0, ...partir(m[1], ';').slice(1).map(largoDeRama))
  return ANCHO_DE_TOKEN
}
// LAS CINCO, NO DOS: desde el 15/08 también COMPROMETIDA y LIBRE tienen ramas (el atraso), y la
// medición se hace con las referencias REALES del panel — la rama con el aviso es la más larga y es
// la que se dibuja los días en que hay algo que decir.
test('las cinco tarjetas entran en su ancho aun en su rama más larga', () => {
  const t = tarjetas({ ...REF, celdasQueSuman: SUMAN })
  for (const clave of ['disponible', 'comprometida', 'libre', 'invertido', 'cierre']) {
    const i = t.findIndex((x) => x.clave === clave)
    const px = largoDeRama(t[i].contexto) * PX_POR_CARACTER
    assert.ok(px <= anchoDeTarjeta(i),
      `"${t[i].rotulo}": su rama más larga mide ≈${Math.round(px)}px y la tarjeta ${anchoDeTarjeta(i)}px — el aviso la corta`)
  }
})
