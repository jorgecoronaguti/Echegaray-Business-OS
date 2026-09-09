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
import { contratoDeRotulos, RANGO_ALICUOTA_IVA } from '../lib/iva-libre-disponibilidad.mjs'
import { parametroAlicuota, ROTULO_ALICUOTA } from '../lib/impuestos-alicuota.mjs'
import { auditarPatron, textoVisible } from '../lib/patron-pestana.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'
import { ANCHO_ROTULO } from '../lib/impuestos-piel.mjs'
import { auditarDiseno } from '../lib/diseno-unificado.mjs'
import { vaciarColumnaDeProsa } from '../lib/nota-celda.mjs'
import { ANCHO as ANCHO_PESTANA } from '../lib/impuestos-grilla.mjs'

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

// EL CENTINELA NO ES UN RÓTULO: `VACIO` dice «esta celda es mía y va vacía», y en la pestaña se ve
// vacía. Sin traducirlo, cada fila de separación cuenta como una fila con contenido.
const rotulos = (g) => g.filas.map((f) => (f[0] === VACIO ? '' : String(f[0] ?? '').trim()))
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

test('LA POSICIÓN VA PRIMERO, Y ENTRA EN CUATRO RENGLONES', () => {
  // ═══ EL REDISEÑO DEL 04/09 Y EL DEL 09/09 ═══
  //
  // El dueño, mirando la pestaña renderizada: "no me sirven del cuadro 1 al 3, veo del 4 en
  // adelante". Se fueron el riesgo 30/60/90, el calendario y el financiamiento —treinta y dos
  // renglones antes del primer número que él usa—. El 09/09 se fueron además el titular y las cuatro
  // sub-líneas: quedan tres «⇒ rótulo | cifra» y el separador, como en las pestañas hermanas.
  const g = armar()
  const primero = filaDe(g, /^⇒ A pagar en 30 días$/)
  const detalle = filaDe(g, /^1 · IVA$/)
  assert.ok(primero > 0 && detalle > primero, `orden real: hero ${primero}, detalle ${detalle}`)
  assert.equal(detalle - primero, 4, 'entre el primer renglón y el primer cuadro van sólo las otras dos filas y el aire')
  assert.ok(g.filasCalendario.iva > detalle, 'el IVA a pagar es detalle: va abajo')
  // Y la posición queda congelada ENTERA, o se va al scrollear y no sirve de nada.
  assert.ok(g.congeladas >= g.hero.hasta, `congela ${g.congeladas} filas y el hero llega hasta la ${g.hero.hasta}`)
  assert.ok(g.congeladas < detalle, 'congelar el detalle además de la posición se come media pantalla')
})

test('el hero se declara entero y son TRES totales, sin titular ni sub-líneas', () => {
  // La piel recibe el rango del hero y le da a esas filas su peso de lectura. Si el rango se queda
  // corto —o largo— el peso cae en el renglón de al lado sin dar un solo error.
  const g = armar()
  const delHero = rotulos(g).slice(g.hero.desde - 1, g.hero.hasta).filter(Boolean)
  assert.deepEqual(delHero, ['⇒ A pagar en 30 días', '⇒ Deuda fiscal y financiera', '⇒ A favor en el fisco'])
  for (const f of g.filas.slice(g.hero.desde - 1, g.hero.hasta)) {
    if (f[0] && f[0] !== VACIO) assert.ok(String(f[1]).startsWith('='), 'cada cifra es una referencia, no un pegado')
  }
  assert.ok(g.hero.hasta < filaDe(g, /^1 · IVA$/), 'el hero termina antes de la sección 1')
  // Y ninguna fila de la pestaña vuelve a decir «LA POSICIÓN AL …».
  assert.equal(rotulos(g).some((r) => /^LA POSICIÓN/.test(r)), false)
})

