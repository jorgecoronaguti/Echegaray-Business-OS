// EL CUADRO 4 DE `OBRAS`, EJERCIDO: las fórmulas que se publican, EVALUADAS sobre una Compras.
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE (14/08/2026) ═══
//
// El dueño, textual: *"el cuadro 4 en obras costo esta mal, hay gastos en pestaña compras q si se han
// hecho para las obras señaladas"*. `Pagado (real)` publicaba $0 en las siete obras con $74.774.766
// imputados a esos tres clientes en Compras.
//
// Y LOS TESTS ESTABAN VERDES. Los de `obras-grilla.test.mjs` comparan el texto de la fórmula contra el
// texto esperado —las dos puntas del mismo lado—, así que confirmaban con entusiasmo un SUMIFS que no
// podía encontrar nada: nunca preguntaron cuánto DA. Una fórmula sintácticamente perfecta que filtra
// por un proveedor inexistente devuelve cero sin un solo error, y eso es indistinguible de un cero
// verdadero mirando el texto.
//
// ACÁ SE PREGUNTA CUÁNTO DA. Se arma una Compras con la forma EXACTA del archivo real —el proveedor
// que no está en la explosión, la compra anterior al inicio, el gasto del cliente sin obra— y se
// evalúan las celdas publicadas con el evaluador en frío del repo. Si alguien repone cualquiera de
// los tres filtros que producían el cero, esto se pone rojo con el número en la mano.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  grillaObras, serialISO, REFS_OBRAS, conColaLimpiable, ANCHO_HISTORICO, ALTO_HISTORICO,
} from './obras-grilla.mjs'
import { OBRAS_FUTURAS, comprasObraDe, totalEgresos } from './obras-datos.mjs'
import { evaluarFormula, hojaDeGrilla } from './evaluar-formula-sheet.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

const { cmp } = REFS_OBRAS
const iCol = (letra) => letra.charCodeAt(0) - 65

/**
 * UNA PESTAÑA `Compras` CON LA FORMA DEL ARCHIVO REAL.
 *
 * Cada fila reproduce un caso concreto que se verificó el 14/08 contra las 1.136 filas vivas. Los
 * importes son los reales redondeados a la fila: el punto no es el monto, es CUÁL entra y cuál no.
 */
const FILAS_COMPRAS = [
  // ① EL PROVEEDOR NO ESTÁ EN LA EXPLOSIÓN Y LA COMPRA ES DE LA OBRA IGUAL. Los $4.200.000 de PISOS
  //   los facturó PEDRO TELLO; la explosión del dueño para esa obra declara ACA y VILLA DEL PINO. El
  //   emparejamiento por proveedor no podía verlo — y es el 100% del gasto real de esa obra.
  { fecha: '2026-08-08', proveedor: 'PEDRO TELLO', cliente: 'San Francisco', obra: 'Pisos Industriales', neto: 4_200_000 },
  // ② EL PROVEEDOR SÍ ESTÁ DECLARADO, PERO FACTURA A OTRO CLIENTE. VILLA DEL PINO tiene 19 filas en
  //   Compras y casi todas van a "Administracion". No es de ninguna obra y no puede entrar a ninguna.
  { fecha: '2026-07-20', proveedor: 'VILLA DEL PINO', cliente: 'Administracion', obra: 'combustible', neto: 900_000 },
  // ③ CLIENTE DE OBRA, PERO NINGUNA OBRA. Es el caso más común del archivo ($35,3M): el gasto está
  //   imputado al cliente y la columna "Detalles / Obra" no dice a cuál de sus obras va. NO se
  //   reparte, NO se adivina: se ve entero en la fila SIN IMPUTAR.
  { fecha: '2026-03-15', proveedor: 'Combustibles Barcelo', cliente: 'San Francisco', obra: 'combustible', neto: 1_000_000 },
  // ④ y ⑤ LA MISMA OBRA ESCRITA DE DOS MANERAS. En el archivo conviven "Planta de BSA", "Camion - BSA"
  //   y "Excavadora - BSA". Por eso el criterio va con comodín a los dos lados: con igualdad exacta
  //   se perdían dos de las tres formas.
  { fecha: '2026-07-31', proveedor: 'Alumetal', cliente: 'MESSINA', obra: 'Planta de BSA', neto: 5_000_000 },
  { fecha: '2026-07-31', proveedor: 'Combustibles Barcelo', cliente: 'MESSINA', obra: 'Camion - BSA', neto: 2_955_772 },
  // ⑥ COMPRADA ANTES DE ARRANCAR. La obra de Quattropani empieza el 18/08 y sus materiales se
  //   facturaron el 29/07. Es lo normal en construcción, y el corte `fecha >= inicio` lo tiraba entero.
  { fecha: '2026-07-29', proveedor: 'Alumetal', cliente: 'Quattropani - Melisa García SAS', obra: 'Salones Comerciales', neto: 27_358_960 },
  // ⑦ OTRO CLIENTE ENTERO. "Taller" no es cliente de ninguna obra: no entra a las obras NI al residuo.
  { fecha: '2026-06-12', proveedor: 'Gruas San Blas', cliente: 'Taller', obra: 'Alquiler', neto: 3_000_000 },
  // ⑧ FUERA DE LA VENTANA DEL AÑO. La pestaña declara 2026 en su subtítulo: una factura de 2025 del
  //   mismo cliente y con el texto de la obra no puede colarse en el año que el cuadro dice medir.
  { fecha: '2025-12-20', proveedor: 'Alumetal', cliente: 'MESSINA', obra: 'Planta de BSA', neto: 99_999_999 },
]

