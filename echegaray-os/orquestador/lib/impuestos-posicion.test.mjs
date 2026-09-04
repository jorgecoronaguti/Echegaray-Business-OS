import test from 'node:test'
import assert from 'node:assert/strict'
import {
  VENTANA, obligacionesDelCalendario, altoDeLaPosicion, filasDeLaPosicion,
  diasAlProximo, ALTO_HERO, OFFSET_TITULAR, conceptoCorto, ROTULO_IVA_EN_CAJA,
  verificarReferenciasDelHero, hallazgoDeVencimiento, conDecisionesDelDueno,
} from './impuestos-posicion.mjs'
import { CONTROLES, decisionesDe, aplicarDecisiones } from './decisiones-hallazgos.mjs'
import { vencimientoIva, vencimientoIibb } from './vencimientos-fiscales.mjs'

const REFS = {
  saldoIva: '$H$56', saldoIibb: '$G$66', prendPend: '$B$92', planesPend: '$B$93',
  ivaAPagar: 55, ivaLibre: 56, ivaCabecera: 52,
}

const HOY = '2026-08-06'
// Las filas del detalle tal como quedan en la pestaña reconstruida.
const FILAS = { iva: 55, iibb: 65, plan: 85, prendario: 89 }
const MESES = { iva: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], iibb: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], plan: [2, 3, 4, 5, 6, 7, 8, 9, 10], prendario: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }
const cal = () => obligacionesDelCalendario({ hoy: HOY, anio: 2026, meses: MESES, filas: FILAS })

