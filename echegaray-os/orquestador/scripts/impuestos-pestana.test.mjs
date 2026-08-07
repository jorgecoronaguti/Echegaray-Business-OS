// LAS LÍNEAS DEL CASH FLOW DE LAS QUE CUELGA LA PROYECCIÓN DE IVA.
//
// Por qué esto merece test propio: si el rótulo no se encuentra, la alternativa silenciosa es
// escribir una referencia a una fila que no existe, que devuelve 0 sin dar error — y el cuadro
// vuelve a mostrar $0 de IVA hasta diciembre, que es exactamente el defecto que se vino a arreglar.
// La columna A de acá es la real del Sheet al 04/08/2026, con sus sangrías y su guion largo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ubicarLineas, sinSolapamiento, grilla } from './impuestos-pestana.mjs'
import { CALENDARIO_IMPUESTOS } from '../lib/cash-flow-lineas.mjs'
import { contratoDeRotulos } from '../lib/iva-libre-disponibilidad.mjs'
import { auditarPatron } from '../lib/patron-pestana.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'

const FUENTE = readFileSync(new URL('./impuestos-pestana.mjs', import.meta.url), 'utf8')
// EL CANARIO SE MUDA CON EL CÓDIGO (06/08). La reconstrucción partió el generador de 1.253 líneas:
// el centinela AJENO vive ahora en `lib/impuestos-grilla.mjs` y las cuatro filas del bloque de IVA en
// `lib/impuestos-bloques.mjs`. Un canario que se queda apuntando al archivo viejo deja de vigilar sin
// avisar — es el mismo movimiento que `rotulos-de-frescura.test.mjs` hace con su lista CONVERTIDAS.
const GRILLA = readFileSync(new URL('../lib/impuestos-grilla.mjs', import.meta.url), 'utf8')
const BLOQUES = readFileSync(new URL('../lib/impuestos-bloques.mjs', import.meta.url), 'utf8')

/** La columna A del "Cash Flow Mensual" real, con las filas que importan en su posición real. */
function colaAReal() {
  const a = Array.from({ length: 55 }, () => [''])
  a[5] = ['Cobros por ventas y servicios (ya cobrado)']
  a[9] = ['Cobranzas esperadas — de este mes en adelante (proyección, suma al flujo)']
  a[13] = ['(–) Pagos al personal y cargas sociales']
  a[22] = ['(–) Pagos a proveedores de obra']
  a[23] = ['    Materiales e insumos de obra civil']
  a[24] = ['    Materiales de mantenimiento']
  a[25] = ['    Cheques sin factura cargada']
  a[26] = ['    Cuotas de tarjeta sin factura cargada']
  a[28] = ['    Gastos de estructura y administración']
  a[29] = ['    Servicios recurrentes']
  return a
}

test('importar el generador NO lo ejecuta contra el Sheet real', async () => {
  // El defecto que atrapa: este archivo llamaba a main() en el tope, sin la guarda de entrypoint que
  // el resto de los generadores tiene. Importarlo —por ejemplo, para probar una función pura como
  // ubicarLineas— corría la pestaña entera contra el archivo de producción. La primera corrida de
  // este test lo hizo: sólo el freno de mano evitó la escritura, y el freno es una red que puede no
  // estar puesta. Si alguien saca la guarda, este test se cuelga o falla en vez de escribir el Sheet.
  const mod = await import('./impuestos-pestana.mjs')
  assert.equal(typeof mod.ubicarLineas, 'function')
  // Que el import haya terminado sin pedir credenciales ni tocar la red ya es la prueba: si main()
  // corriera, el import no resolvería hasta terminar de leer y escribir el Sheet.
})