/** Las filas de arriba, en la grilla que el evaluador sabe leer: la columna de cada campo sale de
 *  `REFS_OBRAS.cmp`, así que si mañana se mueve una, el fixture se mueve con ella. */
function compras() {
  const filas = []
  for (let i = 0; i < cmp.desde - 1; i++) filas.push([]) // el encabezado real vive arriba de `desde`
  for (const f of FILAS_COMPRAS) {
    const fila = []
    fila[iCol(cmp.fecha)] = serialISO(f.fecha)
    fila[iCol(cmp.proveedor)] = f.proveedor
    fila[iCol(cmp.cliente)] = f.cliente
    fila[iCol(cmp.obra)] = f.obra
    fila[iCol(cmp.neto)] = f.neto
    filas.push(fila)
  }
  return hojaDeGrilla(filas)
}

const g = grillaObras({ obras: OBRAS_FUTURAS })
const hoja = hojaDeGrilla(g.filas)
const hojas = { Compras: compras() }
/** El valor PUBLICADO de una celda: no el texto de la fórmula, lo que la fórmula da. */
const val = (ref) => {
  const v = hoja[ref]
  return typeof v === 'string' && v.startsWith('=') ? evaluarFormula(v, { hoja, hojas }) : v
}
const comprado = (clave) => val(`D${g.filasCosto[OBRAS_FUTURAS.findIndex((o) => o.clave === clave)]}`)

// ─────────────────────────────────────────────────────────────────────────────
// EL DEFECTO QUE REPORTÓ EL DUEÑO
// ─────────────────────────────────────────────────────────────────────────────

test('EL CERO NO PUEDE VOLVER: con Compras cargada, el comprado de las 7 obras es > 0', () => {
  // ÉSTE ES EL TEST. Todo lo demás de este archivo explica POR QUÉ dio cero; esto afirma que no puede
  // volver a dar cero. Con cualquiera de los tres filtros viejos repuestos —proveedor, fecha de
  // inicio, o el MIN contra el proyectado— el total cae y esta línea se pone roja.
  const total = g.filasCosto.reduce((s, f) => s + val(`D${f}`), 0)
  assert.ok(total > 0, `las 7 obras suman $0 de comprado teniendo Compras cargada — es el defecto del 14/08`)
  assert.equal(total, 39_514_732)
  assert.equal(val(`D${g.fTotCosto}`), total, 'el cierre del cuadro suma exactamente las filas de obra')
})

test('el emparejamiento NO depende del proveedor: PISOS lo facturó uno que la explosión no nombra', () => {
  // $4.200.000 de PEDRO TELLO. La explosión de PISOS declara ACA ($377.740) y VILLA DEL PINO
  // ($977.760), ninguno de los dos aparece en la fila, y el gasto es de esa obra igual.
  assert.equal(comprado('sf-pisos-industriales'), 4_200_000)
  const declarados = (OBRAS_FUTURAS[0].egresos ?? []).map((e) => e.proveedor)
  assert.ok(!declarados.includes('PEDRO TELLO'), 'el fixture pierde sentido si el proveedor está declarado')
})

