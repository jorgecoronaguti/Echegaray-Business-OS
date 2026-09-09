#!/usr/bin/env node
// LA PESTAÑA «Nómina»: TODOS LOS QUE TRABAJARON ESTE AÑO, MES A MES, Y QUÉ CUESTA DESVINCULARLOS.
//
// ═══ EL PEDIDO (27/08/2026), TEXTUAL ═══
//
// "necesito q crees una pestaña en sheet flujo de fondos […] de «nómina» en donde toda la
// informacion de todos los meses de este año de cada uno de los empleados activos e inactivos q
// hayan habido esten ahi con sus salarios y los acuerdos expresados. ahi mismo tb los costos de
// echar a todos y cada uno de ellos q se encuentra en jornales por quincena migrarlos"
//
// ═══ DE DÓNDE SALE CADA COSA (nada se inventa acá) ═══
//
// · QUIÉNES y CUÁNTO: los espejos `_J_OBREROS` y `_J_OFICINA`, que son la réplica de la planilla de
//   jornales del dueño. Es la fuente que se toca todos los días: manda el Sheet.
// · EL DEVENGADO DE CADA MES: `lib/nomina-devengado.mjs`, que multiplica las horas de cada quincena
//   por el `$/hora` DE ESA quincena. Usar el precio de hoy para enero sería reescribir la historia
//   con el aumento de agosto.
// · EL COSTO DE DESVINCULAR: `lib/desvinculacion-22250.mjs` y `lib/desvinculacion-plantel.mjs` — el
//   mismo núcleo que ya publica el bloque 6 de «Jornales por Quincena», sin una línea nueva de
//   criterio. Lo que se migra es el CUADRO, no la regla.
//
// ═══ LAS DOS COLUMNAS QUE NUNCA SE SUMAN ═══
//
// «Sale de la caja» y «Fondo de cese acumulado» van separadas a propósito: el fondo es plata del
// trabajador que se le entrega con la libreta, no un desembolso nuevo de la empresa. Sumarlas da un
// número que no existe, y es el error clásico al presupuestar una desvinculación.
//
//   node orquestador/scripts/nomina-pestana.mjs           → muestra qué escribiría
//   node orquestador/scripts/nomina-pestana.mjs --aplicar → escribe la pestaña

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { detectarQuincenas } from '../lib/nomina-sync.mjs'
import { plantelDelEspejo, separarPlantel, claveNombre } from '../lib/desvinculacion-plantel.mjs'
// EL COSTO DE DESVINCULAR YA NO SE DIBUJA ACÁ: era el cuadro 3 de «Plantel», la pestaña que el dueño
// mandó borrar el 09/09. Las funciones siguen vivas —y con sus tests— en `lib/desvinculacion-22250.mjs`
// y `lib/desvinculacion-plantel.mjs`; lo que se fue es la copia dibujada.
import { repartoPersona } from '../lib/jornales-reparto-pago.mjs'
import { bancoDeLaPersona, reparto50DeLiquidacionFinal, tieneLiquidacionFinal, esSubcontratista, comoSeEscribe, CUIL_POR_PERSONA_DE_PLANILLA, COBRAN_Y_NO_ESTAN_EN_LA_PLANILLA, SUELDO_NETO_OFICINA } from '../lib/nomina-banco-recibo.mjs'
import {
  claveDeCategoria, convenioDe, esInferida, lineaEquivalenciasInferidas,
  jornalConAumento,
} from '../lib/uocra-paritaria.mjs'
import { HORAS_POR_DIA_DE_SEMANA } from '../lib/jornada-uocra.mjs'
import { carpetaDe } from '../lib/legajo-drive.mjs'
import { query, closePool } from '../lib/db.mjs'
import { escalonDe, parsearAcuerdos } from '../lib/uocra-acuerdos.mjs'
import { COL_OBRA, COL_OFICINA, devengadoPorMes, diaDeCelda, ultimaColumnaHabilCargada, dejoDeCargar as dejoAntesQueElResto } from '../lib/nomina-devengado.mjs'
import { seccion, sub, total as rotuloTotal, ES_SECCION_NUM, ES_TOTAL, ES_SUBITEM } from '../lib/patron-pestana.mjs'
import { conColaLimpiable } from '../lib/cola-de-rango.mjs'
// VACIO vive en `preservar-anotaciones`, no en `cola-de-rango` — ésta lo re-importa de allá.
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { alMultiplo } from '../lib/jornales-neto-pago.mjs'

/**
 * CUÁNTAS FILAS ESCRIBIÓ ALGUNA VEZ ESTE GENERADOR.
 *
 * No es el alto del cuadro de hoy: es el techo que la cola tiene que poder limpiar. Si una corrida
 * publica 53 filas después de una de 141 —pasó, la Nómina bajó de 141 a 46 el 31/08— las 88 de
 * sobra quedan vivas abajo salvo que el centinela las marque como propias. Se declara con margen
 * hacia arriba, nunca hacia abajo.
 */
const ALTO_HISTORICO = 160
// ═══ POR QUÉ ACÁ NO VA EL CENTINELA `VACIO` ═══
//
// El centinela significa «esta celda es mía y va vacía», y se resuelve DENTRO de la fusión. Esta
// pestaña no se fusiona: el generador la reescribe entera. Al escribirlo por esta puerta quedó
// LITERAL en el archivo —«::VACIO::» en cientos de celdas, probado el 27/08— que es exactamente lo
// que el propio módulo advierte. Acá se escribe vacío de verdad.
//
// ═══ LA PREMISA QUE ERA FALSA, Y LO QUE COSTÓ (31/08) ═══
//
// Acá decía: *«la condición para poder usar `respetar: false` es la que se cumple acá: NADIE que no
// sea este script escribió jamás una celda de esta pestaña»*. Dejó de ser cierta y nadie se enteró
// hasta que el dueño lo dijo: **«me borraste mis ediciones»**, y después **«respetá mis ediciones de
// celda por más que después corrijas»**.
//
// Una premisa así no se puede sostener por escrito: la pestaña está a la vista, cualquiera la abre y
// escribe, y el generador corre solo cada dos horas. La Regla 0 vuelve a estar ENCENDIDA —el default
// de `escribirPreservando`— y con ella el auto-respeto de una reescritura completa. Que el generador
// después corrija su número no lo autoriza a borrar lo que una persona escribió: primero se respeta,
// y lo que quede en conflicto se dice, no se pisa.

// EL DESTINO SALE DEL ENTORNO PARA PODER PROBAR SIN TOCAR EL ARCHIVO REAL. Un generador que sólo
// sabe escribir el Sheet vivo no se puede verificar: la única forma de ver el resultado de una
// fórmula es aplicarla y mirarla, y hacerlo sobre el real ya rompió «Jornales por Quincena».
// `scripts/en-copia.mjs` exige esta variable y se niega si trae el id del archivo real.
const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'Nómina'
const ANIO = 2026
const APLICAR = process.argv.includes('--aplicar')
// ═══ ONCE COLUMNAS, LAS MISMAS EN LOS TRES CUADROS (09/09/2026) ═══
//
// El dueño: «los diseños de todas las pestañas son distintos, tenés que mejorar y unificar». Acá el
// descuadre era literal: el cuadro 1 declaraba doce columnas, el 2 nueve con «Quincenas del mes» en
// la letra de «EFECTIVO redondeado», y el 3 nueve con «MITAD BLANCA» en esa misma letra. Tres
// significados para la columna I es lo que obliga a releer el encabezado en cada cuadro.
//
// Ahora hay UN contrato de columnas (`COLUMNAS`) y los tres cuadros lo escriben entero: el que no usa
// una columna la deja vacía, que se ve y no corre nada de lugar.
const ANCHO = 11
/**
 * HASTA DÓNDE ESCRIBIÓ ESTE GENERADOR ALGUNA VEZ, A LO ANCHO.
 *
 * La pestaña tuvo diecisiete columnas hasta el 09/09 («$/h hoy», «$/h c/aumento», y la cola de la
 * versión con los cuadros de respaldo). Bajar `ANCHO` a once no borra esas columnas: las deja vivas
 * a la derecha, con los datos de la corrida vieja publicados. La escritura se hace hasta acá para
 * que la reducción limpie lo que dejó de ser suyo.
 */
const ANCHO_HISTORICO = 17
const SIN_DATO = '—'
/**
 * LA PRIMERA FILA QUE EL TITULAR PUEDE SUMAR.
 *
 * El encabezado son tres filas (título · procedencia · respiro), el titular otras tres y el
 * respiro que lo separa del primer cuadro, una más: el cuadro 1 abre en la 8. Las tres cifras del
 * titular también empiezan con «⇒», así que un rango que las incluyera las haría sumarse a sí
 * mismas — dependencia circular, #REF! publicado en las tres.
 */
const DEBAJO_DEL_TITULAR = 8

/**
 * EL CONTRATO DE COLUMNAS DE LA PESTAÑA — UNO SOLO PARA LOS TRES CUADROS.
 *
 * Lo consume «Jornales por Quincena», que busca sus celdas por el TEXTO del encabezado
 * (`MATCH("TOTAL A PAGAR"; INDEX('Nómina'!$A:$Z; MATCH("Persona";'Nómina'!$A:$A;0);0);0)`): renombrar
 * uno de estos rótulos rompe esa pestaña, no la de acá.
 *
 * ═══ QUÉ ES CADA UNA, Y QUIÉN LO DECIDIÓ ═══
 *
 * · Categoría — la pidió el dueño el 31/08 («necesito q aparezcan las categorias») y va AL LADO del
 *   nombre («poner la categoria al lado del nombre»): es parte de quién es la persona, porque explica
 *   contra qué piso de convenio se la mide. Se muestra el nombre de convenio, no el código de la
 *   planilla («OF», «M OF»), que obligaría a traducir de memoria.
 * · COBRA — lo que GANA la persona, pagado o no. El dueño, 31/08: «me borraste los totales por más
 *   que tengan algo pagado». Son dos preguntas distintas y por eso son dos columnas: COBRA es el
 *   devengado y TOTAL A PAGAR es lo que todavía sale de la caja.
 * · ADELANTO y YA TRANSFERIDO — dos columnas y no una: «no me gusta esa mezcla de conceptos en la
 *   columna "ya transferido" con "adelantos", separar». Un adelanto en efectivo se discute con quien
 *   lo entregó; una transferencia se busca en el extracto del Santander.
 * · POR BANCO — «por banco va lo q dice recibo y en efectivo se completa todo hasta llegar al
 *   numero». Es el recibo, no el 50% calculado.
 * · EFECTIVO redondeado — es del DUEÑO y el OS NO la escribe: «voy a hacer cargas manuales de montos
 *   en columna efectivo redondeado, no tocarla». No reemplaza al efectivo exacto, va al lado: el
 *   exacto es lo devengado y hace falta para auditar. Ver `conEfectivoRedondeadoDelDueno`.
 * · $/hora — UNA sola tarifa, la que se cobra. Hasta el 09/09 había dos («$/h hoy» y «$/h
 *   c/aumento») y `COBRA` multiplicaba por la segunda: la primera era historia dibujada al lado del
 *   número que decide.
 */
const COLUMNAS = Object.freeze(['Persona', 'Categoría', 'COBRA', 'ADELANTO', 'YA TRANSFERIDO',
  'POR BANCO', 'EN EFECTIVO', 'TOTAL A PAGAR', 'EFECTIVO redondeado', 'Horas', '$/hora'])
/** La columna del dueño, 0-based. Ver `conEfectivoRedondeadoDelDueno`. */
export const COL_REDONDEADO = COLUMNAS.indexOf('EFECTIVO redondeado')

const fecha = (d) => (d instanceof Date && !Number.isNaN(+d)
  ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  : SIN_DATO)

/** Filas de una hoja del espejo, ya cruzadas: identidad + devengado. */
/**
 * EL ÚLTIMO BLOQUE DE OFICINA DE LA PLANILLA, PERSONA POR PERSONA.
 *
 * `_J_OFICINA` NO tiene el mismo mapa de columnas que `_J_OBREROS` —ya lo dice `COL_OFICINA`— y las
 * de canal tampoco: acá son **V $ HORA · W BANCO · X ADELANTO · Y TOTAL RECIBO** (índices 21 a 24).
 * Leerlas con las letras de obra (X banco, Y adelanto) corre todo un lugar y publica el adelanto de
 * alguien en su columna de banco.
 *
 * Se queda con el ÚLTIMO bloque cargado porque se recorre en orden y cada persona se pisa a sí
 * misma: la pregunta es qué se le paga ahora, no qué se le pagó en marzo. Hay que leer la grilla
 * SIN FORMATO — con «$398.200» como texto, `Number()` da NaN y toda la tabla saldría en cero.
 */
export function oficinaDelEspejo(grid = []) {
  const porNombre = new Map()
  for (let i = 0; i < grid.length; i++) {
    const nombre = String(grid[i]?.[1] ?? '').trim()
    if (!nombre || nombre.toUpperCase() === 'OBRERO') continue
    const hora = Number(grid[i]?.[21]) || 0
    const banco = Number(grid[i]?.[22]) || 0
    const adelanto = Number(grid[i]?.[23]) || 0
    const total = Number(grid[i]?.[24]) || 0
    // Una fila sin un solo número de canal es una fila de asistencia, no de pago.
    if (!hora && !banco && !adelanto && !total) continue
    porNombre.set(nombre, { nombre, fila: i + 1, hora, banco, adelanto, total })
  }
  return porNombre
}

function personasDe(grid, sector, col) {
  const bloques = detectarQuincenas(grid ?? [])
  if (!bloques.length) return { personas: [], bloques: [] }
  const plantel = plantelDelEspejo(grid ?? [], bloques, { anio: ANIO })
  const { activos } = separarPlantel(plantel, bloques)
  const activasClaves = new Set(activos.map((p) => p.clave))
  const dev = devengadoPorMes(grid ?? [], bloques, { anio: ANIO, clave: claveNombre, col })
  const personas = plantel.map((p) => {
    const d = dev.get(p.clave) ?? { meses: new Map(), jornalPorMes: new Map(), horasSinPrecio: 0, jornal: 0, categoria: '' }
    return {
      ...p,
      sector,
      // El plantel lo lee `desvinculacion-plantel.mjs` con el mapa de OBRA. Para oficina, el jornal y
      // la categoría se toman de la lectura que sí usó el mapa correcto.
      jornalPactado: col === COL_OBRA ? p.jornalPactado : (d.jornal || 0),
      categoria: col === COL_OBRA ? p.categoria : (d.categoria || ''),
      activo: activasClaves.has(p.clave),
      devengado: d,
    }
  })
  return { personas, bloques }
}

