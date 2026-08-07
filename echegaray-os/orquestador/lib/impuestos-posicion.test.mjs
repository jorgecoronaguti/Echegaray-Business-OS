import test from 'node:test'
import assert from 'node:assert/strict'
import {
  VENTANA, obligacionesDelCalendario, altoDeLaPosicion, filasDeLaPosicion,
  formulaOtrosSinFecha, diasAlProximo, ALTO_HERO, OFFSET_TITULAR, conceptoCorto, verificarAnclajes,
} from './impuestos-posicion.mjs'
import { ACUERDO, TARJETA } from './banco-santander.mjs'

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
  const filas = filasDeLaPosicion({
    cal: c, base: 4, hoy: HOY, acuerdo: ACUERDO, tarjeta: TARJETA,
    refs: { saldoIva: '$H$56', saldoIibb: '$G$66', prendPend: '$B$92', planesPend: '$B$93', otrosSinFecha: '=0' },
  })
  assert.equal(filas.length, altoDeLaPosicion(c))
})

const posicion = () => filasDeLaPosicion({
  cal: cal(), base: 4, hoy: HOY, acuerdo: ACUERDO, tarjeta: TARJETA,
  refs: { saldoIva: '$H$56', saldoIibb: '$G$66', prendPend: '$B$92', planesPend: '$B$93', otrosSinFecha: '=$I$77+$J$77' },
})

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
    assert.ok(/^=(\$?[A-N]\$?\d+)([+]\$?[A-N]\$?\d+)*$/.test(f), `el hero sólo suma celdas: ${f}`)
  }
  assert.equal(porRotulo(hero, /IMPUESTOS A FAVOR/)[1], '=$H$56+$G$66', 'a favor = libre disponibilidad de IVA + saldo de IIBB')
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
  assert.equal(hero.filter((f) => /cuotas por vencer/.test(String(f[0] ?? ''))).length, 2)
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

test('una fecha SUPUESTA se marca en la columna A, no en una nota que nadie ve', () => {
  // Las notas de esta pestaña se borran y la columna de procedencia se vacía: una advertencia que
  // sólo viviera ahí sería una advertencia invisible.
  const filas = posicion()
  const iibb = filas.filter((f) => /Ingresos Brutos San Juan/.test(String(f[0] ?? '')))
  assert.ok(iibb.length >= 2)
  for (const f of iibb) assert.match(String(f[0]), /⚠ (fecha supuesta|VENCIDO)/)
  // El IVA está verificado contra ARCA: no lleva la marca.
  const ivaFuturo = filas.filter((f) => /IVA · DDJJ F\.2051/.test(String(f[0] ?? '')) && !/VENCIDO/.test(String(f[0])))
  assert.ok(ivaFuturo.length >= 1)
  for (const f of ivaFuturo) assert.ok(!/fecha supuesta/.test(String(f[0])), `${f[0]}: el IVA está verificado`)
})

test('el riesgo se declara como PREGUNTA: la pestaña no sabe si algo se pagó', () => {
  const f = posicion().find((x) => /vencido s\/verificar/.test(String(x[0] ?? '')))
  assert.ok(f, 'tiene que existir el renglón de riesgo')
  assert.match(String(f[0]), /ver extracto/, 'la duda queda escrita: la pestaña no sabe si algo se pagó')
})

test('las tres ventanas son acumuladas y ninguna incluye lo vencido', () => {
  const filas = posicion()
  const total = filas.find((x) => /A PAGAR EN LA VENTANA/.test(String(x[0] ?? '')))
  const [v30, v60, v90] = [1, 2, 3].map((i) => String(total[i]))
  const celdas = (s) => (s === '=0' ? [] : s.slice(1).split('+'))
  assert.ok(celdas(v30).length <= celdas(v60).length)
  assert.ok(celdas(v60).length <= celdas(v90).length)
  for (const c of celdas(v30)) assert.ok(celdas(v90).includes(c), 'lo de 30 días está adentro de lo de 90')
  // El renglón de vencidos NO comparte ni una celda con las ventanas.
  const riesgo = filas.find((x) => /vencido s\/verificar/.test(String(x[0] ?? '')))
  for (const c of celdas(String(riesgo[1]))) assert.ok(!celdas(v90).includes(c), 'lo vencido no es proyección')
})