test('LA FILA 2 DECLARA PROCEDENCIA Y NADA MÁS: tres fuentes, cero prosa', () => {
  // ═══ POR QUÉ NO ALCANZA `auditar-diseno-unificado` PARA ESTA FILA (09/09/2026) ═══
  //
  // La A2 no es un texto: es una fórmula `LET(...)` que rinde «ARCA al dd/mm · IIBB al dd/mm · banco
  // al dd/mm». Los auditores leen VALORES, y el valor de una fórmula en frío es la fórmula — así que
  // el párrafo «Qué se le debe al fisco, qué está inmovilizado y con qué se cuenta» podía volver a
  // la celda con los dos controles de diseño en verde. MEDIDO: reponerlo dejaba pasar
  // `pestanas-sin-prosa` sin una queja.
  //
  // Se mide el LITERAL MÁS LARGO de la fórmula, que es el que ocupa la fila — la misma técnica que
  // `textoVisible` usa para cazar las glosas escondidas dentro de un IF.
  const a2 = String(armar().filas[1][0])
  assert.ok(a2.startsWith('='), 'la frescura es una fórmula viva, no una fecha estampada el día de la corrida')
  const visible = textoVisible(a2)
  assert.ok(visible.length <= 24, `la A2 publica una glosa de ${visible.length} caracteres: «${visible}»`)
  // Las TRES fuentes, y sólo tres. Cada una con su propia fecha: un MAX le prestaría la frescura de
  // la fuente viva a la congelada, que es el defecto que `rotuloPorFuente` existe para impedir.
  for (const fuente of ['ARCA al ', 'IIBB al ', 'banco al ']) assert.ok(a2.includes(`"${fuente}"`), fuente)
  assert.equal(a2.includes('retenciones al '), false, 'la cuarta fuente se retiró: tres fechas se leen de un vistazo')
  assert.equal(/Qué se le debe|inmovilizado|con qué se cuenta/.test(a2), false, 'ni una palabra de explicación')
})

test('LAS CINCO SECCIONES SE LLAMAN POR SU CONCEPTO, SIN PREGUNTAS NI EXPLICACIÓN', () => {
  // ═══ LA ORDEN DEL 09/09 ═══
  //
  // Decían «1 · IVA — LA DDJJ OFICIAL (F.2051): QUÉ SE DEBE O SE TIENE A FAVOR», «2 · … ¿CUÁNTO SE
  // DEBE CADA MES?», «4 · … ¿QUÉ MÁS SE PAGA Y NO ESTABA A LA VISTA?». Un título que hace una
  // pregunta está explicando el cuadro que tiene debajo, y el cuadro se explica solo.
  //
  // Y LA NUMERACIÓN CORRE SIN HUECOS: la sección 6 se eliminó entera, así que la última es la 5. Un
  // hueco en la numeración es lo que hace dudar de si falta un bloque.
  const secciones = rotulos(armar()).filter((r) => /^\d+ · /.test(r))
  assert.deepEqual(secciones, [
    '1 · IVA', '2 · INGRESOS BRUTOS SAN JUAN', '3 · RETENCIONES SUFRIDAS',
    '4 · OTROS IMPUESTOS', '5 · DEUDA FINANCIERA',
  ])
})

test('NADA DEBAJO DEL ÚLTIMO BLOQUE', () => {
  // El bloque de supuestos y huecos vivía al pie: seis renglones «▲ …» y la alícuota. Se eliminó
  // entero (la alícuota se mudó a «Parámetros»). Lo que este test fija es que no quede una cola de
  // renglones sueltos después del último total, que es como vuelve la prosa sin que nadie la vea.
  const g = armar()
  const ultima = rotulos(g).reduce((acc, r, i) => (r ? i : acc), -1)
  const rotulosSinFrescura = rotulos(g).filter((_, i) => i !== 1 && !rotulos(g)[i].startsWith('='))
  assert.deepEqual(rotulosSinFrescura.filter((r) => /[▲✓]/.test(r)), [])
  const fSalida = filaDe(g, /^⇒ Salida financiera del mes$/)
  const fPrend = filaDe(g, /^Prendario · cuotas por vencer$/)
  assert.ok(fSalida > 0 && fPrend > fSalida, 'el bloque 5 termina con el saldo del prendario')
  assert.equal(ultima + 1, fPrend, `después de la fila ${fPrend} hay contenido en la ${ultima + 1}`)
  // Y ni un ▲ en un RÓTULO: el dueño los nombró uno por uno. La fila 2 queda afuera y es la única
  // excepción: es la fórmula de frescura, que muestra «▲ hace N días» SÓLO cuando una fuente se
  // quedó atrás — un aviso que aparece por excepción, no un glifo dibujado todos los días. Es el
  // mismo mecanismo, letra por letra, que usan «Cargas Sociales» y «Nómina».
})

test('la pestaña cumple su propia gramática — cero defectos de patrón', () => {
  assert.deepEqual(auditarPatron(comoSeVe(armar())), [])
})

