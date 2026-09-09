#!/usr/bin/env node
// LA PESTAÑA "CARGAS SOCIALES" — UN SOLO DUEÑO, UNA SOLA GRILLA.
//
// POR QUÉ SE REHIZO (23/07). El dueño: "rompiste la pestaña cargas sociales" y "no respeta el
// patrón de diseño". Las dos cosas eran ciertas y tenían la MISMA causa de fondo.
//
//   LA ROTURA. El cuadro de lo PAGADO mostraba seis meses de #VALUE!. Sus fórmulas referenciaban la
//   columna de fecha de Compras por su LETRA; alguien movió una columna en Compras y la referencia
//   quedó en #REF!. Nadie se enteró porque ese bloque NO TENÍA DUEÑO: ningún script lo reescribía,
//   así que el error se congeló ahí. Ahora las columnas de Compras se resuelven por su ENCABEZADO
//   (lib/compras-columnas.mjs): el día que se mueva una columna, la fórmula la sigue.
//
//   EL DESORDEN. La pestaña la escribían TRES scripts distintos, cada uno con su propio ancho de
//   grilla —había bloques de 7, 8, 9, 10 y 14 columnas—, más dos bloques huérfanos que nadie
//   reclamaba. Eso es exactamente lo que se ve como "descuadrado": cada cuadro empieza y termina en
//   una columna distinta del de arriba. Un solo script no puede descuadrarse contra sí mismo.
//
// DÓNDE VIVE CADA COSA (06/08). La GRILLA —una sola para toda la pestaña, A el concepto, B..M los
// doce meses, N el total, O de dónde sale— está en `lib/cargas-grilla.mjs`, y los SIETE CUADROS que
// la usan en `lib/cargas-bloques.mjs`. Acá queda lo que sólo se puede hacer contra Google: leer las
// fuentes, armar el hero, fusionar respetando lo que editó una persona, formatear y publicar los
// rangos con nombre por los que entra el Libro.
//
//   node orquestador/scripts/cargas-sociales-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { conColaMedida, avisoDeCola, cuerpoProbadoPorForma } from '../lib/cola-de-rango.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { resolverColumnas, rango } from '../lib/compras-columnas.mjs'
import { total as rotuloTotal, auditarPatron } from '../lib/patron-pestana.mjs'
import { vaciarColumnaDeProsa } from '../lib/nota-celda.mjs'
import { PESTAÑA as RAW, COL as F931_COL, FILA0 as F931_FILA0 } from './f931-sheet.mjs'
import { formulaUltimaFecha, formulaUltimoPeriodo, rotuloPorFuente, DIAS_AVISO_MENSUAL } from '../lib/fecha-de-frescura.mjs'
import { CONCEPTOS_CADENA, parametrosDeCargas, divergenciaDePlantel, TOLERANCIA_PLANTEL, A_VERIFICAR } from '../lib/cargas-cadena.mjs'
import { ALERTA } from '../lib/glifos.mjs'
// LA PESTAÑA PUBLICA, EL LIBRO LEE — y los rótulos que anclan cada nombre se declaran UNA vez, en el
// módulo que los consume. Escritos de los dos lados, el día que uno cambie el nombre queda apuntando
// a la fila de al lado y devuelve un número plausible en vez de un error.
import { rangosDeCargas, NOMBRES_CARGAS } from '../lib/libro-extractores-cargas.mjs'
import { aRangoApi, verificarRangos, explicarProblemas } from '../lib/rangos-con-nombre.mjs'
import { detectarQuincenas } from '../lib/nomina-sync.mjs'
import { ultimaQuincenaCerrada, personasDelBloque } from '../lib/motor-salarial.mjs'
import { bloqueDelPlantel } from '../lib/jornales-piso-uocra.mjs'
import { asegurarParametros, ultimoDiaCargado, PESTAÑA as PESTAÑA_JORNALES } from './jornales-pestana.mjs'
import { baseDeJornales } from '../lib/proyeccion-convenio.mjs'
import { ANCHO, COL_ORIGEN, SIN_DDJJ, cm, crearGrilla, desdeQueMesSeProyecta } from '../lib/cargas-grilla.mjs'
import { bloqueDeclarado, bloquePagado, bloqueProyeccion, bloquePlanes } from '../lib/cargas-bloques.mjs'
import { planesDePago } from '../lib/cargas-planes.mjs'
import { formatear } from '../lib/cargas-piel.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Cargas Sociales'
const DRY = process.argv.includes('--dry')
const AÑO = 2026
// SE CASA POR CÓDIGO, NO POR RÓTULO.
//
// EL DEFECTO QUE ESTO CORRIGE (23/07). La primera versión buscaba la fila del concepto por su
// nombre. Los PDF de ARCA dicen "Aportes de Seguridad Social" y esta lista decía "Aportes Seguridad
// Social": no coincidía, así que CUATRO de los seis conceptos declarados quedaban fuera de la
// proyección. Y no fallaba —el cuadro se dibujaba entero— sólo proyectaba $2,8M por mes en vez de
// $6,6M. El titular de la pestaña quedaba 60% corto y nada lo avisaba. Un código de la DDJJ no lo
// reescribe nadie; un rótulo, sí.
// LA LISTA VIVE EN lib/cargas-cadena.mjs, NO ACÁ. Se reexporta con su nombre viejo porque los tests
// y el resto del OS la citan así: un rename gratuito rompe consumidores sin arreglar nada.
export const CONCEPTOS_PROY = CONCEPTOS_CADENA
// Ídem el primer eslabón de la cadena: la expresión de los jornales del mes se mudó a la misma lib
// —la usan los bloques, no este archivo— y se reexporta para no romper a quien la cita por acá.
export { jornalesDelMes } from '../lib/cargas-cadena.mjs'

