import test from 'node:test'
import assert from 'node:assert/strict'
import {
  VENTANA, obligacionesDelCalendario, altoDeLaPosicion, filasDeLaPosicion,
  diasAlProximo, ALTO_HERO, ROTULO_A_PAGAR_30,
  verificarReferenciasDelHero, hallazgoDeVencimiento, conDecisionesDelDueno,
} from './impuestos-posicion.mjs'
import { CONTROLES, decisionesDe, aplicarDecisiones } from './decisiones-hallazgos.mjs'
import { NOMBRES_CARGAS } from './libro-extractores-cargas.mjs'
import { vencimientoIva, vencimientoIibb } from './vencimientos-fiscales.mjs'

// `planesPend` NO se tipea: sale del módulo que publica el nombre en «Cargas Sociales». Con el
// texto escrito a mano en los dos lados, un renombre allá deja esta celda en #NAME? sin que nada acá
// se ponga rojo — y el hero publicaría «no debo nada» con el mismo aspecto de siempre.
const REFS = { saldoIva: '$H$56', saldoIibb: '$G$66', prendPend: '$B$92', planesPend: NOMBRES_CARGAS.planesSinPagar }

const HOY = '2026-08-06'
// Las filas del detalle tal como quedan en la pestaña reconstruida. La del PLAN es una función y no
// un número: desde el 09/09/2026 esa cuota no tiene fila acá —el cuadro es el de «Cargas Sociales»—
// y entra al calendario como expresión sobre el rango con nombre que aquella pestaña publica.
const FILAS = { iva: 55, iibb: 65, plan: (m) => `INDEX(CARGAS_MES_PLANES;${m})`, prendario: 89 }
const MESES = { iva: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], iibb: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], plan: [2, 3, 4, 5, 6, 7, 8, 9, 10], prendario: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }
const cal = () => obligacionesDelCalendario({ hoy: HOY, anio: 2026, meses: MESES, filas: FILAS })

test('el calendario sale ordenado por fecha, con la celda viva de cada importe', () => {
  const c = cal()
  const fechas = c.map((o) => o.fecha)
  assert.deepEqual(fechas, [...fechas].sort(), 'ordenado por fecha')
  for (const o of c) {
    assert.match(o.celda, /^(\$[A-N]\$\d+|INDEX\(CARGAS_MES_PLANES;\d+\))$/,
      `${o.concepto}: el importe sale de una celda viva o de un rango con nombre, nunca de un número`)
    assert.equal(typeof o.importe, 'undefined', 'el calendario no transporta importes')
  }
  // El primero que viene: el prendario del 07/08.
  assert.equal(c.find((o) => !o.vencido).fecha, '2026-08-07')
  assert.equal(diasAlProximo(c, HOY), 1)
})

test('EL PRENDARIO Y LOS PLANES NO ENTRAN COMO VENCIDOS — son débito automático', () => {
  // EL DEFECTO QUE ESTE TEST ATRAPA. La primera versión miraba 60 días hacia atrás con las cuatro
  // obligaciones: ocho filas "⚠ VENCIDO" por ~$9M que en realidad estaban PAGADAS, y todas sumadas
  // al renglón de riesgo. Una alarma falsa en el número que decide si hay que salir a cubrir un bache
  // es peor que no tener alarma: la próxima vez que se prenda de verdad nadie la va a mirar.
  const vencidos = cal().filter((o) => o.vencido)
  assert.ok(vencidos.length > 0, 'algo vencido tiene que haber, o el test no prueba nada')
  for (const o of vencidos) {
    assert.ok(VENTANA.conPasado.includes(o.tipo),
      `${o.concepto} venció el ${o.fecha} y se debita solo: mostrarlo como impago es una alarma falsa`)
  }
  assert.deepEqual([...new Set(vencidos.map((o) => o.tipo))].sort(), ['iibb', 'iva'])
})