test('con meses de ARCA la pestaña sigue cumpliendo su gramática y su contrato', () => {
  // El tercer estado del cuadro 4 (comprobantes de ARCA) no puede desacomodar la pestaña: mismas
  // filas, mismos rótulos, mismo hero. Si agregara o corriera una fila, `contratoDeRotulos` y el
  // patrón se pondrían rojos acá antes de que ninguna escritura toque el archivo real.
  const g = armar({ arca: { meses: [1, 2, 3, 4, 5, 6, 7, 8] } })
  assert.deepEqual(auditarPatron(comoSeVe(g)), [])
  assert.ok(contratoDeRotulos(g.filas, CALENDARIO_IMPUESTOS.rotulos).ok)
  assert.equal(g.filas.length, armar().filas.length, 'el estado nuevo no agrega ni corre filas')
  assert.equal(g.filasCalendario.iva, armar().filasCalendario.iva)
})

test('el mes EN CURSO queda vinculado a ARCA y se declara como parcial', () => {
  // La pregunta del dueño: "la columna del mes en curso se debe actualizar sola". Se actualiza porque
  // es una fórmula contra _ARCA_RAW, no un número que quedó pegado el día que corrió el generador.
  // HOY es 06/08/2026, así que agosto es el mes en curso.
  const g = armar({ arca: { meses: [7, 8] } })
  const fDDJJ = filaDe(g, /^DDJJ presentada$/)
  assert.equal(g.filas[fDDJJ - 1][8], 'parcial')
  const debito = String(g.filas[filaDe(g, /^Débito fiscal del período$/) - 1][8])
  assert.match(debito, /_ARCA_RAW/, 'agosto sale de la réplica de comprobantes')
  assert.match(debito, /^=MAX\(/, 'y nunca por debajo de la proyección del Libro')
  // Julio, en cambio, es del dueño (ancla = 7): cadena vacía, que es lo que `fusionar()` preserva.
  assert.equal(g.filas[fDDJJ - 1][7], '')
  // Y los meses de ARCA quedan en gris itálica igual que la proyección: no son la DDJJ oficial.
  assert.ok(g.proyectadas.some((x) => x.mes === 8 && x.fila === fDDJJ))
})

test('LA ALÍCUOTA YA NO ES UNA FILA DE ESTA PESTAÑA: es un parámetro del dueño', () => {
  // ═══ POR QUÉ SE MUDÓ (09/09/2026) ═══
  //
  // Vivía en B53, dentro del bloque «Supuestos y huecos» que el dueño mandó eliminar. Pero además
  // estaba mal ubicada desde antes: una alícuota que él FIRMA es una ENTRADA, de la misma categoría
  // que `F931_DIA_DE_PAGO` o las alícuotas del FCL, que ya viven en «Parámetros» con su rango con
  // nombre. Un parámetro escondido al pie del cuadro que lo consume es un parámetro que nadie
  // encuentra para cambiar — y ninguna fórmula de la pestaña deja de andar: leen el NOMBRE.
  const g = armar()
  assert.equal(rotulos(g).includes(ROTULO_ALICUOTA), false, 'la fila se retiró de la pestaña')
  assert.equal(g.filaAlicuotaIva, undefined, 'el generador ya no declara una fila de alícuota')
  // El rango con nombre lo sigue leyendo la proyección de IVA: si alguien reemplazara el nombre por
  // un 0,21 tipeado en la fórmula, la alícuota dejaría de ser editable sin que nada se rompa.
  const cred = String(g.filas[filaDe(g, /^Crédito fiscal del período$/) - 1][10])
  assert.match(cred, new RegExp(RANGO_ALICUOTA_IVA), 'la proyección sigue leyendo el rango con nombre')
  // Y el parámetro que se publica en «Parámetros» declara el MISMO rótulo por el que se lo busca.
  const p = parametroAlicuota(0.21)
  assert.equal(p.rotulo, ROTULO_ALICUOTA)
  assert.equal(p.rango, RANGO_ALICUOTA_IVA)
  assert.equal(p.valor, 0.21, 'se migra el valor vigente, no la semilla: si no, se pisa lo que él firmó')
})

test('IIBB PROYECTA de julio en adelante: seis meses en blanco era el hueco', () => {
  const g = armar()
  const f = g.filas[g.filasCalendario.iibb - 1]
  // B..M son los doce meses. Con DDJJ hasta junio y proyección hasta diciembre, los doce tienen algo.
  for (let m = 1; m <= 12; m++) {
    assert.notEqual(f[m], VACIO, `el mes ${m} de "IIBB a pagar" no puede estar vacío`)
  }
  // Y LA BASE DE UN MES PROYECTADO ES LA MISMA QUE LA DEL DÉBITO FISCAL DE ARRIBA (04/09/2026).
  // Antes salía de las cobranzas del Libro y el bloque de al lado de las facturas emitidas: dos
  // definiciones de «las ventas del mes» a tres filas de distancia. En septiembre una decía $71,1M y
  // la otra $183,7M.
  const base = g.filas[filaDe(g, /^Base imponible declarada$/) - 1]
  assert.match(String(base[9]), /Cobranzas!\$B\$5:\$B="B"/, 'sólo lo facturado, como el débito')
  assert.match(String(base[9]), /Cobranzas!\$J\$5:\$J/, 'la base imponible es el NETO de la factura')
  assert.doesNotMatch(String(base[9]), /_MOVIMIENTOS/, 'la base dejó de ser un percibido')
  assert.doesNotMatch(String(base[9]), /ALICUOTA_IVA/, 'no se deriva de un bruto de caja')
  assert.ok(!/AVERAGE/i.test(String(base[9])))
  assert.match(String(base[9]), /DATE\(2026;9;1\)/, 'la ventana es la del mes, la misma que la del débito')
})

test('un mes FUTURO sin facturas cargadas no proyecta NINGUNO de los dos lados', () => {
  // El reporte del dueño: «cómo me va a dar a pagar si tengo saldo a favor en los meses siguientes».
  // Noviembre y diciembre tenían crédito de IVA proyectado y débito cero, y de ahí salía un saldo a
  // favor de $1.312.377 inventado. Ahora los dos bloques dejan el mes vacío y lo DECLARAN.
  const g = armar({ proy: { ...armar().proy ?? {}, meses: [8, 9, 10, 11, 12], ultimoMesConDato: 7, libreDisp: 7050036,
    alicuotaVigente: 0.21, brutoDebito: (m) => [`BRUTO_DEB_${m}`], brutoCredito: (m) => [`BRUTO_CRE_${m}`],
    supuesto: 'el supuesto', sinBase: [11, 12] } })
  for (const rot of [/^Débito fiscal del período$/, /^Crédito fiscal del período$/, /^Base imponible declarada$/]) {
    const f = g.filas[filaDe(g, rot) - 1]
    for (const mes of [11, 12]) assert.equal(f[mes], VACIO, `${rot} tiene que quedar vacío en el mes ${mes}`)
  }
  // Y EL HUECO SE DECLARA: una columna vacía sin explicación se lee como «no debo nada».
  const proc = g.filas[filaDe(g, /^DDJJ presentada$/) - 1]
  for (const mes of [11, 12]) assert.equal(String(proc[mes]), 'sin ventas')
})

test('los meses proyectados se marcan por CELDA, nunca por columna entera', () => {
  // Pintar la columna del mes de arriba abajo teñiría de proyección el hero, que es la posición de
  // HOY. Un hecho marcado como proyección miente en el sentido que más caro sale.
  //
  // Y DESDE EL 09/09/2026 LA MARCA ES TIPOGRÁFICA, NO UN FONDO ÁMBAR: el amarillo de agosto a
  // octubre era lo único con color de la pestaña y le daba a una estimación más peso visual que a
  // una DDJJ presentada. Gris e itálica es como marca una estimación cualquier statement serio, y
  // es lo que ya hacen «Cargas Sociales» y «Nómina».
  const g = armar()
  assert.ok(g.proyectadas.length > 0)
  assert.equal(g.ambar, undefined, 'el fondo ámbar se retiró: la piel ya no lo recibe')
  const filasDetalle = new Set([g.filasCalendario.iva, g.filasCalendario.iibb])
  assert.ok(g.proyectadas.some((x) => filasDetalle.has(x.fila)))
  for (const x of g.proyectadas) {
    assert.ok(x.fila > g.hero.hasta, `la fila ${x.fila} está en el hero: no se marca como proyección`)
    assert.ok(x.mes >= 1 && x.mes <= 12, `la columna ${x.mes} no es un mes`)
  }
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
    '../lib/impuestos-base-proyeccion.mjs', '../lib/impuestos-alicuota.mjs',
    '../lib/huella-formato-layout.mjs',
    '../lib/impuestos-piel.mjs', '../lib/vencimientos-fiscales.mjs',
  ]
  for (const a of archivos) {
    const n = readFileSync(new URL(a, import.meta.url), 'utf8').split('\n').length
    assert.ok(n <= 500, `${a} tiene ${n} líneas`)
  }
})

