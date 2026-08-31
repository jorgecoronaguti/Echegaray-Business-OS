// LA MATRIZ MENSUAL — los defectos que este archivo mantiene muertos.
//
// El más caro es el del presupuesto: comparar contra un presupuesto que nadie cargó y mostrar la
// variación como si fuera un dato. Un mes sin cargar tiene que decir "—", nunca un porcentaje.
//
// El segundo es de contrato: los tres rangos con nombre que esta vista publica los consume el anexo
// de CAJA. Si se publican sobre la geometría anterior no dan error — devuelven otra celda, y el
// control que los lee miente sin un solo #REF!.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  grillaMeses, mesesDelAnio, destinosNombrados, PESTANA_MENSUAL, vinculoHoy,
  ROTULOS_HERO, ANCHO_HERO, formulaSubtitulo,
} from './cash-flow-meses.mjs'
import { NOMBRE_MESES } from './cash-flow-lineas.mjs'
import { footprintDe, conceptosDe, colTotal, letra, FILA } from './cash-flow-matriz.mjs'
import { ventanasDe } from './cash-flow-ventanas.mjs'
import { RUBROS_EGRESO, RUBROS_SOLO_PROYECTADO } from './cash-flow-rubros.mjs'
import { auditarPatron } from './patron-pestana.mjs'
import { CIERRE_SIN_INVERTIDO, CIERRE_CON_INVERTIDO, CRITERIO_INVERTIDO, citaUnaFilaDe } from './cash-flow-invertido.mjs'