/**
 * LA QUINCENA QUE SE ESTÁ PAGANDO: el ÚLTIMO bloque del espejo, persona por persona.
 *
 * Las columnas son las de `jornales-reparto-pago.mjs` (V horas · W $/hora · X banco · Y adelanto ·
 * AA total). Se lee el TOTAL de la planilla y no se recalcula: si el dueño corrigió una hora a mano,
 * manda su número. Cuando la celda no trae total se cae a `horas × $/hora`, que es la misma cuenta
 * que hace la planilla.
 */
function quincenaEnCurso(grid, bloques, clave, { hoy = new Date(), anio = ANIO } = {}) {
  const b = bloques[bloques.length - 1]
  const out = new Map()
  if (!b) return { porClave: out, desde: null, hasta: null, horasPendientes: 0, diasPendientes: [] }
  const fechas = grid[b.filaFecha - 1] ?? []

  // ═══ LOS DÍAS QUE TODAVÍA NO SE CARGARON SE COMPLETAN CON LA JORNADA ═══
  //
  // El dueño lo pidió dos veces: *"se completara los dias q faltaban en cantidad de hs como 8hs los
  // viernes y 9 los otros"*. Sin esto el cuadro muestra lo que hay CARGADO —77 h de una quincena de
  // 103— y contesta la pregunta equivocada: él no necesita saber cuánto lleva devengado a mitad de
  // la quincena, necesita saber cuánto va a firmar el día de pago.
  //
  // SÓLO SE COMPLETAN LOS DÍAS DE HOY EN ADELANTE. Un día pasado sin horas para nadie es un feriado
  // o un día de lluvia, y rellenarlo inventaría jornadas que no ocurrieron; un día futuro sin horas
  // es, simplemente, un día que todavía no llegó. La jornada es la declarada: 9 h de lunes a jueves,
  // 8 h el viernes.
  const dias = []
  const pendientes = []
  const columnas = []
  const corte = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  let ultimaColumnaCargada = -1
  for (let c = 5; c <= 20; c++) {
    const d = diaDeCelda(fechas[c])
    if (!d) continue
    dias.push(`${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}`)
    const diaSemana = new Date(anio, d.mes - 1, d.dia).getDay()
    columnas.push({ col: c, etiqueta: `${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}`, habil: diaSemana !== 0 && diaSemana !== 6 })
    let cargado = false
    for (let r = b.inicio; r <= b.fin && !cargado; r++) if (Number((grid[r - 1] ?? [])[c]) > 0) cargado = true
    // El día contra el que se mide «dejó de cargar» tiene que ser HÁBIL: ver `ultimaColumnaHabilCargada`.
    const fechaDia = new Date(anio, d.mes - 1, d.dia)
    // EL SÁBADO NO SE COMPLETA. Las 4 h del sábado son un SUPUESTO declarado en `jornada-uocra.mjs`,
    // no la jornada normal: rellenarlo sumaba 4 h por persona que nadie va a trabajar. El dueño
    // contó los días que faltaban a mano —27, 28 y 31 = 26 h— y ahí está la diferencia.
    const esFinDeSemana = fechaDia.getDay() === 0 || fechaDia.getDay() === 6
    if (cargado && !esFinDeSemana) ultimaColumnaCargada = c
    if (!cargado && !esFinDeSemana && fechaDia >= corte) {
      pendientes.push({ etiqueta: `${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}`, horas: HORAS_POR_DIA_DE_SEMANA[fechaDia.getDay()] ?? 0 })
    }
  }
  const horasPendientes = pendientes.reduce((a, x) => a + x.horas, 0)

  for (let r = b.inicio; r <= b.fin; r++) {
    const f = grid[r - 1] ?? []
    const nombre = String(f[1] ?? '').trim()
    if (!nombre) continue
    const cargadas = Number(f[21]) || 0
    const jornal = Number(f[22]) || 0

    // ═══ AL QUE YA NO ESTÁ NO SE LE COMPLETAN LOS DÍAS QUE FALTAN ═══
    //
    // Completar la jornada tiene sentido para quien va a seguir yendo. Sosa Raúl tiene horas hasta el
    // 25/08 y baja registrada ese mismo día; Jofre Ismael tampoco cargó el 26 cuando cargaron los
    // otros quince. Sumarles los tres días que faltan les inventa 26 h que nadie va a trabajar, y en
    // una liquidación final ese invento se paga.
    //
    // El criterio sale de la planilla y no de una lista: si el último día con horas de una persona es
    // ANTERIOR al último día que cargó el resto, esa persona ya no está en el frente. Es el mismo
    // dato que el dueño mira cuando abre la grilla.
    const ultimaSuya = ultimaColumnaHabilCargada(columnas, (col) => Number(f[col]) > 0)
    const dejoDeCargar = dejoAntesQueElResto({ ultimaSuya, ultimaDelResto: ultimaColumnaCargada })
    const ultimoDiaSuyo = columnas.find((x) => x.col === ultimaSuya)?.etiqueta ?? null
    const pendientesSuyas = dejoDeCargar ? 0 : horasPendientes
    const horas = cargadas + pendientesSuyas
    out.set(clave(nombre), {
      nombre,
      // La fila del espejo: es lo que permite que la Nómina CITE las horas y el jornal en vez de
      // pegar el número que el OS ya calculó. Sin esto no hay forma de cumplir la regla de oro 5.
      filaEspejo: r,
      // ═══ LA FILA ANTERIOR DE LA MISMA PERSONA — DE AHÍ SALE «$/h HOY» (31/08) ═══
      //
      // La planilla trae UNA sola columna de tarifa y desde que el dueño aplicó el aumento, esa
      // columna ES la tarifa nueva. Para poder mostrar las dos —«lo que cobraba» y «lo que cobra»—
      // hace falta la quincena ANTERIOR, que está en el bloque de arriba de la misma planilla.
      //
      // Se busca la ÚLTIMA aparición previa de la persona, no una fila calculada por offset: los
      // bloques no tienen todos la misma altura y un offset fijo terminaría citando a otro.
      // La tarifa de la quincena ANTERIOR: la base sobre la que se calcula el aumento. Ver abajo.
      jornalAnterior: (() => {
        for (let k = r - 1; k >= 1; k--) {
          const g = grid[k - 1]
          if (g && clave(String(g?.[1] ?? '').trim()) === clave(nombre) && Number(g?.[22]) > 0) return Number(g[22])
        }
        return null
      })(),
      filaAnterior: (() => {
        for (let k = r - 1; k >= 1; k--) {
          const g = grid[k - 1]
          if (g && clave(String(g?.[1] ?? '').trim()) === clave(nombre) && Number(g?.[22]) > 0) return k
        }
        return null
      })(),
      categoria: claveDeCategoria(f[3]),
      cargadas,
      pendientes: pendientesSuyas,
      dejoDeCargar,
      ultimoDiaSuyo,
      horas,
      jornal,
      // ═══ EL MAPEO DE COLUMNAS DE LA PLANILLA, RELEÍDO EL 31/08 ═══
      //
      // El dueño rehizo «Obreros 26»: aplicó el aumento en $/h, abrió una columna Y para lo YA GIRADO
      // y corrió el resto. El encabezado real de la fila 525 dice:
      //     V:Hs · W:$/h · X:BANCO · Y:(ya girado) · Z:ADELANTO · AA:EFECTIVO · AB:TOTAL
      // El OS seguía leyendo el mapeo viejo —adelanto en Y, total en AA— y publicaba el giro como si
      // fuera un adelanto y el efectivo como si fuera el total. De ahí salió el desastre del día.
      //
      // Se lee la planilla ENTERA, no tres columnas: ella ya declara el reparto y su aritmética
      // cierra (X + Y + Z + AA = AB en las 17 filas). El OS copia; no recalcula.
      banco: Number(f[23]) || 0,
      transferidoPlanilla: Number(f[24]) || 0,
      adelanto: Number(f[25]) || 0,
      efectivoPlanilla: Number(f[26]) || 0,
      totalCargado: Number(f[27]) || cargadas * jornal,
      total: horas * jornal,
    })
  }
  return { porClave: out, desde: dias[0] ?? null, hasta: dias[dias.length - 1] ?? null, horasPendientes, diasPendientes: pendientes }
}

/**
 * LO QUE LA BASE SABE DE CADA PERSONA — para completar lo que la planilla no trae.
 *
 * `_J_OFICINA` no tiene fecha de alta: los dos de oficina salían con antigüedad «—», vacaciones en
 * cero y sin fondo, que no es «no le corresponde» sino «no lo pude calcular». `public.personas` sí
 * la tiene, y además declara el CONVENIO de cada uno — que es el dato que decide si una liquidación
 * se arma por la ley 22.250 o por la LCT, y son dos números muy distintos.
 *
 * Se empareja con la MISMA regla que las carpetas de Drive: dos tokens en común o no hay match.
 */
async function fichasDeLaBase() {
  const { rows } = await query(
    `select nombre_completo, fecha_ingreso, fecha_egreso, categoria, convenio_colectivo
       from public.personas where nombre_completo is not null`,
  )
  return rows
}

/**
 * LOS NETOS DE RECIBO YA CARGADOS, por CUIL. Es la columna BANCO del cuadro 1.
 *
 * Una fila por carga y la última gana: un recibo emitido no se corrige, se emite otro. Sin filas
 * devuelve un mapa vacío y el cuadro cae a lo que traiga la planilla — no inventa un banco.
 */
async function recibosDelPeriodo(periodo) {
  const { rows } = await query(
    `select distinct on (cuil) cuil, neto, etiqueta, nombre_recibo, legajo, fecha_pago
       from public.nomina_recibo_neto where periodo = $1
      order by cuil, cargado_en desc`, [periodo],
  )
  return new Map(rows.map((r) => [r.cuil, { ...r, neto: Number(r.neto) }]))
}

/**
 * TODOS LOS RECIBOS DE UN MES, SUMADOS POR PERSONA.
 *
 * Oficina cobra mensual aunque el estudio liquide dos quincenas, así que su sueldo del mes es la
 * SUMA de los recibos del mes —no el de la quincena en curso, que es la mitad—. La llave sigue
 * siendo el CUIL y el corte es el sufijo del período: `Q1-08/2026` y `Q2-08/2026` son el mismo mes.
 *
 * Devuelve además cuántas quincenas de ese mes hay cargadas, porque un mes al que le falta una
 * quincena publica un sueldo incompleto y eso tiene que verse.
 */
async function recibosDelMesEntero(hoy) {
  const mes = `${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`
  const { rows } = await query(
    `select cuil, sum(neto)::numeric neto, count(*)::int quincenas,
            max(nombre_recibo) nombre_recibo, max(legajo) legajo
       from public.nomina_recibo_neto where periodo like $1 group by cuil`, [`%-${mes}`],
  )
  return new Map(rows.map((r) => [r.cuil, { ...r, neto: Number(r.neto) }]))
}

/** Lo ya transferido a cuenta del sueldo, por CUIL y concepto. Llave: la referencia del banco. */
async function adelantosPagados(concepto) {
  const { rows } = await query(
    `select cuil, beneficiario, sum(importe)::numeric importe
       from public.nomina_adelanto where concepto = $1 group by cuil, beneficiario`, [concepto],
  )
  const porCuil = new Map()
  for (const r of rows) if (r.cuil) porCuil.set(r.cuil, Number(r.importe))
  return { porCuil, filas: rows }
}