test('las filas del HERO declaran suyo todo su ancho: C:O van con centinela, no vacías', () => {
  // ═══ EL RESIDUO I20:M20 (06/08), Y POR QUÉ ESTE TEST SE MUDÓ AL HERO (04/09/2026) ═══
  //
  // La pestaña arrastraba cinco "⚠ PROYECCIÓN" a la derecha de una fila angosta. Ese texto era de la
  // fila "DDJJ presentada" de un layout anterior. Lo que hay que probar es de quién dice el generador
  // que son esas celdas: si las dejara como cadena vacía, `fusionar()` las leería como "no son mías,
  // preservá" y el residuo sería legítimo. Las declara suyas con VACIO —esto lo fija— y la limpieza
  // la desbloquea `huella-celda`.
  //
  // Las filas angostas eran las del calendario; el calendario se fue. Ahora son las TRES del HERO,
  // que usan A y B (a lo sumo C) y dejan el resto de su ancho para limpiar. Y el riesgo es MAYOR que
  // antes: entre el rediseño del 04/09 y el del 09/09 la pestaña se acortó cuarenta renglones, así
  // que debajo de cada fila del hero hay contenido de un layout que ya no existe.
  const g = armar()
  const filasHero = g.filas
    .map((f, i) => ({ f, i }))
    .filter(({ i }) => i + 1 >= g.hero.desde && i + 1 <= g.hero.hasta)
    .filter(({ f }) => /^⇒/.test(String(f[0] ?? '')))
  assert.equal(filasHero.length, 3, `esperaba las tres filas del hero y encontré ${filasHero.length}`)
  for (const { f, i } of filasHero) {
    // A el rótulo, B el importe, C la etiqueta del mes cuando la hay; de ahí a O es ancho propio.
    const desde = String(f[2] ?? '') === VACIO ? 2 : 3
    for (let j = desde; j < 15; j++) {
      assert.equal(f[j], VACIO, `fila ${i + 1} col ${j + 1}: una fila del hero no puede dejar ancho sin centinela`)
    }
  }
})