// `caja` es el TÍTULO de la pestaña de CAJA, que el generador resuelve contra el archivo. Sin él, la
// tarjeta de liquidez total cae a su rama de "no pude leerlo" — que es un caso probado más abajo.
const REFS = { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', minima: 'CAJA_MINIMA', caja: 'CAJA' }
const armar = (opts = {}) => grillaMeses({ anio: 2026, refs: REFS, ...opts })
const en = (filas, f, c) => String((filas[f - 1] || [])[c] ?? '')
const fueraDeComillas = (s) => String(s).replace(/"[^"]*"/g, '""')

test('doce columnas de mes más TOTAL, y las filas de concepto en orden', () => {
  const { filas, meta } = armar()
  assert.equal(meta.pestana, PESTANA_MENSUAL)
  assert.equal(meta.cab.n, 12)
  assert.equal(meta.cab.colTotal, colTotal('mes', 2026))
  assert.equal(en(filas, meta.cab.fila, 0), 'Concepto')
  assert.equal(en(filas, meta.cab.fila, meta.cab.colTotal), 'TOTAL')
  assert.deepEqual(
    conceptosDe('mes').map((c) => en(filas, meta.fila[c.clave], 0)),
    conceptosDe('mes').map((c) => c.rotulo))
  // 81 filas: los 9 conceptos del tronco, la apertura por rubro de las cuatro medidas (36) y la
  // sección POR CLIENTE (1 título + 7 bloques de 5 = 36). Eran 36 de apertura hasta el 06/08: se fue
  // "Ingresos reales · Valores en cartera", que era cero en los doce meses por construcción. El 13/08
  // entró "Materiales de obra proyectados" —los egresos de las obras en curso, que caían en "Otros"—
  // sólo bajo lo proyectado, por el mismo criterio: bajo lo real sería otra fila condenada a cero.
  assert.equal(conceptosDe('mes').length, 81)
  assert.deepEqual(meta.footprint, footprintDe('mes', 2026))
})

test('los doce encabezados son SERIALES del primer día de cada mes, nunca texto', () => {
  const { filas, meta } = armar()
  const meses = mesesDelAnio(2026)
  for (let j = 0; j < 12; j++) {
    const v = (filas[meta.cab.fila - 1] || [])[meta.cab.col0 + j]
    assert.equal(typeof v, 'number', `el mes ${j + 1} escribe un texto donde va la fecha — es lo que dejó a diciembre como cadena`)
    assert.equal(v, Math.round((meses[j].getTime() - Date.UTC(1899, 11, 30)) / 86400000))
  }
})

test('la variación contra el presupuesto NO inventa: sin las dos celdas cargadas muestra "—", no un cero', () => {
  const { filas, meta } = armar()
  for (let j = 0; j < 12; j++) {
    const v = en(filas, meta.fila.variacionPresupuesto, meta.cab.col0 + j)
    assert.ok(v.includes('PRESUPUESTO_INGRESOS') && v.includes('PRESUPUESTO_EGRESOS'),
      'la variación tiene que mirar la pestaña de carga, no una constante')
    assert.ok(v.includes('<>0'), 'sin la guarda de "hay presupuesto cargado", un mes vacío se compara contra cero')
    assert.ok(v.includes('"—"'), 'un mes sin cargar dice "—", no un número')
    assert.ok(v.startsWith('=IFERROR('), 'si el rango con nombre todavía no existe, la celda muestra el hueco y no #NAME?')
  }
})

test('la variación contra el mes anterior deja enero en blanco: no hay diciembre de 2025 en el cuadro', () => {
  const { filas, meta } = armar()
  assert.equal(en(filas, meta.fila.variacionMesAnterior, meta.cab.col0), '')
  assert.equal(en(filas, meta.fila.variacionMesAnterior, meta.cab.col0 + 1),
    `=N($C$${meta.fila.resultado})-N($B$${meta.fila.resultado})`)
})

test('el mes que ancla descuenta lo que ya está adentro del saldo declarado', () => {
  const { filas, meta } = armar()
  const f = en(filas, meta.fila.saldoInicial, meta.cab.col0 + 7) // agosto
  assert.ok(f.includes('CAJA_TOTAL_DISPONIBLE'))
  // SIN TECHO EN EL CORTE (06/08): el total contiene TODO lo REAL (su línea de posteriores no tiene
  // techo). Con techo, un REAL posterior al corte quedaba en el inicio Y en su columna: $11,1M dobles.
  assert.ok(!f.includes('CAJA_FECHA_SALDO+1'),
    'el techo en el corte volvió: los REAL posteriores se cuentan dos veces en la cadena')
  assert.ok(f.includes('CAJA_TOTAL_DISPONIBLE)-('), f)
  assert.match(f, /"REAL"/, 'el ancla descuenta lo REAL del período en adelante')
})

test('LOS MESES ANTERIORES AL CORTE SE DESPEJAN HACIA ATRÁS, no quedan vacíos', () => {
  // ═══ EL CONTRATO CAMBIÓ EL 28/08/2026 ═══
  //
  // Acá se exigía que enero fuera `""`. Iba vacío por una razón declarada —"no hay con qué
  // reconstruirlo"— que resultó falsa: hay la MISMA identidad de la cadena, leída al revés. El efecto
  // de dejarlo vacío era que el cierre del año no se podía seguir con el ojo desde enero, y el titular
  // sumaba doce meses contra una cadena que arrancaba en agosto.
  const { filas, meta } = armar()
  const f = en(filas, meta.fila.saldoInicial, meta.cab.col0)
  const iniFeb = `$C$${meta.fila.saldoInicial}`
  const resEne = `$B$${meta.fila.resultado}`
  assert.ok(f.includes(`N(${iniFeb})-N(${resEne})`), `enero se despeja de febrero menos su resultado: ${f}`)
  // Y NO del cierre del propio mes: `cierre = inicio + resultado` ya existe, así que apuntar ahí
  // cerraría un ciclo de referencias y Sheets pondría #REF! en las dos filas.
  assert.ok(!f.includes(`$B$${meta.fila.saldoFinal}`), 'referencia circular: inicio y cierre se leerían entre sí')
  // El saldo final NO cambia: inicio + resultado ya da el inicio del mes siguiente por construcción.
  assert.ok(en(filas, meta.fila.saldoFinal, meta.cab.col0).startsWith(`=IF(N($B$${meta.fila.saldoInicial})=0;""`))
})

test('el ÚLTIMO mes no tiene de dónde despejar: si el corte cae fuera del año, va vacío', () => {
  const { filas, meta } = armar()
  const dic = en(filas, meta.fila.saldoInicial, meta.cab.col0 + meta.cab.n - 1)
  // Su rama "anterior al corte" es `""` y no una referencia a la columna N, que no existe.
  assert.ok(dic.startsWith('=IF(EOMONTH($M$7;0)+1<=CAJA_FECHA_SALDO;"";'), dic)
})

test('LA CADENA HACIA ATRÁS ES ACÍCLICA: ningún inicio anterior al corte lee su propio cierre', () => {
  const { filas, meta } = armar()
  for (let j = 0; j < meta.cab.n; j++) {
    const propio = `$${letra(meta.cab.col0 + j)}$${meta.fila.saldoFinal}`
    assert.ok(!en(filas, meta.fila.saldoInicial, meta.cab.col0 + j).includes(propio),
      `el mes ${j + 1} lee su propio cierre: Sheets detecta la circularidad por el grafo, no por la rama`)
  }
})

test('cada mes encadena con el cierre del anterior', () => {
  const { filas, meta } = armar()
  for (let j = 1; j < 12; j++) {
    const anterior = letra(meta.cab.col0 + j - 1)
    assert.ok(en(filas, meta.fila.saldoInicial, meta.cab.col0 + j).includes(`$${anterior}$${meta.fila.saldoFinal}`),
      `el mes ${j + 1} no engancha con el cierre del anterior`)
  }
})

test('LA APERTURA POR RUBRO también en el mensual: subtotal del libro, rubros exactos, "Otros" despejado', () => {
  const { filas, meta } = armar()
  const c = meta.cab.col0
  assert.equal(meta.bloques.length, 4)
  for (const b of meta.bloques) {
    const sub = en(filas, b.subtotal, c)
    assert.ok(sub.startsWith('=SUMPRODUCT('), `${b.clave}: el subtotal sale del libro, no de sus sub-líneas`)
    assert.ok(!sub.includes('SUM($B$'), `${b.clave}: si el subtotal fuera la suma, un rubro nuevo del Libro desaparecería`)
    for (const r of b.rubros) {
      assert.ok(en(filas, r.fila, c).includes(`="${r.rubro}"`), `${r.rubro}: el filtro es por igualdad exacta`)
      assert.equal(en(filas, r.fila, 0), `    · ${r.rubro}`)
    }
    assert.equal(en(filas, b.otros, c), `=N($B$${b.subtotal})-SUM($B$${b.primeraSub}:$B$${b.otros - 1})`)
  }
  // Y los rubros de egreso son los que emite el libro: si mañana cambia uno, la sub-línea sumaría
  // cero para siempre sin dar un solo error.
  assert.deepEqual(meta.bloques[3].rubros.map((r) => r.rubro), [...RUBROS_EGRESO])
  // BAJO LO REAL NO VAN LOS RUBROS QUE SÓLO PUEDEN SER PROYECCIÓN: una fila condenada a cero en los
  // doce meses ocupa lugar y enseña a saltear el bloque. "Materiales de obra proyectados" es el
  // segundo caso (13/08): la factura, cuando llega, entra por Compras con SU rubro.
  assert.deepEqual(
    meta.bloques[2].rubros.map((r) => r.rubro),
    RUBROS_EGRESO.filter((r) => !RUBROS_SOLO_PROYECTADO.includes(r)))
  assert.ok(RUBROS_SOLO_PROYECTADO.some((r) => RUBROS_EGRESO.includes(r)),
    'el mecanismo de "sólo proyectado" tiene que seguir aplicando del lado del egreso')
  // "Valores en cartera" SÓLO bajo proyectados: bajo reales estaba en cero los doce meses, porque el
  // día que el valor se acredita entra al libro por el banco con rubro "Cobranzas".
  assert.deepEqual(meta.bloques[0].rubros.map((r) => r.rubro), ['Cobranzas'])
  assert.deepEqual(meta.bloques[1].rubros.map((r) => r.rubro), ['Cobranzas', 'Valores en cartera'])
})

test('cero números pegados en las filas de plata', () => {
  const { filas, meta } = armar()
  const pegados = []
  for (const cc of conceptosDe('mes')) {
    for (let c = meta.cab.col0; c <= meta.cab.colTotal; c++) {
      const v = (filas[meta.fila[cc.clave] - 1] || [])[c]
      if (v === undefined || v === '') continue
      if (typeof v === 'number' || (!String(v).startsWith('=') && v !== '—')) pegados.push(`${cc.rotulo} col ${c + 1}: ${v}`)
    }
  }
  assert.deepEqual(pegados, [])
})

test('LA REGLA INNEGOCIABLE: ninguna tarjeta mezcla lo real con lo proyectado', () => {
  // ═══ EL DEFECTO QUE ESTE TEST MANTIENE MUERTO (29/08/2026) ═══
  //
  // El dueño rechazó el titular anterior: *"todo eso rehacer no me convence nada"*. La causa no era la
  // redacción — las cuatro tarjetas FUNDÍAN lo real con lo proyectado adentro de una misma cifra.
  // `ENTRA EN EL AÑO $816.416.110` era $496.729.892 YA COBRADO más $319.686.218 POR COBRAR: de un
  // número que ya los sumó, nadie puede separar el hecho de la promesa. Regla de oro 3.
  //
  // Se mide sobre la fórmula, no sobre la intención: `ventanasDe` dice a qué filas apunta cada celda.
  const { filas, meta } = armar()
  const mezclan = []
  meta.hero.slots.forEach((col, i) => {
    for (const fila of [meta.hero.valor, meta.hero.nota]) {
      const v = ventanasDe(en(filas, fila, col), meta.fila)
      if (v.length > 1) mezclan.push(`tarjeta ${i + 1} (fila ${fila}): cita ${v.join(' Y ')}`)
    }
  })
  // ═══ EL CONTRATO CAMBIÓ EL 31/08/2026, Y LO CAMBIÓ EL DUEÑO ═══
  //
  //   «necesito ing, egre, rdo y caja a fin de año»
  //
  // Las cuatro son de AÑO COMPLETO: ocho meses reales más cuatro proyectados. O sea que mezclan, y
  // no hay forma de que no mezclen — un total anual con el año a medio correr es eso.
  //
  // Lo que la regla 3 prohíbe no es el total del año: es que la mezcla esté ESCONDIDA. Por eso el
  // test deja de exigir «una sola ventana» y pasa a exigir algo más difícil de cumplir por
  // accidente: **una tarjeta que cite dos ventanas tiene que abrirlas en su glosa**, cada término
  // con su cifra. `ENTRA EN EL AÑO $816.416.110` a secas —el titular que el dueño rechazó el
  // 29/08— seguiría fallando, porque su glosa no partía el número.
  for (const col of meta.hero.slots) {
    const vValor = ventanasDe(en(filas, meta.hero.valor, col), meta.fila)
    const vNota = ventanasDe(en(filas, meta.hero.nota, col), meta.fila)
    if (vValor.length > 1) {
      assert.deepEqual([...vValor].sort(), [...vNota].sort(),
        'una tarjeta suma dos ventanas y su glosa no las abre: el lector no puede separar el hecho de la promesa')
    }
  }
  void mezclan

  // Y NO ES UN CONTROL VACÍO: las tres primeras tarjetas SÍ citan las dos ventanas. Sin esto, cuatro
  // tarjetas que no citaran ninguna fila pasarían el test de arriba sin decir nada.
  const ventanaDe = (i) => ventanasDe(en(filas, meta.hero.valor, meta.hero.slots[i]), meta.fila).sort()
  for (const i of [0, 1, 2]) {
    assert.deepEqual(ventanaDe(i), ['proyección', 'ya pasó'],
      `la tarjeta ${i + 1} dejó de ser del año completo: no cita las dos ventanas`)
  }
})

test('el hero sale del propio cuadro: cada cifra es una resta de dos celdas del cuadro, o el ancla', () => {
  const { filas, meta } = armar()
  const T = letra(meta.cab.colTotal)
  const val = (i) => en(filas, meta.hero.valor, meta.hero.slots[i])
  // 1 · INGRESOS DEL AÑO: lo cobrado más lo por cobrar, las dos filas del cuadro.
  assert.equal(val(0), `=N($${T}$${meta.fila.ingresoReal})+N($${T}$${meta.fila.ingresoProyectado})`)
  // 2 · EGRESOS DEL AÑO: lo pagado más lo por pagar.
  assert.equal(val(1), `=N($${T}$${meta.fila.egresoReal})+N($${T}$${meta.fila.egresoProyectado})`)
  // 3 · LA CAJA QUE GENERA EL AÑO: la resta de las dos anteriores, escrita en la celda para que el
  // lector pueda hacerla con los ojos. NO cita la fila «Variación de caja»: si citara otra fila, el
  // titular podría discrepar de sus propias tarjetas de al lado y nadie sabría cuál mirar.
  assert.equal(val(2), `=N($${T}$${meta.fila.ingresoReal})+N($${T}$${meta.fila.ingresoProyectado})`
    + `-N($${T}$${meta.fila.egresoReal})-N($${T}$${meta.fila.egresoProyectado})`)
  // 4 · EL CIERRE: el saldo final de DICIEMBRE, no la suma de los saldos — sumar doce stocks no da un
  // stock, y los meses anteriores al corte van vacíos.
  assert.equal(val(3), `=N($M$${meta.fila.saldoFinal})`)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LOS RÓTULOS DEL TITULAR — que la cifra correcta no salve a un nombre que dice otra cosa
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('cada tarjeta DICE de qué ventana habla, y la tercera se llama RESULTADO porque él la pidió así', () => {
  const { filas, meta } = armar()
  const rotulos = meta.hero.slots.map((s) => en(filas, meta.hero.rotulo, s))
  assert.deepEqual(rotulos, [
    ROTULOS_HERO.ingresos, ROTULOS_HERO.egresos, ROTULOS_HERO.resultado, ROTULOS_HERO.cierre,
  ])

  // (1) LA VENTANA ESTÁ EN EL RÓTULO, no sólo en la fórmula: quien lee la tarjeta tiene que saber de
  // cuándo habla sin abrir el cuadro.
  // Las tres primeras dicen DEL AÑO —su ventana es el ejercicio entero— y la cuarta su fecha.
  for (const i of [0, 1, 2]) assert.ok(/DEL AÑO|EN EL AÑO/.test(rotulos[i]), rotulos[i])
  assert.ok(/31\/12/.test(rotulos[3]), rotulos[3])
  // (2) LOS INGRESOS DEL AÑO LLEVAN PROYECCIÓN ADENTRO, y esa proyección sale SÓLO de Cobranzas —un
  // libro de cuentas por cobrar, no un pipeline comercial—. Que la glosa parta «cobrado / por
  // cobrar» es lo que mantiene visible el supuesto, y eso ya lo exige el test de la regla 3.
  // (3) LA TERCERA SE LLAMA «RESULTADO», Y ESTE TEST ANTES EXIGÍA LO CONTRARIO (31/08/2026).
  //
  // Decía «ninguna se llama resultado», con el argumento de que entra − sale por criterio PERCIBIDO
  // es caja y el resultado del ejercicio es devengado (reglas de oro 4 y 7). El argumento es cierto;
  // la conclusión no era mía de tomar. El dueño pidió «ing, egre, RDO y caja a fin de año», leyó
  // «CAJA GENERADA EN EL AÑO» en su tarjeta y contestó que había hecho cualquier cosa. Un test que
  // fija el criterio del que construye contra el pedido explícito del que lee no protege nada:
  // congela el error.
  //
  // Lo que SÍ hay que defender es que la palabra no se lea como rentabilidad, y eso se defiende con
  // la glosa —«entra X · sale Y»— y con el subtítulo de la pestaña, que dice percibido. Eso es lo
  // que se mide acá.
  assert.equal(rotulos[2], 'RESULTADO DEL AÑO', 'le cambiaron a la tercera el nombre que el dueño pidió')
  assert.ok(!/VARIACI[ÓO]N/i.test(rotulos.join(' ')), 'volvió la palabra «variación», que no dice nada')

  // EL LÍMITE MEDIDO: la columna del hero corta a los 37 caracteres. Un rótulo más honesto pero
  // truncado no dice nada — por eso el tope se verifica, no se confía.
  for (const t of Object.values(ROTULOS_HERO)) {
    assert.ok([...t].length <= ANCHO_HERO, `"${t}" tiene ${[...t].length} caracteres y el hero corta en ${ANCHO_HERO}`)
  }
})

test('las glosas abren cada cifra en sus dos términos, de la MISMA ventana', () => {
  const { filas, meta } = armar()
  const T = letra(meta.cab.colTotal)
  const glosa = (i) => en(filas, meta.hero.nota, meta.hero.slots[i])

  // Las dos partes CITAN las filas del cuadro: si la glosa recalculara, el titular tendría su propia
  // versión del año. Y las dos que abre cada glosa son de la misma ventana que su tarjeta.
  // CADA GLOSA ABRE SU TARJETA EN LO YA HECHO Y LO PROMETIDO, citando las filas del cuadro. Si la
  // glosa recalculara, el titular tendría su propia versión del año.
  assert.ok(glosa(0).includes(`$${T}$${meta.fila.ingresoReal}`) && glosa(0).includes(`$${T}$${meta.fila.ingresoProyectado}`), glosa(0))
  assert.ok(glosa(0).includes(ROTULOS_HERO.ingresosCobrado) && glosa(0).includes(ROTULOS_HERO.ingresosPorCobrar), glosa(0))
  assert.ok(glosa(1).includes(`$${T}$${meta.fila.egresoReal}`) && glosa(1).includes(`$${T}$${meta.fila.egresoProyectado}`), glosa(1))
  assert.ok(glosa(1).includes(ROTULOS_HERO.egresosPagado) && glosa(1).includes(ROTULOS_HERO.egresosPorPagar), glosa(1))
  assert.ok(glosa(2).includes(ROTULOS_HERO.resultadoEntra) && glosa(2).includes(ROTULOS_HERO.resultadoSale), glosa(2))
  assert.ok(ROTULOS_HERO.vieneCola.length > 0, 'la cola de la glosa se vació y la glosa quedó muda')

  // LA PARTICIÓN NO SE ESCONDE CUANDO UNA MITAD ES CERO. La glosa vieja arrancaba con
  // `IF(proyectado=0;"";…)`: un año sin nada por cobrar publicaba el total pelado, que es justo el
  // caso en que hace falta decirlo. Sin condición, las dos mitades se ven siempre.
  assert.ok(!/^=IF\(/.test(glosa(1)), `la glosa volvió a esconderse sola: ${glosa(1)}`)
  assert.ok(!/^=IF\(/.test(glosa(2)), `la glosa volvió a esconderse sola: ${glosa(2)}`)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LO INVERTIDO — bajó de tarjeta a glosa, y sigue sin poder mentir
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('la glosa del cierre suma lo invertido leyéndolo POR RÓTULO, y declara que ese sumando vale hoy', () => {
  const { filas, meta } = armar()
  const cierre = en(filas, meta.hero.valor, meta.hero.slots[3])
  const glosa = en(filas, meta.hero.nota, meta.hero.slots[3])

  // (1) EL TITULAR ES UNA SOLA VENTANA: el cierre operativo proyectado, sin Balanz adentro.
  assert.ok(!cierre.includes('SUMIF'), `la tarjeta volvió a mezclar el cierre con una posición de hoy: ${cierre}`)
  // (2) Y LA GLOSA TRAE LA OTRA CIFRA, declarando su ventana.
  assert.ok(glosa.includes(CIERRE_CON_INVERTIDO), glosa)
  assert.ok(glosa.includes(`SUMIF('CAJA'!$A:$A;"${CRITERIO_INVERTIDO}";'CAJA'!$C:$C)`), glosa)
  // (3) POR RÓTULO, NUNCA POR FILA: el panel de CAJA se corre de fila y una referencia posicional
  // devuelve OTRO número sin un solo #REF!.
  assert.ok(!citaUnaFilaDe('CAJA', glosa), glosa)
})

test('LA MUTACIÓN: sin poder leer lo invertido, la glosa lo DICE — no promete una cifra con Balanz', () => {
  // Es el mismo generador con la pestaña de CAJA sin resolver, que es lo que pasa cuando la hoja se
  // renombra o el archivo todavía no la tiene. Un cero acá significaría "no hay nada invertido", y eso
  // hoy es falso por $45.015.210.
  const { filas, meta } = grillaMeses({ anio: 2026, refs: { ...REFS, caja: null } })
  const glosa = en(filas, meta.hero.nota, meta.hero.slots[3])
  assert.ok(glosa.includes(CIERRE_SIN_INVERTIDO), glosa)
  assert.ok(!glosa.includes(CIERRE_CON_INVERTIDO), `promete Balanz sin poder leerlo: ${glosa}`)
  // Y el titular NO cambia: el cierre operativo se sigue pudiendo calcular sin CAJA.
  assert.equal(en(filas, meta.hero.valor, meta.hero.slots[3]), `=N($M$${meta.fila.saldoFinal})`)
  assert.equal(en(filas, meta.hero.rotulo, meta.hero.slots[3]), ROTULOS_HERO.cierre)
  // LA FOTO DE HOY DEJÓ DE SER UNA TARJETA (31/08/2026). El dueño pidió cuatro —ingresos, egresos,
  // caja generada y caja a fin de año— y un titular de cuatro no puede tener cinco. La liquidez
  // invertida sigue declarada donde importa: en la glosa del cierre, que es la que la promete.
  // Por eso este test ya no busca el aviso en la primera tarjeta: lo busca donde vive.
})

test('el cuadro lee el libro; sólo el TITULAR puede citar a CAJA, y nunca por fila', () => {
  // La regla de siempre: toda la plata de la matriz sale de `_MOVIMIENTOS`, porque una fila que lee
  // otra pestaña es una segunda definición de la misma cifra esperando a discrepar.
  //
  // El titular tiene una excepción declarada y acotada: las dos tarjetas del cierre. `CAJA` es la
  // dueña de la posición de caja —el ancla del cuadro ya la cita por rango con nombre— y lo INVERTIDO
  // no tiene rango con nombre, así que se lee por rótulo sobre sus columnas. Fuera de las dos filas
  // del hero, ninguna celda puede nombrar otra pestaña.
  const { filas, meta } = armar()
  const permitidas = new Set([meta.hero.valor, meta.hero.nota])
  const otras = []
  filas.forEach((f, i) => (f || []).forEach((c) => {
    const s = String(c ?? '')
    if (!s.startsWith('=')) return
    for (const m of s.matchAll(/(?:'([^']+)'|\b([A-Za-z_][\w ]*))!/g)) {
      const pest = m[1] ?? m[2]
      if (pest === '_MOVIMIENTOS') continue
      if (pest === REFS.caja && permitidas.has(i + 1)) continue
      otras.push(`fila ${i + 1}: ${pest}`)
    }
  }))
  assert.deepEqual(otras, [], 'la matriz mensual sólo puede leer el libro de movimientos')
  // La fila ENTERA, las cuatro columnas del titular, y con el MISMO código que la guarda del Semanal:
  // el mismo control escrito dos veces cerró una sola (ver `citaUnaFilaDe`).
  for (const fila of [meta.hero.rotulo, ...permitidas]) {
    const entera = (filas[fila - 1] || []).map((x) => String(x ?? '')).join(' § ')
    assert.ok(!citaUnaFilaDe(REFS.caja, entera), `la fila ${fila} del titular cita una FILA de CAJA: ${entera}`)
  }
})

test('el subtítulo DECLARA que los saldos previos al corte son calculados, y sólo cuando los hay', () => {
  const { filas } = armar()
  const sub = en(filas, FILA.subtitulo, 0)
  assert.ok(/CALCULADO hacia atrás/.test(sub), `un número despejado tiene que decirlo donde se lo lee: ${sub}`)
  assert.ok(/no registrado/.test(sub), sub)
  // Aparece bajo condición: si el corte cae en el primer mes del cuadro no hay nada que declarar, y
  // una advertencia permanente sobre algo que no pasa enseña a saltearla.
  assert.ok(sub.includes('IF($B$7<CAJA_FECHA_SALDO;'), sub)
  // Sin el rango con nombre no se inventa una advertencia sobre una fecha que no existe.
  assert.ok(!formulaSubtitulo(null, '$B$7').includes('CALCULADO'))
})

test('publica los tres nombres que el resto del archivo necesita, sobre las FILAS de la matriz', () => {
  // CF_MESES lo cuenta la proyección de comisiones; los dos saldos los mira el anexo de CAJA con
  // INDEX(rango;1;MATCH(…)). Publicarlos sobre la geometría anterior no da error: devuelve otra celda.
  const { meta } = armar()
  const d = destinosNombrados(meta)
  assert.deepEqual(d.map((x) => x.name), [NOMBRE_MESES, 'CF_INICIO', 'CF_CIERRE'])
  assert.deepEqual(d.map((x) => x.fila), [meta.cab.fila, meta.fila.saldoInicial, meta.fila.saldoFinal])
  for (const x of d) {
    assert.equal(x.col, 2, 'arrancan en la columna B')
    assert.equal(x.cols, 12, 'doce meses')
    assert.equal(x.filas, 1, 'son una fila, no una columna: la matriz los tiene en horizontal')
  }
})

test('es-AR: ninguna fórmula usa la coma como separador de argumentos', () => {
  const { filas } = armar()
  const malas = []
  filas.forEach((f, i) => (f || []).forEach((c, j) => {
    const s = String(c ?? '')
    if (s.startsWith('=') && fueraDeComillas(s).includes(',')) malas.push(`fila ${i + 1} col ${j + 1}`)
  }))
  assert.deepEqual(malas, [])
})

test('ninguna fórmula derrama sobre las celdas de abajo', () => {
  const { filas } = armar()
  const derraman = []
  filas.forEach((f, i) => (f || []).forEach((c, j) => {
    const s = String(c ?? '')
    if (s.startsWith('=') && (/\bARRAYFORMULA\(/.test(s) || /^=\s*(FILTER|SORTN|QUERY)\(/.test(s))) {
      derraman.push(`fila ${i + 1} col ${j + 1}`)
    }
  }))
  assert.deepEqual(derraman, [])
})

test('el patrón de la pestaña se cumple, salvo la única excepción declarada: una matriz no tiene secciones', () => {
  const { filas } = armar()
  const render = filas.map((f) => (f || []).map((c) => (typeof c === 'string' && c.startsWith('=') ? 0 : c)))
  const malos = auditarPatron(render, { ancho: footprintDe('mes', 2026).cols })
  assert.deepEqual(malos.map((m) => m.regla), ['sin-secciones'], JSON.stringify(malos))
})

test('después de la sección POR CLIENTE no hay NADA: el costo financiero vive en Impuestos y Financieros', () => {
  const { filas, meta } = armar()
  // EL CONTRATO CAMBIÓ EL 06/08 y por un pedido explícito, no por goteo: la última fila era
  // "Variación vs mes anterior" y ahora es la última del bloque residual de la sección POR CLIENTE.
  // Lo que NO cambió es la regla: después de eso no va nada más.
  const ultima = meta.clientes.bloques[meta.clientes.bloques.length - 1].ultima
  assert.equal(meta.filaFin, ultima)
  assert.equal(filas.length, ultima)
  assert.ok(meta.clientes.titulo > meta.fila.variacionMesAnterior, 'la sección va DESPUÉS del tronco entero')
  const texto = filas.flat().map((c) => String(c ?? '')).join(' ')
  assert.ok(!/descubierto|impuesto al cheque|comisiones/i.test(texto), 'un costo modelado no puede vivir adentro del cuadro')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL ATAJO AL MES ACTUAL — el Mensual no lo tenía y el control del pipeline lo reclamaba igual
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el vínculo "hoy" del Mensual apunta al mes corriente, con la URL entera y sin gid no se inventa uno', () => {
  const { meta } = armar()
  assert.equal(vinculoHoy(null, meta), null, 'sin el gid de la pestaña no hay vínculo, no un vínculo a ningún lado')
  const v = vinculoHoy(99, meta)
  // El fragmento "#gid=" suelto no navega: Google contesta "se borró el rango vinculado".
  assert.ok(v.startsWith('=HYPERLINK("https://docs.google.com/spreadsheets/d/'), v)
  assert.ok(v.includes('/edit#gid=99&range="&ADDRESS('), v)
  // El primero del mes corriente, con la MISMA expresión con la que se escribieron los encabezados.
  assert.ok(v.includes('EOMONTH(TODAY();-1)+1'), v)
  assert.ok(!v.includes('WEEKDAY'), 'el mes no se ubica por el lunes de la semana')
  // ═══ EL CONTRATO CAMBIÓ EL 13/08/2026, Y NO ES UN AJUSTE PARA QUE PASE ═══
  //
  // Acá se exigía `;"⏵  IR AL MES ACTUAL")`: un rótulo tipeado que promete un botón. `HYPERLINK` no
  // puede ser un botón (un clic selecciona, el segundo abre el chip, el tercero navega, y el doble
  // clic abre el modo edición), así que el rótulo pasa a DECIR dónde está el mes en curso. El prefijo
  // sigue siendo literal porque es por donde el control del pipeline parte la fórmula.
  assert.ok(v.includes(';"Mes actual: "&'), v)
  assert.ok(v.endsWith('"mmm yy"))'), v)
  assert.ok(!v.includes('⏵'), 'el ícono de botón se fue con la promesa que no se podía cumplir')
  assert.ok(!v.includes('IFERROR'), 'un cuadro vencido tiene que gritar #N/A, no llevar a una celda cualquiera')
})

test('con gid, el botón queda en A3 — la misma celda que en el Semanal', () => {
  const { filas, meta } = armar({ gid: 99 })
  assert.deepEqual(meta.botonHoy, { fila: FILA.botonHoy, col: 0 })
  assert.match(en(filas, FILA.botonHoy, 0), /^=HYPERLINK\(/)
  // Sin gid no se escribe nada: una celda con un vínculo roto es peor que una celda vacía.
  assert.equal(en(armar().filas, FILA.botonHoy, 0), '')
})