test('lo comprado ANTES de arrancar cuenta: en construcción se compra antes', () => {
  // El corte `fecha >= inicio` tiraba los $27.358.960 de Quattropani (facturados el 29/07, obra desde
  // el 18/08). Y en PLAYÓN, que empieza el 24/08, pedía facturas de un futuro que no existe.
  const o = OBRAS_FUTURAS.find((x) => x.clave === 'quattropani-salon-comercial')
  assert.ok(serialISO('2026-07-29') < serialISO(o.inicio), 'la compra del fixture tiene que ser ANTERIOR al inicio')
  assert.equal(comprado('quattropani-salon-comercial'), 27_358_960)
})

test('la obra escrita de varias formas es UNA obra: "Planta de BSA" + "Camion - BSA"', () => {
  assert.equal(comprado('messina-bsa'), 7_955_772)
})

test('lo comprado NO se recorta contra lo proyectado: BSA ya gastó casi 4× su proyección', () => {
  // El `MIN` de la versión anterior existía para que `Falta pagar` no diera negativo. Acá taparía el
  // dato más importante del cuadro: proyectado $2.108.281, comprado $7.955.772. Publicar $2.108.281
  // sería recortar un número para que la resta quede prolija — y decirle al dueño que va justa una
  // obra que se pasó. La resta negativa es la señal, no el error.
  const o = OBRAS_FUTURAS.find((x) => x.clave === 'messina-bsa')
  const f = g.filasCosto[OBRAS_FUTURAS.indexOf(o)]
  assert.ok(comprado('messina-bsa') > totalEgresos(o), 'el fixture tiene que exceder el proyectado')
  assert.equal(val(`D${f}`), 7_955_772, 'no se recortó al proyectado')
  assert.equal(val(`E${f}`), totalEgresos(o) - 7_955_772, 'y la resta publica el exceso, en negativo')
  assert.ok(val(`E${f}`) < 0)
})

test('la factura de 2025 no entra: la ventana es el año que la pestaña declara', () => {
  // Sin ventana, los $99.999.999 del fixture ⑧ —mismo cliente, mismo texto de obra, otro año— se
  // sumarían a BSA. La única razón por la que hoy no rompería contra el archivo vivo es que Compras
  // sólo tiene 2026, y "hoy no hay filas viejas" no es un control.
  assert.ok(!String(hoja[`D${g.filasCosto[5]}`]).includes('99999999'))
  assert.equal(comprado('messina-bsa'), 7_955_772, 'la fila de 2025 quedó afuera')
})

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE NO SE EMPAREJA SE VE — NO SE REPARTE
// ─────────────────────────────────────────────────────────────────────────────

test('las obras que ninguna compra nombra publican $0, y lo DECLARAN en la columna de al lado', () => {
  // Un cero acá no dice "no gastó": dice "ninguna compra la nombra". La diferencia la publica la F,
  // y sin ella el dueño no tendría cómo distinguir las dos cosas.
  for (const [i, o] of OBRAS_FUTURAS.entries()) {
    if (comprasObraDe(o)) continue
    assert.equal(val(`D${g.filasCosto[i]}`), 0, `${o.clave}: sin texto declarado no puede emparejar nada`)
    assert.match(String(hoja[`F${g.filasCosto[i]}`]), /ninguna compra la nombra/, `${o.clave}: no lo declara`)
  }
})

test('la columna F dice el TEXTO por el que emparejó: el dueño puede ir a Compras y filtrar por él', () => {
  for (const [i, o] of OBRAS_FUTURAS.entries()) {
    const patron = comprasObraDe(o)
    if (!patron) continue
    assert.equal(hoja[`F${g.filasCosto[i]}`], `Compras: "${patron}"`)
    // Y el texto declarado tiene que ser EL MISMO que la fórmula usa. Si divergieran, la pestaña
    // estaría diciendo que emparejó por un criterio y sumando por otro — mentira con firma.
    assert.ok(String(hoja[`D${g.filasCosto[i]}`]).includes(`"*${patron}*"`), `${o.clave}: la F no coincide con la D`)
  }
})

test('SIN IMPUTAR: obras + residuo = todo lo que Compras le imputó a estos clientes', () => {
  // EL CONTROL DE INTEGRIDAD DEL CUADRO. No hay forma de que un peso de estos clientes desaparezca:
  // o está en una obra, o está en esta fila. El $1.000.000 del fixture ③ —"combustible" de San
  // Francisco, sin obra— es exactamente el caso que el dueño tiene que ver y resolver en la fuente.
  assert.equal(val(`D${g.fSinImputar}`), 1_000_000)
  const clientes = [...new Set(OBRAS_FUTURAS.map((o) => o.cliente))]
  const enFuente = FILAS_COMPRAS
    .filter((f) => clientes.includes(f.cliente) && f.fecha.startsWith('2026'))
    .reduce((s, f) => s + f.neto, 0)
  assert.equal(val(`D${g.fTotCosto}`) + val(`D${g.fSinImputar}`), enFuente,
    'obras + sin imputar tiene que dar el total de estos clientes en Compras')
})