/**
 * LOS PENDIENTES QUE NO SON DE NINGÚN CUADRO — sobreviven al retiro de la sección 6.
 *
 * Los dos salían de «SAC y vacaciones», que se retiró el 09/09 por ser devengado en un archivo
 * percibido. Ninguno de los dos era una nota al pie: son trabajo pendiente con dueño. Se imprimen en
 * cada corrida, que es donde los ve quien puede resolverlos.
 */
const AVISOS_DEL_DOMINIO = Object.freeze([
  `${ALERTA} Vacaciones: cargá en Parámetros los días por tramo que confirme el contador — no se inventan`,
  `${ALERTA} Fondo de Cese (Ley 22.250) — ${A_VERIFICAR}: que los aportes estén al día (DDJJ de UOCRA contra lo pagado en Compras)`,
])

/** NÚCLEO PURO: arma la grilla entera de la pestaña. Devuelve las filas y las marcas que usa el formato. */
export function grilla({ periodos, conceptos, ps, C, baseJornales = null }) {
  const desdeProy = desdeQueMesSeProyecta(periodos)
  const G = crearGrilla(AÑO)

  // ── TÍTULO Y HERO ──────────────────────────────────────────────────────────────────────────────
  G.push(['Cargas sociales'])
  // LA FRESCURA VA DECLARADA POR FUENTE, NO EN UNA SOLA FECHA (03/08).
  //
  // Era `al ${HOY}` —el día en que corría el script—, y el arreglo evidente (un MAX sobre las dos
  // fuentes) sería peor: Compras se mueve todos los días y el F931 sale de los PDF del data room, que
  // se quedan en el último período presentado. El MAX pondría la fecha de Compras arriba del cuadro
  // "declarado en las DDJJ F931", que hace un mes y medio que no cambia. El porqué, en
  // lib/fecha-de-frescura.mjs; el criterio es el mismo que en "Impuestos y Financieros".
  //
  // El F931 declara su PERÍODO, no la fecha en que se leyó el PDF: una DDJJ de junio presentada en
  // julio habla de junio, y decir "al 16/07" sería declarar frescura de la gestión, no del dato.
  //
  // ═══ Y LA PROSA SE FUE DE LA A2 (09/09/2026) ═══
  //
  // Decía «Qué genera la nómina, qué se paga y cuándo sale de la caja · …»: eso ya lo contestan el
  // nombre en A1 y los cuatro títulos de sección. La fila 2 sólo declara PROCEDENCIA y queda
  // `F931 al dd/mm · Compras al dd/mm`. NO se pudo dejar UNA sola fecha, como se pidió: las dos
  // fuentes tienen frescuras distintas —el F931 sale de PDF y se congela en el último período
  // presentado— y resumirlas le presta la frescura de la viva a la congelada, que es justo lo que
  // `rotuloPorFuente` existe para impedir.
  G.push([rotuloPorFuente('', [
    { nombre: 'F931', expr: formulaUltimoPeriodo(`${RAW}!$${F931_COL.periodo}$${F931_FILA0}:$${F931_COL.periodo}`), avisoDias: DIAS_AVISO_MENSUAL },
    // Lo pagado sale de Compras, por la misma columna de fecha que usan las SUMIFS de la sección 3.
    // `mixto`: esa columna convive como serial y como texto tipeado — un MAX crudo pierde las
    // tipeadas EN SILENCIO y declararía como corte la última que entró por casualidad como número.
    { nombre: 'Compras', expr: formulaUltimaFecha(rango(C.fecha), { mixto: true }) },
  ])])
  G.push()

  // ═══ EL TITULAR CONTESTA DOS PREGUNTAS, Y LAS DOS SON DE CAJA (09/09/2026) ═══
  //
  // Decía «Costo laboral del año — devengado $100.057.714» en un archivo que es PERCIBIDO, y se
  // partía en REAL · COMPROMETIDO · PROYECTADO — tres líneas cuya suma era ese devengado. Un número
  // devengado arriba de una pestaña del Flujo de Caja contesta una pregunta que este archivo no se
  // hace, y encima mezcla ocho meses declarados con cuatro proyectados en una sola cifra.
  //
  // El dueño aprobó reemplazarlo por las dos preguntas que sí decide acá:
  //   · CUÁNTO SALIÓ este año por cargas sociales — la suma del cuadro 2, que mide por HECHO
  //     («Pagado» en Compras) y no por fecha.
  //   · CUÁNDO Y CUÁNTO SALE LO PRÓXIMO — la primera fecha de CARGAS_MES_FECHAS que todavía no pasó,
  //     con el importe que le corresponde en CARGAS_MES_F931_DECLARADO. Se lee por los rangos con
  //     NOMBRE y no por número de fila: es la misma serie que lee el Libro Canónico, así que el
  //     titular y el cash flow no pueden discrepar sobre cuál es el próximo vencimiento.
  //
  // `COUNTIF(<"&TODAY())+1` es «la primera que NO pasó»: incluye la de HOY, que es justo el día en
  // que la pregunta más importa. Con un MATCH(...;1)+1 el vencimiento desaparecía del titular el
  // mismo día que vence.
  const proximo = `COUNTIF(${NOMBRES_CARGAS.fechas};"<"&TODAY())+1`
  // «Cargas sociales pagadas en el año» no entraba en la columna A de 300 px y derramaba sobre el
  // importe (medido en la copia). La pestaña ya se llama «Cargas Sociales»: el rótulo no tiene que
  // repetirlo.
  const hPagado = G.push([rotuloTotal('Pagado en el año'), '@PAGADO', ...Array(11).fill(VACIO), VACIO, 'Sección 2 · lo que Compras marcó Pagado.'])
  const hProximo = G.push([rotuloTotal('Próximo vencimiento'),
    `=IFERROR(INDEX(${NOMBRES_CARGAS.declarado};${proximo});"")`,
    `=IFERROR(INDEX(${NOMBRES_CARGAS.fechas};${proximo});"")`,
    ...Array(10).fill(VACIO), VACIO, 'La primera fecha que no pasó, con su F931.'])
  G.push()

  // ── LOS CUATRO CUADROS ─────────────────────────────────────────────────────────────────────────
  // Cada uno devuelve en qué fila quedaron sus totales: el de abajo los REFERENCIA en vez de
  // recalcular el mismo número por otro camino, que es como aparecen dos verdades en una pestaña.
  const decl = bloqueDeclarado(G, { anio: AÑO, periodos, conceptos })
  // El código 312 es la ART DENTRO de la DDJJ, no un comprobante aparte: el cuadro de lo pagado lo
  // desglosa sin volver a sumarlo. El porqué, con la evidencia, en `bloquePagado`.
  const pag = bloquePagado(G, { anio: AÑO, C, fArtDecl: decl.filaDecl['312'], fDeclTot: decl.fDeclTot })
  const proy = bloqueProyeccion(G, {
    anio: AÑO, desdeProy, filaDecl: decl.filaDecl, filaPag: pag.filaPag, fRem: decl.fRem, fEmp: decl.fEmp,
    fDeclTot: decl.fDeclTot, baseJornales,
  })
  const planes = bloquePlanes(G, { ps, C })

  // ── EL AÑO NO TERMINA EN AGOSTO (07/09/2026) ────────────────────────────────────────────────────
  //
  // El dueño, dos veces: *«no me podés dejar en cero si siempre tengo empleados»* y, después de la
  // primera corrección, *«sigue mal, tengo empleados desde siempre, no podés poner un cero en ningún
  // mes»*. El SUM sobre celdas vacías daba literalmente 0 y se leía «declaró cero»; el texto «sin
  // DDJJ» ya no miente pero deja el renglón mudo cuatro meses.
  //
  // Lo que falta no es un dato declarado —una DDJJ que todavía no venció no existe y no se inventa—:
  // es que el renglón diga lo que la empresa YA SABE que va a generar. Ese número existe, calculado
  // en la sección 3 desde los jornales del plantel, y acá se REFERENCIA en vez de recalcularse.
  //
  // ═══ SE REFERENCIA EL SUBTOTAL F931, NO EL DEVENGADO TOTAL (09/09/2026) ═══
  //
  // Hasta hoy apuntaba a «Total devengado en el mes», que es F931 **más** gremiales. En una fila que
  // se llama «Total declarado» —y cuyos ocho meses reales son los seis códigos de la DDJJ y nada
  // más— eso es comparar dos canastas distintas dentro del mismo renglón. Y no era sólo de lectura:
  // esta fila ES `CARGAS_MES_F931_DECLARADO`, la serie que el Libro Canónico lee, así que un número
  // con los gremiales adentro habría publicado los gremiales dos veces en el cash flow el día que la
  // celda dejara de ser texto. Con el subtotal F931 la fila es homogénea de enero a diciembre.
  //
  // ═══ Y ES UN NÚMERO, NO UNA FRASE — la distinción la hace el FORMATO (09/09/2026) ═══
  //
  // Decía «≈ $8.717.159 proy.»: un importe convertido en oración, que no se suma ni se ordena ni se
  // compara con el de al lado. La proyección se distingue como en cualquier modelo financiero serio,
  // por la tipografía (gris e itálica, ver `proyectadas`), y el Libro la sigue tratando como
  // proyección porque reconoce que ese número ES el que la propia pestaña publica en CARGAS_MES_F931
  // (ver `obligacionF931`). Si no hubiera proyección, la celda vuelve a decir «sin DDJJ»: un cero
  // sigue sin ser una respuesta posible.
  const proyectadas = { fila: decl.fDeclTot, meses: [] }
  for (let m = 1; m <= 12; m++) {
    if (periodos.includes(`${AÑO}-${String(m).padStart(2, '0')}`)) continue
    proyectadas.meses.push(m)
    G.filas[decl.fDeclTot - 1][m] = `=IF(N(${cm(m)}${proy.fSubF931})=0;"${SIN_DDJJ}";${cm(m)}${proy.fSubF931})`
  }

  // ── EL BACKFILL DE «CUOTAS QUE VENCEN» SE FUE CON SU FILA (09/09/2026) ──────────────────────────
  // Copiaba el vector del cuadro 4 dentro del cuadro 3. Que fuera referencia y no número pegado
  // resolvía la divergencia, no la DUPLICACIÓN. El porqué, en `bloqueProyeccion`.

  // ── EL TITULAR, RECIÉN AHORA: ya se sabe en qué fila quedó el total de lo pagado ────────────────
  // Los DOCE meses, no de febrero en adelante: la pregunta es cuánta plata salió este año por cargas
  // sociales, y la de enero salió este año aunque su devengado sea de diciembre pasado. El hero
  // anterior excluía enero porque medía COSTO DEL AÑO (devengado) y ahí sí habría sido de otro año.
  G.filas[hPagado - 1][1] = `=SUM($B$${pag.fPagTot}:$M$${pag.fPagTot})`

  // NO TODO LO QUE ESTÁ EN LA GRILLA ES PLATA. Una dotación de 21 personas mostrada como "$21" y
  // una relación de 0,67 mostrada como "$1" son números que el ojo lee mal y que además hacen dudar
  // del resto del cuadro. Se declaran acá para que el formato las trate por lo que son.
  // El titular de la pestaña: la cifra que contesta la pregunta de arriba de todo.
  // La celda del veredicto (col C del control de plantel) rinde PROSA desde una fórmula: el formato
  // la pinta TEXTO o el barrido de moneda la muestra como número roto.
  // `fPlantel` son PERSONAS (16, no "$16") y `fAntig` una PROPORCIÓN (0,7 → 70%, no "$1"): las dos se
  // dibujaban con el barrido de moneda que cubre la grilla entera. Un número mal formateado no da
  // error y hace dudar del cuadro completo, que es exactamente lo que este bloque vino a evitar.
  return {
    filas: G.filas,
    cantidades: [decl.fEmp, proy.fDot],
    ratios: [proy.fRelacion],
    // La fila de fechas es la única de la grilla que NO es plata: sin esto sale "$46.244".
    fechas: [proy.fFechaSalida],
    titular: hPagado,
    // LA CELDA DEL PRÓXIMO VENCIMIENTO ES UNA FECHA, y está sola en su columna: el barrido de moneda
    // la dibujaría «$46.305». `fechas` pinta filas enteras y ésta es UNA celda, por eso va aparte.
    celdasFecha: [{ fila: hProximo, col: 2 }],
    // LOS MESES SIN DDJJ DE LA FILA «Total declarado»: mismo número, otra tipografía. Es lo que
    // reemplaza a la palabra «proy.» adentro del importe.
    proyectadas: [proyectadas],
    // Las cuotas de planes son la única RÉPLICA de la pestaña —números escritos, no fórmulas— y en el
    // archivo vivo se leían crudas («473767,08»). Se declaran para que el formato de moneda se les
    // aplique al final, después del barrido.
    moneda: planes.moneda ?? [],
    // Las notas al pie: apagadas y chicas, para que no compitan con los importes. Las declara el
    // bloque dueño de cada una — así una nota que se muda no deja el formato apuntando a otra fila.
    // DESDE EL 06/09 LA LISTA VIENE VACÍA: las cuatro notas se retiraron por el minimalismo extremo
    // (ver cargas-bloques.mjs). El canal se deja porque el formato de una nota futura tiene que
    // seguir declarándose acá y no adivinarse; lo que no puede volver es la nota.
    pies: [...(planes.pies ?? [])],
    /** Los hallazgos que antes iban al pie del cuadro. Se imprimen en la corrida: un hallazgo se
     *  resuelve, no se anota al lado de un importe.
     *
     *  LOS DOS DE LA SECCIÓN 6 SIGUEN SALIENDO AUNQUE LA SECCIÓN YA NO ESTÉ (09/09/2026): el cuadro
     *  de SAC y vacaciones se retiró —es devengado en un archivo percibido— pero los dos pendientes
     *  que denunciaba son del NEGOCIO y no del cuadro: los días de vacaciones por tramo los tiene que
     *  confirmar el contador, y que el Fondo de Cese esté al día se sigue sin poder afirmar. Borrar
     *  el aviso junto con la fila sería apagar la alarma al mudar el cuarto. */
    avisos: [
      ...AVISOS_DEL_DOMINIO,
      ...(planes.avisos ?? []),
      // El hallazgo que antes era un renglón al pie de la sección 3.
      ...(proy.sinBase?.length ? [`${ALERTA} ${proy.sinBase.length} concepto(s) sin base para proyectar: ${proy.sinBase.join(', ')} — no aparecen en las secciones 1 ni 2`] : []),
    ],
    // El único control de integridad de la pestaña: el cero es la respuesta, no una celda vacía.
    controles: [planes.fControl],
    // NINGUNA CELDA DE PROSA EN EL MEDIO DE LA GRILLA (09/09/2026): quedaba una —el veredicto en
    // glifo del control de plantel— y se fue con la fila. El canal se deja declarado, no adivinado.
    prosaFormula: [],
    // La geometría que se publica como rangos con nombre. Sale de la grilla recién armada: si la
    // pestaña se reordena, los nombres se mueven con ella.
    rangos: {
      fF931: proy.fSubF931, fGremiales: proy.fSubGremiales, fFechas: proy.fFechaSalida, fDeclarado: decl.fDeclTot,
      // Los dos que «Impuestos y Financieros» lee desde el 09/09: su cuadro de planes se retiró.
      fPlanes: planes.fCuotasTot, fPlanesSinPagar: planes.fSinPagar,
    },
  }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // ── Qué períodos y qué conceptos declaró de verdad la empresa: sale de la réplica de los PDF. ──
  const raw = await google.readSheetValues(ID, `${RAW}!A4:G200`)
  const periodos = [...new Set(raw.map((f) => String(f?.[0] ?? '').trim()).filter((p) => /^\d{4}-\d{2}$/.test(p)))].sort()
  const vistos = new Map()
  for (const f of raw) {
    const cod = String(f?.[1] ?? '').trim()
    if (!cod) continue
    // El rótulo corto es el que usa la proyección para encontrar su fila: se deriva del nombre
    // completo sacándole el código entre paréntesis, no se escribe dos veces.
    const nombre = String(f?.[2] ?? '').trim()
    if (!vistos.has(cod)) vistos.set(cod, { codigo: cod, rotulo: nombre, corto: nombre.replace(/\s*\(\d+\)\s*$/, '').replace(/\s*—\s*ART$/, '') })
  }
  const conceptos = [...vistos.values()]
  if (!periodos.length) { console.error(`no hay datos en ${RAW}: corré primero f931-sheet.mjs`); process.exit(1) }

  // ── Las columnas de Compras, POR SU ENCABEZADO. Acá se arregla el #REF! de raíz. ──
  const cab = (await google.readSheetValues(ID, 'Compras!A3:BZ3'))[0] || []
  const { col: C, faltan } = resolverColumnas(cab, {
    total: 'Total', cliente: 'Cliente / Asignación', detalle: 'Detalles / Obra',
    fecha: 'Fecha de caja', rubro: 'Rubro de caja', proveedor: 'Proveedor', fechaFactura: 'Fecha factura',
    // 'Estado' (la columna del cargador: Pagado/Pendiente/Proyectado), NO 'Estado pago', que es el
    // semáforo derivado con emoji adelante — "<>Pagado" no matchea "✅ Pagado" y el hero de la deuda
    // en planes daría el total del rubro, pagadas incluidas.
    estado: 'Estado',
  })
  if (faltan.length) { console.error(`⚠ faltan columnas en Compras: ${faltan.join(', ')} — no escribo con referencias inventadas`); process.exit(1) }
  console.log(`Compras por encabezado: Total=${C.total} · Cliente=${C.cliente} · Fecha de caja=${C.fecha} · Rubro=${C.rubro}`)

  // ── EL BLOQUE DEL PLANTEL — de ahí sale la antigüedad que pondera el Fondo de Cese ──
  //
  // La fecha de ingreso de cada persona vive en la columna C de `_J_OBREROS` y no tenía un solo
  // consumidor. Es lo que pondera las dos alícuotas del Fondo de Cese, así que el generador resuelve
  // el bloque en cada corrida —igual que Jornales— y emite el rango ya apuntado.
  //
  // ES LA MISMA ELECCIÓN QUE HACE JORNALES, Y POR ESO SALE DE LA MISMA FUNCIÓN (27/08). Acá decía
  // `cerrada?.bloque` y allá también; cuando Jornales pasó al bloque VIGENTE —porque el piso se le
  // debe a quien trabaja hoy— esta pestaña se habría quedado ponderando el FCL con el plantel de la
  // quincena anterior. Dos definiciones de «el plantel» en dos pestañas que multiplican la misma masa
  // es exactamente lo que REALIDAD ÚNICA prohíbe, y la divergencia no da error: da un porcentaje
  // plausible sobre otra gente.
  const espejo = await google.readSheetValues(ID, '_J_OBREROS!A1:AC990').catch(() => [])
  const bloquesJ = detectarQuincenas(espejo ?? [])
  const cerrada = ultimaQuincenaCerrada(bloquesJ, (b) => ultimoDiaCargado(espejo[b.filaFecha - 1] ?? []), new Date())
  const plantel = bloqueDelPlantel({
    bloques: bloquesJ, cerrada: cerrada?.bloque ?? null, personasDe: (b) => personasDelBloque(espejo, b),
  })
  const bloqueBase = plantel.bloque ?? bloquesJ[bloquesJ.length - 1] ?? null
  if (!bloqueBase) console.warn('  ⚠ no pude ubicar el plantel en _J_OBREROS: la alícuota de FCL queda sin ponderar por antigüedad')
  else console.log(`plantel para el FCL: ${plantel.origen} · ${plantel.personas} persona(s) · filas ${bloqueBase.inicio}-${bloqueBase.fin}`)

  // ── CON QUÉ BASE VIENE LA MASA QUE ESTA PESTAÑA MULTIPLICA ──
  //
  // La proyección de esta pestaña es jornales × relación declarado/neto, y los jornales llegan por el
  // rango JORNALES_PROY_TOTAL: la base con que fueron valuados —pactado o 100% del convenio— la decide
  // Jornales y acá NO se vuelve a decidir. Se lee del encabezado que ese cuadro dejó escrito, que es
  // el EFECTO de la decisión, no la intención: si la réplica del convenio estaba caída cuando corrió
  // Jornales, el encabezado dice "pactada" y la glosa de acá dice lo mismo. Sin lectura, la nota
  // declara que no sabe — nunca afirma un supuesto que no puede probar.
  const jorn = await google.readSheetValues(ID, `'${PESTAÑA_JORNALES}'!A1:N400`).catch(() => [])
  const baseJornales = baseDeJornales(jorn ?? [])
  console.log(`base de los jornales proyectados: ${baseJornales ?? '⚠ no la pude leer de la pestaña de Jornales'}`)

  // EL CONTROL DE PLANTEL, QUE ERA UN GLIFO EN LA GRILLA Y AHORA SALE POR ACÁ: cruza la dotación de
  // la cabecera del último F931 contra el plantel de `_J_OBREROS`. El porqué, en `divergenciaDePlantel`.
  const ultimoPeriodo = periodos[periodos.length - 1]
  const dotacion = Number(raw.find((f) => String(f?.[0] ?? '').trim() === ultimoPeriodo)?.[4]) || null
  const div = divergenciaDePlantel({ dotacion, plantel: plantel.personas })
  if (div.motivo === 'sin-dato') console.warn(`  ${ALERTA} control de plantel: no pude medirlo (DDJJ ${dotacion ?? 's/d'} · planilla ${plantel.personas ?? 's/d'})`)
  else if (div.diverge) console.warn(`  ${ALERTA} control de plantel: la DDJJ de ${ultimoPeriodo} declara ${dotacion} y la planilla tiene ${plantel.personas} — ${(div.brecha * 100).toFixed(0)}% de brecha, por encima del ${TOLERANCIA_PLANTEL * 100}% tolerado`)
  else console.log(`  ✓ control de plantel: DDJJ ${dotacion} · planilla ${plantel.personas} (${(div.brecha * 100).toFixed(0)}% de brecha)`)

  const ps = await planesDePago(AÑO)
  console.log(`${periodos.length} período(s) F931 · ${conceptos.length} concepto(s) · ${ps.length} plan(es) de pago`)

  // `filas` es `let` porque la cola de la pestaña vieja se le agrega abajo, después de leerla.
  // ═══ LA GRILLA VIAJA ENTERA HASTA EL FORMATO — NO SE DESARMA ACÁ (09/09/2026) ═══
  //
  // Estaba desarmada en doce variables y `formatear` recibía UNA LISTA ESCRITA A MANO de ellas. Las
  // tres declaraciones nuevas del rediseño —el gris de la proyección, la celda de fecha del titular
  // y la moneda de las réplicas— se declararon en `grilla()` y NO se agregaron a esa lista: viajaron
  // hasta acá y se cayeron en la última línea. No da error, no lo ve ningún test de la grilla y no lo
  // ve el `--dry`: sale mal y se ve mal, que es como se enteró el dueño.
  //
  // Pasando el objeto entero, agregar una declaración nueva no requiere acordarse de nada: la clase
  // de defecto deja de existir en vez de quedar cubierta por un test.
  const g = grilla({ periodos, conceptos, ps, C, baseJornales })
  let { filas } = g
  const { rangos, avisos } = g
  // LOS HALLAZGOS, EN LA CORRIDA Y NO EN LA PESTAÑA: es donde los ve quien puede resolverlos.
  for (const a of (avisos ?? [])) console.warn(`  ${a}`)
  console.log(`grilla: ${filas.length} filas × ${ANCHO} columnas — un solo ancho para toda la pestaña`)
  if (DRY) return

  const hojas = await google.getSheetMeta(ID)
  const hoja = hojas.find((h) => h.title === PESTAÑA)
  if (!hoja) throw new Error(`no encontré la pestaña "${PESTAÑA}"`)

  // ═══ LOS PARÁMETROS NORMATIVOS SE ASEGURAN ANTES DE ESCRIBIR LA GRILLA ═══
  //
  // Las fórmulas de FCL, IERIC y FODECO citan estos nombres. Si los nombres no existen todavía, esas
  // cuatro filas quedan en #NAME? hasta la corrida siguiente — el mismo motivo por el que Jornales
  // asegura los suyos antes de escribir. `asegurarParametros` NUNCA pisa un valor cargado: si el
  // dueño corrigió la alícuota, la corrida siguiente la respeta.
  // Desde el 09/09 la lista incluye la proporción del plantel en su primer año, que era una fila de
  // la sección 3 y ahora es una entrada con rango con nombre (ver `parametrosDeCargas`).
  await asegurarParametros(google, hojas, parametrosDeCargas(bloqueBase))
    .catch((e) => console.warn(`  ⚠ no pude asegurar los parámetros normativos: ${e.message} — las filas de FCL/IERIC/FODECO pueden quedar en #NAME?`))

  // ═══ LA COLA DE LA PESTAÑA VIEJA ═══
  //
  // Este script reemplaza a los tres que escribían acá antes, y su grilla es más corta que la suma
  // de los bloques anteriores. Sin esto, las filas de más abajo sobrevivirían —el precio declarado
  // de no borrar nunca— y quedarían dos cuadros de planes de pago, uno arriba y otro debajo.
  //
  // Se extiende la grilla con filas marcadas VACIO hasta la última fila con contenido: VACIO
  // significa "es mi celda y va vacía", así que se limpia lo que este generador (o sus antecesores)
  // dejaron, y CUALQUIER anotación de una persona en una columna que el generador no ocupa se
  // conserva igual, porque la fusión sólo limpia donde hay centinela. El mecanismo vive en
  // lib/cola-de-rango.mjs: era este mismo bucle copiado en cinco generadores, con cinco variantes.
  const previo = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:${COL_ORIGEN}400`)
  // `probarPorForma`: la pestaña bajó de 83 filas a 61 y su cola no se podía borrar — las celdas de
  // una versión anterior al sistema de huellas no tienen ninguna, así que la guarda respondía «nunca
  // fue mía» y el cuadro 6 viejo quedaba publicado debajo del 4 nuevo. Mismo criterio y mismo umbral
  // que «Impuestos y Financieros», que ya pagó este defecto.
  const cola = conColaMedida(filas, previo, { ancho: ANCHO, probarPorForma: true })
  if (avisoDeCola(cola, PESTAÑA)) console.log(avisoDeCola(cola, PESTAÑA))
  filas = cola.filas

  // Las celdas combinadas de la pestaña vieja se tragan la escritura EN SILENCIO: ni error ni valor.
  await google.spreadsheetBatchUpdate(ID, [
    { unmergeCells: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: Math.max(filas.length + 40, hoja.rows ?? 0), startColumnIndex: 0, endColumnIndex: Math.max(ANCHO, hoja.cols ?? ANCHO) } } },
  ]).catch(() => {})

  // NO se borra nada de lo que escribió una persona: se fusiona. Lo que el generador deja vacío a
  // propósito viene marcado con VACIO y se limpia; lo que no es suyo, se conserva.
  // ═══ REGLA 0 — REVISAR LO QUE LA PERSONA EDITÓ, ANTES DE ESCRIBIR ═══
  // Si el dueño reescribió un rótulo, lo reencuadró o lo borró, gana lo suyo y el generador se
  // adapta. Se compara contra lo que ESTE generador escribió la última vez, que es la única forma
  // de distinguir una edición de una versión vieja de sí mismo. Ver lib/respetar-ediciones.mjs.
  const { grid: gridFinal, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, PESTAÑA, filas, previo)
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${r.suyo.slice(0, 44)}") en vez de escribir "${r.mio.slice(0, 44)}"`)
  // LA COLUMNA DE PROSA SE VA CON LA GRILLA, NO DESPUÉS: ver vaciarColumnaDeProsa en lib/nota-celda.mjs.
  vaciarColumnaDeProsa(gridFinal, ANCHO - 1)
  // ═══ Y EL CUERPO TAMBIÉN SE LIMPIA, NO SÓLO LA COLA (09/09/2026) ═══
  //
  // El rediseño corrió TODA la pestaña cuatro filas. La escritura informó «conservo 287 celda(s) que
  // esta escritura dejaba vacías (no puedo probar de quién son)» y el resultado fue una pestaña
  // MEZCLADA que no dio un solo error: importes viejos en las filas que las fórmulas nuevas leen.
  // El porqué completo, y qué se borra y qué no, en `cuerpoProbadoPorForma`.
  const cuerpo = cuerpoProbadoPorForma(gridFinal, previo)
  if (cuerpo.probadas) console.log(`  🧹 ${cuerpo.probadas} celda(s) del cuerpo con forma de generador: las declaro mías y las limpio`)
  const escritura = await escribirPreservando(google, ID, `'${PESTAÑA}'`, cuerpo.grid, { respetar: false /* la Regla 0 ya se aplicó arriba, a mano: este generador guarda el registro DESPUÉS de releer la pestaña, que es más fiel que hacerlo antes de escribir */, anchoHoja: Math.max(ANCHO, hoja.cols ?? ANCHO) })
  // ═══ SI LA ESCRITURA SE SALTEÓ, NO SE TOCA LA GEOMETRÍA (31/07) ═══
  //
  // El defecto que arruinó CAJA, buscado en todos los generadores y encontrado en seis. La guarda hace
  // bien su trabajo —con la pestaña candada o con la firma editada, `escribirPreservando` NO escribe—
  // pero el resultado se descartaba y la corrida seguía: el formateador pintaba la geometría de la
  // grilla NUEVA sobre los valores VIEJOS, y donde había rangos con nombre los reapuntaba a filas que
  // en la pestaña no tienen ese dato. En CAJA eso dejó CAJA_TOTAL_DISPONIBLE y CAJA_FECHA_SALDO sobre
  // dos celdas vacías: con el total y la fecha de corte en cero, todo cheque y toda quincena pasaban el
  // filtro y el calendario inflaba sus tramos. Sin un solo #ERROR y sin un aviso.
  //
  // Una pestaña que no se escribió no cambió de forma: su formato y sus nombres son los de su última
  // escritura y así tienen que quedar.
  const salteada = Boolean(escritura?.bloqueada || escritura?.editadaPorHumano)
  if (salteada) console.log('  🔒 bajo tu control: no escribí, y por lo tanto no le toco el formato ni sus rangos con nombre. Queda exactamente como la dejaste.')
  const { conservadas } = salteada ? { conservadas: [] } : escritura
  if (conservadas.length) console.log(`✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)

  if (!salteada) await formatear(google, ID, hoja.sheetId, gridFinal, g)
  // LOS NOMBRES SE PUBLICAN SOBRE LO QUE SE ESCRIBIÓ, NUNCA SOBRE LO QUE SE QUISO ESCRIBIR: si la
  // guarda salteó la escritura, la pestaña conserva la geometría de su última corrida y reapuntar los
  // nombres los dejaría sobre filas que en la pestaña son otra cosa. Es el defecto que vació CAJA.
  if (!salteada) await publicarRangos(google, hoja.sheetId, gridFinal, rangos)

  // ── VERIFICAR MIRANDO LA PESTAÑA, no confiando en que la escritura salió bien ──
  const v = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:${COL_ORIGEN}${filas.length}`)
  const errores = v.flat().filter((c) => /^#(REF|ERROR|N\/A|VALUE|VALOR|¿|¡|DIV|NAME|NUM|NULL)/i.test(String(c ?? '')))
  console.log(errores.length ? `⚠ ${errores.length} celda(s) en error` : '✓ ninguna celda en error')
  const defectos = auditarPatron(v)
  console.log(defectos.length ? `⚠ ${defectos.length} defecto(s) de patrón:` : '✓ la pestaña cumple el patrón de diseño')
  for (const d of defectos.slice(0, 10)) console.log(`   fila ${d.fila} · ${d.regla} · ${d.detalle}`)
  for (const f of v) if (/^(⇒|LA POSICIÓN)/.test(String(f?.[0] ?? ''))) console.log(`  ${String(f[0]).slice(0, 46).padEnd(48)}${String(f[1] ?? '').padStart(16)}${String(f[13] ?? '').padStart(16)}`)
  // El registro de rótulos se guarda con lo que QUEDÓ escrito, no con lo que quise escribir.
  await guardarRegistro(ID, PESTAÑA, gridFinal, ediciones, v, candidatos).catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))
  if (errores.length || defectos.length) process.exitCode = 1
}