test('un mes con dato en la hoja pero sin DDJJ se PRESERVA, no se vacía', () => {
  // El defecto que atrapa: la columna de julio del bloque de IVA la escribió una persona (débito,
  // crédito, libre disponibilidad y "⚠ PROYECCIÓN — DDJJ vence 20/08") y en Drive no hay F.2051 de
  // julio. Sin esto el generador le escribía VACIO —"es mi celda y va vacía"— y se la borraba; y
  // como julio es el mes que ancla la proyección, además la falseaba (arrancaría de los $19,3M de
  // junio en vez de los $7,05M de julio, y el cuadro diría que el saldo aguanta todo el año).
  // Las cuatro filas mensuales del bloque tienen que resolver por `ofOAjeno`, nunca por `of`.
  assert.match(GRILLA, /export const AJENO = /, 'tiene que existir el centinela de "no es mi celda"')
  assert.match(GRILLA, /x === AJENO \? ''/, 'push tiene que traducir AJENO a cadena vacía, que es lo que fusionar() preserva')
  // Y `fijar()` —el que escribe la posición sobre el espacio reservado— tiene que traducirlo igual:
  // si sólo lo hiciera `push`, una celda ajena en el área del hero se borraría por la otra puerta.
  assert.equal((GRILLA.match(/x === AJENO \? ''/g) ?? []).length, 2,
    'push Y fijar tienen que respetar el centinela: son las dos puertas por las que se escribe')
  for (const campo of ['debito', 'credito', 'a_pagar_efectivo', 'libre_disp']) {
    assert.match(BLOQUES, new RegExp(`ofOAjeno\\(m, '${campo}'\\)`), `la fila "${campo}" tiene que preservar el mes ajeno`)
    assert.equal(BLOQUES.includes(`: of(m, '${campo}')`), false,
      `la fila "${campo}" sigue usando of(), que vacía el mes que escribió una persona`)
  }
})

