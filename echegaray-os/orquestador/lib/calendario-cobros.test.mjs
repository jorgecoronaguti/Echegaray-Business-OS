// EL CALENDARIO DE COBROS, VERIFICADO CON NÚMEROS — no con la forma de sus fórmulas.
//
// Esta pestaña no calcula nada: deja fórmulas que calcula Google. Un test de cadena prueba que la
// fórmula TIENE LA FORMA esperada y no puede ver que suma la columna equivocada, que se come un
// importe en dólares o que un cobro cayó fuera de todas las columnas de mes. Por eso casi todo lo de
// acá corre las fórmulas EN FRÍO (`evaluar-formula-sheet.mjs`) sobre la foto real de Cobranzas del
// 13/08 y compara NÚMEROS.
//
// LOS CUATRO DEFECTOS QUE ESTE ARCHIVO PERSIGUE:
//
//  · UN COBRO QUE SE CAE DEL CALENDARIO — sin fecha, o con fecha más allá de diciembre. No da error:
//    da un total menor, creíble, que ya no cuadra contra OBRAS y nadie sabe por cuál fila.
//  · CONTAR UN COBRO DOS VECES — si un hito cayera en su mes Y en vencido, la suma horizontal del
//    cliente lo duplicaría sin que ninguna celda se ponga roja.
//  · EL ENDOSO RESTADO EN VEZ DE DECLARADO — cambiaría el significado de `Cobrado` y rompería el
//    cuadre contra OBRAS!D14, que es el número que el dueño mira.
//  · REAL Y PROYECTADO DIBUJADOS IGUAL — el reclamo recurrente del dueño. Si las dos listas de
//    columnas se solapan o dejan un hueco, la itálica marca de más o de menos.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  grillaCalendario, ventanaDeMeses, inicioDeVentana, conColaLimpiable, columnasReales, columnasProyectadas,
  rotuloDeHito, ANCHO_HISTORICO, ALTO_HISTORICO, PESTANA_CALENDARIO, REFS_CALENDARIO, COLS_FIJAS, MARCA_ENDOSO,
} from './calendario-cobros.mjs'
import { hitosPendientes, finDeObraPorFila, canonicoDeCliente, mesDeSerial, textoDeHito } from './calendario-hitos.mjs'
import { evaluarFormula, hojaDeGrilla } from './evaluar-formula-sheet.mjs'
import { comoHoja, comoFilas, DESDE } from './cobranzas-fixture.mjs'
import { grillaObras, problemaDeSintaxis, clientesDeCobranzas, ANO } from './obras-grilla.mjs'
import { OBRAS_FUTURAS } from './obras-datos.mjs'
import { contratoDeObra } from './cobranzas-contrato.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

const TC = 1491.97
const HOY = new Date(Date.UTC(2026, 7, 13))
const HOY_ISO = '2026-08-13'
const COLS = { cliente: 6, concepto: 8, oc: 7, estado: 14, fechaCobro: 16, total: 12, forma: 13, moneda: 26 }
const filas = comoFilas()
const meses = ventanaDeMeses(HOY_ISO)
const clientes = clientesDeCobranzas(filas.map((f) => f[COLS.cliente]))
const finPorFila = finDeObraPorFila(filas, COLS, OBRAS_FUTURAS)
const { hitos, problemas } = hitosPendientes(filas, COLS, {
  desde: DESDE, meses, inicioVentana: inicioDeVentana(meses), finPorFila, ano: ANO,
})
const g = grillaCalendario({ clientes, hitos, meses })

const cel = (grid, ref) => {
  const [, L, n] = /^([A-Z]+)(\d+)$/.exec(ref)
  const c = [...L].reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1
  return grid[Number(n) - 1][c]
}
const val = (ref, { grid = g.filas, hoja = comoHoja(), tc = TC } = {}) => evaluarFormula(cel(grid, ref), {
  hoja: hojaDeGrilla(grid), hojas: { Cobranzas: hoja }, nombres: { TIPO_CAMBIO_USD: tc }, hoy: HOY,
})
const redondo = (x) => Math.round(Number(x) * 100) / 100
const letra = (i) => (i < 26 ? '' : String.fromCharCode(64 + Math.floor(i / 26))) + String.fromCharCode(65 + (i % 26))