test('el calendario sale ordenado por fecha, con la celda viva de cada importe', () => {
  const c = cal()
  const fechas = c.map((o) => o.fecha)
  assert.deepEqual(fechas, [...fechas].sort(), 'ordenado por fecha')
  for (const o of c) {
    assert.match(o.celda, /^\$[A-N]\$\d+$/, `${o.concepto}: el importe sale de una celda, no de un número`)
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
  const filas = filasDeLaPosicion({ cal: c, hoy: HOY, refs: REFS })
  assert.equal(filas.length, altoDeLaPosicion())
  // Y ya no depende de cuántos vencimientos haya: con el calendario vacío mide exactamente lo mismo.
  assert.equal(filasDeLaPosicion({ cal: [], hoy: HOY, refs: REFS }).length, altoDeLaPosicion())
})

const posicion = () => filasDeLaPosicion({ cal: cal(), hoy: HOY, refs: REFS })

/** El bloque de posición, y dentro de él la fila de un rótulo — nunca por índice fijo. */
const heroDe = (filas = posicion()) => filas.slice(0, ALTO_HERO)
const porRotulo = (filas, re) => filas.find((f) => re.test(String(f[0] ?? '')))

test('el HERO referencia el detalle: no recalcula nada por su cuenta', () => {
  const hero = heroDe()
  const formulas = hero.map((f) => String(f[1] ?? '')).filter((x) => x.startsWith('='))
  assert.ok(formulas.length >= 6, 'el hero es todo fórmula')
  for (const f of formulas) {
    assert.ok(!/SUMIFS?\(/.test(f), `el hero no vuelve a sumar Compras: ${f}`)
    assert.ok(!/Compras!|_BANCO_RAW|_MOVIMIENTOS/.test(f), `el hero no toca una fuente: ${f}`)
    // LO QUE DELATA UN RECÁLCULO ES EL RANGO, NO LA FUNCIÓN. La regla era "sólo celdas sumadas con +",
    // y desde el 17/08 las tres celdas de saldo a favor llevan una guarda (`ISNUMBER`/`COUNT`) para no
    // publicar #VALUE! cuando el mes ajeno tiene texto. Esa guarda no recalcula nada: mira las MISMAS
    // dos celdas. Lo que el hero sigue sin poder hacer es barrer un rango — ahí empezaría la segunda
    // verdad que este test existe para impedir.
    // ═══ LA ÚNICA EXCEPCIÓN, Y ES ESTRECHA (04/09/2026) ═══
    //
    // Las tres fórmulas de "el IVA empieza a salir de la caja" SÍ recorren un rango: los doce meses
    // de la fila «⇒ IVA a pagar en efectivo» y los de «Saldo de libre disponibilidad», para quedarse
    // con el PRIMERO que pide caja. Eso no es una segunda verdad —no suma nada, no vuelve a calcular
    // ningún importe—: lee exactamente la fila que el cuadro publica y devuelve UNA de sus celdas.
    // Se permite por su forma exacta (INDEX/MATCH sobre B..M de una fila) y nada más: cualquier otro
    // barrido de rango en el hero sigue siendo rojo.
    const buscaEnUnaFila = /^=IFERROR\(INDEX\(\$B\$\d+:\$M\$\d+;/.test(f)
    if (!buscaEnUnaFila) {
      assert.ok(!/\$?[A-N]\$?\d+:\$?[A-N]?\$?\d*/.test(f), `el hero no barre un rango: ${f}`)
    }
    assert.ok(!/SUM\(|AVERAGE|COUNTIFS?\(/.test(f), `el hero no agrega: ${f}`)
  }
  assert.match(porRotulo(hero, /IMPUESTOS A FAVOR/)[1], /^=IF\(COUNT\(\$H\$56;\$G\$66\)=2;\$H\$56\+\$G\$66;/,
    'a favor = libre disponibilidad de IVA + saldo de IIBB, y sólo si los dos son importes')
  assert.equal(porRotulo(hero, /DEUDA PENDIENTE/)[1], '=$B$92+$B$93', 'deuda pendiente = prendario pendiente + planes pendientes')
})

test('EL TITULAR ES LO QUE HAY QUE PAGAR, NO EL SALDO A FAVOR', () => {
  // ═══ EL DEFECTO DE PRODUCTO QUE ESTE TEST ATRAPA (06/08) ═══
  //
  // La versión anterior abría con "IMPUESTOS A FAVOR" y la piel agranda SIEMPRE la fila que sigue al
  // rótulo del bloque (`OFFSET_TITULAR`): el único número con jerarquía de la pantalla era un activo
  // fiscal inmovilizado, que no dispara ninguna decisión de tesorería. Dirección abre esta pestaña
  // para saber cuánto tiene que juntar y para cuándo. Si alguien vuelve a poner el saldo a favor
  // arriba, esto se pone rojo.
  const hero = heroDe()
  assert.match(String(hero[OFFSET_TITULAR][0]), /A PAGAR EN LOS PRÓXIMOS 30 DÍAS/,
    'la fila que la piel agranda tiene que ser la que decide')
  const iFavor = hero.findIndex((f) => /IMPUESTOS A FAVOR/.test(String(f[0] ?? '')))
  const iDeuda = hero.findIndex((f) => /DEUDA PENDIENTE/.test(String(f[0] ?? '')))
  assert.ok(iDeuda < iFavor, 'primero lo que se debe, después lo que se tiene a favor')
})

test('el hero dice DEUDA PENDIENTE, y sólo lo que falta pagar', () => {
  // El defecto B: decía $31.895.983 (las doce cuotas del año, siete ya pagadas) donde lo pendiente
  // son $14.372.450. El rótulo tiene que decir de qué habla, o el número se lee como el total.
  const hero = heroDe()
  // Rótulos CORTOS (auditor de pantalla, 06/08): PENDIENTE es la palabra que separa deuda real de
  // acumulado histórico; "por vencer" es la condición en tres palabras.
  assert.ok(porRotulo(hero, /DEUDA PENDIENTE/))
  // ═══ LOS DOS DESGLOSES SE FUERON (04/09/2026) ═══
  // "prendario · cuotas por vencer" era literalmente `=$B$92`, la misma celda que la sección 6 ya
  // publica con su serie mensual al lado. El hero repetía dos importes del detalle en los renglones
  // más caros de la pantalla, y no contestaba cuándo el IVA empieza a salir de la caja. Se cambiaron.
  assert.equal(hero.filter((f) => /cuotas por vencer/.test(String(f[0] ?? ''))).length, 0)
})

test('el próximo vencimiento lleva su fecha y su concepto EN el rótulo, sin el emisor', () => {
  // Cuelga del titular como sub-ítem: mismo dato, un renglón, sin competirle. Y el emisor entre
  // paréntesis se saca — a 360 px "⇒ PRÓXIMO VENCIMIENTO · 07/08 · Prendario Ford XLS (Santander)"
  // se dibujaba cortado con el paréntesis abierto, que es un error de imprenta, no un titular.
  const f = porRotulo(heroDe(), /primer vencimiento/)
  assert.ok(f, 'el primer vencimiento sigue estando en el hero')
  assert.match(String(f[0]), /primer vencimiento · 07\/08 · Prendario Ford XLS/)
  assert.ok(!/\(Santander\)/.test(String(f[0])), 'en el hero manda el qué, no el de quién')
  assert.equal(conceptoCorto('IVA · DDJJ F.2051 (ARCA)'), 'IVA · DDJJ F.2051')
  assert.equal(conceptoCorto('Prendario Ford XLS'), 'Prendario Ford XLS')
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

test('EL TITULAR SOBREVIVE AL BORRADO: suma las celdas del DETALLE, no las del calendario', () => {
  // ═══ EL NUDO DE ESTE REDISEÑO ═══
  //
  // "A pagar en los próximos 30 días" sumaba las celdas B de las filas del calendario. Borrar el
  // cuadro sin más rompía lo único que el dueño NO cuestionó. Se resolvió mirando qué había ADENTRO
  // de esas celdas: cada renglón era `=$J$90`, una REFERENCIA al detalle. El calendario nunca fue
  // fuente, era una escala. Ahora el hero salta la escala y suma las mismas celdas.
  const titular = String(posicion()[OFFSET_TITULAR][1])
  assert.ok(titular.startsWith('='), titular)
  const celdas = titular.slice(1).split('+')
  assert.ok(celdas.length >= 1)
  const delDetalle = new Set(cal().filter((o) => !o.vencido && o.dias <= 30).map((o) => o.celda))
  assert.deepEqual(new Set(celdas), delDetalle,
    'el titular tiene que sumar exactamente las celdas del detalle que vencen en 30 días')
  // Ninguna puede ser una celda de la columna B del propio bloque: ahí ya no hay calendario.
  for (const c of celdas) assert.ok(!/^\$B\$/.test(c), `${c} apunta a la columna del hero, no al detalle`)
})

test('EL IVA EMPIEZA A SALIR DE LA CAJA: la pregunta que la pestaña existía para contestar', () => {
  const hero = posicion()
  const f = porRotulo(hero, new RegExp(ROTULO_IVA_EN_CAJA))
  assert.ok(f, 'la línea tiene que estar en el hero')
  assert.match(String(f[1]), /^=IFERROR\(INDEX\(\$B\$55:\$M\$55;/, 'el importe sale de la fila del a-pagar')
  assert.match(String(f[2]), /\$B\$52:\$M\$52/, 'el MES sale del encabezado del cuadro de IVA')
  // LA B ES SIEMPRE EL IMPORTE. Un texto ahí lo dibuja el formato de moneda como plata que no se ve:
  // es la clase de defecto `texto_en_numero` que el auditor de pantalla cuenta. El mes va en la C.
  assert.ok(!/\$B\$52/.test(String(f[1])), 'el nombre del mes no puede caer en la columna del importe')
  const colchon = porRotulo(hero, /saldo a favor que lo venía absorbiendo/)
  assert.ok(colchon, 'el colchón que se agota cuelga de la línea como sub-ítem')
  assert.match(String(colchon[1]), /\$B\$56:\$M\$56/, 'sale de la fila de libre disponibilidad')
})

test('el hero entra en una pantalla: cuatro mensajes, ocho números', () => {
  const hero = posicion()
  assert.equal(hero.length, ALTO_HERO)
  const mensajes = hero.filter((f) => /^⇒/.test(String(f[0] ?? ''))).length
  const conImporte = hero.filter((f) => String(f[1] ?? '').startsWith('=')).length
  assert.equal(mensajes, 4, 'cuatro y no más: el estándar ejecutivo son 5 a 7 indicadores')
  assert.ok(conImporte <= 8, `${conImporte} números en el hero: de más para leerlo en tres segundos`)
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
