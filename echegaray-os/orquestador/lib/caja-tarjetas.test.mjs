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
import { tarjetas, NO_REAL, FIN_DE_MES } from './caja-tarjetas.mjs'
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

test('COMPROMETIDA = todo lo que hay que pagar en el mes − lo ya pagado, con la urgencia en contexto', () => {
  // La definición textual del dueño. Lo REAL (pagado) queda afuera porque ya salió del saldo del
  // banco; lo vencido impago entra (sin `desde`). Los "7d" del contexto conservan la urgencia que
  // antes era el titular.
  const c = de('comprometida')
  assert.equal(c.valor, `=${terminoLibro({ signo: -1, estados: NO_REAL, hasta: FIN_DE_MES, medida: 'magnitud' })}`)
  assert.match(c.contexto, /7d/)
  assert.ok(c.contexto.includes(terminoLibro({ signo: -1, estados: NO_REAL, hasta: 'TODAY()+7', medida: 'magnitud' })))
  assert.ok(!c.valor.includes('"REAL"'), 'lo REAL ya salió de la cuenta: no es obligación')
})

test('EL RÓTULO DE COMPROMETIDA DICE QUE FALTA PAGAR: era la pregunta literal del dueño', () => {
  // 13/08, textual: *"la tarjeta 'caja comprometida' no sé si es algo q tengo q cubrir o ya está
  // cubierto"*. Un rótulo que empieza con "CAJA" nombra plata que se TIENE; ésta es plata que TIENE
  // QUE SALIR. Y "COMPROMETIDO" a secas es el nombre de UNO de los tres estados que el número suma
  // (COMPROMETIDO $15,2M de $62,4M): rotular con él sería falso, no vago.
  const c = de('comprometida')
  assert.equal(c.rotulo, 'FALTA PAGAR ESTE MES')
  assert.doesNotMatch(c.rotulo, /^CAJA /, 'no es un cajón de plata que se tiene: es plata que falta pagar')
  assert.match(c.rotulo, /FALTA PAGAR/, 'el rótulo tiene que contestar "¿lo tengo que cubrir?"')
  // El estado del libro NO se usa como rótulo de un número que suma los tres estados.
  assert.ok(!/^COMPROMETID[OA]\b/.test(c.rotulo),
    'el titular suma COMPROMETIDO + PROYECTADO + VENCIDO: nombrarlo con un solo estado lo vuelve falso')
})

test('EL CONTEXTO DE COMPROMETIDA cuenta la historia entera: total del mes → pagado → falta', () => {
  // "es comprometida y cuando se pagan los compromisos deben salir de ahí" (dueño, 07/08). Salen —
  // pero sin el TOTAL a la vista, $60M pagados junto a $44M comprometidos no cierran ninguna
  // historia. La frase es: de $X pagaste $Y (el titular es la resta, a ojo). Y CORTA: la versión
  // larga se truncaba en la celda, y una frase cortada es peor que ninguna. "Del mes" salió de la
  // frase el 13/08 porque pasó al rótulo, que es donde se lee primero.
  const c = de('comprometida')
  const pagado = terminoLibro({ signo: -1, estados: ['REAL'], desde: 'EOMONTH(TODAY();-1)+1', hasta: FIN_DE_MES, medida: 'magnitud' })
  assert.match(c.contexto, /pagaste/)
  assert.match(de('comprometida').rotulo, /ESTE MES/, 'la ventana la declara el rótulo')
  assert.ok(c.contexto.includes(pagado))
  // El TOTAL del mes = lo pagado + lo que falta (el titular C3): derivable a ojo, nunca una 3ª suma.
  assert.ok(c.contexto.includes(`(${pagado}+N($C$3))`), 'el total del mes se arma con el titular, no con otra suma del libro')
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
  assert.match(l.contexto, /a cobrar al /, 'el monto va fechado: sin fecha no se sabe hasta cuándo vale')
  assert.ok(l.contexto.includes('EOMONTH(TODAY();0)'), 'la fecha es el cierre del mes, calculado, no tipeado')
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
  assert.match(t.contexto, /liquidez T\+1/)
  assert.ok(t.contexto.includes(REF.invFecha))
})

