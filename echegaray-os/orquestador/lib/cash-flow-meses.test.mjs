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
import { RUBROS_EGRESO, RUBROS_SOLO_PROYECTADO } from './cash-flow-rubros.mjs'
import { auditarPatron } from './patron-pestana.mjs'
import { AVISO_SIN_INVERTIDO, GLOSA_SIN_INVERTIDO, CRITERIO_INVERTIDO, citaUnaFilaDe } from './cash-flow-invertido.mjs'

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

test('el hero sale del propio cuadro: cuatro conceptos ANUALES, ninguno con aritmética propia', () => {
  const { filas, meta } = armar()
  const T = letra(meta.cab.colTotal)
  const val = (i) => en(filas, meta.hero.valor, meta.hero.slots[i])
  assert.equal(val(0), `=N($${T}$${meta.fila.ingresoReal})+N($${T}$${meta.fila.ingresoProyectado})`)
  assert.equal(val(1), `=N($${T}$${meta.fila.egresoReal})+N($${T}$${meta.fila.egresoProyectado})`)
  // El cierre del año es el saldo final de DICIEMBRE, no la suma de los saldos: sumar doce stocks no
  // da un stock, y los meses anteriores al corte van vacíos.
  assert.equal(val(2), `=N($M$${meta.fila.saldoFinal})`)
  // La liquidez total es ese mismo cierre MÁS lo invertido: mismo origen, un sumando más.
  assert.ok(val(3).includes(`N($M$${meta.fila.saldoFinal})`), val(3))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LOS RÓTULOS DEL TITULAR — que la cifra correcta no salve a un nombre que dice otra cosa
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el titular no llama "resultado" ni "variación" a nada: la tarjeta que daba pérdidas se fue', () => {
  const { filas, meta } = armar()
  const rotulos = meta.hero.slots.map((s) => en(filas, meta.hero.rotulo, s))

  // ═══ EL DEFECTO QUE ESTE TEST MANTIENE MUERTO ═══
  //
  // "VARIACIÓN DE CAJA DEL AÑO $(23.136.331)". El rótulo era correcto y el número también, y el dueño
  // igual leía una pérdida que no existe: *"la empresa no termina perdiendo tampoco como marca el
  // resultado"*. La cifra suma ocho meses REALES con cuatro PROYECTADOS y no habilita ninguna decisión.
  for (const r of rotulos) {
    assert.ok(!/RESULTADO|VARIACI[ÓO]N/i.test(r), `el titular volvió a publicar un "resultado": ${r}`)
  }
  assert.deepEqual(rotulos, [
    ROTULOS_HERO.entra, ROTULOS_HERO.sale, ROTULOS_HERO.operativa, ROTULOS_HERO.liquidez,
  ])
  // Los cuatro son ANUALES o del cierre del año: ninguno habla de un mes suelto.
  assert.ok(/AÑO/.test(rotulos[0]) && /AÑO/.test(rotulos[1]))
  assert.ok(/31\/12/.test(rotulos[2]) && /31\/12/.test(rotulos[3]))

  // EL LÍMITE MEDIDO: la columna del hero corta a los 37 caracteres. Un rótulo más honesto pero
  // truncado no dice nada — por eso el tope se verifica, no se confía.
  for (const t of Object.values(ROTULOS_HERO)) {
    assert.ok([...t].length <= ANCHO_HERO, `"${t}" tiene ${[...t].length} caracteres y el hero corta en ${ANCHO_HERO}`)
  }
})

