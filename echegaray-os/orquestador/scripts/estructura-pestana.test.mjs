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
import { tiene, fusionar } from '../lib/preservar-anotaciones.mjs'
import { MIN_MESES } from '../lib/cash-flow-lineas.mjs'
import { evaluarFormula, hojaDeGrilla } from '../lib/evaluar-formula-sheet.mjs'

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
  enLaPestana[4] = ['1 · EL GASTO DE ESTRUCTURA, MES A MES', '=IF(S5<>0;S5;0)']

  const fusion = fusionar(g.filas, enLaPestana)
  for (const i of [1, 2, 3, 4]) {
    for (let c = 1; c <= 16; c++) {
      assert.equal(fusion[i][c], '', `fila ${i + 1}, columna ${c + 1}: sobrevivió "${fusion[i][c]}" del layout anterior`)
    }
  }
  // Y el rótulo del cuadro fantasma tampoco sobrevive: la fila 3 es una separadora, no "Equipos y rodados".
  assert.equal(fusion[2][0], '')
  assert.equal(fusion[4][0], '1 · EL GASTO DE ESTRUCTURA, MES A MES', 'el título de sección del layout de hoy sí se escribe')
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

test('el subtítulo entra en una línea', () => {
  assert.ok(String(g.filas[1][0]).length <= 130, `mide ${String(g.filas[1][0]).length} caracteres`)
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
    realCerrado: leer(`AF${f}`),     // el numerador
    proyectado: leer(`O${f}`),
    mes: (m) => leer(`${COL_MES[m]}${f}`),
  }
}

test('EL PROMEDIO IGNORA EL MES EN CURSO: es una observación incompleta, no un mes flojo', () => {
  const hoy = cuadroDe(COMBUSTIBLE)
  assert.equal(hoy.mesesCerrados, 7, 'enero a julio: agosto no cuenta hasta que termine')
  assert.equal(hoy.realCerrado, 5913229)
  assert.equal(hoy.mes(SEP), RITMO)
  // Y ahora entra la primera factura de agosto, parcial. Ni el divisor ni el numerador se mueven.
  const conParcial = cuadroDe(COMBUSTIBLE.map((v, m) => (m === AGO ? AGOSTO_PARCIAL : v)))
  assert.equal(conParcial.mesesCerrados, 7, 'agosto entró al divisor: el mes en curso no terminó')
  assert.equal(conParcial.realCerrado, 5913229, 'agosto entró al numerador del promedio')
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

test('AGOSTO SIGUE MOSTRANDO SU REAL PARCIAL — es otro defecto, y NO se toca acá', () => {
  // LO QUE ESTE FRENTE NO ARREGLA, ESCRITO PARA QUE NO SE PIERDA. La celda del mes EN CURSO es
  // `IF(real<>0;real;proyección)`: en cuanto entra la primera factura muestra el parcial ($165.001)
  // en vez de lo esperado ($844.747), así que agosto BAJA a medida que llegan comprobantes. Es el
  // mismo defecto por la otra punta y en pesos es mayor que el que se arregló ($679.746 contra
  // $339.873, sólo en Combustible). Recurrentes ya lo resuelve con MAX(real; proyección).
  //
  // NO SE ARREGLA EN ESTE FRENTE, y la razón es que la decisión no es mía: mostrar $844.747 donde
  // Compras dice $165.001 es poner un estimado arriba de un hecho, y eso lo firma el dueño.
  // MEDIDO, ADEMÁS: no afecta al Cash Flow Mensual. Para el mes en curso `mesCerrado()` da TRUE y la
  // línea toma el real de Compras, no esta celda; de esta pestaña sólo lee los meses futuros.
  const c = cuadroDe(COMBUSTIBLE.map((v, m) => (m === AGO ? AGOSTO_PARCIAL : v)))
  assert.equal(c.mes(AGO), AGOSTO_PARCIAL,
    'si esto cambió a MAX(real;proyección), el defecto declarado se arregló: actualizar la nota')
  assert.equal(Math.round(RITMO - AGOSTO_PARCIAL), 679746, 'lo que agosto deja de mostrar')
})

test('UN MES CERRADO EN $0 SIGUE CONTANDO COMO CERRADO: la ventana es de calendario, no de datos', () => {
  // Los dos ceros valen $0 y significan cosas distintas: mayo YA PASÓ sin facturar, agosto TODAVÍA
  // NO pasó. Si la máscara mirara el dato en vez del calendario, los dos pesarían igual.
  const conMayoEnCero = COMBUSTIBLE.map((v, m) => (m === MAY ? 0 : v))
  const sinMayo = cuadroDe(conMayoEnCero)
  assert.equal(sinMayo.mesesCerrados, 6, 'mayo cerró sin facturar: no divide el promedio')
  assert.equal(sinMayo.realCerrado, 5913229 - 1063986)
  // La MISMA plata, movida de agosto (en curso) a mayo (cerrado), sí entra: la diferencia es la fecha.
  const enMayo = cuadroDe(conMayoEnCero.map((v, m) => (m === MAY ? AGOSTO_PARCIAL : v)))
  const enAgosto = cuadroDe(conMayoEnCero.map((v, m) => (m === AGO ? AGOSTO_PARCIAL : v)))
  assert.equal(enMayo.mesesCerrados, 7, 'un mes cerrado que factura entra al divisor')
  assert.equal(enAgosto.mesesCerrados, 6, 'el mes en curso no entra al divisor por facturar')
  assert.equal(enMayo.realCerrado, sinMayo.realCerrado + AGOSTO_PARCIAL)
  assert.equal(enAgosto.realCerrado, sinMayo.realCerrado)
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
  assert.match(String(g.filas[1][0]), /meses cerrados/i, 'el subtítulo explica la regla de proyección')
  assert.match(String(g.filas[g.fCtrl + 1][0]), /meses cerrados/i, 'el control de rubros no proyectados')
})