test('la ventana hacia adelante corta donde dice, y hacia atrás también', () => {
  for (const o of cal()) {
    assert.ok(o.dias <= VENTANA.adelante, `${o.fecha} está a ${o.dias} días: fuera de la ventana`)
    assert.ok(o.dias >= -VENTANA.atras, `${o.fecha} está a ${o.dias} días: demasiado viejo`)
  }
})

test('el espacio reservado alcanza EXACTAMENTE para lo que se escribe', () => {
  // Reservar de menos pisa el bloque de abajo sin dar un solo error; de más deja un hueco.
  const c = cal()
  const filas = filasDeLaPosicion({ cal: c, refs: REFS })
  assert.equal(filas.length, altoDeLaPosicion())
  // Y ya no depende de cuántos vencimientos haya: con el calendario vacío mide exactamente lo mismo.
  assert.equal(filasDeLaPosicion({ cal: [], refs: REFS }).length, altoDeLaPosicion())
})

const posicion = () => filasDeLaPosicion({ cal: cal(), refs: REFS })

/** El bloque de posición, y dentro de él la fila de un rótulo — nunca por índice fijo. */
const heroDe = (filas = posicion()) => filas.slice(0, ALTO_HERO)
const porRotulo = (filas, re) => filas.find((f) => re.test(String(f[0] ?? '')))