test('ENTRA y SALE parten el año: lo ya cobrado y lo que falta, en la misma glosa', () => {
  const { filas, meta } = armar()
  const T = letra(meta.cab.colTotal)
  const glosa = (i) => en(filas, meta.hero.nota, meta.hero.slots[i])

  // El total mezclaba $496.729.892 ya cobrado con $319.686.218 por cobrar, y esa diferencia es la que
  // decide si el año está hecho o está prometido. Las dos partes CITAN las filas del cuadro: si la
  // glosa recalculara, el titular tendría su propia versión del año.
  assert.ok(glosa(0).includes(`$${T}$${meta.fila.ingresoReal}`), glosa(0))
  assert.ok(glosa(0).includes(`$${T}$${meta.fila.ingresoProyectado}`), glosa(0))
  assert.ok(glosa(0).includes(ROTULOS_HERO.entraYa) && glosa(0).includes(ROTULOS_HERO.entraFalta), glosa(0))
  assert.ok(glosa(1).includes(`$${T}$${meta.fila.egresoReal}`), glosa(1))
  assert.ok(glosa(1).includes(`$${T}$${meta.fila.egresoProyectado}`), glosa(1))
  assert.ok(glosa(1).includes(ROTULOS_HERO.saleYa) && glosa(1).includes(ROTULOS_HERO.saleFalta), glosa(1))

  // LA PARTICIÓN NO SE ESCONDE CUANDO UNA MITAD ES CERO. La glosa vieja arrancaba con
  // `IF(proyectado=0;"";…)`: un año sin nada por cobrar publicaba el total pelado, que es justo el
  // caso en que hace falta decir que TODO está cobrado. Sin condición, las dos mitades se ven siempre.
  assert.ok(!/^=IF\(/.test(glosa(0)), `la glosa volvió a esconderse sola: ${glosa(0)}`)
  assert.ok(!/^=IF\(/.test(glosa(1)), `la glosa volvió a esconderse sola: ${glosa(1)}`)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LAS DOS TARJETAS DEL CIERRE — y el control que prueba que la cuarta no es una copia de la tercera
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('LIQUIDEZ TOTAL suma lo invertido leyéndolo POR RÓTULO, y no puede dar lo mismo que la caja operativa', () => {
  const { filas, meta } = armar()
  const operativa = en(filas, meta.hero.valor, meta.hero.slots[2])
  const liquidez = en(filas, meta.hero.valor, meta.hero.slots[3])
  const glosa = en(filas, meta.hero.nota, meta.hero.slots[3])

  // (1) SON DOS NÚMEROS DISTINTOS. Si alguien "simplifica" la tarjeta 4 a `=N($M$50)`, esto se pone
  // rojo: los $45.015.210 de Balanz volverían a no aparecer en ninguna cifra de la pestaña.
  assert.notEqual(liquidez, operativa, 'la liquidez total quedó siendo una copia de la caja operativa')
  // (2) Y LA SUMA SE HACE POR RÓTULO, nunca por número de fila: el panel de CAJA se corre de fila y
  // una referencia posicional devuelve OTRO número sin un solo #REF!.
  assert.ok(liquidez.includes(`SUMIF('CAJA'!$A:$A;"${CRITERIO_INVERTIDO}";'CAJA'!$C:$C)`), liquidez)
  assert.ok(!/'CAJA'!\$?C\$?\d+/.test(liquidez), `la tarjeta cita una FILA de CAJA: ${liquidez}`)
  assert.ok(glosa.includes('Balanz'), glosa)
})

test('LA MUTACIÓN: sin poder leer lo invertido, la tarjeta lo DICE — no publica el número de la de al lado', () => {
  // Es el mismo generador con la pestaña de CAJA sin resolver, que es lo que pasa cuando la hoja se
  // renombra o el archivo todavía no la tiene. Un cero acá significaría "no hay nada invertido", y eso
  // hoy es falso por $45.015.210: la tarjeta valdría lo mismo que la caja operativa y nadie lo notaría.
  const { filas, meta } = grillaMeses({ anio: 2026, refs: { ...REFS, caja: null } })
  const operativa = en(filas, meta.hero.valor, meta.hero.slots[2])
  const liquidez = en(filas, meta.hero.valor, meta.hero.slots[3])
  assert.equal(liquidez, AVISO_SIN_INVERTIDO)
  assert.notEqual(liquidez, operativa)
  assert.equal(en(filas, meta.hero.nota, meta.hero.slots[3]), GLOSA_SIN_INVERTIDO)
  // Y el rótulo NO cambia: sigue prometiendo liquidez total, y por eso el valor tiene que gritar.
  assert.equal(en(filas, meta.hero.rotulo, meta.hero.slots[3]), ROTULOS_HERO.liquidez)
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