test('la foto real no tiene ni un cobro sin lugar: si lo tuviera, el escritor NO publicaría', () => {
  assert.deepEqual(problemas, [], 'un problema acá significa que hay plata que el calendario no puede ubicar')
  assert.equal(hitos.length, 44, 'las 44 filas pendientes de la foto del 13/08')
  assert.equal(meses.map((m) => m.rotulo).join(' '), 'ago-26 sep-26 oct-26 nov-26 dic-26')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL CUADRE — el control que el encargo pide: la suma del calendario = la Resta de OBRAS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('EL CALENDARIO CUADRA CONTRA LA "Resta" DE OBRAS, PESO POR PESO', () => {
  // DOS CAMINOS AL MISMO HECHO. OBRAS calcula "lo que falta cobrar" como `todo lo no cancelado −
  // lo cobrado`; el calendario, como `vencido + la suma de cada mes`. Que den lo mismo prueba que
  // ningún cobro se cayó de la ventana y que ninguno se contó dos veces — y ninguna de las dos cosas
  // da error en Sheets: dan un número creíble.
  const porCliente = OBRAS_FUTURAS.reduce((m, o) => m.set(o.cliente, (m.get(o.cliente) ?? 0) + 1), new Map())
  const ALIAS = { 'San Francisco': ['San Francisco', 'IMOTOR/San Francisco/JAVI SANCHEZ'] }
  const obras = OBRAS_FUTURAS.map((o) => ({
    ...o,
    contrato: contratoDeObra(filas, COLS, {
      variantes: ALIAS[o.cliente] ?? [o.cliente], needle: o.ventaTexto, unica: porCliente.get(o.cliente) === 1,
    }, DESDE).contrato,
  }))
  const gObras = grillaObras({ obras, clientes })
  const fTotObras = gObras.totales[0]
  const restaObras = evaluarFormula(cel(gObras.filas, `E${fTotObras}`), {
    hoja: hojaDeGrilla(gObras.filas), hojas: { Cobranzas: comoHoja() }, nombres: { TIPO_CAMBIO_USD: TC }, hoy: HOY,
  })
  const totalCal = val(`${letra(g.iTotal)}${g.fTotal}`)
  assert.equal(redondo(totalCal), redondo(restaObras),
    `el calendario suma ${redondo(totalCal)} y la Resta de OBRAS es ${redondo(restaObras)}`)
  assert.ok(totalCal > 350_000_000, `el número tiene que ser el real del archivo, no un cero simpático: ${totalCal}`)
})

test('cada fila de cliente cuadra con sus propios hitos: si falta uno, el detalle no llega al total', () => {
  // ESTE ES EL CONTROL QUE ATRAPA LA FILA QUE EL CALENDARIO NO LISTA. La fila del cliente sale de la
  // FUENTE con rango abierto (SUMIFS sobre Cobranzas entera); los detalles están anclados a su fila.
  // Si mañana se carga una cobranza y el generador no vuelve a correr, el cliente sube y el detalle
  // no: la diferencia es exactamente la cobranza que falta mostrar.
  for (const [cli, f] of Object.entries(g.filaDeCliente)) {
    const delCliente = hitos.filter((h) => h.cliente === cli)
    const suma = delCliente.reduce((s, h) => {
      const fila = g.detalles.find((d) => g.filas[d - 1][0].includes(`!${REFS_CALENDARIO.fechaCobro}${h.fila}`))
      return s + Number(val(`${letra(g.filas[fila - 1].findIndex((v) => typeof v === 'string' && v.startsWith('=IF(')))}${fila}`))
    }, 0)
    const total = Number(val(`${letra(g.iTotal)}${f}`))
    assert.equal(redondo(suma), redondo(total), `${cli}: sus ${delCliente.length} hitos suman ${redondo(suma)} y la fila dice ${redondo(total)}`)
  }
})

test('NINGÚN HITO CAE EN DOS COLUMNAS: un importe repetido duplicaría el mes sin dar error', () => {
  for (const f of g.detalles) {
    const conImporte = g.filas[f - 1].map((v, i) => (i > 0 && typeof v === 'string' && v.startsWith('=') ? i : -1)).filter((i) => i > 0)
    assert.equal(conImporte.length, 1, `la fila ${f} publica su importe en ${conImporte.length} columnas: ${conImporte.map(letra).join(', ')}`)
    // Y la columna donde cae tiene que ser la de SU mes (o la de vencido), no cualquiera.
    assert.ok(conImporte[0] >= COLS_FIJAS.length - 1, `la fila ${f} pone plata en una columna fija`)
  }
})

test('el hito cae en el mes de SU fecha: si el reparto se corriera un mes, el total seguiría cuadrando', () => {
  // POR QUÉ HACE FALTA ADEMÁS DEL CUADRE: correr todos los hitos un mes deja el total idéntico. El
  // cuadre no puede ver eso; esto sí.
  const iMes = (m) => COLS_FIJAS.length + meses.findIndex((x) => x.mes === m.mes && x.ano === m.ano)
  for (const h of hitos) {
    const fila = g.detalles.find((d) => String(g.filas[d - 1][0]).includes(`!${REFS_CALENDARIO.fechaCobro}${h.fila}`))
    const col = g.filas[fila - 1].findIndex((v, i) => i > 0 && typeof v === 'string' && v.startsWith('='))
    assert.equal(col, h.vencido ? 3 : iMes(h.mes),
      `Cobranzas fila ${h.fila} (${h.concepto}) cobra el ${h.mes.mes}/${h.mes.ano} y cayó en la columna ${letra(col)}`)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LAS GUARDAS: un cobro sin lugar DETIENE la corrida, no se publica a medias
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('un cobro pendiente SIN FECHA detiene la corrida y dice cuál es', () => {
  const sinFecha = [...filas.map((f) => [...f])]
  sinFecha.push(Object.assign(Array.from({ length: 27 }, () => ''),
    { 6: 'ARCOR', 8: 'Un trabajo sin fecha', 12: 5_000_000, 14: 'Pendiente', 16: '' }))
  const r = hitosPendientes(sinFecha, COLS, { desde: DESDE, meses, inicioVentana: inicioDeVentana(meses), finPorFila })
  assert.equal(r.problemas.length, 1)
  assert.match(r.problemas[0], /sin fecha de cobro/)
  assert.match(r.problemas[0], /Un trabajo sin fecha/, 'tiene que nombrar la fila para poder ir a mirarla')
  assert.equal(r.hitos.length, hitos.length, 'y no se cuela igual entre los hitos publicados')
})

test('un cobro MÁS ALLÁ DE DICIEMBRE detiene la corrida: no hay columna donde ponerlo', () => {
  const tarde = [...filas.map((f) => [...f])]
  // 15/03/2027 — la pestaña declara el año 2026 y no tiene columna para eso.
  tarde.push(Object.assign(Array.from({ length: 27 }, () => ''),
    { 6: 'MESSINA', 8: 'Certificación 2027', 12: 9_000_000, 14: 'Pendiente', 16: 46_461 }))
  const r = hitosPendientes(tarde, COLS, { desde: DESDE, meses, inicioVentana: inicioDeVentana(meses), finPorFila, ano: ANO })
  assert.equal(r.problemas.length, 1)
  assert.match(r.problemas[0], /fuera del año 2026/)
})

test('un cobro ATRASADO no detiene nada: tiene su columna, y es la que impide que desaparezca', () => {
  // Es la diferencia de criterio que hace útil a la columna ⚠ Vencido. Hoy da cero en las 9 filas
  // —ninguna de las 44 pendientes está atrasada— y por eso mismo hay que probarla con un caso.
  const viejo = [...filas.map((f) => [...f])]
  viejo.push(Object.assign(Array.from({ length: 27 }, () => ''),
    { 6: 'ARCOR', 8: 'Se pasó de fecha', 12: 1_234_567, 14: 'Pendiente', 16: 46_100 })) // 01/05/2026
  const r = hitosPendientes(viejo, COLS, { desde: DESDE, meses, inicioVentana: inicioDeVentana(meses), finPorFila })
  assert.deepEqual(r.problemas, [], 'lo vencido NO aborta: tiene columna propia')
  const nuevo = r.hitos.find((h) => h.concepto === 'Se pasó de fecha')
  assert.equal(nuevo.vencido, true)
  const g2 = grillaCalendario({ clientes, hitos: r.hitos, meses })
  const fila = g2.detalles.find((d) => String(g2.filas[d - 1][0]).includes(`!Q${nuevo.fila}`))
  assert.ok(String(g2.filas[fila - 1][3]).startsWith('='), 'el atrasado va en la columna ⚠ Vencido, la 4ª')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL ENDOSO — la explicación de los $20.000.000 que separan a OBRAS del Cash Flow
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('el endosado se DECLARA aparte y queda DENTRO de lo cobrado: restarlo rompería el cuadre con OBRAS', () => {
  // El fixture del repo no guarda la columna de notas, así que el caso se arma con la foto de las dos
  // filas reales: Cobranzas 43 y 48, LA ESTRELLA, $10.000.000 cada una, "Endosado a Alumetal 10/7".
  const hoja = {
    G43: 'LA ESTRELLA', M43: 10_000_000, O43: 'Cobrado', Q43: 46_200, W43: 'Endosado a Alumetal 10/7',
    G48: 'LA ESTRELLA', M48: 10_000_000, O48: 'Cobrado', Q48: 46_200, W48: 'Endosado a Alumetal 10/7',
    G49: 'LA ESTRELLA', M49: 33_000_000, O49: 'Cobrado', Q49: 46_200, W49: '',
  }
  const gg = grillaCalendario({ clientes: ['LA ESTRELLA'], hitos: [], meses })
  const f = gg.filaDeCliente['LA ESTRELLA']
  const cobrado = Number(val(`B${f}`, { grid: gg.filas, hoja }))
  const endosado = Number(val(`C${f}`, { grid: gg.filas, hoja }))
  assert.equal(endosado, 20_000_000, 'los dos echeqs endosados, y nada más')
  assert.equal(cobrado, 53_000_000, 'el cliente pagó todo: el endoso NO se resta de lo cobrado')
  assert.ok(endosado < cobrado, 'el endosado es una PARTE de lo cobrado, no un renglón aparte')
  // Y el criterio es la NOTA, no la forma de cobro: hay 9 echeqs en el archivo y sólo 2 endosados.
  assert.ok(String(cel(gg.filas, `C${f}`)).includes(MARCA_ENDOSO))
  assert.ok(!String(cel(gg.filas, `C${f}`)).includes('Echeq'))
})

test('el endosado NO entra en lo que falta cobrar: ya se cobró', () => {
  const hoja = { G43: 'X', M43: 10_000_000, O43: 'Cobrado', Q43: 46_200, W43: 'Endosado a Alumetal 10/7' }
  const gg = grillaCalendario({ clientes: ['X'], hitos: [], meses })
  const f = gg.filaDeCliente.X
  assert.equal(Number(val(`${letra(gg.iTotal)}${f}`, { grid: gg.filas, hoja })), 0)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// REAL vs PROYECTADO: se distingue por FORMA, y la regla vive en UN solo lugar
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('las columnas reales y las proyectadas no se solapan ni dejan un hueco', () => {
  const reales = columnasReales()
  const proy = columnasProyectadas(g.ancho)
  assert.deepEqual(reales.filter((c) => proy.includes(c)), [], 'una columna no puede ser real y proyectada')
  const todas = [0, ...reales, ...proy].sort((a, b) => a - b)
  assert.deepEqual(todas, Array.from({ length: g.ancho }, (_, i) => i),
    'la 0 es el rótulo y todas las demás tienen que estar clasificadas: un hueco se dibuja sin itálica y se lee como real')
})

test('lo REAL son Cobrado y el endosado; TODO lo demás es proyección', () => {
  const enc = g.filas[g.fEncabezado - 1]
  for (const c of columnasReales()) {
    assert.ok(['Cobrado', '↳ endosado'].includes(enc[c]), `la columna ${letra(c)} ("${enc[c]}") no es plata que ya entró`)
  }
  for (const c of columnasProyectadas(g.ancho)) {
    assert.ok(!['Cobrado', '↳ endosado'].includes(enc[c]), `la columna ${letra(c)} ("${enc[c]}") es real y quedó marcada como proyectada`)
  }
  // El mes en curso va del lado PROYECTADO aunque parte de agosto ya se haya cobrado: la columna
  // ago-26 lleva sólo lo PENDIENTE de agosto. Lo cobrado de agosto está en `Cobrado`, sin duplicar.
  assert.ok(columnasProyectadas(g.ancho).includes(COLS_FIJAS.length), 'el mes en curso es proyección')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL ⚠ DE FIN DE OBRA (pedido del dueño): un cobro después de que la obra terminó
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('un cobro POSTERIOR al fin de su obra se marca, y la comparación la hace Sheets', () => {
  // Caso real de la foto: BSA termina el 21/08/2026 y sus dos cobros pendientes caen el 06/09.
  const bsa = hitos.filter((h) => h.finObra === '2026-08-21' && h.concepto.includes('BSA'))
  assert.equal(bsa.length, 2, `esperaba los dos cobros de BSA y encontré ${bsa.length}`)
  for (const h of bsa) {
    assert.match(h.textoVisible, /⚠ fin 21\/08/, `${h.concepto} cobra el ${h.serial} y no quedó marcado`)
    const f = rotuloDeHito(REFS_CALENDARIO, h)
    assert.match(f, /IF\('Cobranzas'!Q\d+>\d+;" ⚠ fin 21\/08";""\)/, 'la comparación tiene que vivir en la fórmula')
    assert.equal(problemaDeSintaxis(f), null)
  }
})

test('un cobro DENTRO del plazo de su obra no se marca: el ⚠ sólo grita cuando hay algo que mirar', () => {
  const dentro = hitos.filter((h) => h.finObra && !h.textoVisible.includes('⚠'))
  assert.ok(dentro.length > 10, 'la mayoría de los hitos de obra cobran dentro del plazo y no llevan marca')
  // EL BORDE, Y ES UN CASO REAL DE LA FOTO: "Entrepiso y Escaleras - Certificación 1/1" cobra el
  // 21/08/2026 y su obra termina EXACTAMENTE ese día. Cobrar el último día del plazo no es cobrar
  // después: la comparación es `>` y no `>=`. Un `>=` marcaría en amarillo el cierre perfecto de una
  // obra, y una marca que se enciende cuando todo salió bien deja de significar algo.
  const justo = hitos.find((h) => h.concepto.startsWith('Entrepiso y Escaleras - Certificación'))
  assert.equal(justo.finObra, '2026-08-21')
  assert.ok(!justo.textoVisible.includes('⚠'), `cobra el último día del plazo y no debe marcarse: "${justo.textoVisible}"`)
  // La marca la decide la FECHA, no la existencia de fin de obra.
  assert.equal(textoDeHito({ serial: 46_235, concepto: 'X', forma: 'Efectivo', estado: 'Pendiente', finObra: '2026-12-31' }).includes('⚠'), false)
  assert.equal(textoDeHito({ serial: 46_387, concepto: 'X', forma: 'Efectivo', estado: 'Pendiente', finObra: '2026-08-21' }).includes('⚠'), true)
})

test('un hito que no pertenece a ninguna obra declarada NO inventa una fecha de fin', () => {
  // Son los $54,6M de trabajos sueltos. No tienen fin porque no son una obra: marcarlos exigiría
  // fabricar el dato, que es lo que la regla de oro 1 prohíbe.
  const sueltos = hitos.filter((h) => !h.finObra)
  assert.ok(sueltos.length > 0)
  for (const h of sueltos) assert.ok(!h.textoVisible.includes('⚠ fin'), `${h.concepto} no tiene obra y se marcó igual`)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA HIGIENE QUE ESTE ARCHIVO YA PAGÓ EN OTRAS PESTAÑAS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('todas las fórmulas parsean y ninguna usa la coma: en es-AR una coma es un decimal', () => {
  for (const [i, fila] of g.filas.entries()) {
    for (const [c, v] of fila.entries()) {
      if (typeof v !== 'string' || !v.startsWith('=')) continue
      assert.equal(problemaDeSintaxis(v), null, `${letra(c)}${i + 1}: ${problemaDeSintaxis(v)}`)
      const sinTextos = v.replace(/"[^"]*"/g, '""')
      assert.ok(!sinTextos.includes(','), `${letra(c)}${i + 1} usa una coma fuera de un texto`)
    }
  }
})

test('ninguna celda de plata es un número pegado: todas son fórmula', () => {
  // Regla de oro 5. Un importe tipeado se fosiliza y nadie se entera.
  for (const [i, fila] of g.filas.entries()) {
    for (const [c, v] of fila.entries()) {
      if (c === 0 || v === VACIO || v === '' || v === undefined) continue
      const esEncabezado = i + 1 <= g.fEncabezado
      assert.ok(esEncabezado || (typeof v === 'string' && v.startsWith('=')),
        `${letra(c)}${i + 1} tiene el valor pegado ${JSON.stringify(v)}`)
    }
  }
})

test('la cola se limpia en los DOS ejes, y ROMPE si la grilla supera el alto declarado', () => {
  const conCola = conColaLimpiable(g.filas)
  assert.equal(conCola.length, ALTO_HISTORICO)
  assert.equal(conCola[0].length, ANCHO_HISTORICO)
  assert.equal(conCola.at(-1).every((c) => c === VACIO), true, 'la cola va con el centinela para que la fusión la limpie')
  // El ancho de HOY es 10 y el histórico 17: las 7 de la derecha son las de los meses que ya pasaron
  // y TIENEN que salir con el centinela, o quedan publicadas cuando la ventana se angosta.
  assert.ok(g.ancho < ANCHO_HISTORICO)
  assert.equal(conCola[g.fTotal - 1].slice(g.ancho).every((c) => c === VACIO), true)
  assert.throws(() => conColaLimpiable(g.filas, ANCHO_HISTORICO, g.filas.length - 1), /Subí ALTO_HISTORICO/)
})

test('la ventana de meses se angosta sola y en enero es la más ancha que la pestaña puede tener', () => {
  assert.equal(ventanaDeMeses('2026-01-05').length, 12)
  assert.equal(ventanaDeMeses('2026-12-31').length, 1)
  assert.equal(ventanaDeMeses('2027-01-01').length, 0, 'un año después del declarado no hay calendario que publicar')
  // El ancho histórico tiene que alcanzar para el caso más ancho posible, si no la cola no se limpia.
  const enero = grillaCalendario({ clientes: ['X'], hitos: [], meses: ventanaDeMeses('2026-01-05') })
  assert.equal(enero.ancho, ANCHO_HISTORICO, `el peor caso mide ${enero.ancho} y ANCHO_HISTORICO es ${ANCHO_HISTORICO}`)
})

test('el mes se calcula en UTC: un serial del día 1 no puede caer en el mes anterior', () => {
  // Con `new Date(serial*86400000)` y una zona al oeste de Greenwich, el 01/09 se lee 31/08 y el hito
  // aparece un mes antes. El total cuadra igual, así que sólo lo ve un test como éste.
  assert.deepEqual(mesDeSerial(46_266), { ano: 2026, mes: 9 }) // 01/09/2026
  assert.deepEqual(mesDeSerial(46_387), { ano: 2026, mes: 12 }) // 31/12/2026
})

test('IMOTOR es San Francisco: el canónico es la MISMA decisión declarada que usa OBRAS', () => {
  assert.equal(canonicoDeCliente('IMOTOR/San Francisco/JAVI SANCHEZ'), 'San Francisco')
  assert.equal(canonicoDeCliente('MESSINA'), 'MESSINA')
  assert.ok(!Object.keys(g.filaDeCliente).includes('IMOTOR/San Francisco/JAVI SANCHEZ'),
    'si abriera fila propia, el cuadro volvería a partir un cliente en dos')
})

test('el subtítulo es UNA línea y ninguna celda del cuerpo explica nada', () => {
  // El dueño rechazó dos pestañas por *"muchas palabras y frases y explicación es q nadie lee"*.
  assert.equal(g.filas[2].every((c) => c === VACIO), true, 'entre el subtítulo y la tabla va aire, no otra frase')
  // SE MIDE LO QUE SE VE, no la fórmula: el rótulo de un hito es una fórmula larga que dibuja un
  // renglón corto. Es la misma distinción que necesita `anchoColumnaA` para no pedir 1.500px.
  const visible = new Map(g.rotulos.map((r) => [r.fila, r.texto]))
  for (const [i, fila] of g.filas.entries()) {
    if (i + 1 <= 2) continue
    const t = visible.get(i + 1) ?? (fila[0] === VACIO ? '' : String(fila[0]))
    assert.ok(t.length < 90, `la fila ${i + 1} escribe un párrafo en una celda (${t.length} caracteres): "${t.slice(0, 70)}…"`)
  }
})

test('la pestaña se llama como dice su constante y el título la nombra', () => {
  assert.equal(PESTANA_CALENDARIO, 'Calendario de Cobros')
  assert.ok(String(g.filas[0][0]).startsWith(PESTANA_CALENDARIO.toUpperCase()))
})