test('el residuo de un layout anterior se limpia de punta a punta (grilla → huella → fusión)', async () => {
  // La prueba del EFECTO: no que la grilla mande VACIO, sino que la celda quede vacía en la pestaña.
  const { aplicarHuella, huellasDeEscritura, claveCelda } = await import('../lib/huella-celda.mjs')
  const { fusionar } = await import('../lib/preservar-anotaciones.mjs')
  // SE RECORRE HASTA LA PESTAÑA, NO HASTA LA FUSIÓN (13/08). Detenerse en `fusionar()` daba verde
  // sobre una limpieza que en producción no ocurría: después corre `no-borrar.mjs`, que reponía toda
  // celda que la escritura dejaba vacía. El residuo de I20:M20 seguía visible con este test en verde.
  const { preservarNoVacias } = await import('../lib/no-borrar.mjs')
  const g = armar()
  const idxCal = g.filas.findIndex((f) => /^⇒ Deuda fiscal y financiera/.test(String(f[0] ?? '')))
  assert.ok(idxCal > 0, 'tiene que haber una fila angosta del hero')
  // ═══ LAS HUELLAS SE SELLAN DEL LAYOUT VIEJO, QUE ES LO QUE PASA EN PRODUCCIÓN (09/09/2026) ═══
  //
  // Antes se sellaban de la grilla NUEVA y el residuo se simulaba con un texto que esa misma grilla
  // seguía escribiendo en otra fila: la limpieza salía por el reconocimiento de forma, no por la
  // huella. Con el rediseño ese texto («▲ PROYECCIÓN») dejó de existir en la pestaña y el test se
  // puso rojo — señalando bien que el atajo no probaba el mecanismo.
  //
  // Lo que ocurre de verdad es esto: la corrida ANTERIOR escribió «▲ PROYECCIÓN» en esas celdas y
  // selló su huella; la de HOY pide limpiarlas. La huella es la evidencia de que la celda es del
  // generador, y sin ella un residuo propio se lee como texto del dueño y se conserva para siempre.
  const viejo = g.filas.map((f, i) => (i === idxCal
    ? f.map((c, j) => (j >= 8 && j <= 12 ? '▲ PROYECCIÓN' : c))
    : f))
  const huellas = new Map(huellasDeEscritura(viejo).map((h) => [claveCelda(h.fila, h.col), { forma: h.forma, huella: h.huella, borrada: false }]))
  const hoy = viejo.map((f) => f.map((c) => (c === VACIO ? '' : c)))
  const { grid, alineacion } = aplicarHuella(g.filas, hoy, huellas)
  assert.equal(alineacion.alineada, true, alineacion.motivo)
  const enPestana = preservarNoVacias(hoy, fusionar(grid, hoy)).values
  for (let j = 8; j <= 12; j++) {
    assert.equal(enPestana[idxCal][j], '', `la columna ${j + 1} de la fila del calendario tiene que quedar vacía`)
  }
  // Y el texto sigue vivo donde SÍ va: la fila de la DDJJ presentada.
  const idxDDJJ = g.filas.findIndex((f) => String(f[0] ?? '').trim() === 'DDJJ presentada')
  assert.equal(enPestana[idxDDJJ][8], 'proyección')
})