test('el financiamiento declara que NO mide el descubierto tomado', () => {
  // Un "disponible" que se lee como plata que está, y puede no estar, es la línea con la que se
  // decide no salir a pedir un adelanto.
  const filas = posicion()
  const desc = filas.find((x) => /Descubierto Santander/.test(String(x[0] ?? '')))
  assert.match(String(desc[0]), /⚠ uso: lo mide CAJA/, 'la duda queda escrita en el rótulo corto')
  const techo = filas.find((x) => /FINANCIAMIENTO SIN USAR/.test(String(x[0] ?? '')))
  assert.match(String(techo[0]), /TECHO/)
})

test('las referencias de "sin fecha cierta" son ABSOLUTAS y del mes en adelante', () => {
  assert.equal(formulaOtrosSinFecha([77, 78], HOY, 2026, 3), '=$I$77+$J$77+$K$77+$I$78+$J$78+$K$78')
  // Agosto es el mes 8 → columna I. Diciembre no tiene tres meses por delante: no inventa columnas.
  assert.equal(formulaOtrosSinFecha([77], '2026-12-01', 2026, 3), '=$M$77')
  assert.equal(formulaOtrosSinFecha([], HOY, 2026, 3), '=0')
})

test('NINGUNA celda del cuadro de financiamiento es un número PEGADO donde su fila la calcula', () => {
  // ═══ D46 (06/08) ═══
  //
  // "Disponible" de la tarjeta estaba pegado en 8.693.073,70 mientras B46 − C46 daba 8.693.074,00:
  // treinta centavos entre la celda y su propia fila, en la única de las cuatro que no calculaba. El
  // origen era el REDONDEO del tomado, que rompía la identidad límite − tomado = disponible.
  const filas = posicion()
  const i0 = filas.findIndex((f) => /^Línea de financiamiento/.test(String(f[0] ?? '')))
  assert.ok(i0 > 0, 'tiene que existir el encabezado del cuadro de financiamiento')
  const lineas = filas.slice(i0 + 1).filter((f) => !/^(⇒|$)/.test(String(f[0] ?? ''))).slice(0, 4)
  assert.equal(lineas.length, 4)
  for (const f of lineas) {
    const [rotulo, limite, tomado, disp] = f
    // Las dos ya tomadas enteras (prendario y planes) no tienen límite y su disponible es 0 explícito.
    if (typeof limite !== 'number') {
      assert.equal(disp, 0, `${rotulo}: sin línea disponible, el 0 va explícito`)
      continue
    }
    assert.match(String(disp), /^=\$B\$\d+-\$C\$\d+$/, `${rotulo}: el disponible tiene que salir de su fila`)
    // Y el tomado conserva los centavos: redondearlo a peso es lo que rompía la identidad de la fila.
    if (typeof tomado === 'number') {
      assert.equal(tomado, Math.round(tomado * 100) / 100, `${rotulo}: el tomado no se redondea a peso`)
    }
  }
  // El techo suma la columna: si una celda fuera un pegado, el total sería otra verdad.
  const techo = filas.find((f) => /FINANCIAMIENTO SIN USAR/.test(String(f[0] ?? '')))
  assert.match(String(techo[3]), /^=SUM\(\$D\$\d+:\$D\$\d+\)$/)
})