test('el HERO referencia el detalle: no recalcula nada por su cuenta', () => {
  const hero = heroDe()
  const formulas = hero.map((f) => String(f[1] ?? '')).filter((x) => x.startsWith('='))
  assert.equal(formulas.length, 3, 'las tres filas del hero son fórmula, ninguna un número pegado')
  for (const f of formulas) {
    assert.ok(!/SUMIFS?\(/.test(f), `el hero no vuelve a sumar Compras: ${f}`)
    assert.ok(!/Compras!|_BANCO_RAW|_MOVIMIENTOS/.test(f), `el hero no toca una fuente: ${f}`)
    // LO QUE DELATA UN RECÁLCULO ES EL RANGO, NO LA FUNCIÓN. Las celdas de saldo llevan una guarda
    // (`ISNUMBER`/`COUNT`) para no publicar #VALUE! cuando el mes ajeno tiene texto; esa guarda mira
    // las MISMAS dos celdas. Lo que el hero no puede hacer es barrer un rango: ahí empezaría la
    // segunda verdad que este test existe para impedir.
    assert.ok(!/\$?[A-N]\$?\d+:\$?[A-N]?\$?\d*/.test(f), `el hero no barre un rango: ${f}`)
    assert.ok(!/SUM\(|AVERAGE|COUNTIFS?\(/.test(f), `el hero no agrega: ${f}`)
  }
  assert.match(porRotulo(hero, /A favor en el fisco/)[1], /^=IF\(COUNT\(\$H\$56;\$G\$66\)=2;\$H\$56\+\$G\$66;/,
    'a favor = libre disponibilidad de IVA + saldo de IIBB, y sólo si los dos son importes')
  // ═══ LA DEUDA CRUZA LAS DOS PESTAÑAS Y NO DUPLICA NINGUNA (09/09/2026) ═══
  //
  // El prendario sale de la fila de ESTA pestaña que lo mide; las cuotas de planes, del rango con
  // nombre que publica «Cargas Sociales», que es la dueña del cuadro de F931. Si alguien volviera a
  // traer acá una fila mensual de planes, tendría que cambiar esta referencia — y el rojo lo dice.
  assert.equal(porRotulo(hero, /Deuda fiscal y financiera/)[1], `=$B$92+${NOMBRES_CARGAS.planesSinPagar}`)
})

test('EL HERO SON TRES RENGLONES, SIN TITULAR Y SIN UNA SOLA SUB-LÍNEA', () => {
  // ═══ LO QUE ESTE TEST FIJA (09/09/2026) ═══
  //
  // El dueño, sobre las cuatro pestañas: *«minimalismo extremo, sin aclaraciones ni explicaciones de
  // nada»*. El hero tenía diez filas: un titular, cuatro totales y cuatro sub-líneas que glosaban al
  // total de arriba. Si alguien devuelve una glosa —o el titular «LA POSICIÓN AL dd/mm»— esto se pone
  // rojo antes de que la escritura toque el archivo.
  const hero = heroDe()
  const conRotulo = hero.filter((f) => String(f[0] ?? '').trim())
  assert.equal(conRotulo.length, 3, `el hero tiene ${conRotulo.length} renglones con rótulo`)
  for (const f of conRotulo) {
    assert.match(String(f[0]), /^⇒ /, `todo renglón del hero es un total: «${f[0]}»`)
    assert.doesNotMatch(String(f[0]), /^\s{2,}·/, 'ninguna sub-línea')
    assert.doesNotMatch(String(f[0]), /[▲⚠✓]/, 'ningún glifo')
  }
  assert.equal(hero.some((f) => /^LA POSICIÓN/.test(String(f[0] ?? ''))), false, 'el titular se retiró')
  // El orden decide la lectura: primero lo que hay que pagar, después lo que se debe, al final lo
  // que se tiene a favor — que es lo único que no dispara una decisión de tesorería.
  assert.deepEqual(conRotulo.map((f) => String(f[0])), [
    '⇒ A pagar en 30 días', '⇒ Deuda fiscal y financiera', '⇒ A favor en el fisco',
  ])
})

test('la fecha del primer vencimiento sube a la columna C: es el dato que decide', () => {
  // ═══ LA ÚNICA SUB-LÍNEA QUE TRAÍA UN DATO PROPIO (09/09/2026) ═══
  //
  // Decía «· primer vencimiento · 07/08 · Prendario Ford XLS» con su importe al lado. El importe era
  // un SUMANDO de la cifra de arriba —repetir un término bajo su propio total no informa—; la FECHA,
  // en cambio, no está en ninguna otra parte de la pestaña. Va en la C y no en la B porque en toda
  // esta pestaña la B es plata: un texto ahí lo dibuja el formato de moneda como un importe que no
  // se ve, el defecto `texto_en_numero` que el auditor de pantalla ya cuenta.
  const f = porRotulo(heroDe(), new RegExp(ROTULO_A_PAGAR_30))
  // ═══ VA COMO FECHA, NO COMO «07/08» (09/09/2026) ═══
  //
  // MEDIDO en la copia: con la cadena, la celda quedaba en **46281** —Sheets parsea «07/08» como
  // fecha y guarda el serial, y el formato TEXT que tenía declarado dibujaba ese número crudo—. Con
  // `DATE(a;m;d)` la celda es una fecha de verdad y la piel la formatea `dd/mm/yyyy`.
  assert.equal(f[2], '=DATE(2026;8;7)', 'el prendario del 07/08 es el primero que viene')
  assert.equal(String(f[2]).includes(','), false, 'es-AR: el separador de argumentos es «;»')
  assert.ok(String(f[1]).startsWith('='), 'la B sigue siendo el importe de la ventana')
  // Y sin ningún vencimiento en la ventana, la celda queda vacía en vez de inventar una fecha.
  const sinCal = filasDeLaPosicion({ cal: [], refs: REFS })
  assert.equal(sinCal[0][2], '')
  assert.equal(sinCal[0][1], '=0', 'cero es la verdad cuando no hay nada que pagar en 30 días')
})

const vencidos = () => cal().filter((o) => o.vencido)

test('la clave de un vencimiento es el impuesto y su período, NUNCA su posición en el calendario', () => {
  const claves = vencidos().map((o) => hallazgoDeVencimiento(o).clave)
  assert.ok(claves.length > 0, 'el calendario del 06/08 tiene vencimientos hacia atrás')
  for (const k of claves) assert.match(k, /^(iva|iibb)·\d{4}-\d{2}$/)
  // La forma es la fecha: si ARCA la mueve, la decisión del dueño fue sobre otra cosa.
  for (const o of vencidos()) assert.deepEqual(hallazgoDeVencimiento(o).forma, { fecha: o.fecha })
})

test('las dos decisiones reales del 13/08 apuntan a los vencimientos de junio, con su fecha', () => {
  const ds = decisionesDe(CONTROLES.vencimientoVencido)
  assert.deepEqual(ds.map((d) => `${d.clave} ${d.forma.fecha}`).sort(),
    ['iibb·2026-06 2026-07-16', 'iva·2026-06 2026-07-21'])
  // La fecha declarada tiene que ser la que el calendario calcula hoy: si no, la decisión no aplica
  // nunca y el aviso vuelve sin que nadie entienda por qué.
  assert.equal(vencimientoIibb('2026-06').fecha, '2026-07-16')
  assert.equal(vencimientoIva('2026-06').fecha, '2026-07-21')
})

test('si la fecha de vencimiento cambia, la decisión vieja NO libera nada', () => {
  const r = aplicarDecisiones(CONTROLES.vencimientoVencido,
    [{ clave: 'iva·2026-06', forma: { fecha: '2026-07-28' } }],
    { decisiones: decisionesDe(CONTROLES.vencimientoVencido) })
  assert.equal(r.silenciados.length, 0, 'el dueño decidió sobre el 21/07, no sobre el 28/07')
  assert.equal(r.caducadas.length, 1)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL REDISEÑO DEL 04/09/2026 — «no me sirven del cuadro 1 al 3, veo del 4 en adelante»
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('los tres cuadros que el dueño no usa NO se escriben — ni uno de sus renglones', () => {
  // Riesgo 30/60/90, calendario de vencimientos y financiamiento: treinta y dos renglones antes del
  // primer número que él mira. Si alguien los vuelve a agregar sin decirlo, esto se pone rojo.
  const filas = posicion()
  const textos = filas.map((f) => String(f?.[0] ?? ''))
  for (const re of [/RIESGO Y PROYECCIÓN/, /CALENDARIO DE VENCIMIENTOS/, /^Fecha y concepto/,
    /FINANCIAMIENTO/, /^Línea de financiamiento/, /Descubierto Santander/, /^Tarjeta de crédito/,
    /A PAGAR EN LA VENTANA/, /vencido s\/verificar/]) {
    assert.ok(!textos.some((t) => re.test(t)), `${re} sigue ocupando una fila de la pestaña`)
  }
  // Y ningún renglón de calendario, que es lo que empezaba con "dd/mm · ".
  assert.ok(!textos.some((t) => /^\d{2}\/\d{2} · /.test(t)), 'no queda ningún renglón del calendario')
})

test('«A PAGAR EN 30 DÍAS» SUMA LAS CELDAS DEL DETALLE, no las de un cuadro intermedio', () => {
  // ═══ EL NUDO DEL REDISEÑO DEL 04/09, QUE ESTE TEST SIGUE PROTEGIENDO ═══
  //
  // La fila sumaba las celdas B de los renglones del calendario. Borrar ese cuadro sin más rompía lo
  // único que el dueño NO cuestionó. Se resolvió mirando qué había ADENTRO de esas celdas: cada
  // renglón era `=$J$90`, una REFERENCIA al detalle. El calendario nunca fue fuente, era una escala.
  //
  // ═══ Y LO QUE SE AGREGA EL 09/09 ═══
  //
  // La cuota de los planes de F931 ya no tiene fila en esta pestaña: entra como `INDEX` sobre el
  // rango con nombre de «Cargas Sociales». Sacarla del calendario habría sido más simple y habría
  // bajado la ventana el importe de una cuota que sí hay que pagar.
  const suma = String(posicion()[0][1])
  assert.ok(suma.startsWith('='), suma)
  const terminos = suma.slice(1).split('+')
  const esperados = cal().filter((o) => !o.vencido && o.dias <= 30).map((o) => o.celda)
  assert.deepEqual(new Set(terminos), new Set(esperados),
    'la ventana suma exactamente las obligaciones del calendario que vencen en 30 días')
  for (const t of terminos) {
    // Ninguna puede apuntar a la columna B del propio hero: ahí no hay detalle, hay totales.
    assert.ok(!/^\$B\$/.test(t), `${t} apunta a la columna del hero, no al detalle`)
    assert.ok(/^\$[A-N]\$\d+$/.test(t) || /^INDEX\(CARGAS_MES_PLANES;\d+\)$/.test(t),
      `${t} no es ni una celda del detalle ni el rango con nombre de Cargas Sociales`)
  }
  // Y la cuota previsional sigue contando: si desapareciera, la ventana bajaría sin decirlo.
  assert.ok(terminos.some((t) => t.includes('CARGAS_MES_PLANES')),
    'la cuota de planes de F931 tiene que seguir dentro de «A pagar en 30 días»')
})

test('el hero entra en una pantalla: tres mensajes, tres números', () => {
  const hero = posicion()
  assert.equal(hero.length, ALTO_HERO)
  const mensajes = hero.filter((f) => /^⇒/.test(String(f[0] ?? ''))).length
  const conImporte = hero.filter((f) => String(f[1] ?? '').startsWith('=')).length
  assert.equal(mensajes, 3, 'tres y no más: es lo que se lee sin bajar la vista')
  assert.equal(conImporte, 3, 'un número por mensaje, ni uno suelto')
})

test('UNA REFERENCIA A UNA FILA VACÍA DEVUELVE 0 SIN DAR ERROR — la guarda tiene que gritar', () => {
  // El modo de falla que este control cierra: el hero apunta a una fila del detalle que se movió o
  // que quedó sin escribir, Sheets devuelve 0, y el hero publica "no hay nada que pagar" con
  // exactamente el mismo aspecto de siempre. Sin error, sin #REF, sin negativo imposible.
  const hero = posicion()
  const todas = Array.from({ length: 100 }, (_, i) => [`fila ${i + 1}`])
  assert.doesNotThrow(() => verificarReferenciasDelHero(hero, todas))
  // Se vacía UNA de las filas que el hero referencia: la guarda tiene que ponerse roja.
  const referida = verificarReferenciasDelHero(hero, todas)[0]
  const rotas = todas.map((f, i) => (i + 1 === referida ? [''] : f))
  assert.throws(() => verificarReferenciasDelHero(hero, rotas), /sin rótulo/)
})

test('la decisión del dueño sigue pegada al vencimiento — ahora la ve el informe, no una fila', () => {
  // ═══ LO QUE EL DUEÑO YA MIRÓ NO VUELVE A GRITAR (13/08), Y SIGUE VIGENTE ═══
  //
  // El calendario dejó de ocupar filas de la pestaña, así que la marca "✓ lo revisó el dueño" ya no
  // se dibuja en una celda. El mecanismo NO se fue: la decisión se sigue adjuntando al vencimiento y
  // el informe del `--dry` la imprime al lado de su celda. Si alguien lo desconectara, el IVA del
  // 21/07 volvería a salir "⚠ VENCIDO" en cada corrida después de que él dijera "no afectan".
  const decision = { decision: 'no afectan', quien: 'dueño', cuando: '2026-08-13' }
  const todos = cal().filter((o) => o.vencido)
  assert.ok(todos.length > 0, 'el calendario del 06/08 tiene vencimientos hacia atrás')
  const clave = hallazgoDeVencimiento(todos[0]).clave
  const c = conDecisionesDelDueno(cal(), new Map([[clave, decision]]))
  assert.equal(c.length, cal().length, 'la fila no desaparece del calendario: el hecho no se borra')
  const liberado = c.find((o) => hallazgoDeVencimiento(o).clave === clave)
  assert.deepEqual(liberado.decisionDelDueno, decision)
  // Y sólo ÉSE: se libera un vencimiento, no el control entero.
  const otros = c.filter((o) => o.vencido && hallazgoDeVencimiento(o).clave !== clave)
  for (const o of otros) assert.equal(o.decisionDelDueno, undefined, o.concepto)
})