test('un rótulo con un importe al lado tiene que ENTRAR en su columna', () => {
  // ═══ EL CRITERIO ES EL DEL AUDITOR, NO UNO INVENTADO ═══
  //
  // `defectos-pantalla.mjs` marca `texto_cortado` cuando el texto no entra Y la celda de al lado está
  // OCUPADA: con la vecina vacía el texto se derrama y se lee entero, así que un renglón suelto puede
  // ser largo. Lo que nunca puede ser largo es un rótulo que tiene un importe pegado a la derecha —
  // ahí no hay adónde derramar y lo que se corta es el final, que es donde suele estar la condición
  // ("PENDIENTE", "por vencer", "que todavía no vencieron").
  //
  // 87 = 500 px / (10 px × 0,57), la misma cuenta que hace el auditor con el ancho real de la columna
  // A de esta pestaña (`ANCHO_ROTULO`).
  const CABEN = Math.floor(ANCHO_ROTULO / (10 * 0.57))
  const largos = armar().filas
    .map((f, i) => ({ fila: i + 1, a: String(f[0] ?? ''), b: String(f[1] ?? '') }))
    .filter((x) => x.a && x.a !== VACIO && x.b && x.b !== VACIO && !x.a.startsWith('='))
    .filter((x) => x.a.length > CABEN)
  assert.deepEqual(largos, [], `rótulos que se cortan con un importe al lado (entran ${CABEN} caracteres)`)
})

test('la pestaña cumple el CONTRATO DE DISEÑO entero en la grilla que el generador devuelve', () => {
  // ═══ POR QUÉ ACÁ Y NO SÓLO EN EL ARCHIVO VIVO (06/09/2026) ═══
  //
  // `auditar-diseno-unificado` medía «A1 dice "Impuestos y financiero" y la pestaña se llama
  // "Impuestos y Financieros"»: el título estaba TIPEADO aparte del nombre real, así que las dos
  // cadenas podían divergir sin que nada se rompiera. Ese auditor sólo puede dar rojo después de
  // correr el pipeline contra el Sheet real, que es lo que no se hace desde un worktree. Acá el mismo
  // contrato se mide sobre la grilla, sin una llamada a la API: si alguien vuelve a tipear el título,
  // o mete una explicación en cualquier columna, este test se pone rojo en el commit y no dos días
  // después en el archivo.
  // La columna O se juzga VACÍA porque `main()` la vacía antes de escribir (`vaciarColumnaDeProsa`,
  // el mismo llamado que se usa acá): medirla con su texto adentro sería marcar 29 desvíos que el
  // lector no tiene, y el rojo dejaría de significar algo.
  const g = armar()
  vaciarColumnaDeProsa(g.filas, ANCHO_PESTANA - 1)
  const filas = g.filas.map((f) => (f || []).map((c) => (c === VACIO ? '' : c)))
  const mal = auditarDiseno(filas, { pestana: 'Impuestos y Financieros' })
  assert.deepEqual(mal, [], mal.map((x) => `${x.col ?? ''}${x.fila} · ${x.regla} · ${x.detalle}`).join('\n'))
})
