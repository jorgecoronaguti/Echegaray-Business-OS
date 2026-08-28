// LA MATRIZ SEMANAL — lo que este archivo impide que vuelva a pasar.
//
// Cada test nombra un defecto concreto que la vista podría tener sin dar un solo error visible: una
// cadena de saldos rota (las cinco semanas de agosto arrancando con el mismo saldo, $84M de desvío),
// un número pegado donde tiene que haber fórmula, una coma de separador en un archivo es-AR (que
// Sheets rechaza entera), una fórmula que derrama, o un hero que contradice al cuadro de abajo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { grillaSemanal, vinculoHoy, PESTANA_SEMANAL } from './cash-flow-semanas.mjs'
import {
  conceptosDe, colTotal, footprintDe, letra, semanasDelAnio, serialDeFecha,
} from './cash-flow-matriz.mjs'
import { ESTADOS_PENDIENTES } from './cash-flow-medidas.mjs'
import { auditarPatron } from './patron-pestana.mjs'

const HOY = new Date(Date.UTC(2026, 7, 5)) // miércoles 5 de agosto de 2026
const ANIO = 2026
const REFS = { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', minima: 'CAJA_MINIMA' }
const armar = (opts = {}) => grillaSemanal({ hoy: HOY, anio: ANIO, refs: REFS, ...opts })
const en = (filas, f, c) => String((filas[f - 1] || [])[c] ?? '')
/** El texto de una fórmula sin lo que va entre comillas: los patrones de número llevan comas legítimas. */
const fueraDeComillas = (s) => String(s).replace(/"[^"]*"/g, '""')

test('EL AÑO ENTERO: 53 columnas de semana más TOTAL, y todas las filas de concepto en orden', () => {
  const { filas, meta } = armar()
  assert.equal(meta.pestana, PESTANA_SEMANAL)
  // Eran trece semanas rodantes desde hoy: escondían la historia del ejercicio y metían columnas de 2027.
  assert.equal(meta.cab.n, 53)
  assert.equal(meta.cab.colTotal, colTotal('semana', ANIO))
  assert.deepEqual(meta.footprint, footprintDe('semana', ANIO))
  assert.equal(meta.footprint.cols, 55)
  assert.equal(en(filas, meta.cab.fila, 0), 'Concepto')
  assert.equal(en(filas, meta.cab.fila, meta.cab.colTotal), 'TOTAL')
  assert.deepEqual(
    conceptosDe('semana').map((c) => en(filas, meta.fila[c.clave], 0)),
    conceptosDe('semana').map((c) => c.rotulo))
})

test('la primera columna es el lunes 29/12/2025 y la última contiene el 31/12/2026', () => {
  const { filas, meta } = armar()
  const cab = filas[meta.cab.fila - 1]
  assert.equal(cab[meta.cab.col0], serialDeFecha(new Date(Date.UTC(2025, 11, 29))),
    'la primera semana es la que CONTIENE el 1° de enero, y arranca en diciembre')
  const ultima = semanasDelAnio(ANIO).at(-1)
  assert.equal(cab[meta.cab.col0 + meta.cab.n - 1], serialDeFecha(ultima.desde))
  const finDeAnio = new Date(Date.UTC(2026, 11, 31))
  assert.ok(ultima.desde <= finDeAnio && finDeAnio < ultima.hasta)
})

test('los encabezados de tiempo son SERIALES de fecha, nunca texto', () => {
  const { filas, meta } = armar()
  for (let j = 0; j < meta.cab.n; j++) {
    const v = (filas[meta.cab.fila - 1] || [])[meta.cab.col0 + j]
    assert.equal(typeof v, 'number', `la columna ${j + 1} escribe un texto donde va la fecha`)
    assert.ok(v > 45900 && v < 47000, `${v} no es un serial del ejercicio`)
  }
  // Lunes consecutivos: el serial del siguiente es el anterior más siete.
  const seriales = filas[meta.cab.fila - 1].slice(meta.cab.col0, meta.cab.col0 + meta.cab.n)
  for (let j = 1; j < seriales.length; j++) assert.equal(seriales[j] - seriales[j - 1], 7)
})

test('LA HISTORIA SE VE PERO NO SE INVENTA: antes del corte hay flujos y NO hay saldo', () => {
  const { filas, meta } = armar()
  // Cuál columna es "antes" lo decide la FÓRMULA, no el generador: refFecha es un rango con nombre que
  // se lee cuando la hoja calcula. Lo que se prueba es que las tres ramas estén escritas.
  const ini = en(filas, meta.fila.saldoInicial, meta.cab.col0 + 20)
  assert.ok(ini.startsWith('=IF($V$7+7<=CAJA_FECHA_SALDO;"";'), `falta la rama ANTES (saldo en blanco): ${ini.slice(0, 60)}`)
  assert.ok(ini.includes('IF($V$7<=CAJA_FECHA_SALDO;'), 'falta la rama ANCLA')
  // Y el cierre propaga el vacío: un cero se leería como "cerró la semana sin plata".
  const fin = en(filas, meta.fila.saldoFinal, meta.cab.col0 + 20)
  assert.equal(fin, `=IF(N($V$${meta.fila.saldoInicial})=0;"";N($V$${meta.fila.saldoInicial})+N($V$${meta.fila.resultado}))`)
  // Los FLUJOS de esa misma semana sí están: la historia del libro se muestra.
  assert.ok(en(filas, meta.fila.ingresoReal, meta.cab.col0 + 20).startsWith('=SUMPRODUCT('))
})

test('la cadena de saldos: cada semana encadena con el cierre de la anterior, y hay UN solo ancla', () => {
  const { filas, meta } = armar()
  const ini = (j) => en(filas, meta.fila.saldoInicial, meta.cab.col0 + j)
  // La primera columna no tiene anterior: su rama "encadena" es "" y no la celda de la izquierda —a la
  // izquierda está el rótulo, y N("Saldo inicial") daría 0 sin avisar.
  assert.ok(ini(0).endsWith(';""))'), ini(0).slice(-40))
  for (let j = 1; j < meta.cab.n; j++) {
    const col = letra(meta.cab.col0 + j - 1)
    assert.ok(ini(j).endsWith(`;IF(N($${col}$${meta.fila.saldoFinal})=0;"";$${col}$${meta.fila.saldoFinal})))`),
      `la semana ${j + 1} no encadena con el cierre de la anterior: es el defecto que dejó cinco semanas con el mismo saldo`)
  }
  // Y el ancla sale del saldo declarado en TODAS, porque cuál es el ancla lo decide la fórmula. Lo que
  // no puede pasar es que la rama de encadenado se pegue al saldo declarado.
  for (let j = 1; j < meta.cab.n; j++) {
    const rama = ini(j).split(';IF(N($').pop()
    assert.ok(!rama.includes('CAJA_TOTAL_DISPONIBLE'),
      `la semana ${j + 1} se vuelve a pegar al saldo declarado: eso rompe la cadena sin dar ningún error`)
  }
})

test('el ancla no cuenta dos veces lo que ya está adentro del saldo declarado, ni pierde lo que pasó después', () => {
  const { filas, meta } = armar()
  const f = en(filas, meta.fila.saldoInicial, meta.cab.col0)
  assert.ok(f.includes('CAJA_FECHA_SALDO+1'), 'las dos ventanas se cortan en el día siguiente al corte')
  assert.ok(f.includes('"REAL"'), 'sólo lo REAL puede ajustar el saldo de hoy: un proyectado vencido no es plata en la cuenta')
  // Lo vivido dentro de la semana se RESTA y lo posterior al corte se SUMA: es el contrato de
  // `expresionInicioCorrido`, el mismo que verifica el control A5 del anexo de CAJA.
  assert.match(f, /N\(CAJA_TOTAL_DISPONIBLE\)-\(SUMPRODUCT\(.+\)\)\+\(SUMPRODUCT\(.+\)\)/)
})

test('la identidad de cada columna: resultado = entra − sale, saldo final = inicial + resultado', () => {
  const { filas, meta } = armar()
  const c = meta.cab.col0 + 3 // la cuarta semana, para no probar sólo el borde
  const L = letra(c)
  const f = meta.fila
  assert.equal(en(filas, f.resultado, c),
    `=N($${L}$${f.ingresoReal})+N($${L}$${f.ingresoProyectado})-N($${L}$${f.egresoReal})-N($${L}$${f.egresoProyectado})`)
  assert.equal(en(filas, f.saldoFinal, c),
    `=IF(N($${L}$${f.saldoInicial})=0;"";N($${L}$${f.saldoInicial})+N($${L}$${f.resultado}))`)
})

test('LA APERTURA POR RUBRO en la pestaña: cada subtotal trae sus rubros y su "Otros" despejado', () => {
  const { filas, meta } = armar()
  const c = meta.cab.col0
  for (const b of meta.bloques) {
    const sub = en(filas, b.subtotal, c)
    assert.ok(sub.startsWith('=SUMPRODUCT('), `${b.clave}: el subtotal tiene que salir del libro`)
    assert.ok(!sub.includes('SUM($B$'), `${b.clave}: el subtotal NO puede ser la suma de sus sub-líneas`)
    for (const r of b.rubros) {
      const f = en(filas, r.fila, c)
      assert.ok(f.includes(`="${r.rubro}"`), `${r.rubro} no filtra por su nombre exacto: ${f.slice(0, 80)}`)
      assert.equal(en(filas, r.fila, 0), `    · ${r.rubro}`)
    }
    // "Otros" = subtotal − las sub-líneas listadas. Un rubro nuevo del Libro cae ahí y SE VE.
    assert.equal(en(filas, b.otros, c), `=N($B$${b.subtotal})-SUM($B$${b.primeraSub}:$B$${b.otros - 1})`)
    assert.equal(en(filas, b.otros, 0), '    · Otros')
  }
})

test('la columna TOTAL suma los flujos y NO suma los saldos: 53 stocks sumados no son un stock', () => {
  const { filas, meta } = armar()
  const T = meta.cab.colTotal
  const ultima = letra(meta.cab.col0 + meta.cab.n - 1)
  for (const cc of conceptosDe('semana')) {
    const v = en(filas, meta.fila[cc.clave], T)
    if (cc.total) {
      assert.ok(v.startsWith('=SUM($B$') && v.includes(`:$${ultima}$${meta.fila[cc.clave]}`), `${cc.rotulo}: ${v}`)
    } else assert.equal(v, '', `${cc.rotulo} no se puede totalizar`)
  }
  assert.equal(ultima, 'BB', 'con 53 semanas la matriz llega a BB, y String.fromCharCode(65+i) miente pasada la Z')
})

test('cero números pegados: toda celda de plata es fórmula', () => {
  const { filas, meta } = armar()
  const pegados = []
  for (const cc of conceptosDe('semana')) {
    for (let c = meta.cab.col0; c <= meta.cab.colTotal; c++) {
      const v = (filas[meta.fila[cc.clave] - 1] || [])[c]
      if (v === undefined || v === '') continue
      if (typeof v === 'number' || !String(v).startsWith('=')) pegados.push(`${cc.rotulo} col ${c + 1}: ${v}`)
    }
  }
  assert.deepEqual(pegados, [], 'un número pegado no se puede auditar y deja de actualizarse en silencio')
  // Y el hero también: las cuatro cifras son fórmula o glosa, ninguna es un número escrito.
  for (const s of meta.hero.slots) {
    const v = en(filas, meta.hero.valor, s)
    assert.ok(v.startsWith('='), `la cifra del hero en la columna ${s + 1} no es fórmula: ${v}`)
  }
})

test('el hero: el mayor pago y el mayor cobro llevan el MISMO filtro de estados que la medida que representan', () => {
  const { filas, meta } = armar()
  const [, , s3, s4] = meta.hero.slots
  for (const s of [s3, s4]) {
    const imp = en(filas, meta.hero.valor, s)
    // LA GLOSA BAJÓ A SU PROPIA FILA (28/08): estaba en la celda de al lado y le comía el ancho al
    // importe. La contraparte sigue colgando del MISMO slot, una fila abajo.
    const quien = en(filas, meta.hero.nota, s)
    for (const e of ESTADOS_PENDIENTES) {
      assert.ok(imp.includes(`="${e}"`), `el importe del hero no filtra ${e}: mostraría un pago YA hecho como si viniera`)
      assert.ok(quien.includes(`="${e}"`), `la contraparte del hero no filtra ${e}: contradice al importe de al lado`)
    }
    assert.ok(!imp.includes('"REAL"'), 'lo que "viene" no puede incluir lo ya movido')
  }
  assert.equal(en(filas, meta.hero.rotulo, s3), 'MAYOR PAGO · PRÓXIMOS 7 DÍAS')
})

test('el hero lee el propio cuadro: el piso sale de la fila de saldo final, no de otro cálculo', () => {
  const { filas, meta } = armar()
  const ultima = letra(meta.cab.col0 + meta.cab.n - 1)
  const piso = en(filas, meta.hero.valor, meta.hero.slots[1])
  assert.equal(piso, `=MIN($B$${meta.fila.saldoFinal}:$${ultima}$${meta.fila.saldoFinal})`)
  const cuando = en(filas, meta.hero.nota, meta.hero.slots[1])
  // INDEX con la FILA explícita: sobre un rango de una sola fila, INDEX(rango;n) es "la fila n" y da #REF!.
  assert.ok(cuando.includes(`INDEX($B$${meta.cab.fila}:$${ultima}$${meta.cab.fila};1;MATCH(`), cuando)
})

test('es-AR: ninguna fórmula usa la coma como separador de argumentos', () => {
  const { filas } = armar()
  const malas = []
  filas.forEach((f, i) => (f || []).forEach((c, j) => {
    const s = String(c ?? '')
    if (s.startsWith('=') && fueraDeComillas(s).includes(',')) malas.push(`fila ${i + 1} col ${j + 1}`)
  }))
  assert.deepEqual(malas, [], 'una coma de separador en un archivo es_AR hace que Sheets rechace la fórmula entera')
})

test('ninguna fórmula derrama: un ARRAYFORMULA suelto se rompe con #REF! cuando el generador reescribe', () => {
  const { filas } = armar()
  const derraman = []
  filas.forEach((f, i) => (f || []).forEach((c, j) => {
    const s = String(c ?? '')
    if (!s.startsWith('=')) return
    if (/\bARRAYFORMULA\(/.test(s)) derraman.push(`fila ${i + 1} col ${j + 1}: ARRAYFORMULA`)
    if (/^=\s*(FILTER|SORTN|QUERY)\(/.test(s)) derraman.push(`fila ${i + 1} col ${j + 1}: ${s.slice(1, 12)}`)
  }))
  assert.deepEqual(derraman, [])
})

test('todo importe sale del libro o de una celda de la propia vista', () => {
  const { filas } = armar()
  const otras = new Set()
  for (const f of filas) {
    for (const c of f || []) {
      const s = String(c ?? '')
      if (!s.startsWith('=')) continue
      for (const m of s.matchAll(/(?:'([^']+)'|\b([A-Za-z_][\w ]*))!/g)) {
        const pest = m[1] ?? m[2]
        if (pest !== '_MOVIMIENTOS') otras.add(pest)
      }
    }
  }
  assert.deepEqual([...otras], [], 'la matriz semanal sólo puede leer el libro de movimientos')
})

test('el patrón de la pestaña se cumple, salvo la única excepción declarada: una matriz no tiene secciones', () => {
  const { filas } = armar()
  // Se audita como se VE: las fórmulas evalúan a un número, así que se reemplazan por uno.
  const render = filas.map((f) => (f || []).map((c) => (typeof c === 'string' && c.startsWith('=') ? 0 : c)))
  const malos = auditarPatron(render, { ancho: footprintDe('semana', ANIO).cols })
  // La gramática de `patron-pestana` está escrita para pestañas de statement (hero + secciones
  // numeradas). Una matriz ES una sola tabla: numerarla "1 · LA MATRIZ" sería ruido, y el dueño pidió
  // explícitamente que después del cuadro no haya nada más. Se declara acá, no se silencia: si
  // aparece CUALQUIER otro hallazgo, este test se pone rojo.
  assert.deepEqual(malos.map((m) => m.regla), ['sin-secciones'], JSON.stringify(malos))
})

test('el vínculo "hoy" apunta a la columna de la semana corriente, y sin gid no se inventa uno', () => {
  const { meta } = armar()
  assert.equal(vinculoHoy(null, meta), null, 'sin el gid de la pestaña no hay vínculo, no un vínculo a ningún lado')
  const v = vinculoHoy(1234, meta)
  // ═══ LA URL ENTERA, NO EL FRAGMENTO SUELTO (13/08/2026) ═══
  //
  // Acá se exigía `=HYPERLINK("#gid=1234…` — el fragmento a secas. Google no navega con eso: contesta
  // "no se puede abrir el vínculo porque se borró el rango vinculado". El test fijaba el defecto, así
  // que el atajo que el dueño usa para llegar a la semana actual no hacía nada al hacer clic y ningún
  // control lo veía. Sale de `URL_ARCHIVO()`, que es donde vive el id del archivo.
  assert.ok(v.startsWith('=HYPERLINK("https://docs.google.com/spreadsheets/d/'), v)
  assert.ok(v.includes('/edit#gid=1234&range="&ADDRESS('), v)
  assert.ok(v.includes('TODAY()-WEEKDAY(TODAY();3)'), 'el lunes de hoy se calcula igual que los encabezados')
  // ═══ EL RÓTULO DEJÓ DE PROMETER UN BOTÓN (13/08/2026) ═══
  //
  // Acá se exigía `;"⏵  IR A LA SEMANA ACTUAL")`. El dueño lo reportó roto y un navegador real lo
  // midió: el destino estaba BIEN (AH7) y el gesto no existía —hacen falta tres clics, y el doble clic
  // abre el modo edición—. El rótulo ahora DICE dónde está la semana actual, calculado en la hoja, y
  // sirve aunque nadie haga clic. El prefijo va literal: por ahí parte la fórmula el control.
  assert.ok(v.includes(';"Semana actual: "&'), v)
  assert.ok(v.endsWith('"d/mm"))'), v)
  assert.ok(!v.includes('⏵'), 'el ícono de botón se fue con la promesa que no se podía cumplir')
  assert.ok(!v.includes('IFERROR'), 'un cuadro vencido tiene que gritar #N/A, no llevar a una celda cualquiera')
})

test('sin los rangos con nombre de CAJA, el ancla va VACÍA en vez de apuntar a una celda inventada', () => {
  const { filas, meta } = grillaSemanal({ hoy: HOY, anio: ANIO, refs: {} })
  assert.equal(en(filas, meta.fila.saldoInicial, meta.cab.col0), '')
  assert.equal(en(filas, meta.hero.valor, 0), '')
  assert.match(en(filas, meta.hero.nota, 0), /Falta el saldo declarado/)
})

test('después de la sección POR CLIENTE no hay NADA: nada se cuela sin que el dueño lo pida', () => {
  const { filas, meta } = armar()
  // EL CONTRATO CAMBIÓ EL 06/08 y por un pedido explícito ("discriminame a cada uno de los clientes
  // con su monto de ingresos y de egresos reales y proyectados"), no por goteo. La regla sigue siendo
  // la misma: la última fila escrita es la última fila que el dueño pidió, y después no va nada.
  const ultima = meta.clientes.bloques[meta.clientes.bloques.length - 1].ultima
  assert.equal(meta.filaFin, ultima)
  assert.equal(filas.length, ultima)
  assert.ok(meta.clientes.titulo > meta.fila.saldoFinal, 'la sección va DESPUÉS del saldo final')
  // 79 filas de cuadro: 7 del tronco + 36 de la apertura por rubro + 36 de la sección POR CLIENTE
  // (1 título + 7 bloques de 5). La zona de gráficos está en el footprint pero no lleva contenido.
  // Eran 36 de apertura: el 06/08 se dejó de emitir "Ingresos reales · Valores en cartera", que valía
  // cero en las 53 columnas porque el valor acreditado entra al libro como "Cobranzas"; el 13/08 entró
  // "Egresos proyectados · Materiales de obra proyectados", que hasta ese día caía en "· Otros".
  assert.equal(conceptosDe('semana').length, 79)
})
