// EL SUBTÍTULO DE "CARGAS SOCIALES" CRUZA UNA FUENTE VIVA CON UNA CONGELADA.
//
// Compras se mueve todos los días; el F931 sale de los PDF del data room y se queda en el último
// período presentado. Un MAX sobre las dos —el arreglo "obvio" cuando se sacó la fecha de la
// corrida— es PEOR que el texto estampado: pone la fecha de Compras arriba del cuadro "declarado en
// las DDJJ F931", que hace un mes y medio que no cambia. Eso es lo que estos tests impiden.
import test from 'node:test'
import assert from 'node:assert/strict'
import { grilla } from './cargas-sociales-pestana.mjs'

const periodos = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
const conceptos = [
  { codigo: '301', rotulo: 'Aportes de Seguridad Social (301)', corto: 'Aportes de Seguridad Social' },
  { codigo: '351', rotulo: 'Contribuciones de Seguridad Social (351)', corto: 'Contribuciones de Seguridad Social' },
]
const C = {
  total: 'O', cliente: 'F', detalle: 'G', fecha: 'AD', rubro: 'K', proveedor: 'E', fechaFactura: 'C',
}
const g = grilla({ periodos, conceptos, ps: [], C })
const subtitulo = String(g.filas[1][0])

test('el subtítulo es una FÓRMULA: un texto queda clavado en el día de la corrida', () => {
  assert.ok(subtitulo.startsWith('='), `el subtítulo volvió a ser texto: ${subtitulo.slice(0, 80)}`)
})

test('no hay ninguna fecha estampada adentro', () => {
  assert.doesNotMatch(subtitulo.replace(/"dd\/mm"/g, ''), /\d{1,2}\/\d{1,2}\/\d{2,4}/)
})