test('el gasto de un cliente AJENO no entra a ninguna obra ni al residuo', () => {
  // "Administracion" y "Taller" son asignaciones de Compras, no clientes de obra. Si el residuo los
  // absorbiera, la fila SIN IMPUTAR se llenaría de plata que no tiene nada que ver con estas obras y
  // dejaría de ser accionable — que es la única razón por la que existe.
  const ajeno = FILAS_COMPRAS.filter((f) => ['Administracion', 'Taller'].includes(f.cliente))
    .reduce((s, f) => s + f.neto, 0)
  assert.equal(ajeno, 3_900_000)
  const enElCuadro = g.filasCosto.reduce((s, f) => s + val(`D${f}`), 0) + val(`D${g.fSinImputar}`)
  assert.equal(enElCuadro, 40_514_732, 'los $3.900.000 ajenos quedaron afuera del cuadro entero')
})

test('dos obras del mismo cliente no pueden emparejar la misma compra', () => {
  // No es teórico: los patrones son comodines. Si una obra declarara "Pisos" y otra "Pisos
  // Industriales", la misma fila entraría a las dos y el cuadro sumaría el gasto dos veces —y encima
  // el residuo saldría NEGATIVO, que es la única señal que quedaría. Se prohíbe en el dato.
  const porCliente = new Map()
  for (const o of OBRAS_FUTURAS) {
    const p = comprasObraDe(o)
    if (!p) continue
    const otros = porCliente.get(o.cliente) ?? []
    for (const [clave, q] of otros) {
      const a = p.toLowerCase(); const b = q.toLowerCase()
      assert.ok(!a.includes(b) && !b.includes(a),
        `${o.clave} ("${p}") y ${clave} ("${q}") son del mismo cliente y uno contiene al otro: doble conteo`)
    }
    porCliente.set(o.cliente, [...otros, [o.clave, p]])
  }
})

test('el residuo no puede dar negativo: sería doble conteo, no un saldo', () => {
  assert.ok(val(`D${g.fSinImputar}`) >= 0,
    'SIN IMPUTAR negativo significa que las obras se llevaron más de lo que el cliente tiene en Compras')
})

test('el derrame de la F llega SÓLO al cuadro 4: en el cuadro 3 taparía el contratado', () => {
  // La F mide 138 px y el texto de auditoría mide hasta 221: el formateador la deja derramar sobre la
  // G/H/I, que en el cuadro 4 están vacías. En el cuadro 3 la G lleva el CONTRATADO — si `textoEnF`
  // arrastrara una fila de ese cuadro, un rótulo de texto se dibujaría encima de un importe.
  const cuadro3 = g.bloques.map((b) => b.fProt)
  // Se mira la grilla CON LA COLA, que es la que se escribe: ahí las celdas que el generador no usa
  // llevan el centinela VACIO, que la fusión convierte en una celda realmente vacía. VACIO no es
  // contenido — es la instrucción de limpiar—, así que cuenta como espacio libre para el derrame.
  const conCola = conColaLimpiable(g.filas, ANCHO_HISTORICO, ALTO_HISTORICO)
  const libre = (v) => v === undefined || v === '' || v === VACIO
  for (const f of g.textoEnF) {
    assert.ok(!cuadro3.includes(f), `la fila ${f} es del cuadro 3: no puede derramar sobre el contratado`)
    for (const c of ['G', 'H', 'I']) {
      assert.ok(libre(conCola[f - 1]?.[c.charCodeAt(0) - 65]), `${c}${f} tiene contenido: el derrame lo taparía`)
    }
  }
  // Y la contraprueba: en el cuadro 3 esas columnas SÍ tienen plata, que es lo que el derrame taparía
  // si alguien agregara una de sus filas a `textoEnF`.
  assert.ok(!libre(conCola[cuadro3[0] - 1]?.[6]), 'la G del cuadro 3 lleva el contratado')
  // Y cubre lo que tiene que cubrir: encabezado, las siete obras y el residuo.
  assert.deepEqual(g.textoEnF, [g.filasCosto[0] - 1, ...g.filasCosto, g.fSinImputar])
})