test('LO QUE DECIDE VA ARRIBA DE SU DETALLE: primero las ventanas, después el calendario', () => {
  // ═══ EL DEFECTO DE PRODUCTO (06/08, mirando el PDF) ═══
  //
  // La primera pantalla eran quince renglones de vencimientos uno por uno —los dos primeros vencidos
  // y dibujados "—"— y para llegar al único cuadro con el que se decide algo (cuánto juntar a 30, 60
  // y 90 días) había que scrollear. Un calendario línea por línea contesta "cuándo", no "cuánto
  // tengo que juntar": es el respaldo del agregado, y va abajo.
  const filas = posicion()
  const fila = (re) => filas.findIndex((f) => re.test(String(f[0] ?? '')))
  const riesgo = fila(/^1 · RIESGO Y PROYECCIÓN/)
  const calend = fila(/^2 · CALENDARIO DE VENCIMIENTOS/)
  const financ = fila(/^3 · FINANCIAMIENTO/)
  assert.ok(riesgo > 0 && calend > riesgo && financ > calend,
    `orden real: riesgo ${riesgo}, calendario ${calend}, financiamiento ${financ}`)
  // Y el riesgo entero entra en la primera pantalla, que es de lo que se trata.
  assert.ok(fila(/A PAGAR EN LA VENTANA/) < 25, 'el cuadro de decisión no puede exigir scroll')
})

test('LAS REFERENCIAS DE ARRIBA APUNTAN A LAS FILAS QUE DICEN — o el generador rompe', () => {
  // ═══ EL MODO DE FALLA QUE ESTO CIERRA ═══
  //
  // El hero suma `$B$` de las filas del calendario y el techo suma `$D$` de las del financiamiento, y
  // las dos direcciones se calculan ANTES de escribir los bloques, a partir de las alturas del hero y
  // del riesgo. Si alguien agrega un renglón al hero y no toca esas constantes, el hero sigue sumando
  // las mismas celdas —que ahora son otro concepto— y publica un importe distinto con exactamente el
  // mismo aspecto. No hay error, no hay #REF, no hay negativo imposible.
  const c = cal()
  const filas = posicion()
  const base = 4
  // La celda que el titular referencia tiene que caer sobre una fila de calendario, no sobre otra cosa.
  const celdas = String(filas[OFFSET_TITULAR][1]).slice(1).split('+')
  for (const celda of celdas) {
    const f = Number(celda.replace(/\$B\$/, ''))
    assert.match(String(filas[f - base][0]), /^\d{2}\/\d{2} · /,
      `el titular suma ${celda} y ahí no hay un vencimiento sino "${String(filas[f - base][0]).slice(0, 40)}"`)
  }
  // Y la guarda tiene que gritar cuando la dirección calculada NO cae sobre el bloque que dice. Se la
  // prueba con una geometría desplazada una fila, que es exactamente lo que deja un renglón nuevo en
  // el hero: el síntoma real, no una condición inventada.
  const filaCal0 = base + ALTO_HERO + 10 + 2
  assert.throws(
    () => verificarAnclajes(filas, base, {
      filaCal0: filaCal0 + 1, filaFin0: filaCal0 + c.length, cal: c, fin: [{ rotulo: 'x' }],
    }),
    /apuntando a otras filas/,
    'una referencia corrida una fila tiene que romper, no publicar el importe de al lado',
  )
  // Y con la geometría real no molesta a nadie.
  assert.doesNotThrow(() => verificarAnclajes(filas, base, {
    filaCal0, filaFin0: filaCal0 + c.length + 4, cal: c, fin: [{ rotulo: String(filas[filaCal0 + c.length + 4 - base][0]) }],
  }))
})

test('el disponible de la TARJETA sigue siendo el que declara el banco, al centavo', () => {
  // El dato primario del resumen es el DISPONIBLE; el tomado se despeja de él. Si alguien invierte la
  // dependencia (tomado = consumido declarado), el disponible cambia $60.433 y nadie lo ve.
  const filas = posicion()
  const f = filas.find((x) => /^Tarjeta de crédito/.test(String(x[0] ?? '')))
  assert.ok(f)
  assert.equal(Math.round((f[1] - f[2]) * 100) / 100, TARJETA.disponible)
})
