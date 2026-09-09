// `ESTRUCTURA_TOTAL_MESES` APUNTABA A LA FILA 3, QUE ES UNA FILA EN BLANCO.
//
// Es el tercero de los tres rangos ciegos de la auditoría del 03/08, y el de causa más simple: este
// generador NO publicaba ningún rango con nombre. El nombre venía de un layout anterior —cuando el
// cuadro arrancaba arriba de todo, sin subtítulo ni títulos de sección— y como nadie lo republicaba,
// se quedó donde estaba mientras el cuadro bajaba. Anclado a la posición.
//
// Lo que se prueba: que el nombre caiga SOBRE la fila de totales que este generador acaba de armar,
// y que esa fila tenga contenido. El oráculo es la grilla, no un número de fila escrito acá.
import test from 'node:test'
import assert from 'node:assert/strict'
import { grilla, rangosDeEstructura, ROTULO_TOTAL, formatosPropios } from './estructura-pestana.mjs'
import { verificarRangos, explicarProblemas, fila } from '../lib/rangos-con-nombre.mjs'
import { tiene, fusionar, limpiarCentinela } from '../lib/preservar-anotaciones.mjs'
import { auditarDiseno, encabezadoRoto, TOPE_SUBTITULO } from '../lib/diseno-unificado.mjs'
import { textoVisible } from '../lib/patron-pestana.mjs'
import { MONEDA_CUERPO, MONEDA_TOTAL, CONTADOR } from '../lib/formato-statement.mjs'
import { ANCHO as ANCHO_COLUMNA } from '../lib/estilo-pestana.mjs'
import { FILA_BLOQUE } from '../lib/control-arca-bloque.mjs'
import { MIN_MESES } from '../lib/cash-flow-lineas.mjs'
import { evaluarFormula, hojaDeGrilla } from '../lib/evaluar-formula-sheet.mjs'
import { enBloqueIndivisible } from '../lib/celda-de-estructura.mjs'

const g = grilla()

test('ESTRUCTURA_TOTAL_MESES cae sobre la fila de totales, con los doce meses adentro', () => {
  const problemas = verificarRangos(g.filas, rangosDeEstructura(g))
  assert.deepEqual(problemas, [], explicarProblemas(problemas))
  const [d] = rangosDeEstructura(g)
  assert.equal(d.r0, g.fTot, 'el rango tiene que salir de la fila que el generador acaba de calcular')
  assert.equal(d.c1 - d.c0 + 1, 12, 'son los doce meses del año, no el total anual')
})

test('LA FILA 3 —donde estaba— es justamente una fila en blanco', () => {
  // El defecto medido en el archivo real: cero celdas con dato, y por lo tanto cualquier fórmula que
  // lo leyera valía 0 sin dar error. Si algún día la fila 3 dejara de estar en blanco, esto avisa que
  // el "antes" de este arreglo ya no es el que se documentó.
  // `tiene()` y no `=== ''`: desde el 04/08 una celda que el generador deja vacía lleva el centinela
  // VACIO ("es mía y va vacía"), justamente para que la fusión la BORRE en vez de preservar el
  // fantasma del layout anterior. Sigue estando en blanco; ahora además se limpia.
  assert.ok(!tiene(g.filas[2]?.[1]), 'la fila 3 sigue sin dato')
  const viejo = fila('ESTRUCTURA_TOTAL_MESES', { fila: 3, c0: 1, c1: 12, rotulo: ROTULO_TOTAL })
  assert.equal(verificarRangos(g.filas, [viejo])[0].problema, 'desanclado')
})