test('SALDO AL CIERRE es la CONSECUENCIA: disponible − comprometida + cobros del mes', () => {
  const t = de('cierre')
  assert.equal(t.rotulo, 'SALDO AL CIERRE')
  assert.equal(t.valor, `=N($A$3)-N($C$3)+${terminoLibro({ signo: 1, estados: NO_REAL, hasta: FIN_DE_MES, medida: 'magnitud' })}`,
    'disponible y comprometida por referencia; los cobros con la suma única del libro')
  // EL PAR DE ESCENARIOS: la tarjeta del medio es el mismo número sin cobrar nada, ésta cobrando
  // todo. La cláusula condicional no se negocia — sin ella el número se lee como plata garantizada.
  assert.match(t.contexto, /cobrando todo/, 'sin la cláusula, se leería como plata garantizada')
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

test('DISPONIBLE avisa cuando la fecha MÁS VIEJA de las filas que suman quedó atrás', () => {
  const t = tarjetas({ ...REF, fechaVieja: 'MIN($D$7;$D$10)' }).find((x) => x.clave === 'disponible')
  assert.match(t.contexto, /MIN\(\$D\$7;\$D\$10\)/, 'la tarjeta tiene que mirar la más vieja, no sólo el MAX del total')
  assert.match(t.contexto, /parte al/, 'el aviso dice que una PARTE del total viene de otra fecha')
  assert.match(t.contexto, /▲/, 'la marca es ALERTA (▲): el ⚠ no se dibuja al exportar a PDF')
  assert.match(t.contexto, /TODAY\(\)-MIN\(\$D\$7;\$D\$10\)>7/, 'el umbral es el mismo DIAS_AVISO del resto del OS')
})

test('DISPONIBLE no avisa de nada cuando no hay atraso: la frase del día bueno es la de siempre', () => {
  const t = tarjetas({ ...REF, fechaVieja: 'MIN($D$7)' }).find((x) => x.clave === 'disponible')
  // El aviso vive adentro de un IF: existe la rama que devuelve "" y no agrega una sola letra.
  assert.match(t.contexto, /;""\)/, 'sin atraso el término tiene que ser vacío — un aviso permanente deja de leerse')
  assert.match(t.contexto, /"al "&TEXT\(\$D\$15;"dd\/mm"\)&" · bancos y efectivo"/, 'la frase base no cambia')
})

test('DISPONIBLE sin `fechaVieja` queda EXACTAMENTE como antes: falla hacia atrás, no hacia una fecha inventada', () => {
  const t = tarjetas(REF).find((x) => x.clave === 'disponible')
  assert.doesNotMatch(t.contexto, /parte al/)
  assert.match(t.contexto, /"al "&TEXT\(\$D\$15;"dd\/mm"\)&" · bancos y efectivo"/)
})

test('INVERTIDO publica los días encima en vez de "liquidez T+1" cuando la posición está vieja', () => {
  const t = tarjetas(REF).find((x) => x.clave === 'invertido')
  assert.match(t.contexto, /TODAY\(\)-\$D\$11>7/, 'compara contra el mismo umbral que la columna de fechas')
  assert.match(t.contexto, /▲ "&TEXT\(TODAY\(\)-\$D\$11;"0"\)&" días"/, 'dice cuántos días, no sólo que está vieja')
  assert.doesNotMatch(t.contexto, /hace/, 'el patrón del archivo es `▲ N días` (formulaAntiguedad), no "hace N días"')
  assert.match(t.contexto, /liquidez T\+1/, 'y sigue diciendo su naturaleza los días en que está al día')
})

test('INVERTIDO no inventa una antigüedad cuando la fecha no es un número', () => {
  const t = tarjetas(REF).find((x) => x.clave === 'invertido')
  assert.match(t.contexto, /IF\(NOT\(ISNUMBER\(\$D\$11\)\);"Balanz · liquidez T\+1"/,
    'sin fecha, TODAY()-"" daría un número enorme y el aviso quedaría prendido para siempre')
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
test('las tarjetas que declaran FRESCURA entran en su ancho aun en su rama más larga', () => {
  const t = T()
  for (const clave of ['disponible', 'invertido']) {
    const i = t.findIndex((x) => x.clave === clave)
    const px = largoDeRama(t[i].contexto) * PX_POR_CARACTER
    assert.ok(px <= anchoDeTarjeta(i),
      `"${t[i].rotulo}": su rama más larga mide ≈${Math.round(px)}px y la tarjeta ${anchoDeTarjeta(i)}px — el aviso la corta`)
  }
})
