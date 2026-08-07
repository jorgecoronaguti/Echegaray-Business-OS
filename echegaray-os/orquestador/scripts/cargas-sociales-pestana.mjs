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
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { resolverColumnas, rango } from '../lib/compras-columnas.mjs'
import { sub, total as rotuloTotal, auditarPatron } from '../lib/patron-pestana.mjs'
import { vaciarColumnaDeProsa } from '../lib/nota-celda.mjs'
import { PESTAÑA as RAW, COL as F931_COL, FILA0 as F931_FILA0 } from './f931-sheet.mjs'
import { formulaUltimaFecha, formulaUltimoPeriodo, rotuloPorFuente, DIAS_AVISO_MENSUAL } from '../lib/fecha-de-frescura.mjs'
import { CONCEPTOS_CADENA, PARAMETROS_CARGAS } from '../lib/cargas-cadena.mjs'
// LA PESTAÑA PUBLICA, EL LIBRO LEE — y los rótulos que anclan cada nombre se declaran UNA vez, en el
// módulo que los consume. Escritos de los dos lados, el día que uno cambie el nombre queda apuntando
// a la fila de al lado y devuelve un número plausible en vez de un error.
import { rangosDeCargas, RUBRO_PLANES } from '../lib/libro-extractores-cargas.mjs'
import { aRangoApi, verificarRangos, explicarProblemas } from '../lib/rangos-con-nombre.mjs'
import { detectarQuincenas } from '../lib/nomina-sync.mjs'
import { ultimaQuincenaCerrada } from '../lib/motor-salarial.mjs'
import { asegurarParametros, ultimoDiaCargado } from './jornales-pestana.mjs'
import { ANCHO, COL_ORIGEN, cm, crearGrilla } from '../lib/cargas-grilla.mjs'
import {
  bloqueDeclarado, bloquePagado, bloqueDiferencia, bloqueProyeccion, bloqueCaja, bloqueSac, bloquePlanes,
} from '../lib/cargas-bloques.mjs'
import { planesDePago } from '../lib/cargas-planes.mjs'
import { formatear } from '../lib/cargas-piel.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Cargas Sociales'
const DRY = process.argv.includes('--dry')
const AÑO = 2026
/**
 * DESDE QUÉ MES SE PROYECTA — SE DEDUCE DEL DATO, NO SE ESCRIBE A MANO.
 *
 * POR QUÉ CAMBIÓ (23/07). El dueño: "si tienen proyecciones que dejaron de serlo porque ya estamos
 * en el momento determinado, ¿se actualiza?". Acá decía `DESDE_PROY = 7`. Una constante no se entera
 * de que pasó el tiempo: en agosto el cuadro habría seguido proyectando julio aunque el F931 de
 * julio ya estuviera presentado y leído — una estimación dibujada al lado de un hecho, sin que nada
 * lo avisara. Es la clase de error que envejece en silencio, igual que un número pegado.
 *
 * Ahora la frontera la pone el dato: se proyecta desde el primer mes SIN DDJJ presentada.
 */
function desdeQueMesSeProyecta(periodos) {
  const conDato = periodos.map((p) => Number(p.slice(5, 7))).filter(Boolean)
  return conDato.length ? Math.max(...conDato) + 1 : 1
}

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