test('cada fuente declara SU fecha: no hay un MAX que le preste frescura a la congelada', () => {
  assert.match(subtitulo, /"DDJJ F931 al "/, 'el F931 tiene que declarar la suya')
  assert.match(subtitulo, /"Compras al "/, 'y Compras la suya')
  // El defecto que esto ataja: una sola fecha para las dos.
  assert.doesNotMatch(subtitulo, /"al "&TEXT\(MAX\(/, 'volvió a resumir las dos fuentes en una sola fecha')
})

test('el F931 declara su PERÍODO, no el día en que se leyó el PDF', () => {
  // Una DDJJ de junio presentada el 16/07 habla de junio: decir "al 16/07" sería declarar frescura
  // de la gestión administrativa, no del dato.
  assert.match(subtitulo, /EOMONTH\(/, 'el período tiene que declararse como el último día que cubre')
  assert.match(subtitulo, /_F931_RAW!\$A\$4:\$A/)
  // Y sin DATEVALUE: en un libro es-AR puede leer el ISO como dd/mm y devolver otro mes SIN error.
  // Se mira sólo el tramo del F931 — en el de Compras el DATEVALUE es correcto y necesario, porque
  // esa columna sí trae fechas tipeadas "dd/mm/aaaa" que un MAX crudo ignoraría en silencio.
  const tramoF931 = subtitulo.split('&" · "&').find((t) => t.includes('_F931_RAW')) ?? ''
  assert.doesNotMatch(tramoF931, /DATEVALUE/, 'el período del F931 no puede depender del locale del libro')
  assert.match(tramoF931, /DATE\(VALUE\(LEFT\(/)
})

test('la fuente mensual avisa con su propio umbral, o el ▲ estaría prendido siempre', () => {
  assert.match(subtitulo, />45;/, 'el F931 tiene que usar el umbral mensual')
  assert.match(subtitulo, />7;/, 'y Compras el diario')
})

test('la columna de fecha de Compras se coacciona: mezcla serial y texto tipeado', () => {
  // Un MAX crudo ignora el texto EN SILENCIO y se queda con la última fecha que por casualidad entró
  // como número — justo las filas cargadas a mano quedan afuera.
  assert.match(subtitulo, /IFERROR\(DATEVALUE\(Compras!\$AD\$4:\$AD&""\);N\(Compras!\$AD\$4:\$AD\)\)/)
})

test('la fuente sin datos lo dice, y no muestra el 31/01/1900 que da EOMONTH(0;0)', () => {
  assert.match(subtitulo, /"DDJJ F931 sin datos"/)
})

test('separador es-AR en la parte calculada: una coma parte la fórmula', () => {
  const soloCalculo = subtitulo.replace(/"(?:[^"]|"")*"/g, '')
  assert.doesNotMatch(soloCalculo, /,/, `hay una coma separando argumentos: ${soloCalculo}`)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA CADENA COMPLETA, ARMADA (06/08). Se ejercita la grilla ENTERA —no una fórmula suelta— porque los
// tres defectos que se arreglan acá sólo se ven en la pestaña armada: el SAC que se corta a mitad de
// año, la dotación promedio y el número pegado del hero.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import { grilla as grillaCS, jornalesDelMes } from './cargas-sociales-pestana.mjs'
import {
  A_VERIFICAR, RANGO_FCL_PRIMER_ANIO, RANGO_IERIC, RANGO_DIA_PAGO_F931, PARAMETROS_CARGAS,
} from '../lib/cargas-cadena.mjs'
import { rangosDeCargas, ROTULOS_CARGAS, NOMBRES_CARGAS } from '../lib/libro-extractores-cargas.mjs'
import { verificarRangos as verificarRangosCS, explicarProblemas as explicarProblemasCS } from '../lib/rangos-con-nombre.mjs'
import { auditarPatron as patronCS } from '../lib/patron-pestana.mjs'
import { VACIO as VACIO_CS } from '../lib/preservar-anotaciones.mjs'

/** El ancho de la pestaña: la última columna es la de prosa, que el generador vacía a propósito. */
const ANCHO_CS = 15

const COLS = {
  total: 'O', cliente: 'J', detalle: 'K', fecha: 'AD', rubro: 'AB', proveedor: 'E', fechaFactura: 'C',
  estado: 'X',
}
const PERIODOS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
const CONCEPTOS = [
  { codigo: '301', rotulo: 'Aportes de Seguridad Social (301)' },
  { codigo: '302', rotulo: 'Aportes de Obra Social (302)' },
  { codigo: '351', rotulo: 'Contribuciones de Seguridad Social (351)' },
  { codigo: '352', rotulo: 'Contribuciones de Obra Social (352)' },
  { codigo: '312', rotulo: 'L.R.T. — ART (312)' },
  { codigo: '028', rotulo: 'Seguro Colectivo de Vida Obligatorio (028)' },
]
const PLANES = [{
  nombre: 'Plan F931 W303094 — financiación de junio 2026', n: 3, pagadas: 0, saldo: 7484627,
  proxima: '2026-09-10', total: 7484627,
  porMes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2494876, 2494876, 2494876, 0],
}]
const gCS = grillaCS({
  periodos: PERIODOS, conceptos: CONCEPTOS, ps: PLANES, C: COLS,
  bloqueBase: { inicio: 495, fin: 510 },
})
const filaCS = (re) => gCS.filas.find((f) => re.test(String(f[0] ?? '')))
// LA ÚLTIMA, NO LA PRIMERA. Los rótulos FCL · UOCRA · IERIC · FODECO aparecen DOS veces: en el cuadro
// de lo pagado (sección 2) y en el de la proyección (sección 4). Buscar la primera medía el cuadro
// equivocado — que es, en chiquito, el mismo defecto de anclar en la posición que este repo ya pagó.
const filaProyCS = (re) => [...gCS.filas].reverse().find((f) => re.test(String(f[0] ?? '')))
const textoCS = gCS.filas.flat().map(String).join('\n')

test('B10 · EL SAC SE DEVENGA LOS DOCE MESES, no hasta donde llegan las DDJJ', () => {
  // El defecto: `=B$20/12` sobre la remuneración DECLARADA. De julio en adelante esa fila está vacía,
  // así que el devengado se cortaba y el pagado seguía: la provisión acumulada terminaba diciembre en
  // −$10.308.830. Un aguinaldo pagado contra un devengado que dejó de devengarse.
  const dev = filaCS(/^SAC devengado/)
  assert.ok(dev, 'desapareció la fila del SAC devengado')
  for (let m = 1; m <= 12; m++) {
    const c = String(dev[m])
    assert.ok(c.startsWith('='), `mes ${m}: el SAC devengado quedó vacío — la provisión va a cerrar el año en negativo`)
    assert.match(c, /IF\(N\(\w\$\d+\)>0;/, `mes ${m}: no cae a la remuneración proyectada cuando no hay DDJJ`)
  }
})

test('A7 · LA DOTACIÓN ES LA ÚLTIMA REAL, NO UN AVERAGE — y se controla contra otra fuente', () => {
  const dot = filaCS(/^Dotación proyectada/)
  const celda = String(dot[7])
  assert.doesNotMatch(celda, /AVERAGE/, 'volvió el promedio: 21 personas que no fueron ciertas ningún mes')
  assert.match(celda, /INDEX\(.*COUNT\(/, 'tiene que tomar el último mes con DDJJ')
  // Y el control cruzado: la planilla de jornales, que es otra fuente.
  const ctrl = filaCS(/plantel de la última quincena/)
  assert.ok(ctrl, 'sin el contraste, la dotación se valida contra sí misma')
  assert.match(String(ctrl[1]), /JORNALES_REAL_PERSONAS/)
  assert.match(String(ctrl[2]), /▲ la DDJJ y la planilla no coinciden/)
})

test('B13 · IERIC y FODECO multiplican la DOTACIÓN, no la remuneración', () => {
  const dot = gCS.filas.indexOf(filaCS(/^Dotación proyectada/)) + 1
  const rem = gCS.filas.indexOf(filaCS(/^Remuneración proyectada/)) + 1
  for (const r of ['IERIC', 'FODECO']) {
    const f = filaProyCS(new RegExp(`^${r}$`))
    assert.ok(f, `desapareció la fila de ${r}`)
    const c = String(f[8])
    assert.match(c, new RegExp(`\\*I\\$${dot}$`), `${r} volvió a proyectarse sobre la masa salarial`)
    assert.doesNotMatch(c, new RegExp(`\\$${rem}\\b`))
  }
  assert.match(textoCS, new RegExp(RANGO_IERIC))
})

test('FCL usa la alícuota legal por antigüedad, y la antigüedad sale del espejo', () => {
  const fcl = filaProyCS(/^FCL$/)
  assert.match(String(fcl[8]), new RegExp(RANGO_FCL_PRIMER_ANIO))
  const antig = filaCS(/en su primer año de antigüedad/)
  assert.ok(antig, 'falta la fila que mide la proporción del plantel en su primer año')
  assert.match(String(antig[1]), /'_J_OBREROS'!\$C\$495:\$C\$510/)
})

test('LO QUE NO SE PUDO VERIFICAR ESTÁ DECLARADO EN LA PESTAÑA, no sólo en el código', () => {
  // Sin esto, un número normativo inventado se lee igual que uno verificado. Es la condición que el
  // dueño puso para aceptar un parámetro en lugar de una alícuota citada.
  assert.ok(textoCS.includes(A_VERIFICAR), 'la marca de "a verificar" no llegó a ninguna celda de la pestaña')
  const conMarca = gCS.filas.filter((f) => f.some((c) => String(c ?? '').includes(A_VERIFICAR))).length
  assert.ok(conMarca >= 3, `sólo ${conMarca} fila(s) declaran el límite: FCL, IERIC y FODECO tienen que decirlo`)
})

test('B9 · LA DEUDA EN PLANES ES UNA FÓRMULA VIVA, no un número pegado', () => {
  const deuda = filaCS(/^⇒ En planes de pago/)
  const v = deuda[1]
  assert.equal(typeof v, 'string', `sigue siendo un número pegado: ${v}`)
  assert.ok(String(v).startsWith('='))
})

test('B8 · "POR PAGAR" INCLUYE EL MES EN CURSO — el criterio de posición perdía $2,97M', () => {
  // EL DEFECTO, MEDIDO EL 06/08. La fórmula sumaba las columnas cuyo número de mes fuera
  // `> MONTH(TODAY())`: agosto quedaba afuera ENTERO y el hero decía $4.989.751. Las cuotas de agosto
  // —$473.767 con vencimiento el 16 y $2.494.876 de la financiación de junio, ninguna pagada— no
  // estaban en ningún lado. Con el criterio por HECHO (lo que la planilla no marcó "Pagado") el hero
  // da $7.958.394,73, que es exactamente lo que el Libro ya trae como compromiso.
  const v = String(filaCS(/^⇒ En planes de pago/)[1])
  assert.doesNotMatch(v, /MONTH\(TODAY\(\)\)/,
    'volvió el criterio de posición: el mes en curso se pierde entero y con él la cuota que vence esta semana')
  assert.match(v, /"<>Pagado"/, 'lo que falta pagar es lo que la planilla no marcó pagado, no lo que vence después')
  assert.match(v, /Deuda previsional \(planes de pago\)/, 'tiene que filtrar por el rubro, no por el cliente')
  // La columna del estado es la del cargador (Pagado/Pendiente), NO el semáforo con emoji: "<>Pagado"
  // contra "✅ Pagado" no excluye nada y el hero mostraría el total del rubro, pagadas incluidas.
  assert.match(v, new RegExp(`Compras!\\$${COLS.estado}\\$4`), 'la columna de estado tiene que ser la resuelta por rótulo')
})

test('B11 · los avisos ▲ tienen su texto EN la celda, no en la columna que el generador vacía', () => {
  // El filtro miraba SÓLO el texto del rótulo: cualquier fila que empezara con "Fondo de Cese"
  // entraba, incluida una fila de DATOS mensuales agregada el 18/08 ("Fondo de Cese devengado
  // (DDJJ UOCRA)"). Un renglón con doce importes no es un aviso y no tiene por qué explicarse en su
  // propio rótulo. Lo que distingue a un aviso no es cómo empieza: es que ocupa la fila entera y no
  // trae ni un número. Se afila por esa condición, que es la que el test de verdad quiere probar.
  const esAviso = (f) => (/^[▲]/.test(String(f[0] ?? '')) || /^(Vacaciones|Fondo de Cese)/.test(String(f[0] ?? '')))
    && f.slice(1, ANCHO_CS - 1).every((c) => c === '' || c == null || c === VACIO_CS)
  const avisos = gCS.filas.filter(esAviso)
  assert.ok(avisos.length >= 4, `esperaba los cuatro avisos y encontré ${avisos.length}`)
  for (const a of avisos) {
    assert.ok(String(a[0]).length > 70,
      `"${String(a[0]).slice(0, 40)}…" quedó como un ▲ mudo: su explicación vive en la columna de prosa que este mismo generador borra`)
    assert.equal(a[ANCHO_CS - 1], VACIO_CS, 'la explicación no puede volver a la columna O')
  }
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA POSICIÓN, EN EL IDIOMA DE JORNALES (06/08). El dueño: "separar real / comprometido /
// proyectado". El hero partía por PROCEDENCIA del dato ("declarado en las DDJJ" contra "proyectado")
// y hablaba en "devengado": vocabulario contable en una pestaña del Flujo de Caja, que no contesta
// en qué estado está la plata. Lo que estos tests protegen es que la partición nueva sea EXACTA —si
// las tres no suman el titular, hay plata en un limbo que nadie mira— y que no vuelva a contar dos
// veces lo que ya está adentro.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const heroCS = (re) => gCS.filas.findIndex((f) => re.test(String(f[0] ?? ''))) + 1

test('la posición habla REAL · COMPROMETIDO · PROYECTADO, como su hermana Jornales', () => {
  for (const estado of [/^ {3}· REAL · /, /^ {3}· COMPROMETIDO · /, /^ {3}· PROYECTADO · /]) {
    assert.ok(filaCS(estado), `falta la línea ${estado} en la posición: la pestaña sigue hablando sólo en devengado`)
  }
})

test('las tres particiones SUMAN el titular: sin huecos y sin solapamiento', () => {
  // El titular no puede ser una cuarta cifra calculada por su cuenta. Si lo fuera, el día que una
  // partición se mueva el hero seguiría cerrando contra sí mismo y la plata faltante no se vería.
  const [fTit, fReal, fComp, fProy] = [
    /^⇒ Costo laboral del año/, /^ {3}· REAL · /, /^ {3}· COMPROMETIDO · /, /^ {3}· PROYECTADO · /,
  ].map(heroCS)
  assert.equal(String(filaCS(/^⇒ Costo laboral del año/)[1]), `=$B$${fReal}+$B$${fComp}+$B$${fProy}`)
  assert.ok(fTit < fReal, 'el titular va arriba de sus partes')
})

test('COMPROMETIDO sale POR DIFERENCIA: entre lo declarado y lo pagado no puede quedar un hueco', () => {
  // Mismo criterio que Jornales. Si algún día lo pagado supera a lo declarado, esta celda se va a
  // negativo Y SE VE —querría decir que se pagó un período cuya DDJJ no está leída—. Un MAX(...;0)
  // taparía exactamente el caso que hay que ver.
  const v = String(filaCS(/^ {3}· COMPROMETIDO · /)[1])
  const fDecl = heroCS(/^⇒ Total declarado/)
  assert.equal(v, `=SUM($B$${fDecl}:$M$${fDecl})-$B$${heroCS(/^ {3}· REAL · /)}`)
  assert.doesNotMatch(v, /MAX\(/, 'un piso en cero esconde el único caso que esta fila tiene que denunciar')
  // Y el declarado se lee de la fila ENTERA: con el rango de seis meses, la DDJJ de julio entraría a
  // la pestaña y el hero seguiría mostrando el año hasta junio sin avisar.
  assert.match(v, /:\$M\$/, 'el hero volvió a leer sólo los seis primeros meses')
})

test('REAL arranca en FEBRERO: el F931 de enero es la DDJJ de diciembre del año anterior', () => {
  // Contarlo infla lo REAL y achica lo COMPROMETIDO en $3.811.458 (medido el 06/08) — y COMPROMETIDO
  // es el número con el que se decide qué hay que pagar.
  const v = String(filaCS(/^ {3}· REAL · /)[1])
  assert.match(v, /^=SUM\(\$C\$\d+:\$M\$\d+\)$/, `REAL volvió a incluir enero: ${v}`)
})

test('los planes NO son una cuarta partición, y la pestaña lo dice al lado del número', () => {
  // Financian parte de lo que arriba figura como COMPROMETIDO (las DDJJ de enero y junio 2026 se
  // refinanciaron) y arrastran cuotas de un plan de 2025. Sumarlo al titular lo contaría dos veces.
  const planes = filaCS(/^⇒ En planes de pago/)
  assert.match(String(planes[2]), /comprometido/i, 'sin la aclaración al lado, el que lee lo suma al titular')
  assert.ok(String(planes[2]).length <= 60, 'un texto largo en el medio de la grilla desparrama la fila')
  assert.doesNotMatch(String(filaCS(/^⇒ Costo laboral del año/)[1]), new RegExp(`\\$B\\$${heroCS(/^⇒ En planes de pago/)}\\b`))
})

test('las notas al pie y el control se declaran para que la piel los dibuje distinto', () => {
  // Las cuatro advertencias salían con el peso de un importe (tres, además, en negrita y con regla
  // encima, porque empiezan con ⚠ y la piel compartida lee eso como un total). Y el control de
  // integridad, cuyo cero ES la respuesta, salía como el mismo "—" que significa "no hay dato".
  assert.equal(gCS.pies.length, 4, `esperaba las cuatro notas al pie y llegaron ${gCS.pies.length}`)
  for (const f of gCS.pies) assert.match(String(gCS.filas[f - 1][0]), /^▲ /, 'una nota al pie declarada que no es una nota')
  assert.deepEqual(gCS.controles, [heroCS(/^⇒ Diferencia — tiene que ser \$0/)])
})

test('la pestaña armada cumple el patrón de diseño: cero defectos', () => {
  const vista = gCS.filas.map((f) => f.map((c) => {
    const s = String(c ?? '')
    return s === VACIO_CS ? '' : (s.startsWith('=') ? '123' : s)
  }))
  const d = patronCS(vista)
  assert.deepEqual(d, [], d.map((x) => `fila ${x.fila} · ${x.regla} · ${x.detalle}`).join('\n'))
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA CADENA PUBLICADA (06/08) — la fila que decía "ésta es la que tiene que mirar el cash flow" y
// que no miraba nadie. Sin estos tres rangos con nombre, el Libro proyecta las cargas con las filas
// planas tipeadas en Compras.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('la pestaña publica la serie de cargas, anclada a sus rótulos y sin rangos ciegos', () => {
  const quiero = rangosDeCargas(gCS.rangos)
  assert.deepEqual(quiero.map((r) => r.nombre), Object.values(NOMBRES_CARGAS))
  const problemas = verificarRangosCS(gCS.filas, quiero)
  assert.deepEqual(problemas, [], explicarProblemasCS(problemas))
})

test('los subtotales son DOS: el F931 y los gremiales son dos líneas del cash flow', () => {
  const f931 = filaCS(new RegExp(`^${ROTULOS_CARGAS.f931.replace(/[⇒]/, '⇒')}`))
  const grem = filaCS(new RegExp(ROTULOS_CARGAS.gremiales.slice(2, 30)))
  assert.ok(f931 && grem, 'sin los dos subtotales, los gremiales se mudan a la línea de cargas sociales')
  // El total del mes es la suma de los dos, no un SUM sobre el bloque: con las filas de subtotal
  // adentro del rango, cada concepto se contaría dos veces.
  const tot = String(filaCS(/^⇒ Total devengado en el mes/)[8])
  assert.doesNotMatch(tot, /SUM\(/, 'un SUM sobre el bloque ahora incluiría los dos subtotales')
  assert.match(tot, /^=I\d+\+I\d+$/)
})

test('la fila de fechas fecha la salida al MES SIGUIENTE, y diciembre cae en enero del año que viene', () => {
  const fechas = filaCS(new RegExp(ROTULOS_CARGAS.fechas.trim().slice(0, 20)))
  assert.ok(fechas, 'sin la fila de fechas el Libro no puede ubicar la cadena en ningún tramo del calendario')
  assert.equal(fechas[7], `=DATE(2026;8;MAX(1;N(${RANGO_DIA_PAGO_F931})))`, 'el devengado de julio sale en agosto')
  // DICIEMBRE SALE EN ENERO DEL AÑO QUE VIENE: son $10.507.157 (medidos el 06/08) que ninguna vista
  // levantaba, porque la grilla del año termina en diciembre. Y se escribe con su año, no como mes 13.
  assert.equal(fechas[12], `=DATE(2027;1;MAX(1;N(${RANGO_DIA_PAGO_F931})))`)
  assert.doesNotMatch(gCS.filas.flat().map(String).join(' '), /DATE\(\d{4};1[3-9];/, 'volvió el mes 13')
  assert.equal(fechas[13], VACIO_CS, 'una fila de fechas no se totaliza')
})

test('el día de pago vive en Parámetros, no adentro de la fórmula', () => {
  const p = PARAMETROS_CARGAS.find((x) => x.rango === RANGO_DIA_PAGO_F931)
  assert.ok(p, 'sin el parámetro, la fila de fechas queda en #NAME? y la cadena no entra al libro')
  assert.equal(p.valor, 10, 'la moda de los seis pagos reales de F931 cargados en Compras')
  assert.ok(p.nota.includes(A_VERIFICAR), 'el calendario de ARCA para F931 no está cableado: hay que decirlo')
})

test('B12 · el SAC "pagado" se corta HOY: lo cargado con fecha futura es previsión', () => {
  // El defecto: la fila sumaba por fecha de FACTURA sin tope, así que los $8.500.000 con fecha 30/12
  // y estado "Proyectado" entraban como pagados y la provisión acumulada cerraba el año en
  // −$4.914.913 — la pestaña afirmando que se pagó más aguinaldo del que se devengó.
  const pag = String(filaCS(/^SAC pagado/)[12])
  assert.match(pag, /<=TODAY\(\)/, 'sin el tope, un aguinaldo previsto para diciembre se cuenta como pagado')
  assert.match(pag, /LOWER\(Compras!\$E\$4:\$E\)="sac"/)
})

test('B78 · el control de planes resta DOS CELDAS VIVAS: ninguna constante de la corrida', () => {
  const dif = filaCS(/^⇒ Diferencia — tiene que ser \$0/)
  assert.match(String(dif[1]), /^=\$B\$\d+-\$N\$\d+$/,
    `el control volvió a restar contra una constante: ${dif[1]}`)
})

test('NINGUNA FÓRMULA DE LA GRILLA LLEVA UN LITERAL DE MILLONES ADENTRO', () => {
  // Un número grande estampado en una fórmula es una foto del día de la corrida: el control que lo
  // usa da cero cuando se escribe y miente para siempre después. Se escanea la grilla entera y no
  // sólo el control, porque el defecto se repite solo.
  const culpables = []
  gCS.filas.forEach((f, i) => f.forEach((c, j) => {
    const s = String(c ?? '')
    if (!s.startsWith('=')) return
    // Los años (2026, 2027) son cuatro dígitos y son legítimos; un importe tiene siete o más.
    const m = s.match(/(?<![\d.,])\d{7,}(?![\d.,])/)
    if (m) culpables.push(`fila ${i + 1} col ${j}: …${s.slice(Math.max(0, s.indexOf(m[0]) - 24), s.indexOf(m[0]) + m[0].length)}`)
  }))
  assert.deepEqual(culpables, [], culpables.join('\n'))
})

test('lo que no es plata no se dibuja como plata: personas, proporción y fechas', () => {
  const fila = (re) => gCS.filas.findIndex((f) => re.test(String(f[0] ?? ''))) + 1
  assert.ok(gCS.cantidades.includes(fila(/plantel de la última quincena/)),
    'las 16 personas del control de plantel se dibujaban "$16"')
  assert.ok(gCS.ratios.includes(fila(/en su primer año de antigüedad/)),
    'la proporción 0,7 del plantel se dibujaba "$1"')
  assert.deepEqual(gCS.fechas, [fila(new RegExp(ROTULOS_CARGAS.fechas.trim().slice(0, 20)))],
    'la fila de fechas sin formato de fecha sale "$46.244"')
})

test('la cadena arranca en los jornales: la remuneración proyectada cuelga de sus rangos con nombre', () => {
  const j = jornalesDelMes('DATE(2026;9;1)')
  assert.match(j, /JORNALES_REAL_TOTAL/)
  assert.match(j, /JORNALES_PROY_TOTAL/)
  const rem = filaCS(/^Remuneración proyectada/)
  assert.match(String(rem[9]), /JORNALES_PROY_TOTAL/, 'la remuneración dejó de colgar de los jornales proyectados')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL BLOQUE 2 DECÍA "SALIÓ DE LA CAJA" SOBRE PLATA QUE NO SALIÓ (17/08/2026)
//
// Medido contra el Sheet vivo. La fila «F931» del bloque *"2 · PAGADO — ¿cuánto salió efectivamente
// de la caja?"* publicaba **$10.494.876 en ago-26**. Ninguno de esos pesos salió:
//
//   · Compras f469 — $8.000.000, ARCA, fecha de caja 10/08, estado **«Proyectado»**. Es el número
//     redondo tipeado que `libro-extractores-cargas.mjs` ya denuncia en su cabecera como previsión.
//   · Compras f725 — $2.494.876, cuota del plan W303094, fecha 16/08, estado **«Pendiente»**, rubro
//     «Deuda previsional (planes de pago)» — pero con "F931" en Cliente/Asignación, así que entraba
//     por la puerta del F931 Y volvía a contarse en la fila del plan de al lado.
//
// EL TOPE DE HOY NO ALCANZA, Y ÉSE ERA EL ERROR DE FONDO. El arreglo del 23/07 cortó el futuro
// (`<=TODAY()`), que resuelve los meses que vienen; no resuelve la fila de ESTE mes cuya fecha
// prevista ya pasó y que nadie marcó. Una fecha vencida no es un pago: es una previsión atrasada.
//
// Y LA PROPIA PESTAÑA YA SABÍA CÓMO SE PREGUNTA. Doce filas más arriba, el hero de planes de pago
// mide por HECHO (`"<>Pagado"` sobre la columna del cargador) y por eso da bien. Dos definiciones de
// "pagado" en la misma pestaña: la de arriba correcta y la de abajo por fecha. La consecuencia se
// propagaba al hero —REAL inflado ~$10,5M y COMPROMETIDO desinflado en lo mismo, porque sale por
// diferencia— y a la sección 3, que llegó a declarar $10.494.876 de sobrepago inexistente.
//
// LO QUE ESTOS TESTS NO HACEN, Y ES DELIBERADO: no leen la fila 25 para decidir nada. Un extractor
// que retire deuda porque este cuadro dice "pagado" estaría validando el control contra la misma
// información que lo produce (la fila sale de Compras, y la cadena existe para reemplazar a Compras).
// El candado de ese lado vive en `lib/libro-extractores-cargas.test.mjs`.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** Las filas del bloque 2. `filaCS` devuelve la PRIMERA coincidencia y el bloque 2 va antes que el 4,
 *  donde FCL/UOCRA/IERIC/FODECO vuelven a aparecer como proyección. */
const CONCEPTOS_PAGADOS = ['F931', 'Deuda previsional en cuotas', 'FCL', 'UOCRA', 'IERIC', 'FODECO']

test('2 · PAGADO: una fila que la planilla NO marcó "Pagado" no salió de la caja', () => {
  const sinEstado = []
  for (const rotulo of CONCEPTOS_PAGADOS) {
    const f = filaCS(new RegExp(`^${rotulo}$`))
    assert.ok(f, `no encontré la fila «${rotulo}» del bloque de lo pagado`)
    // Se mira una columna cualquiera de la grilla mensual (ago = índice 8): las doce se generan igual.
    const v = String(f[8] ?? '')
    if (!new RegExp(`Compras!\\$${COLS.estado}\\$4`).test(v) || !/"Pagado"/.test(v)) sinEstado.push(`${rotulo}: ${v}`)
  }
  assert.deepEqual(sinEstado, [],
    'estas filas dicen "salió de la caja" mirando sólo la FECHA. Al 17/08 eso publicó $10.494.876 de '
    + `F931 pagado en agosto contra $0 realmente pagados:\n${sinEstado.join('\n')}`)
})

test('2 · PAGADO: el tope de HOY se queda, pero ya no decide solo', () => {
  // El arreglo del 23/07 sigue vigente y hace falta: una fila marcada "Pagado" con fecha de caja
  // futura tampoco salió todavía. Los dos filtros son necesarios y ninguno reemplaza al otro.
  for (const rotulo of CONCEPTOS_PAGADOS) {
    assert.match(String(filaCS(new RegExp(`^${rotulo}$`))[8]), /TODAY\(\)/,
      `«${rotulo}» perdió el tope de hoy: lo previsto para diciembre volvería a contarse como pagado`)
  }
})

test('2 · PAGADO: la cuota de un plan no entra por la fila del F931', () => {
  // Compras f725 tiene "F931" en Cliente/Asignación y rubro «Deuda previsional (planes de pago)».
  // Con el criterio por cliente solo, sus $2.494.876 sumaban en la fila del F931 mientras la fila del
  // plan los contaba aparte: el mismo peso, dos veces, dentro del mismo cuadro.
  const f931 = String(filaCS(/^F931$/)[8])
  assert.match(f931, new RegExp(`Compras!\\$${COLS.rubro}\\$4`),
    'la fila del F931 no acota por rubro: una cuota de plan rotulada "F931" se cuenta como F931')
  assert.match(f931, /Nómina · Cargas sociales/, 'el rubro tiene que ser el de la taxonomía única')
})

test('2 · PAGADO: los gremiales se acotan a SU rubro', () => {
  for (const rotulo of ['FCL', 'UOCRA', 'IERIC', 'FODECO']) {
    const v = String(filaCS(new RegExp(`^${rotulo}$`))[8])
    assert.match(v, /Nómina · Gremiales/,
      `«${rotulo}» no acota por rubro: cualquier fila con ese texto en Cliente/Asignación entra al cuadro`)
  }
})

test('UNA SOLA DEFINICIÓN DE "PAGADO" EN TODA LA PESTAÑA', () => {
  // El defecto no fue una fórmula: fue que convivieran dos criterios para la misma palabra. Este test
  // los ata. Si mañana alguien agrega un cuadro de "lo que salió" con un tercer criterio, se pone rojo.
  const hero = String(filaCS(/^⇒ En planes de pago/)[1])
  assert.match(hero, new RegExp(`Compras!\\$${COLS.estado}\\$4`), 'el hero mide por estado')
  for (const rotulo of CONCEPTOS_PAGADOS) {
    assert.match(String(filaCS(new RegExp(`^${rotulo}$`))[8]), new RegExp(`Compras!\\$${COLS.estado}\\$4`),
      `«${rotulo}» mide "pagado" por un criterio distinto al del hero, en la misma pestaña`)
  }
})