/**
 * PUBLICA LA SERIE DE CARGAS COMO RANGOS CON NOMBRE — la puerta por la que el Libro entra a la cadena.
 *
 * ═══ POR QUÉ NO EXISTÍA Y CUÁNTO COSTABA (06/08) ═══
 *
 * Esta pestaña calcula las cargas del mes desde los jornales y su fila de caja dice, en el código,
 * "Ésta es la fila que tiene que mirar el cash flow". No la miraba nadie: no había un solo rango con
 * nombre `CARGAS_*` y el Libro proyectaba las cargas con las filas planas de Compras ($8.000.000 en
 * agosto, $6.500.000 de septiembre a diciembre) contra los $8.569.345 · $7.608.663 · $8.633.543 ·
 * $9.082.359 · $9.121.411 que mide la cadena. Y el devengado de diciembre —que sale en enero del año
 * siguiente— no estaba en ninguna vista.
 *
 * SE VERIFICA CONTRA LA GRILLA ANTES DE PUBLICAR. Un nombre apuntando a doce celdas vacías no da
 * error: devuelve cero, y el cash flow mostraría "no hay cargas este año" sin una sola celda en rojo.
 */
async function publicarRangos(google, sheetId, filas, rangos) {
  const quiero = rangosDeCargas(rangos)
  const problemas = verificarRangos(filas, quiero)
  if (problemas.length) {
    console.error('✗ NO publico los rangos con nombre: hay rangos ciegos\n' + explicarProblemas(problemas))
    process.exitCode = 1
    return
  }
  const existentes = new Map((await google.getNamedRanges(ID)).map((r) => [r.name, r.namedRangeId]))
  const reqs = quiero.map((d) => {
    const range = aRangoApi(sheetId, d)
    return existentes.has(d.nombre)
      ? { updateNamedRange: { namedRange: { namedRangeId: existentes.get(d.nombre), name: d.nombre, range }, fields: 'range' } }
      : { addNamedRange: { namedRange: { name: d.nombre, range } } }
  })
  await google.spreadsheetBatchUpdate(ID, reqs)
  // LAS COLUMNAS SE IMPRIMEN DE LA DECLARACIÓN, NO CLAVADAS. Decía `B${d.r0}:M${d.r1}` a fuego, y
  // `CARGAS_PLANES_SIN_PAGAR` —que es UNA celda— salía en el log como si cubriera los doce meses:
  // un aviso que describe otra cosa que la que se publicó es peor que no tenerlo.
  const col = (i) => String.fromCharCode(65 + i)
  console.log(`rangos con nombre publicados: ${quiero.map((d) => `${d.nombre}=${col(d.c0)}${d.r0}:${col(d.c1)}${d.r1}`).join(' · ')} — el Libro Canónico ya no proyecta cargas con las filas planas de Compras`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