function grilla(activos, { hoy, quincena, escala, recibosPorCuil = new Map(), finales = new Map(), adelantosPorCuil = new Map(), adelantosDeFinal = new Map(), periodoRecibo = '', recibosDelMes = new Map(), oficinaEspejo = new Map() }) {
  // ═══ UNA HOJA, UN PROPÓSITO ═══
  //
  // Esta pestaña hacía cinco trabajos: la instrucción de pago de la quincena, el plantel, lo
  // devengado mes a mes, el costo de desvincular y el índice de legajos en Drive. Ciento cuarenta y
  // una filas y seis anchos de grilla distintos para contestar «cuánto le pago a cada uno mañana».
  //
  // El estándar de modelado financiero es explícito: cada hoja es un capítulo, y los cuadros de
  // respaldo van a su propia hoja (FAST — «worksheets are like chapters in a book»; los supporting
  // schedules se separan). Y el contrato del dueño dice lo mismo con otras palabras: *menos bloques;
  // antes de agregar un cuadro, preguntar si su información no cabe en uno que ya existe*.
  //
  // Así que la Nómina se queda con lo que se paga —y nada más—. Los cuatro cuadros de respaldo se
  // habían mudado a «Plantel» el 31/08; el 09/09 el dueño mandó borrar esa pestaña y se fueron con
  // ella (ver el porqué más abajo, donde estaba el bloque). Este generador vuelve a escribir UNA
  // sola pestaña: por eso `fila` empuja a un solo destino y no hay `destino` que cambiar.
  const f = []
  const fila = (...c) => { f.push(c.concat(Array(Math.max(0, ANCHO - c.length)).fill(''))) }

  fila(PESTANA)
  // ═══ FILA 2: PROCEDENCIA, NO SUBTÍTULO (09/09/2026) ═══
  //
  // El dueño pidió «minimalismo extremo, sin aclaraciones ni explicaciones de nada», y lo que había
  // acá era una explicación de 89 caracteres —«Qué se le paga a cada uno esta quincena · espejo de la
  // planilla de jornales · al …»—: argumentaba para qué sirve la pestaña.
  //
  // La fila NO se puede dejar vacía: la gramática del archivo (`lib/diseno-unificado.mjs`,
  // `encabezadoRoto`) exige una línea de PROCEDENCIA en A2 y `pestanas-sin-prosa.test.mjs` la mide.
  // Son dos cosas distintas: declarar de dónde sale el número no es explicar nada. Queda lo mínimo
  // que declara —fuentes y fecha de corte— y nada más.
  fila(`Jornales · recibos · al ${fecha(hoy)}`)
  fila()

  // ═══ EL TITULAR: TRES CIFRAS, UNA SOLA VEZ ═══
  //
  // Estaba escrito DOS VECES en la pantalla: «QUÉ SALE DE LA CAJA MAÑANA» en A4 y otra vez en A5. No
  // era un `fila()` de más — la fila de rótulos empezaba con `''` en la columna A, y una cadena vacía
  // NO borra (la guarda NO-BORRAR conserva el destino), así que el titular de una corrida vieja
  // sobrevivía debajo del nuevo. La forma de que no pueda volver a pasar no es escribir la celda
  // vacía con más cuidado: es que ninguna fila tenga un hueco en la columna A.
  //
  // Ahora son tres renglones «⇒ rótulo | cifra», la misma forma con la que cierra cada cuadro de
  // abajo, y las dos primeras dan la tercera — se verifica sumando una columna, mirando.
  //
  // POR FÓRMULA, NO PEGADO. `SUMIF` sobre las filas de total, ancladas por el «⇒» con que las escribe
  // `rotuloTotal`: cuando entre un cuadro más, entra solo. El rango arranca DEBAJO del titular
  // (fila 7) porque estas tres filas también empiezan con «⇒» y sumarse a sí mismas es una referencia
  // circular — Sheets publica #REF! y la pestaña queda rota.
  //
  // «POR BANCO» de las liquidaciones finales muestra lo que falta GIRAR, no el acuerdo: por eso la
  // tarjeta suma la columna y no hay que restarle nada.
  const deTodos = (col) => `SUMIF($A$${DEBAJO_DEL_TITULAR}:$A$400;"⇒*";$${col}$${DEBAJO_DEL_TITULAR}:$${col}$400)`
  fila(rotuloTotal('Por banco'), `=${deTodos('F')}`)
  fila(rotuloTotal('En efectivo'), `=${deTodos('G')}`)
  fila(rotuloTotal('Total a pagar'), `=${deTodos('F')}+${deTodos('G')}`)
  fila()

  // Los cuadros se numeran CORRIDOS, no con su número escrito a mano: oficina y liquidaciones finales
  // son condicionales, y un archivo sin oficina publicaba «1 ·» y «3 ·» — el hueco que
  // `numeracionRota` denuncia y que el dueño lee como que falta un cuadro.
  let nBloque = 0
  const bloque = (texto) => fila(seccion(++nBloque, texto))

  // ═══ EL RÓTULO NOMBRA AL GRUPO Y AL PERÍODO, Y NADA MÁS (09/09/2026) ═══
  //
  // Decía «1 · QUÉ SE LE PAGA A CADA UNO · QUINCENA 01/09 A 15/09»: la primera mitad es la pregunta
  // que contesta la pestaña entera, repetida en el título de un cuadro. Lo que distingue este cuadro
  // de los otros dos es QUIÉNES: obreros, oficina, liquidaciones finales.
  //
  // El rótulo lo consume `lib/origen-declarado.mjs` (recorta en el primer « · », así que el período
  // no lo identifica): si se renombra acá, hay que renombrarlo en `scripts/formato-pestanas.mjs` o el
  // amparo de «EFECTIVO redondeado» queda huérfano y el censo denuncia catorce números que están bien.
  bloque(`obreros · quincena ${quincena.desde ?? SIN_DATO}–${quincena.hasta ?? SIN_DATO}`)

  // ═══ LO QUE SE FUE DE ESTE CUADRO, Y A DÓNDE ═══
  //
  // · «Jornadas completadas: 7 · 62 h» — el dato ya está publicado: la columna HORAS de cada persona
  //   lo suma (`=N('_J_OBREROS'!$V$559)+62`) y el total del cuadro lo totaliza. El renglón lo repetía
  //   en palabras. El día por día vive en «_J_OBREROS», que es de donde sale.
  // · «$/h hoy» y «$/h c/aumento» — dos columnas para una tarifa. La que se cobra es la segunda:
  //   `COBRA = horas × $/hora` la usa. La anterior es historia y vive en la planilla, quincena por
  //   quincena. Publicar las dos obligaba a mirar cuál de ellas multiplicaba.
  // · «▲ N sin recibo confirmado…» al pie — es un hallazgo (hay que ir a buscar el recibo), no algo
  //   que se lea el día de pago: sale por `console.warn`, como el resto.
  //
  // LA MARCA «▲» SALE DE LA CELDA DEL NOMBRE. Decía «GONZALEZ EMILIANO  ▲ sin cargar desde el 03/09»
  // dentro de la celda de una persona: 45 caracteres de aviso en la columna con la que se lo busca,
  // se lo ordena y se lo cruza contra la planilla. El aviso no se pierde —va por consola, abajo— y la
  // celda vuelve a contener sólo el nombre.
  fila(...COLUMNAS)
  const T = { cargadas: 0, horas: 0, adelanto: 0, bancoHoy: 0, efHoy: 0, totHoy: 0, bancoNuevo: 0, efNuevo: 0, totNuevo: 0, sube: 0, totalCargado: 0 }
  const sinRecibo = []
  const liquidados = []
  // Las tarifas de la planilla que la regla del aumento deja cortas. Se avisan; no se pisan.
  const seQuedaronCortas = []
  const sinConvenio = []
  // QUIÉNES TIENEN UN PISO DECIDIDO POR UNA INFERENCIA. `sinConvenio` sólo ve los códigos que NADIE
  // mapeó: el día que se agrega el mapeo, se apaga. Y ahí es cuando más hace falta mirar —la
  // equivalencia empieza a gobernar plata—, así que esta lista toma la posta con los que quedaron
  // mapeados por deducción del OS.
  const conInferencia = []
  for (const p of activos) {
    const q = quincena.porClave.get(p.clave)
    if (!q) continue
    // Quien ya cobró su liquidación final NO cobra la quincena, por más que la planilla le traiga
    // horas hasta el día de la baja. Va en el cuadro 1.b y sólo ahí: verlo en los dos es cómo se
    // paga dos veces a la misma persona.
    if (tieneLiquidacionFinal(p.nombre)) { liquidados.push(p.nombre); continue }
    const codigo = q.categoria || p.categoria
    const conv = convenioDe(codigo)
    // EL PISO ES EL MÍNIMO LEGAL; LO QUE SE PAGA ES LO DE HOY + EL 50% DEL BÁSICO DE SU CATEGORÍA
    // (decisión del dueño, 28/08 — el aumento es un MONTO sumado, no un múltiplo del piso; el
    // `Math.max` contra el básico vive adentro de `jornalConAumento`). Se guardan los dos: el básico
    // es lo que la ley exige y tiene que seguir siendo legible, porque es contra ESE número que se
    // mide si la empresa está en falta — no contra el que se decidió pagar.
    const basico = conv ? escala.porCategoria[conv] ?? null : null
    // ═══ EL AUMENTO SE CALCULA SOBRE LA TARIFA DE LA QUINCENA ANTERIOR (31/08) ═══
    //
    // El dueño ya aplicó el aumento a mano en su planilla para casi todos, pero a Quiroga Alexander
    // se le pasó: quedó en $4.500 con los otros Ayudantes en $4.950. Y él pidió: «no podés editar
    // ahí, tenés que TRAER los valores de hora — falta el de Quiroga Alexander».
    //
    // Calcularlo sobre la tarifa ACTUAL aplicaría el aumento dos veces a los que ya lo tienen
    // ($5.974 → $6.161). Calcularlo sobre la ANTERIOR da el mismo número que él ya escribió para los
    // 14, y completa el que falta. La regla no cambia —media brecha hasta el piso, sin pasarlo—:
    // cambia la base sobre la que se aplica, que es la única correcta.
    //
    // Sin quincena anterior (alguien que entró ahora) se usa la actual: es lo único que hay.
    // ═══ LA TARIFA DE LA PLANILLA MANDA; EL CÁLCULO SÓLO COMPLETA LO QUE FALTA (31/08) ═══
    //
    // El dueño ya aplicó el aumento a mano para 14 de los 15, y a Quiroga Alexander se le pasó: quedó
    // en $4.500 con los otros Ayudantes en $4.950. Pidió: «no podés editar ahí, tenés que TRAER los
    // valores de hora — falta el de Quiroga Alexander».
    //
    // Cómo se distingue «ya lo aplicó» de «se le pasó», sin adivinar: si la tarifa de esta quincena
    // es DISTINTA de la de la anterior, la movió él y se respeta tal cual. Si es IGUAL, el aumento no
    // llegó a esa fila y el OS lo calcula con la regla —media brecha hasta el piso, sin pasarlo—.
    //
    // Recalcular siempre rompía dos filas: a Castillo (sin quincena anterior) le aplicaba el aumento
    // sobre una tarifa que YA lo tenía, $5.733 → $5.800; y a Ochoa, cuya quincena anterior fue más
    // alta que ésta, le publicaba $6.174 contra los $5.974 de la planilla.
    const yaLoAplico = q.jornalAnterior != null && Number(q.jornal) !== Number(q.jornalAnterior)
    const objetivo = yaLoAplico || q.jornalAnterior == null
      ? Number(q.jornal)
      : jornalConAumento(q.jornalAnterior, basico)
    if (!conv) sinConvenio.push(p.nombre)
    // LA FILA DICE SI SU EQUIVALENCIA LA DECLARÓ ALGUIEN O LA DEDUJO EL OS. Sin la marca, `M OF →
    // Medio Oficial` (una lectura del OS que el jornal de Castillo contradice) se dibuja idéntico al
    // `OF → Oficial` que declaró el dueño, y la inferencia pasa a ser un hecho silencioso.
    //
    // LÍMITE DECLARADO (28/08): la marca se probó sobre el TEXTO de este archivo y sobre las funciones
    // puras, no viéndola en la pestaña — generarla exige escribir el Sheet real. Y la celda pasa de
    // ~13 a ~22 caracteres: la de al lado tiene dato, así que debería truncar en vez de desparramar,
    // pero eso se confirma mirando el PDF, no razonándolo.
    if (conv && esInferida(codigo)) conInferencia.push({ nombre: p.nombre, codigo })

    // ═══ LA COLUMNA BANCO ES EL RECIBO, NO EL 50% ═══
    //
    // Orden del dueño, 31/08/2026: «por banco va lo q dice recibo y en efectivo se completa todo
    // hasta llegar al numero». El 50/50 sigue rigiendo el TOTAL de cada persona; lo que deja de ser
    // un cálculo es el REPARTO. Para Aguero el 50% daba $294.000 y el recibo dice $215.564,62: son
    // $78.435 que este cuadro mandaba al banco y en realidad se pagan en efectivo.
    //
    // Sin recibo NO se vuelve al 50% por la puerta de atrás: `bancoDeLaPersona` devuelve `null` y
    // acá se cae a lo que traiga la planilla, que es lo que había antes de que existiera el recibo.
    // La diferencia se ve en la fila, que dice de dónde salió cada banco.
    const delRecibo = bancoDeLaPersona(p.nombre, recibosPorCuil)
    // ═══ EL ADELANTO SUMA LA PLANILLA Y LO QUE SALIÓ POR EL BANCO ═══
    //
    // «restar lo que ya hemos transferido lo pagado en adelantos que di el viernes». La planilla
    // trae unos y el extracto trae otros —el lote de haberes del 28/08— y son distintos: ningún
    // importe se repite. Sumarlos es lo correcto; quedarse con uno le paga de más a cinco personas.
    const porBanco = CUIL_POR_PERSONA_DE_PLANILLA[p.nombre]
      ? (adelantosPorCuil.get(CUIL_POR_PERSONA_DE_PLANILLA[p.nombre]) ?? 0) : 0
    const adel = Number(q.adelanto || 0) + porBanco
    const declaradoPorLaPlanilla = { efectivoPlanilla: q.efectivoPlanilla, totalPlanilla: q.totalCargado }
    const hoyR = repartoPersona({ total: q.total, adelanto: adel, banco: delRecibo.banco ?? q.banco, ...declaradoPorLaPlanilla })
    if (delRecibo.banco === null) sinRecibo.push({ nombre: p.nombre, porQue: delRecibo.fuente })
    // EL ESCENARIO «CON AUMENTO» NUNCA BAJA A NADIE, y por dos razones distintas que conviene no
    // confundir: el aumento SUMA sobre lo que cada uno cobra hoy (nadie puede quedar por debajo de su
    // propio jornal), y además `jornalConAumento` no devuelve nunca menos que el básico de convenio,
    // que es el mínimo legal. Acá ya no hay `Math.max` contra el jornal de hoy: sería redundante.
    //
    // LOS NOMBRES DICEN LO QUE SON (29/08). Se llamaban `jornalPiso`, `pisoR` y `T.*Piso` de cuando
    // esta columna era el plantel llevado al PISO del convenio. Dejó de serlo el día que el dueño
    // ordenó el aumento aditivo, y los encabezados de la pestaña ya decían «CON AUMENTO» mientras el
    // código seguía diciendo «piso»: dos vocabularios para la misma columna es como alguien vuelve a
    // implementar un piso creyendo que arregla algo.
    const jornalNuevo = objetivo
    const totalNuevo = jornalNuevo != null ? q.horas * jornalNuevo : null
    // «se deja fijo lo de banco y se pasa lo q haga falta para llegar al monto con aumento todo via
    // efectivo». El `banco: 0` de antes hacía que la proyección recalculara el 50% sobre el total
    // nuevo — o sea, el aumento se repartía mitad y mitad. La orden es que el aumento vaya ENTERO
    // al efectivo, porque lo registrado no se mueve hasta que el estudio liquide distinto.
    const nuevoR = totalNuevo != null
      ? repartoPersona({ total: totalNuevo, adelanto: adel, banco: delRecibo.banco ?? q.banco, ...declaradoPorLaPlanilla })
      : null

    T.cargadas += q.cargadas; T.horas += q.horas; T.adelanto += adel; T.totalCargado += q.totalCargado
    T.bancoHoy += hoyR.banco; T.efHoy += hoyR.efectivo; T.totHoy += hoyR.total
    if (nuevoR) { T.bancoNuevo += nuevoR.banco; T.efNuevo += nuevoR.efectivo; T.totNuevo += nuevoR.total; T.sube += nuevoR.total - hoyR.total }

    // EL AUMENTO DE SU CATEGORÍA, QUE ES LO QUE EL DUEÑO DECIDIÓ. Sale de la MISMA función que la
    // tarifa nueva —no se recalcula acá con otro `× 0,5`— porque dos fórmulas para el mismo aumento
    // se separan el día que el porcentaje cambie.
    // ═══ EL NOMBRE QUE SE MUESTRA ES EL DEL RECIBO ═══
    //
    // La planilla de jornales los escribe como salga: «Aguero Cristian» y «Emanuel Alaniz» y «Emi
    // Maldonado» — apellido primero en unos, nombre primero en otros. Ordenar alfabéticamente una
    // lista así ordena por lo que quedó adelante, y el dueño lo pidió corregido: «no mezcles
    // nombres con apellidos, necesito orden alfabetico claro».
    //
    // El recibo de sueldo los escribe SIEMPRE igual, APELLIDO y después nombres, porque lo emite el
    // sistema de liquidación. Es la forma canónica y ya la tenemos por CUIL. Quien no tenga recibo
    // conserva el nombre de la planilla: inventarle un orden a un nombre que no vimos escrito sería
    // adivinar cuál de sus palabras es el apellido.
    const cuilP = CUIL_POR_PERSONA_DE_PLANILLA[p.nombre]
    const oficial = cuilP ? recibosPorCuil.get(cuilP)?.nombre_recibo : null
    const comoSeLlama = comoSeEscribe(oficial ?? p.nombre)
    // LA CELDA DE UN NOMBRE LLEVA UN NOMBRE. Decía «GONZALEZ EMILIANO  ▲ sin cargar desde el 03/09»:
    // el aviso se metía adentro del identificador con el que se busca, se ordena y se cruza esa fila
    // contra la planilla. Que dejó de cargar horas es un hallazgo —hay que ir a preguntar— y sale por
    // consola, unas líneas más abajo, con nombre y fecha.
    const nombreFila = comoSeLlama
    // ═══ LA PLATA VA POR FÓRMULA CONTRA `_RECIBOS_RAW`, NO PEGADA ═══
    //
    // Regla de oro 5: *«nunca un número pegado: todo en celda referenciada y/o fórmula»*. El censo
    // midió 601 pegados en esta pestaña apenas entró al registro de controles. El neto del recibo y
    // lo transferido son DATO DE ORIGEN y viven en su réplica declarada; acá se los cita, y el
    // efectivo y el total se calculan en la celda. Así el que abre la pestaña puede ver de dónde
    // sale cada peso sin salir del archivo, que es de lo que se trata la regla.
    //
    // Con CUIL se cita; sin CUIL —quien no tiene recibo— se conserva el valor calculado, porque no
    // hay a qué apuntar. Esas filas quedan contadas por el censo y eso es correcto: son la excepción
    // y tienen que verse.
    // SUMIFS y no INDEX+MATCH: `MATCH(1;(A:A=x)*(B:B=y);0)` necesita semántica de array y sin
    // ARRAYFORMULA devuelve vacío — probado, la columna salió en blanco. Con una fila por
    // (CUIL, período) la suma ES el valor, y de paso es la fórmula más simple que resuelve, que es
    // lo que pide el checklist. Rangos CERRADOS, no `A:A`, por la misma razón.
    // ═══ TODA LA PLATA POR FÓRMULA (regla de oro 5) ═══
    //
    // Nada de esta fila es un número calculado y pegado. Las horas y el jornal CITAN el espejo de la
    // planilla; el neto del recibo y lo transferido citan `_RECIBOS_RAW`, que es el insumo declarado;
    // y el total y el efectivo son la cuenta hecha EN LA CELDA. Quien abre la pestaña puede seguir de
    // dónde sale cada peso sin salir del archivo.
    //
    // Queda un solo número pegado por fila: `$/h c/aumento`. No es un cálculo, es LA DECISIÓN del
    // dueño —cerrar la mitad de la brecha hasta el piso de convenio, sin pasarlo nunca— y la produce
    // `jornalConAumento`. Pegarlo es correcto; derivarlo en la celda sería reimplementar la regla en
    // dos lugares, que es como se separan.
    const R = "'_RECIBOS_RAW'!"
    const J = "'_J_OBREROS'!"
    // El mismo formato con el que `_RECIBOS_RAW` escribe la fecha: d/m/aaaa, sin ceros a la izquierda.
    const diaDeHoy = `${hoy.getDate()}/${hoy.getMonth() + 1}/${hoy.getFullYear()}`
    const n = f.length + 1                   // la fila que va a ocupar en la Nómina
    const e = q.filaEspejo                   // su fila en el espejo de la planilla
    const cuilFila = CUIL_POR_PERSONA_DE_PLANILLA[p.nombre]
    const rec = (col, cuil, per) => `SUMIFS(${R}$E$1:$E$400;${R}$${col}$1:$${col}$400;"${cuil}";${R}$B$1:$B$400;"${per}")`
    // ═══ «POR BANCO» ES LO QUE FALTA TRANSFERIR, NO EL NETO DEL RECIBO (31/08) ═══
    //
    // El dueño, después de pagar: *«te equivocaste con los empleados que ya habían recibido
    // transferencias, me hiciste transferir de más porque no consideraste que lo del neto del recibo
    // es lo que va al banco, y si dice transferido también»*.
    //
    // Tenía razón y costó plata. La columna publicaba el NETO DEL RECIBO entero como si estuviera
    // pendiente, con «YA TRANSFERIDO $200.000» en la celda de al lado: el que paga lee la columna de
    // banco y transfiere. A Gonzalez Tobares se le mandó $192.887,48 cuando ya tenía cubiertos los
    // $192.887,48 con el lote del 28/08; a Rosales y a Pastran, $200.000 de más a cada uno.
    //
    // El neto del recibo es la OBLIGACIÓN bancaria de la quincena. Lo ya transferido es un pago A
    // CUENTA de esa misma obligación, no un concepto aparte: se resta acá, no del efectivo. `MAX(0;…)`
    // porque transferir de más no genera una transferencia negativa — el sobrante lo absorbe el
    // efectivo, que es `total − banco − transferido − adelanto` y ya lo contempla.
    //
    // SIN `ROUND`: el dueño, más temprano — «dejar los números de la manera correcta porque si no las
    // transferencias se hacen mal». El recibo dice $215.564,62 y redondear hace una transferencia por
    // 38 centavos de más.
    // ═══ LA PLANILLA MANDA. EL OS COPIA (31/08) ═══
    //
    // El dueño, después de tres correcciones mías sobre la misma quincena: «respetá las anotaciones
    // de jornales». Su planilla ya declara qué va al banco, qué se giró, qué se adelantó y qué queda
    // en billetes — y su aritmética cierra fila por fila. Todo lo que el OS ponga encima es una
    // conjetura sobre un dato que ya existe.
    //
    // Por eso estas cuatro columnas CITAN el espejo y no calculan nada. El que quiera saber de dónde
    // sale un peso lo sigue hasta la planilla, que es donde se carga la obra.
    const girosDeHoy = cuilFila
      ? `SUMIFS(${R}$E$1:$E$400;${R}$C$1:$C$400;"${cuilFila}";${R}$F$1:$F$400;"QUINCENA";${R}$B$1:$B$400;"${diaDeHoy}")`
      : '0'
    // ═══ QUÉ VA EN CADA COLUMNA — LO FIJÓ EL DUEÑO (31/08) ═══
    //
    //   POR BANCO       = lo que salió por transferencia HOY, del extracto del Santander.
    //   YA TRANSFERIDO  = lo que ya había salido ANTES de esos giros (la columna Y de su planilla).
    //
    // Textual: «eso va en columna por banco, y lo ya transferido era un dato que tenías antes de
    // haber hecho esas transferencias». Las dos son plata que ya salió por el banco, en momentos
    // distintos, y por eso son dos columnas y no una: mezcladas no se puede auditar contra el
    // extracto de hoy.
    const celdaBanco = `=${girosDeHoy}`
    // B · EL ADELANTO EN OBRA. Sale del espejo de la planilla, citado por fórmula como las horas y
    // el jornal: es el mismo dato, de la misma fila, y no hay razón para pegarlo.
    //
    // CERO, no el guión: esta celda entra en una resta. Con «—» adentro, `F−D−C−B` devuelve #VALUE!
    // y se llevó puesta la fila de Castillo y el total de la columna. El guión es para leer, no
    // para calcular; que el cero se VEA como guión lo resuelve el formato, no el contenido.
    const celdaAdel = e ? `=N(${J}$Z$${e})` : (Number(q.adelanto) || 0)
    // C · LO QUE YA SALIÓ POR EL BANCO. Otra fuente, otra columna: `_RECIBOS_RAW` trae una fila por
    // movimiento con su referencia del extracto. Sin CUIL no hay a qué apuntar y queda el valor.
    // LO YA GIRADO SALE DE LA PLANILLA (columna Y), no del registro de movimientos: la planilla es
    // la que el dueño mantiene y contra la que paga. El registro sigue existiendo para el control.
    // ═══ LO YA GIRADO: LA PLANILLA **MÁS** LOS GIROS DE HOY (31/08) ═══
    //
    // La columna Y de la planilla trae lo que el dueño anotó hasta ayer. Los 16 giros de hoy salen
    // del extracto del Santander (lote 260831507) y todavía no están anotados ahí. Se suman las dos
    // fuentes, filtrando el registro por la FECHA de hoy: sin ese filtro se contaría dos veces el
    // lote del 28/08, que ya está en Y.
    const celdaTransf = e ? `=N(${J}$Y$${e})` : (porBanco || 0)
    // Las horas del espejo más los días que faltan a jornada completa. El sumando sólo aparece
    // cuando hay días pendientes, así la fórmula no lleva un «+0» que hace dudar.
    const celdaHoras = e ? `=N(${J}$V$${e})${q.pendientes ? `+${Math.round(q.pendientes)}` : ''}` : Math.round(q.horas)
    const celdaJornal = e ? `=N(${J}$W$${e})` : q.jornal
    // La categoría de convenio: la declarada si existe, y si la dedujo el OS va con «▲». Sin
    // equivalencia se muestra el código crudo de la planilla, que es mejor que un blanco: dice que
    // esa categoría no está mapeada y por eso su fila no tiene piso.
    // SIN LA MARCA «▲» DENTRO DE LA CELDA. Que la equivalencia la dedujo el OS y no la declaró nadie
    // sigue siendo un hallazgo vivo —gobierna el piso contra el que se mide a esa persona— y por eso
    // no se apaga: sale por consola en `lineaEquivalenciasInferidas`, al final de la corrida. Lo que
    // no puede es vivir pegado al valor de una celda que se lee, se ordena y se compara.
    const catConvenio = conv || codigo || SIN_DATO
    // ═══ TODA LA PLATA POR FÓRMULA O CITADA (regla de oro 5) ═══
    //
    // Las horas y la tarifa CITAN el espejo de la planilla; el neto del recibo y lo transferido citan
    // `_RECIBOS_RAW`, que es el insumo declarado; y el resto es la cuenta hecha EN LA CELDA. Quien
    // abre la pestaña puede seguir de dónde sale cada peso sin salir del archivo.
    fila(nombreFila, catConvenio,
      // COBRA = horas × la tarifa que se cobra, las dos citadas: es la misma cuenta que hace la
      // planilla, escrita en la celda y no traída ya resuelta.
      `=ROUND(N(J${n})*N(K${n});0)`,
      celdaAdel, celdaTransf, celdaBanco,
      // EN EFECTIVO — la identidad de la planilla: cobra − banco − girado − adelanto = su columna AA.
      `=ROUND(N(C${n})-N(F${n})-N(E${n})-N(D${n});0)`,
      `=N(F${n})+N(G${n})`,                            // TOTAL A PAGAR = lo que falta entregar
      // «EFECTIVO redondeado»: la celda del dueño. Nace vacía y `conEfectivoRedondeadoDelDueno` le
      // vuelve a poner lo que él tenía escrito, buscándolo POR PERSONA y no por número de fila.
      '',
      celdaHoras,
      // ═══ LA TARIFA SE CITA, NO SE PEGA (09/09/2026) ═══
      //
      // Iba PEGADA con el argumento de que era «la DECISIÓN» del dueño —media brecha hasta el piso de
      // convenio— y no un cálculo. Es las dos cosas: la produce `jornalConAumento`, o sea que ES un
      // número calculado por el código, y la regla de oro 5 no admite ninguno. Peor: envejece en
      // silencio, que es exactamente lo que la regla evita.
      //
      // Manda la planilla, como en las otras cuatro columnas de este cuadro («respetá las anotaciones
      // de jornales»). Cuando la regla del OS dice que esa tarifa se quedó corta —el caso de Quiroga
      // Alexander, que quedó en $4.500 con los otros Ayudantes en $4.950— eso es un HALLAZGO: hay que
      // corregirlo en la planilla, y sale por consola. Publicarlo acá encima pisaría el dato de la
      // fuente con una conjetura del OS, sin que nadie se entere.
      celdaJornal)
    if (jornalNuevo != null && Number(q.jornal) && Number(jornalNuevo) !== Number(q.jornal)) {
      seQuedaronCortas.push(`${comoSeLlama}: la planilla dice ${q.jornal} y la regla del aumento da ${jornalNuevo}`)
    }
  }
  // El conteo cuenta a los que QUEDARON en el cuadro. Con `activos.filter(...)` seguía diciendo 17
  // después de sacar a los dos liquidados: un total de 15 filas rotulado «17 persona(s)».
  const nF = f.length
  const n0 = nF - activos.filter((x) => quincena.porClave.has(x.clave) && !tieneLiquidacionFinal(x.nombre)).length + 1
  const suma = (c) => `=SUM(${c}${n0}:${c}${nF})`
  // EL RÓTULO «⇒ N persona(s)» ES UN CONTRATO CON OTRA PESTAÑA. «Jornales por Quincena» ubica esta
  // fila con `MATCH("⇒*persona(s)";'Nómina'!$A:$A;0)` y de ahí saca el plantel, el total, el adelanto
  // y el banco de la quincena. Cambiar el texto la deja leyendo #N/A o, peor, el total de otro cuadro.
  fila(rotuloTotal(`${activos.filter((p) => quincena.porClave.has(p.clave) && !tieneLiquidacionFinal(p.nombre)).length} persona(s)`),
    // B es la categoría (texto, no se suma); de C a I la plata; J las horas. K es la tarifa:
    // promediar $/hora es inventar un número que nadie cobra, así que queda vacía.
    '', suma('C'), suma('D'), suma('E'), suma('F'), suma('G'), suma('H'), suma('I'), suma('J'), '')
  // ═══ LAS CUATRO NOTAS AL PIE DE ESTE CUADRO SE FUERON A LA CONSOLA (06/09/2026) ═══
  //
  // Eran 1.400 caracteres de párrafo debajo del total —la brecha de convenio, quiénes cobran sin
  // estar en la planilla, quiénes ya cobraron su liquidación final, quiénes no tienen recibo— y
  // ninguna se podía quedar: el dueño pidió el 05/09 «minimalismo extremo, sin aclaraciones ni
  // explicaciones de nada», y el contrato (lib/diseno-unificado.mjs, regla 10) prohíbe la nota al pie.
  //
  // PERO BORRARLAS A SECAS APAGA UN AVISO, y ésa es la forma exacta en que nace un control que no
  // puede dar rojo. Cada una se resolvió por lo que era:
  //
  //   · LA BRECHA DE CONVENIO no es un hallazgo: es una decisión ya tomada y su número está publicado
  //     en la columna «$/hora». El párrafo lo repetía en palabras. Se borra.
  //   · LOS LIQUIDADOS no faltan: están en el cuadro 3 con su plata. El párrafo avisaba de algo que
  //     el lector encuentra dos bloques más abajo. Se borra.
  //   · QUIÉNES COBRAN SIN ESTAR EN LA PLANILLA y QUIÉNES NO TIENEN RECIBO **sí** son hallazgos
  //     vivos: hay que cargarles las horas o conseguir el recibo. Van por `console.warn` del
  //     generador, que es donde el que corre el pipeline los ve — no en la pestaña que se mira el
  //     día de pago. Un hallazgo se resuelve; no se anota al pie de un cuadro.
  //
  // Y el de «sin recibo» además no informaba nada que el cuadro no muestre: a quien no tiene recibo
  // le sale POR BANCO desde la planilla, y su columna se ve.
  const fueraDePlanilla = COBRAN_Y_NO_ESTAN_EN_LA_PLANILLA
    .map((x) => ({ ...x, r: [...recibosPorCuil.values()].find((v) => String(v.legajo) === String(x.legajo)) }))
    .filter((x) => x.r)
  for (const x of fueraDePlanilla) {
    console.warn(`  ⚠ ${x.nombre} (leg. ${x.legajo}) cobra esta quincena y no tiene horas en la planilla: `
      + `su efectivo no se puede calcular hasta que se le carguen`)
  }
  for (const x of sinRecibo) console.warn(`  ⚠ ${x.nombre}: sin recibo de esta quincena (${x.porQue}) — el banco sale de la planilla`)

  // ═══ 2 · OFICINA — MENSUAL, NO QUINCENAL ═══
  //
  // El dueño, 31/08: «falta lo relativo a las personas de "oficina" […] mismo arreglo de 50 y 50» y,
  // corrigiendo la primera versión: «es personal q cobra MENSUAL por mas q tenga 2 quincenas
  // liquidadas por mes, esto es algo aclarado hace mucho tiempo».
  //
  // Ésa es la diferencia con obra y no es cosmética. En obra la unidad es la quincena: se paga lo de
  // esos quince días y el ciclo cierra. En oficina el estudio liquida dos quincenas pero **el sueldo
  // es del mes**, así que tomar el recibo de la segunda quincena y tratarlo como el pago completo
  // publica la MITAD de lo que se le debe a una persona.
  //
  // Por eso el banco de esta tabla suma TODOS los recibos del mes —`"*-MM/AAAA"`, las dos
  // quincenas— y no el del período en curso. Sobre ese mensual corre el 50/50: mitad blanca lo
  // liquidado, mitad negra en efectivo, total el doble.
  //
  // Y SI FALTA UNA QUINCENA, SE DICE. Hoy sólo está cargada la segunda de agosto: el mensual que
  // publica esta tabla está incompleto y la nota lo declara con el nombre de lo que falta. Un número
  // incompleto presentado como completo es peor que un hueco visible.
  const deOficina = activos.filter((p) => p.sector === 'Oficina')
  if (deOficina.length) {
    const mes = `${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`
    // Cuántas quincenas de ESTE mes tiene cargada cada persona. Se cuenta por CUIL sobre los recibos
    // que ya están en la base: es el único lugar donde el hecho existe.
    const quincenasDe = (cuil) => Number(recibosDelMes.get(cuil)?.quincenas ?? 0)
    fila('')
    // El rótulo lo consume `lib/origen-declarado.mjs` (recorta en el primer « · ») para amparar la
    // columna COBRA de este cuadro: el neto acordado es una decisión del dueño, no una liquidación.
    // Si se renombra acá, hay que renombrarlo también en `scripts/formato-pestanas.mjs`.
    bloque(`oficina · mes ${mes}`)
    // ═══ EL RECIBO ES EL DE LA QUINCENA, NO LA SUMA DEL MES (31/08, corrección del dueño) ═══
    //
    // Yo sumaba las dos quincenas —$663.526,08 + $663.141,56 = $1.326.667,64— y él lo cortó:
    // «eso esta mal porque no es lo q indican los recibos de cada uno». Tiene razón: por banco va
    // lo que dice EL recibo, y el recibo de esta quincena dice $663.141,56.
    //
    // El neto ACORDADO sí es mensual ($1.800.000), así que la quincena vale la mitad y el efectivo
    // completa hasta ahí. Las dos cosas conviven sin contradecirse: el acuerdo se pacta por mes, la
    // plata se paga por quincena. El criterio vive donde se calcula (`SUELDO_NETO_OFICINA`).
    //
    // ═══ SE FUERON EL RENGLÓN DEL NETO Y LA COLUMNA «Quincenas del mes» (09/09/2026) ═══
    //
    // El renglón decía «Neto acordado por mes: 1.800.000 c/u» y la columna COBRA de las dos filas
    // publica exactamente eso, persona por persona: era el mismo número escrito tres veces.
    //
    // «Quincenas del mes» ocupaba la letra I, que en el cuadro de arriba es «EFECTIVO redondeado».
    // Una misma columna con dos significados en la misma pestaña es lo que obliga a releer el
    // encabezado en cada cuadro, y es de donde venía el descuadre que el dueño marcó. El dato que
    // daba —si el mes está completo— es un hallazgo, no una cifra que se lee el día de pago: sale
    // por consola, con el nombre de quién está incompleto.
    fila(...COLUMNAS)
    const incompletos = []
    const sinRecibOfi = []
    const sinAcuerdoNeto = []
    const orden = (x) => comoSeEscribe(recibosDelMes.get(CUIL_POR_PERSONA_DE_PLANILLA[x.nombre])?.nombre_recibo ?? x.nombre)
    for (const p of [...deOficina].sort((x, y) => orden(x).localeCompare(orden(y), 'es'))) {
      const cuil = CUIL_POR_PERSONA_DE_PLANILLA[p.nombre]
      const r = cuil ? (recibosPorCuil.get(cuil) ?? recibosDelMes.get(cuil)) : null
      const comoSeLlama = comoSeEscribe(r?.nombre_recibo ?? p.nombre)
      const o = oficinaEspejo.get(p.nombre) ?? null
      const R = "'_RECIBOS_RAW'!"
      const nf = f.length + 1
      const cuantas = cuil ? quincenasDe(cuil) : 0
      const diaDeHoyOfi = `${hoy.getDate()}/${hoy.getMonth() + 1}/${hoy.getFullYear()}`
      // EL NETO ES UN ACUERDO DECLARADO, no un cálculo. Quien no lo tenga declarado no lleva total:
      // inventarle uno es inventarle el sueldo a una persona.
      const neto = cuil ? (SUELDO_NETO_OFICINA[cuil] ?? null) : null
      if (neto == null && r) sinAcuerdoNeto.push(comoSeEscribe(r.nombre_recibo))
      if (!r) {
        // Sin recibo no hay mitad blanca, y sin mitad blanca el 50/50 no tiene de dónde salir.
        sinRecibOfi.push(`${comoSeLlama} (sin recibo de ${mes})`)
        // Las columnas que este cuadro no usa quedan VACÍAS, no corridas: «EFECTIVO redondeado»,
        // «Horas» y «$/hora» son de obra. Un cuadro con menos columnas que el de arriba es lo que se
        // ve descuadrado.
        fila(comoSeLlama, SIN_DATO, neto ?? SIN_DATO, o ? `=N('_J_OFICINA'!$X$${o.fila})` : '', '', SIN_DATO, SIN_DATO, SIN_DATO, '', '', '')
        continue
      }
      if (cuantas < 2) incompletos.push(`${comoSeLlama} (${cuantas} de 2)`)
      fila(comoSeLlama,
        SIN_DATO,                            // la planilla de oficina no trae categoría
        // COBRA · EL NETO ACORDADO, ENTERO. El dueño: «te había dicho que eran 1.800.000 cada uno».
        neto ?? SIN_DATO,
        o ? `=N('_J_OFICINA'!$X$${o.fila})` : 0,
        `=SUMIFS(${R}$E$1:$E$400;${R}$C$1:$C$400;"${cuil}";${R}$F$1:$F$400;"QUINCENA")`,
        // ═══ LO QUE FALTA GIRAR, NO EL RECIBO ENTERO (31/08) ═══
        //
        // Por banco va lo que dice el recibo de la quincena, MENOS lo que ya se le giró. La versión
        // sin el `MAX` publicaba el recibo entero con «YA TRANSFERIDO $663.141,56» al lado, y el que
        // paga lee esta columna: es el mismo defecto que en el cuadro de obreros le hizo transferir
        // $592.887 de más. Con `MAX(0;…)` un giro de más no genera una transferencia negativa — el
        // sobrante lo absorbe el efectivo, que resta las dos columnas.
        `=SUMIFS(${R}$E$1:$E$400;${R}$C$1:$C$400;"${cuil}";${R}$F$1:$F$400;"QUINCENA";${R}$B$1:$B$400;"${diaDeHoyOfi}")`,
        // El efectivo completa hasta el NETO ACORDADO, y va en billetes: sin centavos.
        //
        // EL NETO VA ACÁ Y NO SE CITA A `G`: desde que «TOTAL A PAGAR» pasó a ser `E+F`, leerlo desde
        // G hacía un ciclo —F depende de G y G de F— y Sheets publicaba #REF! en las dos celdas y en
        // la tarjeta del titular. El neto es un PARÁMETRO declarado por el dueño («el 1.800.000 es el
        // salario de cada uno»), no un cálculo: va escrito, como estaba antes en G.
        `=ROUND(N(C${nf})-N(F${nf})-N(E${nf})-N(D${nf});0)`,
        // ═══ «TOTAL A PAGAR» ES LO QUE SALE MAÑANA, NO EL SUELDO DEL MES (31/08) ═══
        //
        // Acá iba el neto acordado entero ($1.800.000). Mientras nada estaba pagado daba lo mismo;
        // desde que hay giros hechos, no: la tarjeta del titular suma esta columna y decía
        // «$7.972.450 sale mañana» cuando de la caja salían $6.646.166 — y su propio subtítulo
        // promete que «las dos primeras dan la tercera», que dejaba de ser cierto.
        //
        // El neto acordado no se pierde: está escrito en el subtítulo del bloque, que es donde
        // corresponde. Las tres tablas dicen ahora lo mismo en esta columna: banco + efectivo.
        `=N(F${nf})+N(G${nf})`,
        // «EFECTIVO redondeado», «Horas» y «$/hora» no aplican a oficina: van vacías.
        '', '', '')
    }
    const oF = f.length
    const o0 = oF - deOficina.length + 1
    fila(rotuloTotal(`${deOficina.length} persona(s) de oficina`), '',
      `=SUM(C${o0}:C${oF})`, `=SUM(D${o0}:D${oF})`, `=SUM(E${o0}:E${oF})`, `=SUM(F${o0}:F${oF})`, `=SUM(G${o0}:G${oF})`, `=SUM(H${o0}:H${oF})`,
      '', '', '')
    // ═══ EL ESTADO DEL MES YA NO SE PUBLICA: SE AVISA (09/09/2026) ═══
    //
    // Debajo del total iba «   · Mes completo · 09/2026» o «   · ▲ INCOMPLETO · 1ª quincena sin
    // cargar». El mes ya está escrito en el rótulo del bloque, y que falte una quincena es un
    // hallazgo —hay que pedirle el recibo al estudio—, no una cifra que se lea el día de pago.
    //
    // Se escribía SIEMPRE, dijera lo que dijera, porque una celda vacía no borra y la advertencia
    // vieja sobrevivía a la corrida que la reemplazaba. Ese riesgo desaparece con la fila.
    if (incompletos.length) console.warn(`  ⚠ oficina, mes ${mes} incompleto: ${incompletos.join(' · ')}`)
    // LOS DOS HALLAZGOS VAN A LA CONSOLA. Un recibo que falta y un neto sin declarar son cosas que
    // hay que ir a buscar, no información que se lee el día de pago: el que corre el pipeline los
    // ve, y la pestaña no publica el pendiente de nadie. La fila del afectado ya lo muestra sin
    // texto — sin recibo, su POR BANCO queda en cero; sin neto acordado, su fila no tiene total.
    for (const n of sinRecibOfi) console.warn(`  ⚠ ${n}: sin recibo de ${mes} — no se puede calcular su efectivo`)
    for (const n of sinAcuerdoNeto) console.warn(`  ⚠ ${n}: sin neto acordado en SUELDO_NETO_OFICINA — su fila queda sin total`)
  }

  // ═══ 3 · LAS LIQUIDACIONES FINALES, 50 EN BLANCO Y 50 EN EFECTIVO ═══
  //
  // El dueño lo pidió textual: «me reflejes el calculo de 50 en blanco (lo liquidado) y 50 en negro
  // (lo q se paga en efectivo) […] debajo del cuadro de todos los salarios quincenales q se
  // abonaran mañana».
  //
  // Lo que liquidó el estudio ES la mitad blanca; la otra mitad es un monto igual en efectivo. El
  // total que sale de la caja es el DOBLE del recibo. Leerlo al revés —tomar el recibo como el
  // total— le paga a cada uno la mitad de lo que le corresponde.
  if (finales.size) {
    fila('')
    bloque('liquidaciones finales')
    // ═══ LO QUE ESTE CUADRO SIGNIFICA, Y POR QUÉ NO LO EXPLICA UN RENGLÓN ═══
    //
    // El acuerdo es 50/50: lo que liquidó el estudio ES la mitad blanca y la otra mitad es un monto
    // IGUAL en efectivo, así que de la caja sale el DOBLE del recibo. Leerlo al revés —tomar el
    // recibo como el total— le paga a cada uno la mitad de lo que le corresponde. La cuenta vive en
    // `reparto50DeLiquidacionFinal` y el cuadro la muestra columna por columna.
    //
    // El dueño lo aprobó así y me corrigió dos veces cuando lo cambié para arreglar el titular:
    // «estan mal las liquidaciones finales porque el acuerdo tb es 50 y 50» y «pesimo el calculo de
    // liquidaciones finales, estaba bien lo indicaba antes». El titular se arregla en el titular.
    //
    // ═══ LAS MISMAS ONCE COLUMNAS QUE LOS OTROS DOS CUADROS (09/09/2026) ═══
    //
    // Tenía nueve, con «POR BANCO (a girar)» y «MITAD BLANCA (lo liquidado)» donde los otros dos
    // dicen «POR BANCO» y «EFECTIVO redondeado». Dos rótulos distintos para la misma letra obligan a
    // releer el encabezado, y «MITAD BLANCA» era además una tercera copia del mismo número: es lo
    // que ya publica «EN EFECTIVO» —la mitad negra es igual a la blanca— y la mitad de «COBRA».
    //
    // «POR BANCO» significa lo mismo en los tres: lo que TODAVÍA no salió. Por eso el titular puede
    // sumar la columna sin restarle nada, y ésa fue la corrección que hacía que dijera cualquier cosa.
    fila(...COLUMNAS)
    const F = { blanco: 0, negro: 0, total: 0, dado: 0, queda: 0 }
    const ordenadas = [...finales.values()].sort((a, b) => String(a.nombre_recibo).localeCompare(String(b.nombre_recibo), 'es'))
    for (const r of ordenadas.filter((x) => !esSubcontratista(x.nombre_recibo))) {
      const c = reparto50DeLiquidacionFinal(r.neto)
      if (c.total === null) { fila(r.nombre_recibo, SIN_DATO, SIN_DATO, '', SIN_DATO, SIN_DATO, SIN_DATO, SIN_DATO, '', '', ''); continue }
      // ═══ LO QUE YA SE LE TRANSFIRIÓ CONTRA SU LIQUIDACIÓN ═══
      //
      // El lote de haberes del 28/08 les pagó $300.000 a Jofre y $300.000 a Sosa. Esa plata NO es
      // un adelanto de quincena —ellos ya no cobran la quincena— sino un pago a cuenta de esto. Sin
      // restarla acá, el cuadro pide transferir de nuevo lo que ya salió.
      //
      // ═══ POR CUIL, Y LA PRIMERA VERSIÓN POR NOMBRE FALLÓ EN LA PRIMERA CORRIDA ═══
      //
      // Emparejaba por nombre normalizado con prefijo de nueve letras. El banco escribe «Sosa Nestor
      // Raul» y su recibo dice «SOSA NESTROR RAUL»: una letra de diferencia en la posición nueve, y
      // su fila salió publicando que no se le había transferido nada cuando ya tenía $300.000
      // encima. Le pedía al dueño transferir de nuevo lo que ya había salido.
      //
      // El CUIL de esos dos movimientos se completó desde el CUIL de sus propios recibos. Sin CUIL
      // NO se resta: la fila muestra el total entero y eso se ve, que es mejor que restarle a quien
      // no corresponde.
      const dado = (adelantosDeFinal.filas ?? [])
        .filter((a) => a.cuil && a.cuil === r.cuil)
        .reduce((acc, a) => acc + Number(a.importe), 0)
      F.blanco += c.blanco; F.negro += c.negro; F.total += c.total; F.dado += dado; F.queda += c.total - dado
      // Igual que el cuadro 1: el blanco CITA la réplica y el resto es la cuenta en la celda. El
      // negro es un espejo del blanco —el 50/50— y el total su suma; escribirlos como números sería
      // pegar tres veces el mismo hecho.
      const nf = f.length + 1
      const cita = `SUMIFS('_RECIBOS_RAW'!$E$1:$E$400;'_RECIBOS_RAW'!$A$1:$A$400;"${r.cuil}";'_RECIBOS_RAW'!$B$1:$B$400;"FINAL")`
      fila(r.nombre_recibo,
        SIN_DATO,                              // su categoría no vive en ninguna fuente del archivo
        // COBRA · el acuerdo entero: la mitad blanca liquidada más una mitad negra igual.
        `=ROUND(N(${cita})*2;0)`,
        // ADELANTO EN OBRA: a estas personas no se les dio, y la celda va VACÍA, no en cero. Un cero
        // escrito es un número pegado a mano —el censo de la regla de oro 5 lo cuenta como tal— y
        // además dibuja «—» igual que el vacío. Las restas de abajo la leen con `N()`, que trata la
        // celda vacía como cero: la cuenta no cambia.
        '',
        dado ? `=SUMIFS('_RECIBOS_RAW'!$E$1:$E$400;'_RECIBOS_RAW'!$C$1:$C$400;"${r.cuil}";'_RECIBOS_RAW'!$F$1:$F$400;"LIQUIDACION_FINAL")` : '',
        // La mitad negra es IGUAL a la blanca —el acuerdo— y el total es el doble del recibo.
        // Lo ya entregado se resta al final, en su columna, sin tocar el 50/50.
        // ═══ LO YA TRANSFERIDO SE RESTA DEL BANCO, NO DEL EFECTIVO (31/08) ═══
        //
        // Lo tenía al revés y el dueño lo vio en las tarjetas: los $300.000 de cada uno salieron
        // por TRANSFERENCIA —el lote de haberes del 28/08—, así que reducen lo que falta
        // transferir, no los billetes. Restándolos del efectivo, la tarjeta «POR TRANSFERENCIA»
        // pedía transferir $600.000 que YA habían salido.
        //
        // De paso el 50/50 vuelve a leerse solo: EN EFECTIVO ($330.431) es exactamente la mitad
        // negra, igual a lo liquidado, y lo que se descontó se ve en la columna de al lado.
        // La blanca es lo liquidado; la negra es un monto IGUAL; lo que queda por pagar descuenta
        // lo ya entregado; y el total del acuerdo —el doble— queda a la vista en la última columna.
        // Falta girar = lo liquidado menos lo ya girado. La mitad negra es IGUAL a la blanca.
        `=ROUND(N(${cita})-N(E${nf})-N(D${nf});0)`, `=ROUND(N(${cita});0)`,
        // «EFECTIVO redondeado», «Horas» y «$/hora» no aplican a una liquidación final: van vacías.
        // Acá iba «MITAD BLANCA (lo liquidado)», que era el mismo `cita` publicado por tercera vez.
        `=N(F${nf})+N(G${nf})`, '', '', '')
    }
    // Cuenta las que QUEDARON en el cuadro. Con `finales.size` decía «7 liquidaciones» sobre dos
    // filas, porque las otras cinco se habían ido al bloque de subcontratistas.
    const q1 = f.length - ordenadas.filter((x) => !esSubcontratista(x.nombre_recibo)).length + 1
    const q2 = f.length
    fila(rotuloTotal(`${ordenadas.filter((x) => !esSubcontratista(x.nombre_recibo)).length} liquidación(es) final(es)`),
      '', `=SUM(C${q1}:C${q2})`, `=SUM(D${q1}:D${q2})`, `=SUM(E${q1}:E${q2})`,
      `=SUM(F${q1}:F${q2})`, `=SUM(G${q1}:G${q2})`, `=SUM(H${q1}:H${q2})`, '', '', '')
    // G ES «QUEDA POR PAGAR» EN ESTE CUADRO Y «TOTAL A PAGAR» EN LOS OTROS DOS, y las dos cosas son
    // lo mismo: lo que todavía sale de la caja por esa fila. Por eso el titular puede sumar la
    // columna G de los tres sin mezclar nada.
    // ACÁ IBA LA NOTA QUE DECÍA QUE ESTAS PERSONAS NO COBRAN LA QUINCENA. El título del bloque ya lo
    // dice —«lo que terminó · liquidaciones finales»— y no están en el cuadro 1: el renglón repetía
    // el rótulo. Lo que sí era conocimiento y por eso queda escrito acá: la baja de los dos la
    // confirma ARCA, con fecha de cese 25/08/2026 (despido Art. 5° Ley 25.371) y la constancia
    // guardada en su legajo. Hasta el 31/08 esto se apoyaba sólo en que el estudio les liquidó el
    // final, que es bastante menos.
  }


  // ═══ LA LISTA DE «SIN HORAS DESDE ANTES DEL CIERRE» YA ESTABA EN CADA FILA ═══
  //
  // El párrafo nombraba uno por uno a los que dejaron de cargar horas, y la columna A de cada uno
  // de ellos ya lo dice en su propio renglón: «GONZALEZ EMILIANO ▲ sin cargar desde el 03/09». Era
  // la misma información dos veces, y la segunda vez en 240 caracteres.
  //
  // Peor: se publicó DUPLICADA. Medido el 06/09 en el archivo vivo, las filas 48 y 49 tenían las dos
  // versiones —«1 sin horas» y «13 sin horas»—, la vieja sobreviviendo a la corrida que la reemplazó.
  // Una nota que cambia de largo es una fila que se corre, y `sinNotasRepetidas` no la reconoce
  // porque el texto no es idéntico. Sin la nota, el defecto no puede volver.
  //
  // El caso que hay que MIRAR —el que dejó de cargar horas y no tiene ni liquidación final ni baja
  // en ARCA— es un hallazgo, y va por consola.
  for (const pp of activos.filter((x) => quincena.porClave.get(x.clave)?.dejoDeCargar && !tieneLiquidacionFinal(x.nombre))) {
    console.warn(`  ⚠ ${pp.nombre}: sin horas desde el ${quincena.porClave.get(pp.clave).ultimoDiaSuyo}, `
      + 'sin liquidación final y sin baja en ARCA — sigue en el plantel')
  }
  // ═══ POR QUÉ ESTE TOTAL NO ES EL DE «JORNALES POR QUINCENA» ═══
  //
  // Aquella pestaña publica la quincena con las horas CARGADAS —es lo correcto para conciliar contra
  // la planilla— y ésta la publica COMPLETA, que es lo que se va a firmar el día de pago. Los dos
  // números son ciertos y miden cosas distintas; el que se calla es el que después no cierra.
  // ESTA NOTA COMPARABA DOS COSAS QUE YA NO SON COMPARABLES. Decía «Jornales por Quincena publica
  // 7.540.500 y acá se completan las horas que faltan», y desde que «TOTAL A PAGAR» de este cuadro
  // pasó a ser lo que SALE de la caja (banco + efectivo, neto de adelantos), su total es $6.331.859:
  // el lector veía dos cifras distintas presentadas como la misma. Se dice qué es cada una.
  // EL PUENTE CON «Jornales por Quincena» NO SE DIBUJA ACÁ. Este renglón explicaba por qué las dos
  // pestañas publican cifras distintas: aquélla el DEVENGADO de la quincena (horas cargadas) y ésta
  // lo que SALE de la caja (neto de adelantos y transferencias). Las dos son ciertas y cada una vive
  // en su pestaña; el que quiera el devengado lo lee donde se publica. Acá era una nota al pie.
  for (const n of sinConvenio) console.warn(`  ⚠ ${n}: sin equivalencia de convenio declarada — no se le mide el piso`)
  // Y LA OTRA MITAD DE LA MISMA PREGUNTA: los que SÍ tienen equivalencia, pero la puso el OS. Deja de
  // avisarse solo el día que el dueño las confirme — no hay nada que apagar a mano.
  //
  // NI EL PÁRRAFO NI LA MARCA EN LA CELDA. Hasta el 09/09 la categoría llevaba un «▲» pegado
  // («Medio Oficial ▲») para decir que la equivalencia la dedujo el OS. Ese glifo dentro del valor
  // de una celda que se lee, se ordena y se compara es lo que el dueño mandó sacar; y el aviso no se
  // pierde: sale entero acá, con el mapeo crudo y dónde se corrige — `CONVENIO_POR_CODIGO`
  // (lib/uocra-paritaria.mjs).
  const inferidas = lineaEquivalenciasInferidas(conInferencia)
  if (inferidas) console.warn(`  ⚠ ${inferidas}`)
  for (const x of seQuedaronCortas) console.warn(`  ⚠ ${x} — se corrige en la planilla, no acá`)
  // NADA DEBAJO DEL ÚLTIMO CUADRO. El `fila()` que iba acá dejaba un renglón suelto al final y, con
  // él, el colchón de filas en blanco que `auditar-pantalla` cuenta como «derrame a la vista».

  // ═══ «Plantel» SE RETIRÓ DEL ARCHIVO (09/09/2026, decisión del dueño: «sí, borrala») ═══
  //
  // Acá vivían los cuatro cuadros de respaldo que el 31/08 se habían mudado de «Nómina» a una pestaña
  // propia: quiénes son, lo devengado mes a mes, qué cuesta desvincular a cada uno y el índice de
  // legajos en Drive. Ninguno tenía consumidor —cero rangos con nombre, cero fórmulas de otras
  // pestañas apuntándole— y el generador la reescribía entera en cada corrida, así que era superficie
  // de escritura sobre el Sheet real sin nadie que leyera el resultado.
  //
  // Se retira el CÓDIGO acá y la PESTAÑA con `scripts/pestana-retirar.mjs Plantel --aplicar`, que
  // exporta el PDF de respaldo antes de borrarla. Lo que ese cuadro calculaba no se pierde: el costo
  // de desvincular sigue viviendo en `lib/desvinculacion-22250.mjs` y en `lib/desvinculacion-plantel.mjs`
  // —con sus tests—, y el devengado por persona, en `lib/nomina-devengado.mjs`. Lo que ya no existe es
  // la copia dibujada de esos números en una pestaña que nadie miraba.
  return { nomina: f }
}