/** NÚCLEO PURO: arma la grilla entera de la pestaña. Devuelve las filas y las marcas que usa el formato. */
export function grilla({ periodos, conceptos, ps, C, bloqueBase = null }) {
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
  G.push([rotuloPorFuente('Qué genera la nómina, qué se paga y cuándo sale de la caja', [
    { nombre: 'DDJJ F931', expr: formulaUltimoPeriodo(`${RAW}!$${F931_COL.periodo}$${F931_FILA0}:$${F931_COL.periodo}`), avisoDias: DIAS_AVISO_MENSUAL },
    // Lo pagado sale de Compras, por la misma columna de fecha que usan las SUMIFS de la sección 3.
    // `mixto`: esa columna convive como serial y como texto tipeado — un MAX crudo pierde las
    // tipeadas EN SILENCIO y declararía como corte la última que entró por casualidad como número.
    { nombre: 'Compras', expr: formulaUltimaFecha(rango(C.fecha), { mixto: true }) },
  ])])
  G.push()

  // ═══ LA POSICIÓN HABLA EL IDIOMA DE SU HERMANA: REAL · COMPROMETIDO · PROYECTADO (06/08) ═══
  //
  // El dueño, sobre Jornales: "separar real / comprometido / proyectado". Acá el hero partía por
  // PROCEDENCIA del dato —"declarado en las DDJJ" contra "proyectado"— y decía "devengado", que es
  // vocabulario contable. En una pestaña del Flujo de Caja eso no contesta la pregunta que se hace el
  // que la abre, que no es de dónde salió el número sino EN QUÉ ESTADO ESTÁ LA PLATA. Las dos
  // pestañas hermanas hablaban de la misma nómina en dos idiomas distintos.
  //
  // LAS TRES PARTICIONES NO SE SOLAPAN Y SUMAN EL TITULAR AL PESO, igual que en Jornales:
  //   REAL         — el F931 del mes ya salió de la caja. Sale de Compras, y el banco lo prueba.
  //   COMPROMETIDO — declarado en la DDJJ y todavía sin salir. POR DIFERENCIA, a propósito: entre lo
  //                  declarado y lo pagado no puede quedar un hueco escondido.
  //   PROYECTADO   — lo que la cadena mide de acá a diciembre desde los jornales.
  // El titular (declarado + proyectado) no cambia de valor: sólo se parte de otra manera. La cadena
  // que cierra al peso queda intacta.
  G.push(['LA POSICIÓN', 'Monto', ...Array(11).fill(VACIO), VACIO, 'De dónde sale'])
  // El titular se completa al final, cuando ya se sabe en qué filas quedaron los totales.
  const hCosto = G.push([rotuloTotal('Costo laboral del año — devengado'), '@COSTO', ...Array(11).fill(VACIO), VACIO, 'REAL más COMPROMETIDO más PROYECTADO.'])
  const hReal = G.push([sub('REAL · el F931 del mes ya salió de la caja'), '@REAL',
    // El pago de enero es la DDJJ de DICIEMBRE del año anterior: plata que salió este año por una
    // nómina que no es de este año. Contarla acá inflaría lo REAL y achicaría lo COMPROMETIDO en
    // $3.811.458 sin que nada lo avise — y COMPROMETIDO es el número que se usa para decidir.
    'el pago de enero es la DDJJ de diciembre, no cuenta', ...Array(10).fill(VACIO), VACIO, 'Sección 2 · Compras, de febrero en adelante.'])
  const hComp = G.push([sub('COMPROMETIDO · declarado y todavía sin salir'), '@COMP', ...Array(11).fill(VACIO), VACIO, 'Sección 3 · lo declarado menos lo pagado, por diferencia.'])
  const hProy = G.push([sub('PROYECTADO · la cadena, desde los jornales'), '@PROY', ...Array(11).fill(VACIO), VACIO, 'Sección 4 · alícuotas medidas sobre los meses reales.'])
  // LOS PLANES NO SON UNA CUARTA PARTICIÓN, Y DECIRLO EVITA UNA SUMA FALSA. Financian parte de lo que
  // arriba figura como COMPROMETIDO —la DDJJ de enero 2026 y la de junio 2026 se refinanciaron— y
  // además arrastran cuotas de un plan de 2025, que no es costo de este año. Sumar este número al
  // titular lo contaría dos veces; no decirlo deja que lo sume el que lee.
  const hDeuda = G.push([rotuloTotal('En planes de pago · cuotas sin pagar'), '@DEUDA',
    'financia parte de lo comprometido; incluye deuda de 2025', ...Array(10).fill(VACIO), VACIO, VACIO])
  G.push()

  // ── LOS SIETE CUADROS ──────────────────────────────────────────────────────────────────────────
  // Cada uno devuelve en qué fila quedaron sus totales: el de abajo los REFERENCIA en vez de
  // recalcular el mismo número por otro camino, que es como aparecen dos verdades en una pestaña.
  const decl = bloqueDeclarado(G, { anio: AÑO, periodos, conceptos })
  // El código 312 es la ART DENTRO de la DDJJ, no un comprobante aparte: el cuadro de lo pagado lo
  // desglosa sin volver a sumarlo. El porqué, con la evidencia, en `bloquePagado`.
  const pag = bloquePagado(G, { anio: AÑO, C, fArtDecl: decl.filaDecl['312'], fDeclTot: decl.fDeclTot })
  bloqueDiferencia(G, { fPagF931: pag.filaPag.F931, fDeclTot: decl.fDeclTot })
  const proy = bloqueProyeccion(G, {
    anio: AÑO, desdeProy, filaDecl: decl.filaDecl, filaPag: pag.filaPag, fRem: decl.fRem, fEmp: decl.fEmp, bloqueBase,
  })
  const caja = bloqueCaja(G, {
    anio: AÑO, desdeProy, proyMeses: proy.proyMeses, fDeclTot: decl.fDeclTot, fProyTot: proy.fProyTot, C,
  })
  const sac = bloqueSac(G, { anio: AÑO, C, fRem: decl.fRem, fRemProy: proy.fRemProy })
  const planes = bloquePlanes(G, { ps, C })

  // ── SECCIÓN 5, RECIÉN AHORA: la fila de "cuotas que vencen" referencia el total de la sección 7 ──
  // Antes escribía el mismo número por dos caminos (JS acá, fórmula allá); ahora hay UNA fuente y el
  // cuadro de caja lee exactamente lo que dice el detalle de planes. Sólo los meses proyectados.
  for (const m of proy.proyMeses) G.filas[caja.fCuotasVencen - 1][m] = `=${cm(m)}${planes.fCuotasTot}`

  // ── EL HERO, RECIÉN AHORA: ya se sabe en qué fila quedó cada total ──────────────────────────────
  // REAL de FEBRERO a diciembre: la columna B de lo pagado es el F931 de diciembre del año anterior.
  G.filas[hReal - 1][1] = `=SUM($C$${pag.filaPag.F931}:$M$${pag.filaPag.F931})`
  // COMPROMETIDO POR DIFERENCIA. Si algún día lo pagado supera a lo declarado, esta celda se va a
  // negativo y se ve: querría decir que se pagó un período cuya DDJJ todavía no está leída. Un tope a
  // cero taparía justo eso. Y el declarado se lee de la fila ENTERA (B..M), no de los seis primeros
  // meses: en cuanto entre la DDJJ de julio, el hero la toma sin que nadie mueva un rango.
  G.filas[hComp - 1][1] = `=SUM($B$${decl.fDeclTot}:$M$${decl.fDeclTot})-$B$${hReal}`
  G.filas[hProy - 1][1] = `=SUM($${cm(desdeProy)}$${proy.fProyTot}:$M$${proy.fProyTot})`
  G.filas[hCosto - 1][1] = `=$B$${hReal}+$B$${hComp}+$B$${hProy}`
  // ═══ DOS VERDADES PARA LO MISMO, EN LA MISMA PESTAÑA (06/08 — defecto B9) ═══
  //
  // Acá había un NÚMERO PEGADO: $7.958.394, el saldo de los planes calculado en JavaScript. Doce
  // filas más abajo, la sección 7 decía $16.536.820 de cuotas del año y el control contra Compras
  // confirmaba ese segundo número. Los dos eran "la deuda en planes" y no coincidían, porque medían
  // cosas distintas: uno el saldo pendiente y el otro el total del año. Ninguno lo decía.
  //
  // ═══ Y "EL MES QUE VIENE" NO ES "LO QUE FALTA PAGAR" (06/08) ═══
  //
  // La primera corrección lo hizo fórmula, y la fórmula medía mal: `> MONTH(TODAY())` deja afuera el
  // mes en curso ENTERO. Al 06/08 daba $4.989.751 y las cuotas de agosto —$2.968.643, ninguna pagada,
  // una de ellas con vencimiento el 16— no estaban en ningún lado del hero. Un titular que dice
  // "por pagar" y se olvida de la próxima quincena es peor que uno que no está.
  //
  // El criterio correcto no es de POSICIÓN sino de HECHO: lo que falta pagar es lo que la planilla no
  // marcó "Pagado", venza cuando venza. Así entra agosto, y también entraría una cuota vencida y sin
  // pagar —que es justo la que hay que ver— mientras que la grilla mensual, que agrupa por columna, no
  // puede distinguir dentro del mes. Sale de Compras, que es donde vive el estado de cada cuota.
  G.filas[hDeuda - 1][1] = `=SUMIFS(${rango(C.total)};Compras!$${C.rubro}$4:$${C.rubro};"${RUBRO_PLANES}";${rango(C.estado)};"<>Pagado")`
  G.filas[hDeuda - 1][ANCHO - 1] = `Compras · rubro "${RUBRO_PLANES}", todas las cuotas que la planilla NO marcó "Pagado" — incluidas las vencidas sin pagar y las de ${AÑO + 1}, que la tabla de abajo no llega a mostrar.`
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
    cantidades: [decl.fEmp, proy.fDot, proy.fPlantel],
    ratios: [proy.fRelacion, proy.fAntig],
    // La fila de fechas es la única de la grilla que NO es plata: sin esto sale "$46.244".
    fechas: [proy.fFechaSalida],
    titular: hCosto,
    // Las notas al pie: apagadas y chicas, para que no compitan con los importes. Las declara el
    // bloque dueño de cada una — así una nota que se muda no deja el formato apuntando a otra fila.
    pies: [...(caja.pies ?? []), ...(sac?.pies ?? []), ...(planes.pies ?? [])],
    // El único control de integridad de la pestaña: el cero es la respuesta, no una celda vacía.
    controles: [planes.fControl],
    // Texto en el medio de la grilla: sin esto lo pinta el barrido de moneda y sale a la derecha,
    // pegado al importe de al lado. Son las dos aclaraciones del hero y el veredicto del plantel.
    prosaFormula: [{ fila: proy.fPlantel, col: 2 }, { fila: hReal, col: 2 }, { fila: hDeuda, col: 2 }],
    // La geometría que se publica como rangos con nombre. Sale de la grilla recién armada: si la
    // pestaña se reordena, los nombres se mueven con ella.
    rangos: { fF931: proy.fSubF931, fGremiales: proy.fSubGremiales, fFechas: proy.fFechaSalida },
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

  // ── EL BLOQUE DE LA ÚLTIMA QUINCENA CERRADA — de ahí sale la antigüedad del plantel ──
  //
  // La fecha de ingreso de cada persona vive en la columna C de `_J_OBREROS` y no tenía un solo
  // consumidor. Es lo que pondera las dos alícuotas del Fondo de Cese, así que el generador resuelve
  // el bloque en cada corrida —igual que Jornales— y emite el rango ya apuntado.
  const espejo = await google.readSheetValues(ID, '_J_OBREROS!A1:AC990').catch(() => [])
  const bloquesJ = detectarQuincenas(espejo ?? [])
  const cerrada = ultimaQuincenaCerrada(bloquesJ, (b) => ultimoDiaCargado(espejo[b.filaFecha - 1] ?? []), new Date())
  const bloqueBase = cerrada?.bloque ?? bloquesJ[bloquesJ.length - 1] ?? null
  if (!bloqueBase) console.warn('  ⚠ no pude ubicar la última quincena cerrada en _J_OBREROS: la alícuota de FCL queda sin ponderar por antigüedad')

  const ps = await planesDePago(AÑO)
  console.log(`${periodos.length} período(s) F931 · ${conceptos.length} concepto(s) · ${ps.length} plan(es) de pago`)

  const { filas, cantidades, ratios, fechas, titular, prosaFormula, pies, controles, rangos } = grilla({ periodos, conceptos, ps, C, bloqueBase })
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
  await asegurarParametros(google, hojas, PARAMETROS_CARGAS)
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
  // conserva igual, porque la fusión sólo limpia donde hay centinela.
  const previo = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:${COL_ORIGEN}400`)
  let ultima = 0
  previo.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) ultima = i + 1 })
  if (ultima > filas.length) {
    console.log(`cola de la pestaña vieja: limpio las filas ${filas.length + 1}–${ultima} (${ultima - filas.length} filas de los generadores anteriores)`)
    for (let i = filas.length; i < ultima; i++) filas.push(Array(ANCHO).fill(VACIO))
  }

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
  const escritura = await escribirPreservando(google, ID, `'${PESTAÑA}'`, gridFinal, { respetar: false /* la Regla 0 ya se aplicó arriba, a mano: este generador guarda el registro DESPUÉS de releer la pestaña, que es más fiel que hacerlo antes de escribir */, anchoHoja: Math.max(ANCHO, hoja.cols ?? ANCHO) })
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

  if (!salteada) await formatear(google, ID, hoja.sheetId, gridFinal, { cantidades, ratios, fechas, titular, prosaFormula, pies, controles })
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
  console.log(`rangos con nombre publicados: ${quiero.map((d) => `${d.nombre}=B${d.r0}:M${d.r1}`).join(' · ')} — el Libro Canónico ya no proyecta cargas con las filas planas de Compras`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