test('el generador NO usa IFERROR para tapar una fuente que no resuelve', () => {
  // LA ORDEN DEL DUEÑO (06/08): "no usar IFERROR para esconder". El cuadro tenía 33: seis en el
  // bloque de IIBB, doce en Anticipo de Ganancias y quince en los planes. Un plan renombrado en
  // Compras, o una columna movida, daba $0 en vez de un error — el modo de falla exacto que el resto
  // del repo persigue, tolerado justo donde se decide un pago.
  //
  // Sobrevive UNO solo, y con motivo declarado: el INDEX+MATCH de _IIBB_RAW busca un período que
  // puede no estar en la réplica todavía (la DDJJ se sube cuando se presenta), y ahí el 0 es la
  // respuesta correcta —no hay DDJJ de ese mes—, no un error escondido.
  const conIferror = (BLOQUES.match(/IFERROR\(/g) ?? []).length
  assert.equal(conIferror, 1, 'sólo el MATCH de _IIBB_RAW puede llevar IFERROR, y está declarado')
  assert.ok(!/IFERROR\(SUMIFS/.test(BLOQUES), 'un SUMIFS que no resuelve tiene que romperse a la vista, no valer $0')
})

test('el prendario NO puede volver a salir del extracto en ningún archivo del generador', () => {
  // El defecto A costaba $6,4M de salida financiera inventada. Si alguien "restaura" la fórmula
  // vieja en cualquiera de las tres piezas, este test se pone rojo.
  for (const [nombre, src] of [['el script', FUENTE], ['los bloques', BLOQUES], ['la grilla', GRILLA]]) {
    assert.ok(!/Préstamo prendario/.test(src), `${nombre}: la cuota del prendario no sale de la naturaleza bancaria`)
    assert.ok(!/SUMIF\('?_BANCO_RAW/.test(src), `${nombre}: un SUMIF sobre el extracto entero no es una cuota`)
  }
})

test('ubica las líneas por rótulo y devuelve la fila real del Sheet', () => {
  const a = colaAReal()
  assert.deepEqual(ubicarLineas(a, [
    'Cobros por ventas y servicios (ya cobrado)',
    'Cobranzas esperadas — de este mes en adelante (proyección, suma al flujo)',
  ]), [6, 10])
  assert.deepEqual(ubicarLineas(a, [
    'Materiales e insumos de obra civil',
    'Materiales de mantenimiento',
    'Gastos de estructura y administración',
    'Servicios recurrentes',
  ]), [24, 25, 29, 30])
})

test('la sangría del cash flow no impide encontrar la línea', () => {
  // Los rótulos hijos llevan cuatro espacios adelante; el buscado no los lleva.
  assert.deepEqual(ubicarLineas(colaAReal(), ['Servicios recurrentes']), [30])
})

test('un rótulo que no está ROMPE — nunca devuelve una fila inventada ni un cero', () => {
  assert.throws(
    () => ubicarLineas(colaAReal(), ['Cobranzas de Marte']),
    /no encuentro.*Cobranzas de Marte/s,
  )
  // Y nombra TODOS los que faltan, no sólo el primero: si el cash flow cambió de forma, hace falta
  // ver la lista entera de una vez.
  assert.throws(
    () => ubicarLineas(colaAReal(), ['Cobranzas de Marte', 'Servicios recurrentes', 'Otra que no está']),
    /Cobranzas de Marte · Otra que no está/,
  )
})

test('las líneas SIN FACTURA quedan deliberadamente fuera del crédito fiscal', () => {
  // No hay crédito fiscal sin comprobante. Si alguien las agrega a LINEAS_CREDITO, el crédito se
  // infla y hace desaparecer un pago de IVA que sí va a ocurrir. Este test fija la intención: las
  // filas existen en el cuadro (25 y 26 de la grilla base) y NO son las que la proyección usa.
  const a = colaAReal()
  const sinFactura = ubicarLineas(a, ['Cheques sin factura cargada', 'Cuotas de tarjeta sin factura cargada'])
  const credito = ubicarLineas(a, [
    'Materiales e insumos de obra civil', 'Materiales de mantenimiento',
    'Gastos de estructura y administración', 'Servicios recurrentes',
  ])
  for (const f of sinFactura) assert.equal(credito.includes(f), false, `la fila ${f} no tiene factura: no da crédito fiscal`)
})

// ── EL DOBLE CONTEO ──────────────────────────────────────────────────────────────────────────────
//
// El cuadro tiene totales sin sangría y sus componentes indentados debajo. Sumar un total Y alguno de
// sus componentes cuenta esa plata dos veces, y el resultado sigue pareciendo un importe razonable —
// no hay #ERROR, no hay negativo imposible, sólo una carga fiscal inflada. Sobre agosto:
// fila 10 ($151.317.518) + fila 11, su único componente con dato, daría $302,6M de base y $52,5M de
// débito donde corresponden $29,8M. La única defensa es que el generador se niegue a armar la base.

test('un TOTAL y uno de sus COMPONENTES no pueden estar los dos en la base', () => {
  const a = colaAReal()
  // fila 10 es el total y la 11 su componente: la base no puede llevar las dos.
  a[10] = ['    Esperado · obra civil']
  assert.throws(
    () => sinSolapamiento(a, [10, 11]),
    /doble conteo|componente/i,
    'sumar la fila 10 y su hija 11 duplica $151M y nadie se entera',
  )
})

test('dos componentes del mismo total sí pueden estar juntos', () => {
  // 24 y 25 son hermanos bajo el total 23: sumarlos no duplica nada, y es justo lo que hace falta
  // para dejar afuera los cheques y la tarjeta sin factura.
  assert.deepEqual(sinSolapamiento(colaAReal(), [24, 25, 29, 30]), [24, 25, 29, 30])
})

test('dos totales sin parentesco entre sí pasan', () => {
  assert.deepEqual(sinSolapamiento(colaAReal(), [6, 10]), [6, 10])
})

test('LA BASE REAL de hoy no tiene solapamiento — ni el débito ni el crédito', () => {
  // Es el chequeo que descarta la hipótesis de doble conteo sobre la estructura real de la pestaña.
  const a = colaAReal()
  const deb = ubicarLineas(a, [
    'Cobros por ventas y servicios (ya cobrado)',
    'Cobranzas esperadas — de este mes en adelante (proyección, suma al flujo)',
  ])
  const cre = ubicarLineas(a, [
    'Materiales e insumos de obra civil', 'Materiales de mantenimiento',
    'Gastos de estructura y administración', 'Servicios recurrentes',
  ])
  assert.deepEqual(sinSolapamiento(a, deb), [6, 10])
  assert.deepEqual(sinSolapamiento(a, cre), [24, 25, 29, 30])
})

test('el subtotal "(–) Pagos a proveedores de obra" NO se usa como base de crédito', () => {
  // Usar el subtotal metería adentro los cheques y la tarjeta sin factura por la puerta de atrás.
  const a = colaAReal()
  const [subtotal] = ubicarLineas(a, ['(–) Pagos a proveedores de obra'])
  const credito = ubicarLineas(a, [
    'Materiales e insumos de obra civil', 'Materiales de mantenimiento',
    'Gastos de estructura y administración', 'Servicios recurrentes',
  ])
  assert.equal(credito.includes(subtotal), false)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA GRILLA ENTERA, EN FRÍO — sin Google, sin Postgres, sin una sola escritura
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const C = { total: 'O', concepto: 'L', fecha: 'AD', rubro: 'AB', fechaPrev: 'Q', detalle: 'K' }
const HOY = '2026-08-06'
const armar = (extra = {}) => grilla({
  anio: 2026,
  C,
  hoy: HOY,
  iibb: [1, 2, 3, 4, 5, 6].map((m) => ({ periodo: `2026-0${m}` })),
  ivaOficial: [1, 2, 3, 4, 5, 6].map((m) => ({
    periodo: `2026-0${m}`, debito: 1, credito: 1, a_pagar_efectivo: 0, libre_disp: 1e6,
    fecha_presentacion: '19/02/2026', nro_transaccion: '1',
  })),
  planes: [
    { nombre: 'Plan F931 W303094', patron: 'W303094', campo: 'concepto', cuotas: 3, total: 7484628, monto_cuota: 2494876, porMes: [0, 0, 0, 0, 0, 0, 0, 0, 2494876, 2494876, 2494876, 0, 0] },
    { nombre: 'Deuda previsional F931 Enero 2026', patron: '931 Enero 26', campo: 'detalle', cuotas: 6, total: 2842602, monto_cuota: 473767, porMes: [0, 0, 0, 473767, 473767, 473767, 473767, 473767, 473767, 0, 0, 0, 0] },
  ],
  proy: {
    meses: [8, 9, 10, 11, 12], ultimoMesConDato: 7, libreDisp: 7050036, alicuotaVigente: 0.21,
    brutoDebito: (m) => [`BRUTO_DEB_${m}`], brutoCredito: (m) => [`BRUTO_CRE_${m}`], supuesto: 'el supuesto',
  },
  ...extra,
})

/** La pestaña como la ve `main()`: valores renderizados y la columna de prosa ya vaciada. */
const comoSeVe = (g) => g.filas.map((f) => f.map((c, j) => {
  if (j === 14 || c === VACIO) return ''
  return typeof c === 'string' && c.startsWith('=') ? 1234 : c
}))

const rotulos = (g) => g.filas.map((f) => String(f[0] ?? '').trim())
const filaDe = (g, re) => rotulos(g).findIndex((r) => re.test(r)) + 1

test('LOS DOS RÓTULOS DEL CONTRATO están, una sola vez, y con el texto exacto', () => {
  // Cinco consumidores los ubican POR TEXTO (`caja-refs`, `libro-movimientos-pestana`,
  // `cash-flow-rehacer`, `conciliar-caja-vs-cashflow`, `cash-flow-mapa`). Un rótulo cambiado deja el
  // IVA/IIBB a pagar en $0 y el piso de caja sube sin que se haya pagado nada; uno DUPLICADO es peor,
  // porque los cinco usan findIndex y se quedarían con la primera aparición sin dar error.
  const g = armar()
  const r = contratoDeRotulos(g.filas, CALENDARIO_IMPUESTOS.rotulos)
  assert.ok(r.ok, r.motivo)
  assert.equal(rotulos(g).filter((x) => x === CALENDARIO_IMPUESTOS.rotulos.iva).length, 1)
  assert.equal(rotulos(g).filter((x) => x === CALENDARIO_IMPUESTOS.rotulos.iibb).length, 1)
  assert.equal(r.destino.iva, g.filasCalendario.iva)
  assert.equal(r.destino.iibb, g.filasCalendario.iibb)
})

test('LA POSICIÓN VA PRIMERO: hero, riesgo, calendario y financiamiento ARRIBA del detalle', () => {
  // La orden del dueño: "la pantalla muestra PRIMERO posición, vencimientos, riesgo y proyección;
  // después el detalle técnico". Y entre esos cuatro, el AGREGADO antes que su detalle: el calendario
  // línea por línea es el respaldo del cuadro de 30/60/90, no la portada.
  const g = armar()
  const hero = filaDe(g, /^LA POSICIÓN AL/)
  const riesgo = filaDe(g, /^1 · RIESGO Y PROYECCIÓN/)
  const calend = filaDe(g, /^2 · CALENDARIO DE VENCIMIENTOS/)
  const financ = filaDe(g, /^3 · FINANCIAMIENTO/)
  const detalle = filaDe(g, /^4 · IVA — LA DDJJ OFICIAL/)
  assert.ok(hero > 0 && riesgo > hero && calend > riesgo && financ > calend && detalle > financ,
    `orden real: hero ${hero}, riesgo ${riesgo}, calendario ${calend}, financiamiento ${financ}, detalle ${detalle}`)
  assert.ok(g.filasCalendario.iva > financ, 'el IVA a pagar es detalle: va abajo')
  // Y la posición queda congelada ENTERA, o se va al scrollear y no sirve de nada. El número sale
  // del hero: con un 12 tipeado, un renglón más arriba dejaba el último sub-ítem fuera del congelado.
  assert.ok(g.congeladas >= g.hero.hasta, `congela ${g.congeladas} filas y el hero llega hasta la ${g.hero.hasta}`)
  assert.ok(g.congeladas < riesgo, 'congelar el detalle además de la posición se come media pantalla')
})

test('el TITULAR que la piel agranda es la fila que decide, y el hero se declara entero', () => {
  // La piel no adivina cuál es el número grande: lo recibe. Si el hero se reordena y `titular` se
  // queda quieto, el que crece es el renglón de al lado — y la pestaña entera pasa a gritar otra cosa
  // sin un solo error. Acá se prueba el EFECTO: qué dice la fila que se va a agrandar.
  const g = armar()
  assert.match(String(g.filas[g.titular - 1][0]), /A PAGAR EN LOS PRÓXIMOS 30 DÍAS/)
  assert.ok(String(g.filas[g.titular - 1][1]).startsWith('='), 'el titular es una referencia, no un pegado')
  // Y el rango del hero contiene al titular y a los tres totales, sin desbordar al riesgo.
  assert.ok(g.hero.desde <= g.titular && g.titular <= g.hero.hasta)
  assert.equal(String(g.filas[g.hero.desde - 1][0]).startsWith('LA POSICIÓN AL'), true)
  assert.ok(g.hero.hasta < filaDe(g, /^1 · RIESGO Y PROYECCIÓN/), 'el hero termina antes de la sección 1')
})

test('la pestaña cumple su propia gramática — cero defectos de patrón', () => {
  assert.deepEqual(auditarPatron(comoSeVe(armar())), [])
})

test('el parámetro de alícuota queda ABAJO DE TODO: ninguna fila nueva lo corre', () => {
  // El rango con nombre ALICUOTA_IVA apunta a esa celda. Una fila insertada arriba lo reapunta a
  // otra cosa, y toda la proyección de IVA se calcularía con alícuota cero.
  const g = armar()
  assert.equal(g.filaAlicuotaIva, g.filas.length, 'la alícuota es la última fila de la pestaña')
  assert.equal(g.filas[g.filaAlicuotaIva - 1][0], 'Alícuota general de IVA')
})

test('IIBB PROYECTA de julio en adelante: seis meses en blanco era el hueco', () => {
  const g = armar()
  const f = g.filas[g.filasCalendario.iibb - 1]
  // B..M son los doce meses. Con DDJJ hasta junio y proyección hasta diciembre, los doce tienen algo.
  for (let m = 1; m <= 12; m++) {
    assert.notEqual(f[m], VACIO, `el mes ${m} de "IIBB a pagar" no puede estar vacío`)
  }
  // Y la base de un mes proyectado sale del Libro, no de un promedio.
  const base = g.filas[filaDe(g, /^Base imponible declarada$/) - 1]
  assert.match(String(base[9]), /_MOVIMIENTOS/, 'la base de septiembre sale del Libro')
  assert.match(String(base[9]), /\/\(1\+ALICUOTA_IVA\)/, 'la base imponible es NETA de IVA')
  assert.ok(!/AVERAGE/i.test(String(base[9])))
})

test('los meses proyectados se marcan en ÁMBAR por celda, nunca por columna entera', () => {
  // Pintar la columna del mes de arriba abajo teñiría de proyección el hero y el calendario, que son
  // la posición de HOY. Un hecho pintado de proyección miente en el sentido que más caro sale.
  const g = armar()
  assert.ok(g.ambar.length > 0)
  const filasDetalle = new Set([g.filasCalendario.iva, g.filasCalendario.iibb])
  assert.ok(g.ambar.some((x) => filasDetalle.has(x.fila)))
  const heroHasta = filaDe(g, /^1 · RIESGO Y PROYECCIÓN/)
  for (const x of g.ambar) assert.ok(x.fila > heroHasta, `la fila ${x.fila} está en la posición: no se pinta de proyección`)
})

test('el ancho de toda fila es exactamente el de la pestaña', () => {
  // Una fila corta deja celdas del generador anterior sin limpiar; una larga escribe fuera del
  // footprint y le pisa una columna al dueño.
  const g = armar()
  for (const [i, f] of g.filas.entries()) assert.equal(f.length, 15, `la fila ${i + 1} mide ${f.length}`)
})

test('ninguna fórmula de la pestaña lleva coma: el archivo es es-AR', () => {
  // En es-AR la coma es el DECIMAL; el separador de argumentos es el punto y coma. Una coma deja la
  // celda en #ERROR o —peor— la interpreta como otro número.
  // Una coma DENTRO de un texto entrecomillado es prosa y no molesta a nadie ("Ley 25.413, 0,6%").
  // Lo que rompe es la que separa argumentos. Se saca lo entrecomillado y se mira el resto.
  const sinTextos = (f) => f.replace(/"(?:[^"]|"")*"/g, '""')
  const g = armar()
  for (const [i, f] of g.filas.entries()) {
    for (const [j, c] of f.entries()) {
      if (typeof c !== 'string' || !c.startsWith('=')) continue
      assert.ok(!sinTextos(c).includes(','), `fila ${i + 1} col ${j + 1}: coma en una fórmula es-AR — ${c.slice(0, 90)}`)
    }
  }
  // Y la guarda de la guarda: si `sinTextos` dejara de sacar nada, el test pasaría por vacío.
  assert.equal(sinTextos('=IF(A1="hola, chau";1;2)'), '=IF(A1="";1;2)')
})

test('ningún archivo del generador pasa de 500 líneas', () => {
  // El generador tenía 1.253 y adentro, mezcladas con la orquestación, las fórmulas que deciden
  // plata. Tres estaban mal y no se veían.
  const archivos = [
    './impuestos-pestana.mjs', '../lib/impuestos-informe.mjs', '../lib/impuestos-grilla.mjs', '../lib/impuestos-bloques.mjs',
    '../lib/impuestos-posicion.mjs', '../lib/impuestos-cuadro.mjs', '../lib/impuestos-fuentes.mjs',
    '../lib/impuestos-piel.mjs', '../lib/vencimientos-fiscales.mjs',
  ]
  for (const a of archivos) {
    const n = readFileSync(new URL(a, import.meta.url), 'utf8').split('\n').length
    assert.ok(n <= 500, `${a} tiene ${n} líneas`)
  }
})

test('las filas del CALENDARIO declaran suyo todo su ancho: I:M van con centinela, no vacías', () => {
  // ═══ EL RESIDUO I20:M20 (06/08) ═══
  //
  // La pestaña arrastraba cinco "⚠ PROYECCIÓN" a la derecha de "18/08 · Planes de pago F931 (ARCA)".
  // Ese texto es de la fila "DDJJ presentada", que en el layout anterior estaba en la 20 y hoy está en
  // la 57. Lo primero que hubo que probar es de quién dice el generador que son esas celdas: si las
  // dejara como cadena vacía, `fusionar()` las leería como "no son mías, preservá" y el residuo sería
  // legítimo. Las declara suyas con VACIO —esto lo fija— y la limpieza la desbloquea `huella-celda`.
  const g = armar()
  const filasCal = g.filas
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => /^\d{2}\/\d{2} · .+ · (ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)/.test(String(f[0] ?? '')))
  assert.ok(filasCal.length >= 4, `esperaba filas de calendario y encontré ${filasCal.length}`)
  for (const { f, i } of filasCal) {
    // A el rótulo, B el importe; de C a O es ancho propio que tiene que limpiarse solo.
    for (let j = 2; j < 15; j++) {
      assert.equal(f[j], VACIO, `fila ${i + 1} col ${j + 1}: una fila del calendario no puede dejar ancho sin centinela`)
    }
  }
})

test('el residuo de un layout anterior se limpia de punta a punta (grilla → huella → fusión)', async () => {
  // La prueba del EFECTO: no que la grilla mande VACIO, sino que la celda quede vacía en la pestaña.
  const { aplicarHuella, huellasDeEscritura, claveCelda } = await import('../lib/huella-celda.mjs')
  const { fusionar } = await import('../lib/preservar-anotaciones.mjs')
  const g = armar()
  const idxCal = g.filas.findIndex((f) => /^\d{2}\/\d{2} · Planes de pago F931/.test(String(f[0] ?? '')))
  assert.ok(idxCal > 0, 'tiene que haber una fila de calendario de planes')
  // La pestaña de hoy: lo que el generador escribió, más el residuo del layout viejo en I:M.
  const huellas = new Map(huellasDeEscritura(g.filas).map((h) => [claveCelda(h.fila, h.col), { forma: h.forma, huella: h.huella, borrada: false }]))
  const hoy = g.filas.map((f, i) => (i === idxCal
    ? f.map((c, j) => (j >= 8 && j <= 12 ? '⚠ PROYECCIÓN' : (c === VACIO ? '' : c)))
    : f.map((c) => (c === VACIO ? '' : c))))
  const { grid, alineacion } = aplicarHuella(g.filas, hoy, huellas)
  assert.equal(alineacion.alineada, true, alineacion.motivo)
  const fusionada = fusionar(grid, hoy)
  for (let j = 8; j <= 12; j++) {
    assert.equal(fusionada[idxCal][j], '', `la columna ${j + 1} de la fila del calendario tiene que quedar vacía`)
  }
  // Y el texto sigue vivo donde SÍ va: la fila de la DDJJ presentada.
  const idxDDJJ = g.filas.findIndex((f) => String(f[0] ?? '').trim() === 'DDJJ presentada')
  assert.equal(fusionada[idxDDJJ][8], '⚠ PROYECCIÓN')
})