/**
 * EL FORMATO, QUE ES LA MITAD DEL PEDIDO.
 *
 * Una tabla de cuarenta personas y catorce columnas de pesos SIN separador de miles no se lee: es
 * exactamente la queja que el dueño hizo sobre «Proveedores» el mismo día. Tres cosas y ninguna
 * decorativa: el patrón de miles en todo lo que es plata, ancho suficiente para que un apellido no
 * se corte, y negrita donde está el número que decide (encabezados, totales y títulos de sección).
 *
 * El patrón va en formato US (`#,##0`) aunque el archivo esté en es-AR: la API interpreta el patrón
 * en US y lo MUESTRA con la coma y el punto del locale. Escribirlo con el separador local lo rompe.
 */
/**
 * DOS NOTAS IDÉNTICAS SEGUIDAS NO SON DOS NOTAS: ES UN DEFECTO PUBLICADO.
 *
 * La corrida del 31/08 publicó tres pares exactos —el aviso de Castillo, el de la quincena que falta
 * en oficina y el de la equivalencia inferida— cada uno repetido en la fila de abajo. Da igual dónde
 * esté la causa: **una pestaña que dice dos veces lo mismo hace dudar del resto**, y el dueño la usa
 * para pagar.
 *
 * Sólo se colapsa el caso inequívoco: dos filas CONSECUTIVAS, con el mismo texto en la columna A y
 * el resto vacío. Una fila de datos nunca cumple eso —lleva importes— y dos personas homónimas
 * tampoco, porque tendrían plata al lado. Se informa cuántas se colapsaron: si el número no baja a
 * cero cuando alguien arregle la causa, es que la causa sigue ahí.
 */