test('la fila de totales conserva su rótulo: es el ancla del rango', () => {
  assert.equal(g.filas[g.fTot - 1][0], ROTULO_TOTAL)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CUADRO DUPLICADO DEL 04/08 — lo que el dueño vio como "rompiste estructura"
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// La pestaña real tenía DOS encabezados y DOS bloques de datos: el de la versión anterior clavado en
// las filas 2 a 5 (seriales de fecha en crudo pintados como moneda, y fórmulas de "% del total"
// dividiendo por $P$11 — que en el layout de hoy es "Honorarios y servicios") y el bueno desde la 6.
// La causa no era el generador escribiendo dos veces: era que armaba sus filas con `fill('')` y la
// fusión preserva la cadena vacía. Si se vuelve a `fill('')`, este test se pone rojo.

test('EL CUADRO DUPLICADO: la fusión limpia el encabezado y los datos del layout anterior', () => {
  const enLaPestana = g.filas.map(() => [])
  enLaPestana[1] = ['(subtítulo viejo)', 46023, 46054, 46082, 46113, 46143, 46174, 46204, 46235, 46266, 46296, 46327, 46357, 'Total real', 'Proyectado', 'Total 2026', '% del total']
  enLaPestana[2] = ['Equipos y rodados (inversión)', '=IF(S3<>0;S3;0)', '', '', '', '', '', '', '', '', '', '', '', '=SUM($S3:$AD3)', '=$P3-$N3', '=SUM($B3:$M3)', '=IFERROR($P3/$P11;0)']
  enLaPestana[3] = ['Combustible', '=IF(S4<>0;S4;0)']
  enLaPestana[4] = ['Vehículos y taller', '=IF(S5<>0;S5;0)']
  enLaPestana[6] = ['Insumos y ferretería', '=IF(S7<>0;S7;0)']
  enLaPestana[7] = ['1 · EL GASTO DE ESTRUCTURA, MES A MES', '=IF(S8<>0;S8;0)']

  const fusion = fusionar(g.filas, enLaPestana)
  // LA COLUMNA B DE LAS FILAS DEL TITULAR SÍ SE ESCRIBE: es la cifra que la pestaña contesta. Lo que
  // no puede sobrevivir es el importe del layout anterior — se comprueba por el valor, no por el hueco.
  for (const i of [1, 2, 3, 4, 6, 7]) {
    for (let c = 1; c <= 16; c++) {
      const propio = String(g.filas[i]?.[c] ?? '').startsWith('=')
      const esperado = propio ? g.filas[i][c] : ''
      assert.equal(fusion[i][c], esperado, `fila ${i + 1}, columna ${c + 1}: sobrevivió "${fusion[i][c]}" del layout anterior`)
    }
  }
  // Y el rótulo del cuadro fantasma tampoco sobrevive: la fila 3 es una separadora, no "Equipos y rodados".
  assert.equal(fusion[2][0], '')
  assert.equal(fusion[6][0], '', 'la fila en blanco entre el titular y el bloque 1 se limpia')
  assert.equal(fusion[3][0], 'GASTO DE ESTRUCTURA 2026', 'el titular del layout de hoy sí se escribe')
  assert.equal(fusion[7][0], '1 · EL GASTO DE ESTRUCTURA, MES A MES', 'el título de sección del layout de hoy sí se escribe')
})

test('lo que la persona anota fuera del ancho declarado se preserva igual', () => {
  const enLaPestana = g.filas.map(() => [])
  enLaPestana[7] = Array(40).fill('')
  enLaPestana[7][34] = 'el combustible de julio incluye la moto'
  assert.equal(fusionar(g.filas, enLaPestana)[7][34], 'el combustible de julio incluye la moto')
})

test('EL FALSO ROJO: la diferencia del control se redondea a peso', () => {
  const dif = String(g.filas[g.fCtrl][1])
  assert.match(dif, /^=ROUND\(.*;0\)$/, 'sin ROUND, medio centavo de residuo dibujaba "-$0" en rojo con los datos perfectos')
})

test('NI UNA COLUMNA DE PROSA: la columna D del bloque de control quedó vacía', () => {
  for (let i = g.fCtrl - 2; i < g.filas.length; i++) {
    for (let j = 2; j < 17; j++) {
      assert.ok(!tiene(g.filas[i]?.[j]),
        `fila ${i + 1}, columna ${j + 1}: "${g.filas[i][j]}" es la prosa que el dueño borra y volvía en cada corrida`)
    }
  }
})

// EL SUBTÍTULO SE MIDE POR LO QUE SE VE, NO POR LO QUE PESA (09/09/2026). Medía el largo del valor
// CRUDO, y desde que la fila 2 declara su fecha de corte con una fórmula —la frescura se mide, no se
// tipea— ese largo es el de la fórmula (742 caracteres) y no el del renglón que el dueño lee. El
// contrato mide `textoVisible` contra `TOPE_SUBTITULO` (lib/diseno-unificado.mjs) y esto mide lo
// mismo: dos varas para la misma regla es cómo se termina con una pestaña conforme y un test verde
// que no miran lo mismo.
test('el subtítulo entra en una línea', () => {
  const visible = textoVisible(g.filas[1][0])
  assert.ok(visible, 'la fila 2 tiene que declarar procedencia')
  assert.ok(visible.length <= TOPE_SUBTITULO, `mide ${visible.length} caracteres visibles`)
  assert.deepEqual(encabezadoRoto(limpiarCentinela(g.filas), { pestana: 'Estructura' }), [],
    'el encabezado de tres filas tiene que pasar el contrato tal como sale del generador')
})

test('los formatos propios no pintan un solo fondo: el color quedó en el rojo del control', () => {
  const reqs = formatosPropios(1, g)
  const fondos = reqs.filter((r) => JSON.stringify(r).includes('backgroundColor'))
  assert.deepEqual(fondos, [], 'la barra azul, el ámbar de lo proyectado y el gris del total se van a la piel de statement')
  // Lo proyectado se distingue en itálica, que es la convención de un estimado en un estado financiero.
  const italicas = reqs.filter((r) => r.repeatCell?.cell?.userEnteredFormat?.textFormat?.italic)
  assert.ok(italicas.length >= 2, 'los meses proyectados y la columna Proyectado van en itálica')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL PROMEDIO SE MIDE SOBRE MESES CERRADOS — 13/08/2026
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// EL DEFECTO. La proyección de cada mes futuro salía de `Total real / COUNTIF(real;"<>0")`, y en los
// dos lados entraba el mes EN CURSO, que por definición está a medio transcurrir. Consecuencia
// medida sobre los datos reales de Compras (espejo `public.costos_obra`), sub-rubro Combustible:
// con los siete meses cerrados de enero a julio el ritmo es 5.913.229/7 = $844.747, y en cuanto
// entró la primera factura parcial de agosto ($165.001) pasó a 6.078.230/8 = $759.779. Cargar UNA
// factura bajaba $84.968 por mes el pronóstico de septiembre a diciembre: $339.873 en el cuatrimestre.
// El cuadro empeoraba su pronóstico justo cuando llegaba más información.
//
// POR QUÉ SE EVALÚAN LAS FÓRMULAS Y NO SE MIRA SU TEXTO. Una aserción de cadena no puede ver por qué
// número divide un promedio: el generador escribe fórmulas, el número lo calcula Google. El evaluador
// de `lib/evaluar-formula-sheet.mjs` corre en frío la fórmula que este generador escribe, con los
// datos que pone el test. Correr el generador contra el Sheet vivo para verificar ya borró trabajo
// del dueño tres veces, y desde un worktree la guarda falla cerrada y borra la pestaña entera.
const HOY = new Date(Date.UTC(2026, 7, 13)) // 13/08/2026: agosto EN CURSO, julio el último cerrado
const COL_MES = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']
const AUX = ['S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD']
const [MAY, AGO, SEP, DIC] = [4, 7, 8, 11]

// Combustible 2026 tal como está hoy en Compras: enero a julio cerrados, y agosto con una sola
// factura parcial de $165.001 — la que hacía caer el pronóstico.
const CERRADOS = [465147, 859964, 498298, 1244364, 1063986, 980404, 801066]
const COMBUSTIBLE = [...CERRADOS, 0, 0, 0, 0, 0]
const AGOSTO_PARCIAL = 165001
const RITMO = 5913229 / 7      // $844.747 — el promedio de los meses que YA TERMINARON
const RITMO_ROTO = 6078230 / 8 // $759.778,75 — lo que daba metiendo agosto a medio transcurrir

/**
 * Arma el cuadro con el real de UN sub-rubro y evalúa lo que el dueño va a leer en la pestaña.
 *
 * EL ENCABEZADO SE FUERZA A `Date` A PROPÓSITO. El generador lo escribe como el texto "1/8/2026" y
 * lo convierte Sheets bajo el locale es_AR; el evaluador no parsea fechas de un locale. La
 * dependencia es PREEXISTENTE y ruidosa —la fórmula del real ya hace `EOMONTH()` sobre esa misma
 * celda, que sobre texto da #VALUE!—, así que si algún día dejara de parsearse la pestaña entera se
 * llenaría de errores y el generador los denuncia al releer. Acá se modela el valor ya convertido.
 */
function cuadroDe(realPorMes, { rubro = 'Combustible', hoy = HOY } = {}) {
  const fCab = g.filas.findIndex((fl) => fl[0] === 'Rubro') + 1
  assert.equal(g.filas[fCab - 1][1], '1/1/2026', 'el encabezado dejó de ser el primero de cada mes')
  const f = g.f0 + g.rubros.indexOf(rubro)
  assert.equal(g.filas[f - 1][0], rubro, 'la fila del sub-rubro se movió')
  const hoja = hojaDeGrilla(g.filas)
  COL_MES.forEach((c, m) => { hoja[`${c}${fCab}`] = new Date(Date.UTC(2026, m, 1)) })
  AUX.forEach((c, m) => { hoja[`${c}${f}`] = realPorMes[m] ?? 0 })
  const leer = (ref) => evaluarFormula(`=${ref}`, { hoja, hoy })
  return {
    totalReal: leer(`N${f}`),        // el año entero — lo que el control compara contra Compras
    mesesCerrados: leer(`AE${f}`),   // el divisor
    promedioCerrado: leer(`AF${f}`), // el PROMEDIO de los meses cerrados (07/09/2026: era el numerador)
    proyectado: leer(`O${f}`),
    mes: (m) => leer(`${COL_MES[m]}${f}`),
  }
}

test('EL PROMEDIO IGNORA EL MES EN CURSO: es una observación incompleta, no un mes flojo', () => {
  const hoy = cuadroDe(COMBUSTIBLE)
  assert.equal(hoy.mesesCerrados, 7, 'enero a julio: agosto no cuenta hasta que termine')
  assert.equal(Math.round(hoy.promedioCerrado), Math.round(5913229 / 7))
  assert.equal(hoy.mes(SEP), RITMO)
  // Y ahora entra la primera factura de agosto, parcial. Ni el divisor ni el numerador se mueven.
  const conParcial = cuadroDe(COMBUSTIBLE.map((v, m) => (m === AGO ? AGOSTO_PARCIAL : v)))
  assert.equal(conParcial.mesesCerrados, 7, 'agosto entró al divisor: el mes en curso no terminó')
  assert.equal(Math.round(conParcial.promedioCerrado), Math.round(5913229 / 7), 'agosto entró al promedio')
  // "Total real" SÍ lo incluye: es un hecho del año y es lo que el bloque de control compara contra
  // Compras. Recortarlo haría fallar ese control por algo que no es un error de carga.
  assert.equal(conParcial.totalReal, 6078230)
})

test('EL DEFECTO QUE MOTIVA TODO: una factura del mes en curso NO baja la proyección de los futuros', () => {
  // La propiedad es que MÁS INFORMACIÓN NUNCA EMPEORE EL PRONÓSTICO. El factor de inflación de
  // Parámetros no está modelado y cae en 1 por su propio IFERROR: lo que se mide es la BASE.
  const antes = cuadroDe(COMBUSTIBLE)
  const despues = cuadroDe(COMBUSTIBLE.map((v, m) => (m === AGO ? AGOSTO_PARCIAL : v)))
  for (const m of [SEP, SEP + 1, SEP + 2, DIC]) {
    assert.ok(despues.mes(m) >= antes.mes(m),
      `el mes ${m + 1} cayó de ${antes.mes(m)} a ${despues.mes(m)} porque entró una factura de agosto`)
    assert.equal(despues.mes(m), RITMO,
      `el mes en curso se metió en el promedio: ${RITMO_ROTO} en vez de ${RITMO} (−$84.968 por mes)`)
  }
  // EN PESOS, que es donde se mide: los cuatro meses futuros que el Cash Flow Mensual lee de la fila
  // TOTAL de esta pestaña. Antes del arreglo, cargar la factura parcial de agosto los bajaba $339.873.
  const futuros = (c) => [SEP, SEP + 1, SEP + 2, DIC].reduce((s, m) => s + c.mes(m), 0)
  assert.equal(Math.round(futuros(despues) - futuros(antes)), 0,
    'septiembre a diciembre se movieron por cargar una factura de agosto')
  assert.equal(Math.round(futuros(despues)), Math.round(RITMO * 4))
  assert.equal(Math.round(RITMO_ROTO * 4 - RITMO * 4), -339873, 'la pérdida que el defecto producía')
})

test('EL MES EN CURSO MUESTRA LO ESPERADO, NO EL PARCIAL: se unificó con Recurrentes (07/09/2026)', () => {
  // ═══ EL DEFECTO QUE ESTE ARCHIVO DECLARABA COMO «NO SE TOCA ACÁ», ARREGLADO ═══
  //
  // La celda del mes EN CURSO era `IF(real<>0;real;proyección)`: en cuanto entraba la primera
  // factura mostraba el parcial ($165.001) en vez de lo esperado ($844.747), así que agosto BAJABA a
  // medida que llegaban comprobantes. En pesos era MAYOR que el defecto que ya se había arreglado
  // ($679.746 contra $339.873, sólo en Combustible).
  //
  // NO SE ARREGLÓ ACÁ PORQUE LA DECISIÓN NO ERA MÍA — mostrar un estimado arriba de un hecho lo
  // firma el dueño— y la firmó al mandar unificar las dos pestañas: Recurrentes ya usaba
  // `MAX(real; proyección)` desde el 13/08 y él lo pidió por el caso Movistar, que factura el 25 y
  // dejaba el mes en «—» veinticinco días. Al unificar, gana esa regla para las dos familias.
  //
  // NO AFECTA AL CASH FLOW MENSUAL, medido: para el mes en curso `mesCerrado()` da TRUE y la línea
  // toma el real de Compras, no esta celda; de esta pestaña sólo lee los meses futuros.
  const c = cuadroDe(COMBUSTIBLE.map((v, m) => (m === AGO ? AGOSTO_PARCIAL : v)))
  assert.equal(Math.round(c.mes(AGO)), Math.round(RITMO), 'el mes en curso muestra el MAYOR de los dos')
  assert.ok(c.mes(AGO) > AGOSTO_PARCIAL, 'y no baja al llegar una factura parcial')
  assert.equal(Math.round(RITMO - AGOSTO_PARCIAL), 679746, 'lo que agosto dejaba de mostrar')
})

test('UN MES CERRADO EN $0 SIGUE CONTANDO COMO CERRADO: la ventana es de calendario, no de datos', () => {
  // Los dos ceros valen $0 y significan cosas distintas: mayo YA PASÓ sin facturar, agosto TODAVÍA
  // NO pasó. Si la máscara mirara el dato en vez del calendario, los dos pesarían igual.
  const conMayoEnCero = COMBUSTIBLE.map((v, m) => (m === MAY ? 0 : v))
  const sinMayo = cuadroDe(conMayoEnCero)
  assert.equal(sinMayo.mesesCerrados, 6, 'mayo cerró sin facturar: no divide el promedio')
  assert.equal(Math.round(sinMayo.promedioCerrado), Math.round((5913229 - 1063986) / 6))
  // La MISMA plata, movida de agosto (en curso) a mayo (cerrado), sí entra: la diferencia es la fecha.
  const enMayo = cuadroDe(conMayoEnCero.map((v, m) => (m === MAY ? AGOSTO_PARCIAL : v)))
  const enAgosto = cuadroDe(conMayoEnCero.map((v, m) => (m === AGO ? AGOSTO_PARCIAL : v)))
  assert.equal(enMayo.mesesCerrados, 7, 'un mes cerrado que factura entra al divisor')
  assert.equal(enAgosto.mesesCerrados, 6, 'el mes en curso no entra al divisor por facturar')
  assert.equal(Math.round(enMayo.promedioCerrado), Math.round(((5913229 - 1063986) + AGOSTO_PARCIAL) / 7))
  assert.equal(Math.round(enAgosto.promedioCerrado), Math.round(sinMayo.promedioCerrado))
})

test('EL MÍNIMO DE MESES SE MIDE SOBRE CERRADOS: 3 cerrados + una factura de este mes proyecta $0', () => {
  // Sin esto, sacar el mes en curso del promedio y dejarlo en el contador daría el promedio de TRES
  // meses presentado como si fuera una tendencia de cuatro. Un gasto que pasó tres veces no lo es.
  const tresYUno = [100000, 200000, 300000, 0, 0, 0, 0, 400000, 0, 0, 0, 0]
  const c = cuadroDe(tresYUno)
  assert.equal(c.mesesCerrados, 3, `son 3 cerrados, no ${MIN_MESES}`)
  assert.equal(c.mes(SEP), 0, 'proyectó un promedio de tres meses porque contó agosto como el cuarto')
  assert.equal(c.mes(DIC), 0)
  assert.equal(c.totalReal, 1000000, 'el año entero sigue siendo un hecho, aunque no se proyecte')
  // Con el cuarto mes CERRADO sí proyecta, y sobre los cuatro cerrados.
  const cuatroCerrados = [100000, 200000, 300000, 400000, 0, 0, 0, 0, 0, 0, 0, 0]
  assert.equal(cuadroDe(cuatroCerrados).mes(SEP), 1000000 / 4)
})

test('LOS RÓTULOS DICEN "CERRADOS" PORQUE ES LO QUE MIDEN', () => {
  // Si el número cambia de significado y el rótulo no, el cuadro miente sin un solo error.
  // LA MITAD QUE MEDÍA EL SUBTÍTULO SE FUE (09/09/2026): exigía que la fila 2 explicara la regla de
  // proyección («sólo lo que apareció en 4 meses cerrados o más»), y bajo el minimalismo extremo la
  // fila 2 declara procedencia y no explica nada. Lo que queda es el rótulo del CONTROL, que sí tiene
  // que decir «cerrados» porque es el universo exacto que su COUNTIFS cuenta.
  assert.match(String(g.filas[g.fCtrl + 1][0]), /meses cerrados/i, 'el control de rubros no proyectados')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// UN CONTROL PUBLICADO NO PUEDE QUEDARSE SIN SUS INSUMOS
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// EL DEFECTO, medido el 06/09/2026 contra el archivo vivo y `sheet_huella_celda`: `B28` publicaba
// «⇒ Cobertura fiscal de esta pestaña» con `=IF(B25=0;"";B26/B25)` y B25/B26 VACÍAS —devuelve `""`
// pase lo que pase— y `B19` publicaba «⇒ Diferencia … (debe ser $0)» restando contra una `B18` vacía,
// o sea gritando en rojo el total entero del cuadro. Causa: 15 celdas marcadas borradas en un
// instante (13/08 15:13), las de los dos cuadros de control, cuando el layout del bloque se movió.
// El seguro de alineación no lo ve (la pestaña alinea: 281 de 293) y `esCeldaDeEstructura` rescata
// sólo el `⇒`, que es por qué sobrevivía el rótulo del control y no sus insumos.

test('los dos ⇒ de Estructura tienen TODOS sus insumos amparados por un bloque declarado', () => {
  assert.ok(g.indivisibles?.length, 'la grilla declara sus cuadros de control')
  const controles = g.filas
    .map((f, i) => ({ fila: i + 1, rotulo: String(f[0] ?? ''), formula: String(f[1] ?? '') }))
    .filter((x) => x.rotulo.startsWith('⇒') && x.formula.startsWith('='))
  // Tres desde el 09/09/2026: la diferencia, la cobertura y «⇒ Filas sin comprobante en ARCA», que
  // reemplazó al veredicto en prosa del bloque compartido (lib/control-arca-bloque.mjs).
  assert.equal(controles.length, 3, 'Estructura publica tres controles: la diferencia, la cobertura y las filas sin comprobante')
  for (const c of controles) {
    // Sólo las referencias a ESTA pestaña necesitan amparo: una celda de `_CRUCE_ARCA` (precedida
    // por `!`) la escribe otro generador y la huella de acá no la puede declarar.
    const refs = [...c.formula.matchAll(/(?<![!$A-Z])\$?[A-Z]{1,2}\$?(\d+)/g)].map((m) => Number(m[1]))
    if (c.rotulo.startsWith('⇒ Filas sin comprobante')) { assert.equal(refs.length, 0, 'ese control sólo lee la réplica'); continue }
    assert.ok(refs.length, `${c.rotulo} no referencia ninguna celda`)
    for (const r of refs) {
      // LA ÚNICA EXCEPCIÓN es la fila de totales del propio cuadro de datos: no es parte del bloque
      // de control, y hoy no está declarada indivisible. Queda dicho acá para que no pase por amparo.
      if (r === g.fTot) continue
      assert.ok(enBloqueIndivisible(r, g.indivisibles),
        `${c.rotulo} (fila ${c.fila}) lee la fila ${r} y ese insumo no está amparado por ningún bloque declarado`)
    }
  }
})

test('LA DECLARACIÓN NO SE COME EL CUADRO DE DATOS: ahí el dueño anota y la huella manda', () => {
  for (let f = 1; f <= g.fTot; f++) {
    assert.equal(enBloqueIndivisible(f, g.indivisibles), false, `la fila ${f} es cuadro de datos y no puede estar declarada`)
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CONTRATO DE DISEÑO SE MIDE SOBRE LA GRILLA, NO SOBRE EL SHEET (06/09/2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// EL DEFECTO, medido con `auditar-diseno-unificado.mjs` contra el archivo vivo: diez desvíos en esta
// pestaña. `A1` decía "Gastos de estructura" sobre una pestaña llamada "Estructura" (dos nombres para
// lo mismo); `A17` argumentaba en su título ("QUE ESTE CUADRO SEA EXACTAMENTE EL RUBRO ESTRUCTURA DE
// COMPRAS"); `A18`, `A19` y `A20` explicaban al lado del número; y las cuatro restantes venían del
// bloque de ARCA, que es compartido.
//
// El auditor lee el Sheet REAL y por eso no puede correr acá. Esto mide lo MISMO —el mismo núcleo
// puro, `auditarDiseno`— sobre lo que el generador está por escribir: el desvío se ve antes de que
// llegue a la pantalla del dueño, y no dos horas después en el log del worker.
test('EL DEFECTO · la grilla que se escribe no tiene un solo desvío del contrato de diseño', () => {
  const h = auditarDiseno(limpiarCentinela(g.filas), { pestana: 'Estructura' })
  const detalle = h.map((x) => `${(x.col ?? 'A')}${x.fila} · ${x.regla} · ${x.detalle}`).join('\n  ')
  assert.deepEqual(h, [], `Estructura vuelve a desviarse del contrato:\n  ${detalle}`)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL TITULAR Y LOS FORMATOS QUE EL ARCHIVO VIVO NO TENÍA — 09/09/2026
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Medido en el Sheet real antes de este cambio: el encabezado del cuadro de servicios recurrentes
// publicaba «1/1/2026» al lado de un «ene» —dos formas del mismo encabezado en la misma pestaña— y
// `B20` (Movistar, enero) salía «393970» en crudo. Las dos son fallas de FORMATO, no de dato, y las
// dos se prueban acá sobre los requests: es la única forma de que un rediseño no las reintroduzca sin
// que nadie mire la pantalla.

/** El último formato que gana sobre una celda: los requests se aplican EN ORDEN, como en la API. */
function formatoDe(reqs, fila, col, campo = 'numberFormat') {
  let out = null
  for (const r of reqs) {
    const rg = r.repeatCell?.range
    const v = r.repeatCell?.cell?.userEnteredFormat?.[campo]
    if (!rg || v === undefined) continue
    if (fila - 1 < (rg.startRowIndex ?? 0) || fila - 1 >= (rg.endRowIndex ?? Infinity)) continue
    if (col - 1 < (rg.startColumnIndex ?? 0) || col - 1 >= (rg.endColumnIndex ?? Infinity)) continue
    out = v
  }
  return out
}

test('EL TITULAR: la cifra que la pestaña contesta está arriba y sale de la fila de totales', () => {
  assert.equal(g.filas[3][0], 'GASTO DE ESTRUCTURA 2026', 'A4 es el titular')
  assert.equal(g.filas[3][1], `=$P${g.fTot}`, 'B4 cita el total del año de la fila de totales')
  assert.equal(g.filas[4][0], '   · Real a la fecha')
  assert.equal(g.filas[4][1], `=$N${g.fTot}`)
  assert.equal(g.filas[5][0], '   · Proyectado')
  assert.equal(g.filas[5][1], `=$O${g.fTot}`)
  // NINGUNA CELDA PUEDE QUEDAR CON EL MARCADOR SIN RESOLVER: `$TOT` se reemplaza al final de `grilla`,
  // y una que se escape publica `#REF!` en la cifra más visible de la pestaña.
  for (const [i, f] of g.filas.entries()) {
    for (const [j, c] of (f || []).entries()) {
      assert.ok(!String(c ?? '').includes('$TOT'), `fila ${i + 1}, columna ${j + 1}: quedó "${c}" sin resolver`)
    }
  }
  // Y la fila 7 es el respiro entre el titular y el bloque 1: sin ella el titular se lee como parte
  // del cuadro.
  assert.ok(!tiene(g.filas[6]?.[0]), 'la fila 7 separa el titular del primer bloque')
  assert.match(String(g.filas[7][0]), /^1 · /, 'el bloque 1 abre en la fila 8')
})

test('EL DEFECTO DEL SHEET VIVO: los meses del SEGUNDO cuadro salían «1/1/2026» y su cuerpo sin formato', () => {
  const gr = grilla(['MASS CONSULTORA', 'Movistar'])
  const reqs = formatosPropios(1, gr)
  assert.ok(gr.fCabRec && gr.fTotRec, 'con proveedores, la sección de recurrentes existe')
  // Los DOS encabezados de mes llevan el mismo formato, y el segundo se resuelve por la fila que la
  // grilla declara — no por una constante.
  for (const fc of [9, gr.fCabRec]) {
    const f = formatoDe(reqs, fc, 2)
    assert.deepEqual(f, { type: 'DATE', pattern: 'mmm' }, `el encabezado de la fila ${fc} tiene que decir «ene», no «1/1/2026»`)
  }
  // EL CUERPO DEL SEGUNDO CUADRO: la primera fila de proveedor, en enero. Es la B20 del archivo real.
  const primera = gr.fCabRec + 1
  assert.deepEqual(formatoDe(reqs, primera, 2), MONEDA_CUERPO, 'un importe del cuadro de recurrentes sin formato sale «393970»')
  assert.deepEqual(formatoDe(reqs, gr.fTotRec, 2), MONEDA_TOTAL, 'la fila de total del segundo cuadro lleva el "$"')
})

test('LOS CONTROLES SON «rótulo | número»: el titular lleva "$" y el cierre del bloque de ARCA cuenta filas', () => {
  const gr = grilla(['Movistar'])
  const reqs = formatosPropios(1, gr)
  assert.deepEqual(formatoDe(reqs, 4, 2), MONEDA_TOTAL, 'el titular es la cifra más fuerte: lleva la unidad')
  assert.deepEqual(formatoDe(reqs, 5, 2), MONEDA_CUERPO, 'la sub-línea no repite el "$"')
  assert.equal(formatoDe(reqs, 6, 2, 'textFormat')?.italic, true, 'lo proyectado va en itálica también arriba')
  // La última fila del bloque de ARCA dejó de ser un veredicto en prosa: cuenta FILAS, y sin este
  // formato la columna B hereda el barrido de moneda y «3 filas» se dibuja «$3».
  assert.deepEqual(formatoDe(reqs, gr.arca0 + FILA_BLOQUE.veredicto, 2), CONTADOR,
    'el cierre del respaldo fiscal es un contador, no plata')
})

test('el ancho de la columna de concepto sale del estándar, no de un número tipeado', () => {
  const reqs = formatosPropios(1, g)
  const anchoA = reqs.find((r) => r.updateDimensionProperties?.range?.dimension === 'COLUMNS'
    && r.updateDimensionProperties.range.startIndex === 0)
  assert.equal(anchoA?.updateDimensionProperties?.properties?.pixelSize, ANCHO_COLUMNA.concepto)
})