export function sinNotasRepetidas(filas = []) {
  const soloA = (f) => String(f?.[0] ?? '').trim() && (f ?? []).slice(1).every((c) => !String(c ?? '').trim())
  const out = []
  let repetidas = 0
  for (const f of filas) {
    const previa = out[out.length - 1]
    if (previa && soloA(f) && soloA(previa) && String(f[0]).trim() === String(previa[0]).trim()) { repetidas++; continue }
    out.push(f)
  }
  if (repetidas) console.log(`  ⚠ ${repetidas} nota(s) repetida(s) colapsada(s) — hay un defecto en el armado, no sólo en la vista`)
  return out
}

async function formatear(google, hoja, filas) {
  // ═══ EL FORMATO SALE DE `estilo-pestana`, COMO EN TODO EL ARCHIVO ═══
  //
  // Esta pestaña era la ÚNICA del Sheet con su propio formateo escrito a mano: CAJA, Cheques,
  // Jornales, Estructura, OBRAS y Calendario pasan todas por `lib/estilo-pestana.mjs`. Por eso se
  // veía distinta por más que se le arreglaran los detalles — no era un problema de detalles, era
  // que no hablaba el mismo idioma. El dueño lo dijo así: «no coincide con el formato de todo el
  // sheet».
  //
  // Todo formato pasa por `E.conFuente`: si se define `textFormat` sin nombrar la tipografía, Sheets
  // la reemplaza por la de la hoja y la celda queda en otra fuente.
  const s = hoja.sheetId
  const n = filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId: s, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  // El rectángulo que hay que dejar limpio incluye las columnas que este generador escribió ANTES:
  // pintar sólo hasta ANCHO deja el formato de las seis que se retiraron el 09/09 vivo a la derecha.
  const rTodo = (r0, r1) => ({ sheetId: s, startRowIndex: r0, endRowIndex: r1, startColumnIndex: 0, endColumnIndex: ANCHO_HISTORICO })
  const req = [
    { unmergeCells: { range: rTodo(0, Math.max(n, 200)) } },
    E.reset(s, Math.max(n + 20, 200), ANCHO_HISTORICO),
    // SIN CUADRÍCULA y con el titular congelado: la jerarquía la hace la tipografía, no la reja.
    // SE CONGELA HASTA DEBAJO DEL TITULAR: las tres cifras que se deciden quedan siempre a la vista.
    { updateSheetProperties: { properties: { sheetId: s, gridProperties: { hideGridlines: true, frozenRowCount: DEBAJO_DEL_TITULAR - 1 } }, fields: 'gridProperties.hideGridlines,gridProperties.frozenRowCount' } },
    // ═══ UN SOLO ANCHO, Y LA COLUMNA DE TEXTO NO ES UNA COLUMNA DE NÚMEROS ═══
    //
    // A: 300 px para el nombre. B: la categoría es TEXTO y «Oficial Especializado» son 21 caracteres
    // — con el ancho de una columna numérica se cortaba, y el auditor de pantalla lo contaba como
    // `texto_cortado`. C en adelante: 100 px, el mismo para todas.
    { updateDimensionProperties: { range: { sheetId: s, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 300 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: s, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: E.ANCHO.texto }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: s, dimension: 'COLUMNS', startIndex: 2, endIndex: ANCHO }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
  ]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: E.conFuente(format) }, fields } })

  // ── EL CONTRATO DE COLUMNAS SE DECLARA, NO SE ADIVINA DEL RÓTULO ───────────────────────────────
  //
  // Antes la unidad de cada columna salía de una regex sobre el texto de su encabezado. Es la trampa
  // que `estilo-pestana` advierte en su propio comentario: «un formato que depende de cómo está
  // escrito un rótulo se rompe cada vez que se mejora la redacción, y en silencio». Ya había pasado
  // acá — «$/h» caía en la rama de CANTIDAD y la tarifa salía dibujada «5.974», sin el signo, al
  // lado de columnas de pesos.
  //
  // Con UN contrato de columnas para los tres cuadros la unidad se puede declarar de una vez.
  //
  // ═══ SIN CENTAVOS, POR PEDIDO DEL 09/09 ═══
  //
  // El patrón es `"$"#,##0`. Va escrito en formato US aunque el archivo sea es-AR: la API interpreta
  // el patrón en US y lo MUESTRA con el punto de miles local; escribirlo con el separador local lo
  // rompe.
  //
  // LÍMITE DECLARADO. El 31/08 el dueño había pedido lo contrario para esta pestaña: «cuidado con
  // redondear en la pestaña nomina, dejar los numeros de la manera correcta porque sino las
  // transferencias se hacen mal» — un recibo de $215.564,62 dibujado «$215.565» hace transferir 38
  // centavos de más. El VALOR de la celda sigue siendo exacto (se ve en la barra de fórmulas), pero
  // lo que se lee ya no. Las dos órdenes se contradicen y manda la última; si vuelve a aparecer una
  // transferencia con centavos de diferencia, la causa es ésta.
  const UNIDAD = COLUMNAS.map((rotulo) => (rotulo === 'Persona' || rotulo === 'Categoría'
    ? E.NUM.texto
    : rotulo === 'Horas' ? E.NUM.cantidad : E.NUM.moneda))
  fmt(rTodo(0, Math.max(n, 200)), 'userEnteredFormat.numberFormat,userEnteredFormat.wrapStrategy', { numberFormat: E.NUM.texto, wrapStrategy: 'CLIP' })
  // Cada tabla va de su encabezado («Persona») hasta su fila de total inclusive.
  for (let i = 0; i < n; i++) {
    if (String(filas[i]?.[0] ?? '') !== 'Persona') continue
    let fin = i + 1
    while (fin < n && !ES_TOTAL.test(String(filas[fin]?.[0] ?? ''))) fin++
    fin = Math.min(fin + 1, n)
    for (let c = 1; c < ANCHO; c++) {
      fmt(r(i + 1, fin, c, c + 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
        { numberFormat: UNIDAD[c], horizontalAlignment: UNIDAD[c] === E.NUM.texto ? 'LEFT' : 'RIGHT' })
    }
  }

  // ── LA JERARQUÍA, FILA POR FILA ────────────────────────────────────────────────────────────────
  const texto = (i) => String(filas[i]?.[0] ?? '')
  for (let i = 0; i < n; i++) {
    // EL TITULAR SE PINTA APARTE, ABAJO. Sus tres renglones empiezan con «⇒» —son totales de verdad,
    // la suma de las filas de total de los tres cuadros— y sin esta guarda caían en la rama de
    // `ES_TOTAL`, que los rulaba con línea superior y relleno como si fueran el cierre de una tabla.
    if (i < DEBAJO_DEL_TITULAR - 1) continue
    if (ES_SECCION_NUM.test(texto(i))) { fmt(r(i, i + 1), 'userEnteredFormat', E.bloque()); continue }
    if (texto(i) === 'Persona') {
      fmt(r(i, i + 1), 'userEnteredFormat', E.encabezado())
      // El encabezado envuelve, así que necesita alto propio: con los 20px de una fila normal se ve
      // la primera línea y el resto queda cortado abajo, sin que nada avise.
      req.push({ updateDimensionProperties: { range: { sheetId: s, dimension: 'ROWS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } })
      continue
    }
    if (ES_TOTAL.test(texto(i))) {
      // Hasta la columna del último importe: pintado hasta el final, `E.total()` dibujaba las HORAS
      // como pesos —«$1.408»— porque trae su propio formato de moneda.
      fmt(r(i, i + 1, 0, COLUMNAS.indexOf('Horas')), 'userEnteredFormat', E.total())
      // El total se rula con una línea fina arriba, no con relleno: es la diferencia entre una
      // planilla y un estado financiero.
      req.push({ updateBorders: { range: r(i, i + 1), top: { style: 'SOLID', color: E.COLOR.hairline ?? { red: 0.8, green: 0.84, blue: 0.86 } } } })
      continue
    }
    if (ES_SUBITEM.test(texto(i))) fmt(r(i, i + 1), 'userEnteredFormat', E.nota())
  }

  // ── EL TÍTULO Y EL TITULAR ─────────────────────────────────────────────────────────────────────
  //
  // Tres renglones «⇒ rótulo | cifra», la misma forma con la que cierra cada cuadro: el rótulo a la
  // izquierda en negrita, la cifra al lado, grande. Es lo que hace que las tres se lean de un
  // vistazo en vez de una a una, y que se pueda verificar que las dos primeras dan la tercera.
  fmt(r(0, 1), 'userEnteredFormat', E.titulo())
  fmt(r(1, 2), 'userEnteredFormat', { numberFormat: E.NUM.texto, textFormat: { fontSize: E.TAM.nota, foregroundColor: E.COLOR.bloqueTexto }, horizontalAlignment: 'LEFT', wrapStrategy: 'CLIP' })
  const f0 = 3                                   // la primera fila del titular, 0-based
  fmt(r(f0, DEBAJO_DEL_TITULAR - 1, 0, 1), 'userEnteredFormat',
    { numberFormat: E.NUM.texto, textFormat: { bold: true, fontSize: E.TAM.bloque, foregroundColor: E.COLOR.titulo }, horizontalAlignment: 'LEFT', wrapStrategy: 'CLIP' })
  fmt(r(f0, DEBAJO_DEL_TITULAR - 1, 1, 2), 'userEnteredFormat',
    { numberFormat: E.NUM.moneda, textFormat: { bold: true, fontSize: E.TAM.titulo, foregroundColor: E.COLOR.titulo }, horizontalAlignment: 'LEFT' })
  req.push({ updateDimensionProperties: { range: { sheetId: s, dimension: 'ROWS', startIndex: f0, endIndex: DEBAJO_DEL_TITULAR - 1 }, properties: { pixelSize: 26 }, fields: 'pixelSize' } })
  await google.spreadsheetBatchUpdate(ID, req)
  console.log(`  formato: ${req.length} reglas`)
}

/**
 * PUBLICA UNA PESTAÑA GENERADA ENTERA: la borra, la vuelve a crear y la escribe.
 *
 * Era el cuerpo final de `main` y hablaba de `PESTANA` y de `filas` por nombre. Desde que la
 * Nómina se partió en dos —la instrucción de pago acá, los cuadros de respaldo en «Plantel»— hay
 * dos pestañas que se publican igual, y una segunda copia de estas ochenta líneas es la forma más
 * segura de que dentro de un mes una tenga una guarda que la otra no.
 */
async function publicar(google, PESTANA, filas) {
  // ═══ EL TÍTULO SE COMPARA EXACTO, NUNCA POR PREFIJO ═══
  //
  // `hallarPestana` prueba exacto y DESPUÉS por prefijo: si no existiera una pestaña llamada
  // exactamente «Nómina» pero sí una sola que empiece así —«Nómina 2026», «Nómina (copia)»— la
  // devolvería, y acá abajo hay un `deleteSheet`. El dueño ya movió esta pestaña a mano; duplicarla
  // o renombrarla es el gesto siguiente, y con el prefijo eso terminaba en un borrado.
  const buscar = async () => (await google.getSheetMeta(ID)).find((h) => h.title === PESTANA) ?? null
  let hoja = await buscar()

  // ═══ DÓNDE VA LA PESTAÑA LO DECIDE EL DUEÑO, NO EL GENERADOR ═══
  //
  // Rehacerla la mandaba al final del archivo en cada corrida. Él la había movido a mano y se lo
  // volví a pisar tres veces; textual: *«respetá la ubicación q YO le asigno […] si yo hago algo,
  // después no se toca»*. `getSheetMeta` no devuelve el índice, así que se pide aparte y se repone
  // al crearla. Es el mismo criterio que gobierna el contenido de las celdas, aplicado al orden de
  // las solapas — que también es algo que él acomodó.
  // ═══ SI NO SÉ DÓNDE ESTABA, NO LA MANDO AL FINAL ═══
  //
  // Preservar la posición sólo sirve si se pudo leer. Cuando la lectura falla —o cuando la pestaña
  // todavía no existe— `indicePrevio` quedaba en `null` y el `addSheet` la creaba al final del
  // archivo. Peor: la corrida SIGUIENTE leía esa posición del final y la «preservaba», así que un
  // fallo momentáneo se volvía permanente. Fue exactamente lo que le pasó a la Nómina: del lugar 2,
  // pegada a «Jornales por Quincena», al 37, y ninguna corrida posterior la trajo de vuelta.
  //
  // El dueño ya lo había marcado una vez, textual: *«respetá la ubicación q YO le asigno […] si yo
  // hago algo, después no se toca»*. Así que ahora hay un lugar declarado al que volver, y el
  // `null` deja de significar «al final».
  const LUGAR = { 'Nómina': 2, Plantel: 3 }
  let indicePrevio = LUGAR[PESTANA] ?? null
  if (hoja) {
    try {
      const meta = await google.apiGetSheets(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(ID)}?fields=sheets.properties(sheetId,index,title)`)
      const leido = (meta.sheets ?? []).find((x) => x.properties?.sheetId === hoja.sheetId)?.properties?.index
      if (Number.isInteger(leido)) indicePrevio = leido
      console.log(`  posición actual de ${PESTANA}: ${leido ?? 'no la pude leer'} → repongo en ${indicePrevio}`)
    } catch { /* queda el lugar declarado */ }
  }

  // ═══ YA NO SE BORRA LA PESTAÑA. EL DUEÑO ESCRIBE ACÁ (31/08/2026) ═══
  //
  // Hasta hoy este bloque hacía `deleteSheet` + `addSheet` en cada corrida, con este argumento
  // escrito al lado: *«esta pestaña la crea y la rehace ESTE script, entera, y nadie más escribió
  // nunca una celda suya»*, y con esta condición: *«el día que el dueño anote algo acá, esta
  // decisión hay que revisarla»*.
  //
  // Ese día llegó, y con la peor evidencia posible: **«no estas respetando mis ediciones en las
  // pestañas seguis borrando lo q yo hago en sheet flujo de fondos»**. La pestaña se corrió ocho
  // veces el 31/08 y cada corrida se llevó puesto lo que él hubiera anotado, sin dejar rastro —
  // borrar la hoja no deja ni la huella que deja pisar una celda.
  //
  // ═══ LO QUE REEMPLAZA AL BORRADO ═══
  //
  // El borrado existía por una razón real: la regla NO-BORRAR impide vaciar una celda con contenido,
  // así que una corrida más corta que la anterior dejaba la cola de la vieja viva abajo. La solución
  // no es borrar la hoja: es el CENTINELA de `cola-de-rango`, que marca las celdas sobrantes como
  // propias y las vacía por `vaciarPropio` — el mismo mecanismo que usan todas las demás pestañas
  // del archivo, incluida SUBCONTRATISTAS.
  //
  // La diferencia práctica: si él escribe algo en una celda que el generador no escribe, ahora se
  // conserva y la corrida lo informa. Si escribe encima de una celda que el generador SÍ escribe,
  // gana el generador — eso no cambió y es correcto, porque esa celda es una cuenta.
  if (!hoja) {
    const creada = await google.spreadsheetBatchUpdate(ID, [{
      addSheet: {
        properties: {
          title: PESTANA,
          ...(indicePrevio == null ? {} : { index: indicePrevio }),
          gridProperties: { rowCount: filas.length + 40, columnCount: ANCHO, frozenRowCount: 3 },
        },
      },
    }])
    hoja = await buscar()
    if (creada?.protegido || !hoja) {
      console.error(`no pude crear ${PESTANA} (${creada?.motivo ?? 'no aparece en el archivo'}): NO sigo.`)
      process.exit(1)
    }
    console.log(`  ✚ creé la pestaña ${PESTANA}`)
  }

  // La cola de la corrida anterior se limpia con el centinela, no borrando la hoja. `alto` es lo que
  // este generador escribió alguna vez: se declara con margen para que una corrida corta limpie lo
  // que dejó una larga, y `conColaLimpiable` aborta si la grilla crece más que eso en vez de dejar
  // cola publicada en silencio.
  // ═══ EL CENTINELA SÓLO PUEDE ALCANZAR LO QUE ESTE GENERADOR ESCRIBE (31/08, segunda vuelta) ═══
  //
  // Saqué el `deleteSheet` y el dueño volvió a decir «te dije q no borraras mi ediciones». Tenía
  // razón de nuevo: había puesto la cola en 160 filas × 17 columnas, o sea que el centinela
  // declaraba suyas 2.720 celdas y vaciaba TODAS las que el generador no escribe. Es el mismo
  // borrado con otra puerta — y peor, porque parece cuidadoso.
  //
  // La cola existe para limpiar lo que dejó una corrida MÁS LARGA de este mismo script, y eso vive
  // en las columnas que él escribe y en las filas que ya no llena. Fuera de ese rectángulo no hay
  // cola posible: hay, si acaso, algo que escribió una persona.
  const anchoPropio = Math.max(...filas.map((f) => f.filter((c) => String(c ?? '').trim()).length), 1)
  // ═══ UNA CELDA VACÍA NO BORRA: HAY QUE PEDIR QUE SE BORRE ═══
  //
  // `fila()` rellena cada renglón hasta ANCHO con cadena vacía, y la guarda NO-BORRAR conserva el
  // destino cuando la fuente trae `''` — hace bien, es lo que impide que un generador roto vacíe una
  // pestaña. El efecto secundario acá era feo: cuando una nota desaparecía, las de abajo se corrían
  // y la vieja quedaba viva en su fila, publicada dos veces. Se vio con «1 sin recibo confirmado» y
  // con «INCOMPLETO: el mes son DOS quincenas», los dos duplicados exactos.
  //
  // El centinela SÍ borra, y decir «esta celda es mía y va vacía» es justamente lo que hay que
  // decir. Se aplica sólo a los rellenos de la cola —no a un `''` que alguna fila use como dato—
  // porque se reemplaza a partir del último contenido real de cada renglón.
  const conCentinela = filas.map((f) => {
    let fin = f.length
    while (fin > 0 && !String(f[fin - 1] ?? '').trim()) fin--
    return [...f.slice(0, fin), ...Array(Math.max(0, f.length - fin)).fill(VACIO)]
  })
  const conCola = conColaLimpiable(sinNotasRepetidas(conCentinela), { ancho: anchoPropio, alto: ALTO_HISTORICO, quien: PESTANA })
  // ═══ EL CONTRATO, DICHO EN UNA LÍNEA: ESTE GENERADOR ES DUEÑO DE SU RECTÁNGULO ═══
  //
  // `respetar: true` conserva TODO texto del destino, y en esta pestaña casi todo es texto: las
  // notas al pie de la corrida anterior sobrevivían a la siguiente y, cuando una nota desaparecía,
  // las de abajo se corrían y quedaban DUPLICADAS. Se vio: tres pares idénticos en las filas 32-33,
  // 40-41 y 51-52.
  //
  // Así que dentro de su rectángulo —las columnas que escribe, hasta ALTO_HISTORICO— manda el
  // generador. Fuera de ahí no toca nada: lo que el dueño escriba a la derecha de la última columna
  // o más abajo se conserva, que antes ni siquiera era cierto porque la pestaña se borraba entera.
  // SIN `respetar: false`: la Regla 0 es el default y acá tiene que estar encendida. Ver arriba.
  const escritura = await escribirPreservando(google, ID, `'${PESTANA}'`, conCola, { anchoHoja: anchoPropio })
  // ═══ UNA ESCRITURA QUE NO OCURRIÓ NO PUEDE ANUNCIARSE COMO HECHA ═══
  //
  // `escribirPreservando` puede volver SIN HABER ESCRITO —pestaña bajo candado, editada por una
  // persona, o firma no verificable— y devuelve la razón en su resultado. Este script no la miraba:
  // seguía de largo, formateaba y después releía la pestaña, que obviamente tenía contenido, y
  // publicaba «✓ releído del archivo, 53 filas». Verde sobre una corrida que no tocó nada.
  //
  // Es exactamente el defecto que el OS persigue: un control validado contra la misma información
  // que produce. Releer que hay 53 filas no prueba que las haya escrito esta corrida.
  if (escritura?.bloqueada || escritura?.editadaPorHumano || escritura?.noVerificable) {
    console.error(`✋ ${PESTANA}: NO se escribió — `
      + `${escritura.bloqueada ? 'la pestaña está bajo candado' : ''}`
      + `${escritura.editadaPorHumano ? 'la editaste vos y el generador no pisa tus ediciones' : ''}`
      + `${escritura.noVerificable ? 'no pude verificar la firma de la pestaña' : ''}.`)
    process.exit(1)
  }
  if (escritura?.conservadas?.length) {
    console.log(`  ✋ ${escritura.conservadas.length} celda(s) tuyas conservadas:`)
    for (const c of escritura.conservadas.slice(0, 8)) console.log(`     fila ${c.fila}, col ${c.col}: ${String(c.valor).slice(0, 60)}`)
  }
  if (escritura?.respetadas?.length) console.log(`  ✋ ${escritura.respetadas.length} texto(s) tuyos respetados`)
  // ═══ SI LA ESCRITURA NO PASÓ, NO SE FORMATEA ═══
  //
  // El desastre de CAJA fue exactamente esto: la guarda frenó los VALORES y el generador siguió
  // aplicando su formato encima, así que la pestaña quedó con los datos viejos vestidos de nuevos —
  // que es peor que no haber corrido, porque parece que corrió.
  const salteada = Boolean(escritura?.protegido)
  if (salteada) console.error(`la escritura quedó frenada (${escritura.motivo ?? 'sin motivo'}): NO formateo.`)
  if (!salteada) await formatear(google, hoja, filas)
  if (salteada) process.exit(1)

  // RELEER EL DESTINO: lo que prueba una escritura es el dato leído en su destino.
  const releido = await google.readSheetValues(ID, `${PESTANA}!A1:A${filas.length}`)
  console.log(`✓ ${PESTANA}: releído del archivo, ${(releido ?? []).filter((r) => String(r?.[0] ?? '').trim()).length} filas con contenido`)
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hoy = new Date()
  // ═══ LA MISMA PLANILLA, LEÍDA DE LAS DOS FORMAS, Y CADA UNA PARA LO SUYO ═══
  //
  // Con FORMATTED_VALUE la fecha de ingreso llega como «26/05/2025» —que es lo que el lector del
  // plantel sabe parsear— y los importes llegan como «$ 431.200», que no son un número. Con
  // UNFORMATTED_VALUE pasa exactamente lo contrario. Pedir las dos cuesta una llamada más y evita la
  // clase entera de defectos: la primera versión leyó todo sin formato y dejó la columna Ingreso en
  // «—» para las diecinueve personas, sin un solo error a la vista.
  const [obreros, obrerosNum, oficina, oficinaNum, uocra] = await Promise.all([
    google.readSheetValues(ID, '_J_OBREROS!A1:AC990'),
    google.readSheetValues(ID, '_J_OBREROS!A1:AC990', { render: 'UNFORMATTED_VALUE' }),
    google.readSheetValues(ID, '_J_OFICINA!A1:AA990'),
    // La MISMA planilla sin formato: las columnas de canal de oficina son plata y con
    // FORMATTED_VALUE llegan como «$398.200», que no es un número.
    google.readSheetValues(ID, '_J_OFICINA!A1:AA990', { render: 'UNFORMATTED_VALUE' }),
    google.readSheetValues(ID, '_UOCRA_RAW!A1:J400', { render: 'UNFORMATTED_VALUE' }),
  ])
  const a = personasDe(obreros, 'Obra', COL_OBRA)
  const b = personasDe(oficina, 'Oficina', COL_OFICINA)
  // SÓLO EL PLANTEL DE HOY. El dueño: *"los inactivos quitar"*. La historia de los que se fueron no
  // desaparece —vive en la planilla de jornales, que es la fuente— pero no ensucia la decisión de
  // cuánto hay que pagar esta quincena.
  const quincena = quincenaEnCurso(obrerosNum ?? [], a.bloques, claveNombre, { hoy })
  // Los recibos se leen ACÁ porque el orden alfabético
  // del plantel depende del nombre canónico, que sale de ellos.
  const quincenaDelMes = (quincena.desde && Number(String(quincena.desde).split('/')[0]) > 15) ? 'Q2' : 'Q1'
  const periodoRecibo = `${quincenaDelMes}-${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`
  const recibosPorCuil = await recibosDelPeriodo(periodoRecibo)
  // OFICINA COBRA MENSUAL: su banco es la suma de las quincenas del MES, no la del período en curso.
  const recibosDelMes = await recibosDelMesEntero(hoy)
  const finales = await recibosDelPeriodo('FINAL')
  const { porCuil: adelantosPorCuil } = await adelantosPagados('QUINCENA')
  const adelantosDeFinal = await adelantosPagados('LIQUIDACION_FINAL')
  console.log(`recibos del período ${periodoRecibo}: ${recibosPorCuil.size} · liquidaciones finales: ${finales.size}`)

  // ═══ EL ORDEN ES POR EL NOMBRE CANÓNICO, NO POR EL DE LA PLANILLA ═══
  //
  // Ordenar por `p.nombre` ordena por lo que quedó adelante en cada renglón de la planilla, y ahí
  // conviven «Aguero Cristian» con «Emanuel Alaniz»: la lista sale alfabética por apellido para unos
  // y por nombre de pila para otros, que es justo lo que el dueño pidió corregir. Se ordena por el
  // nombre del recibo —APELLIDO primero, siempre— y quien no tenga recibo cae a su nombre de
  // planilla, que sigue siendo mejor que un orden inventado.
  const activos = [...a.personas, ...b.personas].filter((p) => p.activo)
  const claveDeOrden = (x) => {
    const c = CUIL_POR_PERSONA_DE_PLANILLA[x.nombre]
    return comoSeEscribe((c ? recibosPorCuil.get(c)?.nombre_recibo : null) ?? x.nombre)
  }
  activos.sort((x, y) => claveDeOrden(x).localeCompare(claveDeOrden(y), 'es'))

  // LA ESCALA DEL CONVENIO, del período de la quincena. Si no hay escalón para ese mes NO se estira
  // el anterior: la columna del piso queda vacía y la pestaña lo dice.
  const { escalones } = parsearAcuerdos(uocra ?? [])
  const periodo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const esc = escalonDe(escalones, periodo)
  const escala = {
    rotulo: esc ? `${esc.rotulo} (${esc.periodo})` : null,
    porCategoria: Object.fromEntries(Object.entries(esc?.categorias ?? {}).map(([k, v]) => [k, v.zonaA ?? v.basico])),
  }

  console.log(`activos: ${activos.length} · quincena ${quincena.desde ?? '—'} a ${quincena.hasta ?? '—'} con ${quincena.porClave.size} persona(s) · escala ${escala.rotulo ?? 'SIN ESCALA'}`)
  if (!activos.length) { console.error('no leí ninguna persona activa: NO escribo'); process.exit(1) }
  if (!esc) console.warn('  ⚠ sin escalón de convenio para el período: el cuadro del piso sale vacío')

  // LA COLUMNA BANCO DEL CUADRO 1. Sale del recibo que emitió el estudio, no del 50% calculado.
  // El período se arma del mes de la quincena: la segunda mitad del mes es Q2.
  // LO QUE LA PLANILLA NO TRAE Y LA BASE SÍ: la fecha de ingreso y el convenio declarado.
  const fichas = await fichasDeLaBase()
  const nombresFicha = fichas.map((f) => f.nombre_completo)
  for (const p of activos) {
    const m = carpetaDe(p.nombre, nombresFicha)
    const f = m.seguro ? fichas.find((x) => x.nombre_completo === m.carpeta) : null
    p.convenio = f?.convenio_colectivo ?? null
    p.fichaDe = f?.nombre_completo ?? null
    if (!p.ingreso && f?.fecha_ingreso) {
      p.ingreso = new Date(f.fecha_ingreso)
      p.ingresoDeLaBase = true
    }
  }
  const filas = grilla(activos, { hoy, quincena, escala, recibosPorCuil, finales, adelantosPorCuil, adelantosDeFinal, periodoRecibo, recibosDelMes, oficinaEspejo: oficinaDelEspejo(oficinaNum ?? []) })
  console.log(`${PESTANA}: ${filas.nomina.length} filas × ${ANCHO} columnas`)
  for (const x of filas.nomina.slice(5, 12)) console.log('  ', x.filter((c) => c !== '').map((c) => String(c).slice(0, 16)).join(' | '))
  if (!APLICAR) return console.log('\n(sin --aplicar: no escribí nada)')

  const malas = filas.nomina.map((x, i) => (x.length > ANCHO ? i + 1 : 0)).filter(Boolean)
  if (malas.length) throw new Error(`${PESTANA}: ${malas.length} fila(s) más anchas que ${ANCHO}: ${malas.slice(0, 5).join(', ')}. NO escribo.`)

  await publicar(google, PESTANA, filas.nomina)

}

main().then(() => closePool()).catch(async (e) => { console.error(String(e?.message ?? e)); await closePool().catch(() => {}); process.exit(1) })
