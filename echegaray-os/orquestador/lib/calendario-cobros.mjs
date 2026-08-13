// `Calendario de Cobros` — CUÁNDO ENTRA CADA PESO. LA GRILLA.
//
// ═══ QUÉ PROBLEMA RESUELVE (13/08/2026) ═══
//
// El dueño, textual: *"la pestaña 'obras' no veo q este reflejando exactamente el tema pestaña de
// 'cobranzas' es confuso si quiero armar un calendario de avance de cobros con los clientes"*.
//
// Son dos cosas y ésta es la segunda. OBRAS es un cuadro de ESTADO: una fila por obra, y las columnas
// son magnitudes acumuladas (venta, cobrado, resta, vencido). Contesta *"¿cómo viene cada obra?"*. No
// contesta —ni puede— *"¿cuándo entra la plata?"*, porque no tiene eje de tiempo. Los $357.487.078
// que OBRAS publica como "Resta" son un solo número: no dice si entran en agosto o en diciembre.
//
// ═══ POR QUÉ UNA PESTAÑA PROPIA Y NO UN BLOQUE MÁS EN OBRAS ═══
//
// Tres razones, en orden de peso:
//
//  1 · SON DOS GRAMÁTICAS DE COLUMNA INCOMPATIBLES. En OBRAS la columna C es "Venta"; acá la C es un
//      mes. Apilar los dos cuadros en una grilla obliga a que cada encabezado signifique algo
//      distinto según en qué fila estés — que es literalmente lo que el dueño llamó "confuso". La
//      pestaña ya arrastra ese problema con la H (Retenido arriba, Próx. cobro abajo).
//  2 · NO ENTRA. OBRAS mide 9 columnas (300 + 138×8 ≈ 1.400px). Cinco meses más la llevan a 14 y
//      empujan los importes fuera de pantalla — que es exactamente por lo que el dueño mandó sacar la
//      columna de glosa y la de margen.
//  3 · EL CALENDARIO TIENE FILAS QUE OBRAS NO TIENE, Y ES EL PUNTO. $54.585.997 de cobranzas
//      pendientes no pertenecen a ninguna de las 7 obras declaradas (trabajos sueltos de ARCOR, el
//      Faltante del Galpón 9 de LA ESTRELLA, cinco trabajos de MESSINA). Dentro de la Sección 2 de
//      OBRAS habría que inventarles una fila o dejarlos afuera, y dejarlos afuera es el defecto de
//      origen. Acá entran con su nombre, porque el eje es el cliente y no la obra.
//
// ═══ EL GRANO ES MENSUAL, Y NO ES UNA PREFERENCIA ═══
//
// Se miró cómo están cargadas las fechas ANTES de decidir: las 44 filas pendientes de Cobranzas
// tienen fecha de cobro al día, ninguna vacía, entre el 14/08/2026 y el 30/12/2026 — cinco meses.
// Semanal daría 20 columnas para 44 hitos (una matriz casi toda vacía, y la fila del cliente sin
// nada que sumar); mensual da 5 columnas y ninguna queda hueca. Y es el horizonte de los dos Cash
// Flow, así que las dos caras del archivo hablan del mismo período.
//
// ═══ QUÉ DECIDE CADA NÚMERO, Y DE DÓNDE SALE ═══
//
// LA FILA DEL CLIENTE SALE DE LA FUENTE, CON RANGO ABIERTO. No suma sus propios detalles: es un
// SUMIFS sobre Cobranzas entera. Es la regla del repo —*el número que decide sale de la fuente*— y
// acá tiene una consecuencia concreta: una cobranza que se cargue mañana en Cobranzas entra sola en
// el total del cliente y del mes, aunque el generador no haya vuelto a correr.
//
// LAS FILAS DE DETALLE SON LA EXPLICACIÓN, y están ancladas a SU fila de Cobranzas (`'Cobranzas'!M71`
// y no un SUMIFS): son el hito con nombre y fecha, que es lo que se lleva a la reunión con el
// cliente. Por eso el escritor controla que los detalles sumen lo mismo que la fila del cliente: si
// no cierran, hay una cobranza que el calendario no está listando.
//
// LO QUE NO SE DUPLICA: Cobranzas ya es el libro de hitos. Lo que acá se agrega y allá no existe es
// el EJE DE TIEMPO — el hito puesto en su mes, y el cliente sumado por mes.
//
// ═══ REAL Y PROYECTADO SE DISTINGUEN POR FORMA, NO POR UNA NOTA ═══
//
// Reclamo recurrente del dueño, ya resuelto en "Jornales por Quincena": lo pagado en negrita con
// tinta plena, lo proyectado en itálica apagada. Acá la división es por COLUMNA y es limpia: `Cobrado`
// y `↳ endosado` son plata que YA entró (real); `Vencido`, los meses y `Por cobrar` son proyección.
// La regla vive en `columnasReales`/`columnasProyectadas` y la piel la consume — no se decide dos
// veces. Es el mismo mecanismo que ya usan los Cash Flow (`columnasProyectadas` de cash-flow-piel).
//
// ═══ EL ENDOSO SE DECLARA CON UN NÚMERO, NO CON UNA ACLARACIÓN ═══
//
// OBRAS!D14 publica $474,4M de cobrado 2026 y los "Ingresos reales" de los Cash Flow dicen $454,6M.
// Las dos tienen razón y miden preguntas distintas: hay dos echeqs de LA ESTRELLA por $10.000.000
// cada uno (Cobranzas filas 43 y 48, nota "Endosado a Alumetal 10/7") que el cliente pagó y que nunca
// pasaron por la cuenta. El cliente canceló su deuda (lo ve OBRAS) y al banco no entró un peso (lo ve
// el Cash Flow). Ninguna pestaña lo declaraba, así que la diferencia parecía un error.
//
// La columna `↳ endosado` es esa declaración, y es una COLUMNA y no una nota al pie por dos motivos:
// se puede sumar, y sale de una fórmula viva sobre la nota de Cobranzas — el día que se endose otro
// cheque aparece solo, sin que nadie tenga que acordarse de actualizar un texto.
//
// ⚠ NO SE RESTA DE `Cobrado`: está DENTRO. `Cobrado` es lo que el cliente pagó; `↳ endosado` dice qué
// parte de eso no tocó el banco. Restarlo cambiaría el significado de la primera columna y rompería
// el cuadre contra OBRAS!D14.

import { VACIO } from './preservar-anotaciones.mjs'
import { conColaLimpiable as colaDeclarada } from './cola-de-rango.mjs'
import { sumaConUSD } from './cobranzas-contrato.mjs'
import { RANGO_TC } from './caja-disponibilidades.mjs'
import { ANO, serialISO, variantesDe, criterioCliente, REFS_OBRAS } from './obras-grilla.mjs'

export const PESTANA_CALENDARIO = 'Calendario de Cobros'

/**
 * LAS COLUMNAS DE COBRANZAS QUE ESTE CUADRO CITA.
 *
 * Son las de `REFS_OBRAS.cob` más `notas` (col W), que OBRAS no usa y acá es la que identifica un
 * cheque endosado. SE DECLARA UN MAPA PROPIO Y NO SE LE AGREGA LA COLUMNA A `REFS_OBRAS`: el escritor
 * de OBRAS resuelve por rótulo y ROMPE si un rótulo no está, así que meterle una columna que no
 * necesita sería darle un motivo más para no publicar. Son los DEFECTOS para construir en frío; el
 * escritor los resuelve contra el encabezado vivo.
 */
export const REFS_CALENDARIO = Object.freeze({ ...REFS_OBRAS.cob, notas: 'W' })

/** Los estados de Cobranzas que este cuadro NO proyecta: lo ya entrado y lo que dejó de existir. */
export const COBRADO = 'Cobrado'
export const NO_VENTA = 'CANCELAR'

/** El estado normal de una cobranza pendiente. Los otros ("Proyectado", "Facturado") se publican en
 *  el rótulo del hito porque dicen algo distinto: cuán firme es ese cobro. */
export const ESTADO_NORMAL = 'Pendiente'

/** Las cuatro columnas fijas, antes de los meses. La quinta zona son los meses y la última el total. */
export const COLS_FIJAS = ['Cliente / cobro', 'Cobrado', '↳ endosado', '⚠ Vencido']

/**
 * EL ANCHO MÁS GRANDE QUE ESTA PESTAÑA PUEDE TENER: 4 fijas + 12 meses + el total.
 *
 * No es el ancho de hoy (10): es el techo. La ventana de meses arranca en el mes en curso, así que en
 * enero la pestaña tiene 17 columnas y en diciembre 6 — y cada vez que se angosta hay que BORRAR lo
 * que quedó a la derecha. Sacar una columna del código no la saca de la pestaña: OBRAS publicó 40
 * celdas de una columna que ya no existía por no declarar esto.
 */
export const ANCHO_HISTORICO = 17

/** El alto más grande que tuvo la grilla. Mismo razonamiento, en el otro eje: `conColaLimpiable`
 *  ROMPE si se supera, que es la única forma de que la constante siga significando algo. */
export const ALTO_HISTORICO = 90

export function conColaLimpiable(filas = [], hasta = ANCHO_HISTORICO, alto = ALTO_HISTORICO) {
  return colaDeclarada(filas, { ancho: hasta, alto, quien: 'calendario-cobros' })
}

/** Los meses en es-AR, para el encabezado. Se escriben: `TEXT` con un patrón de mes daría el idioma
 *  de la hoja y el rótulo de una columna no puede depender de una configuración que no controlamos. */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** El último día de un mes (1-based), sin depender de la zona horaria del proceso. */
const ultimoDia = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate()
const iso = (ano, mes, dia) => `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

/**
 * LA VENTANA DE MESES: del mes en curso a diciembre del año declarado.
 *
 * POR QUÉ NO LOS 12 MESES SIEMPRE: siete columnas de meses ya pasados, todas vacías, es lo contrario
 * del minimalismo que el dueño pidió. POR QUÉ NO "desde el primer cobro pendiente": la ventana pasaría
 * a depender del dato y se movería sola cada vez que se cobra algo, así que el ancho de la pestaña
 * cambiaría sin que nadie decida nada.
 *
 * LO QUE CAE ANTES DE ESTA VENTANA NO DESAPARECE: va a la columna `⚠ Vencido`. Ese es justamente el
 * motivo por el que esa columna existe (ver `columnaVencido`).
 *
 * @param {string} hoyISO la fecha de corrida, inyectable para poder probar el borde del año.
 * @returns {{ano:number, mes:number, rotulo:string, desde:number, hasta:number}[]}
 */
export function ventanaDeMeses(hoyISO, ano = ANO) {
  const [y, m] = String(hoyISO).split('-').map(Number)
  // Si la corrida es de un año posterior al declarado, no hay ventana: el escritor lo trata como
  // error en vez de publicar un calendario del pasado con cara de vigente.
  const desdeMes = y > ano ? 13 : (y < ano ? 1 : m)
  const meses = []
  for (let mm = desdeMes; mm <= 12; mm++) {
    meses.push({
      ano, mes: mm, rotulo: `${MESES[mm - 1]}-${String(ano).slice(2)}`,
      desde: serialISO(iso(ano, mm, 1)), hasta: serialISO(iso(ano, mm, ultimoDia(ano, mm))),
    })
  }
  return meses
}

/** El serial del primer día de la ventana: todo lo pendiente anterior es lo VENCIDO. */
export const inicioDeVentana = (meses) => (meses.length ? meses[0].desde : serialISO(iso(ANO, 12, 31)) + 1)

/** Un rango abierto de Cobranzas. Rompe si la columna no está resuelta — mismo criterio que
 *  `obras-grilla`: una referencia rota se interpola como `$undefined$` y publica #ERROR!. */
const abierto = (c, campo) => {
  const col = c?.[campo]
  if (!col || !c?.hoja || !c?.desde) {
    throw new Error(`calendario-cobros: la columna "${campo}" de ${c?.hoja ?? '(hoja sin nombre)'} no está resuelta`
      + ' — el escritor tiene que buscarla por su rótulo. NO se construye la grilla con una referencia rota.')
  }
  return `'${c.hoja}'!$${col}$${c.desde}:$${col}`
}

/** Una celda concreta de Cobranzas: `'Cobranzas'!M71`. Sin `$`: si el dueño inserta una fila arriba,
 *  Sheets corre la referencia sola y el hito sigue apuntando a su propio renglón. */
const celdaDe = (c, campo, fila) => `'${c.hoja}'!${c[campo]}${fila}`

const quote = (t) => `"${String(t).replace(/"/g, '')}"`

/** Una suma sobre Cobranzas para un cliente y sus alias, con los dólares valuados. */
function porCliente(cob, cliente, criterios) {
  return variantesDe(cliente)
    .map((v) => sumaConUSD({
      rango: abierto(cob, 'total'),
      criterios: `${abierto(cob, 'cliente')};${quote(criterioCliente(v))}${criterios}`,
      moneda: abierto(cob, 'moneda'), tc: RANGO_TC,
    }))
    .join('+')
}

/** La misma suma sin filtrar por cliente: la usa la fila de cierre. Si un cliente quedara fuera de la
 *  lista derivada, su plata TIENE que seguir estando en el total — es como se detecta que falta. */
const deTodo = (cob, criterios) => sumaConUSD({
  rango: abierto(cob, 'total'), criterios: criterios.replace(/^;/, ''),
  moneda: abierto(cob, 'moneda'), tc: RANGO_TC,
})

/** Lo pendiente: ni cobrado ni cancelado. Sale del ESTADO y no de una columna de saldo — la col M de
 *  Cobranzas es el importe que el cliente transfiere, no lo que queda por cobrar. */
const PENDIENTE = (cob) => `;${abierto(cob, 'estado')};"<>${COBRADO}";${abierto(cob, 'estado')};"<>${NO_VENTA}"`

/** Criterio de un mes: la fecha de cobro dentro del mes. */
const enMes = (cob, m) => `${PENDIENTE(cob)};${abierto(cob, 'fechaCobro')};">="&${m.desde};${abierto(cob, 'fechaCobro')};"<="&${m.hasta}`

/**
 * LO VENCIDO: pendiente con fecha de cobro ANTERIOR a la ventana.
 *
 * ES LA COLUMNA QUE IMPIDE QUE UN COBRO ATRASADO DESAPAREZCA. Sin ella, un cobro que venció en julio
 * quedaría fuera de todas las columnas de mes y el calendario publicaría un total menor que la Resta
 * de OBRAS — plata perdida sin un solo error a la vista. Hoy da cero en las nueve filas (verificado:
 * ninguna de las 44 pendientes tiene fecha anterior a hoy) y aun así se queda: es un control, y un
 * control no se borra porque hoy dé bien.
 *
 * EL `>0` NO ES DECORATIVO: una celda de fecha vacía se compara como 0 y entraría acá como si
 * estuviera vencida desde 1899. El escritor además ABORTA si encuentra una pendiente sin fecha —
 * porque esa fila no tendría columna donde caer y el cuadre lo delataría sin decir cuál es.
 */
const columnaVencido = (cob, meses) =>
  `${PENDIENTE(cob)};${abierto(cob, 'fechaCobro')};">"&0;${abierto(cob, 'fechaCobro')};"<"&${inicioDeVentana(meses)}`

/** Lo cobrado del año, por fecha de COBRO (percibido). Es el mismo criterio que la columna D de
 *  OBRAS, y tiene que dar el mismo número: el escritor lo verifica contra la pestaña publicada. */
const criterioCobrado = (cob) => `;${abierto(cob, 'estado')};"${COBRADO}"`
  + `;${abierto(cob, 'fechaCobro')};">="&${serialISO(`${ANO}-01-01`)};${abierto(cob, 'fechaCobro')};"<="&${serialISO(`${ANO}-12-31`)}`

/** De lo cobrado, lo que se cobró con un cheque que se endosó: nunca pasó por la cuenta. El criterio
 *  es la NOTA, no la forma de cobro — hay 9 echeqs y sólo 2 endosados. */
export const MARCA_ENDOSO = '*Endosad*'
const criterioEndosado = (cob) => `${criterioCobrado(cob)};${abierto(cob, 'notas')};"${MARCA_ENDOSO}"`

/** Mismo constructor que OBRAS: push devuelve la fila 1-based y toda celda vacía sale con el
 *  centinela VACIO ("es mía y va vacía") para que la fusión la limpie. */
function hoja(ancho) {
  const filas = []
  return {
    filas,
    rotulos: [],
    get n() { return filas.length },
    push(c = []) {
      const r = [...c].map((x) => (x === '' || x === undefined || x === null ? VACIO : x))
      while (r.length < ancho) r.push(VACIO)
      r.length = ancho
      filas.push(r)
      return filas.length
    },
  }
}

/**
 * EL RÓTULO DE UN HITO: fecha · concepto · forma, y el estado sólo cuando NO es el normal.
 *
 * TODO VIVO CONTRA COBRANZAS. La fecha es el dato central de un calendario: tipeada, quedaría vieja
 * el día que el dueño la corrige, y nadie se enteraría hasta la próxima corrida del generador.
 *
 * EL ESTADO APARECE SÓLO SI NO DICE "Pendiente". De 44 hitos, 40 son Pendiente: publicarlo en los 44
 * sería una columna de ruido que hace invisible justo lo que importa —los 3 "Proyectado" (sin orden
 * de compra: dicen "RECLAMAR OC!") y el "Facturado"—. El silencio es la señal de normalidad.
 *
 * EL ⚠ DEL FIN DE OBRA (13/08, pedido del dueño): *"una obra que termina en octubre no puede tener
 * cobros proyectados en diciembre sin que se note"*. Cuando el hito pertenece a una obra declarada y
 * su cobro cae DESPUÉS del fin de esa obra, el rótulo lo dice con la fecha de fin al lado. Se compara
 * dentro del Sheet, así que si mañana se corre la fecha de cobro la marca aparece o se va sola.
 *
 * @param {object} cob las columnas resueltas de Cobranzas
 * @param {{fila:number, estado:string, finObra:string|null}} h el hito
 */
export function rotuloDeHito(cob, h) {
  const f = celdaDe(cob, 'fechaCobro', h.fila)
  const partes = [`"      "`, `TEXT(${f};"dd/mm")`, `" · "`, celdaDe(cob, 'concepto', h.fila),
    `" · "`, celdaDe(cob, 'forma', h.fila)]
  // El estado, sólo cuando difiere del normal. La comparación es viva: si el hito pasa de
  // "Proyectado" a "Pendiente" en Cobranzas, la marca se va sin que nadie toque nada.
  partes.push(`IF(${celdaDe(cob, 'estado', h.fila)}="${ESTADO_NORMAL}";"";" · "&${celdaDe(cob, 'estado', h.fila)})`)
  if (h.finObra) {
    const [, mm, dd] = String(h.finObra).split('-')
    partes.push(`IF(${f}>${serialISO(h.finObra)};" ⚠ fin ${dd}/${mm}";"")`)
  }
  return `=${partes.join('&')}`
}

/** El importe del hito, valuado si está en dólares. El IF es VIVO a propósito: si mañana se marca
 *  esa fila como USD, el calendario la valúa sin esperar a que corra el generador. */
const importeDeHito = (cob, fila) =>
  `=IF(${celdaDe(cob, 'moneda', fila)}="USD";${celdaDe(cob, 'total', fila)}*${RANGO_TC};${celdaDe(cob, 'total', fila)})`

/**
 * ¿QUÉ COLUMNAS SON REALES Y CUÁLES PROYECTADAS? La única definición, para que la piel no la invente.
 *
 * Real = plata que YA entró (Cobrado y la parte endosada de eso). Proyectado = todo lo que todavía no
 * pasó: lo vencido, cada mes y el total por cobrar. La columna 0 es el rótulo: no es ninguna de las
 * dos, y por eso no aparece en ninguna de las dos listas.
 */
export const columnasReales = () => [1, 2]
export const columnasProyectadas = (ancho) => {
  const c = []
  for (let i = 3; i < ancho; i++) c.push(i)
  return c
}

/**
 * LA GRILLA COMPLETA.
 *
 * @param {object} ctx
 *   `clientes` los canónicos derivados de Cobranzas · `hitos` las filas pendientes ya leídas
 *   (`{fila, cliente, estado, finObra, mes}`) · `meses` la ventana · `refs` las columnas resueltas.
 * @returns {{filas:Array, rotulos:Array, protagonistas:number[], detalles:number[], totales:number[],
 *   ancho:number, meses:Array, filaDeCliente:object}}
 */
export function grillaCalendario(ctx = {}) {
  const cob = { ...REFS_CALENDARIO, ...ctx.refs?.cob }
  const meses = ctx.meses ?? ventanaDeMeses(ctx.hoy ?? `${ANO}-01-01`)
  const clientes = ctx.clientes ?? []
  const hitos = ctx.hitos ?? []
  const ancho = COLS_FIJAS.length + meses.length + 1
  const h = hoja(ancho)
  const iMes = (m) => COLS_FIJAS.length + meses.findIndex((x) => x.mes === m.mes && x.ano === m.ano)
  const iTotal = ancho - 1
  const col = (i) => (i < 26 ? '' : String.fromCharCode(64 + Math.floor(i / 26))) + String.fromCharCode(65 + (i % 26))

  h.push([`${PESTANA_CALENDARIO.toUpperCase()} — CUÁNDO ENTRA CADA PESO`])
  // UNA LÍNEA. El dueño rechazó dos pestañas por *"muchas palabras y frases y explicación es q nadie
  // lee"*. Lo único que no se deduce mirando la tabla es con qué criterio está medida cada columna, y
  // eso hay que declararlo: percibido, por fecha de cobro, y qué significa el endosado.
  h.push([`=${quote(`${ANO} · percibido, por fecha de cobro · importes con IVA netos de retenciones`
    + ' · en itálica lo proyectado · ↳ endosado = cobrado que no pasó por la cuenta · USD valuado a ')}&`
    + `IFERROR(TEXT(${RANGO_TC};"$ #.##0,00");"(sin tipo de cambio)")`])
  h.push([])
  // UN SOLO BLOQUE, ASÍ QUE NO LLEVA RÓTULO DE BLOQUE NI NUMERACIÓN. Numerar "1 · …" cuando no hay un
  // 2 es prometer un cuadro que no existe.
  const fEnc = h.push([...COLS_FIJAS, ...meses.map((m) => m.rotulo), 'Por cobrar'])

  const filaDeCliente = {}
  const protagonistas = []
  const detalles = []
  for (const cli of clientes) {
    const f = h.n + 1
    filaDeCliente[cli] = f
    protagonistas.push(f)
    const fila = [cli, `=${porCliente(cob, cli, criterioCobrado(cob))}`, `=${porCliente(cob, cli, criterioEndosado(cob))}`,
      `=${porCliente(cob, cli, columnaVencido(cob, meses))}`]
    for (const m of meses) fila.push(`=${porCliente(cob, cli, enMes(cob, m))}`)
    // El total de la fila suma sus propias celdas de tiempo. Es el control más barato que existe:
    // cualquiera puede verificarlo con la vista, sin abrir una fórmula.
    fila.push(`=SUM(${col(3)}${f}:${col(iTotal - 1)}${f})`)
    h.push(fila)

    for (const hito of hitos.filter((x) => x.cliente === cli)) {
      const fd = h.n + 1
      detalles.push(fd)
      const fila2 = Array.from({ length: ancho }, () => '')
      fila2[0] = rotuloDeHito(cob, hito)
      // EL HITO CAE EN UNA SOLA COLUMNA: la de su mes, o la de vencido si su fecha ya pasó. Que sea
      // UNA y no dos es lo que hace que la suma horizontal del cliente no lo cuente dos veces.
      fila2[hito.vencido ? 3 : iMes(hito.mes)] = importeDeHito(cob, hito.fila)
      h.rotulos.push({ fila: fd, texto: hito.textoVisible ?? '' })
      h.push(fila2)
    }
  }

  const fTot = h.n + 1
  const cierre = ['⇒ TOTAL POR COBRAR', `=${deTodo(cob, criterioCobrado(cob))}`, `=${deTodo(cob, criterioEndosado(cob))}`,
    `=${deTodo(cob, columnaVencido(cob, meses))}`]
  for (const m of meses) cierre.push(`=${deTodo(cob, enMes(cob, m))}`)
  cierre.push(`=SUM(${col(3)}${fTot}:${col(iTotal - 1)}${fTot})`)
  h.push(cierre)

  return {
    filas: h.filas, rotulos: h.rotulos, protagonistas, detalles, totales: [fTot],
    ancho, meses, filaDeCliente, fEncabezado: fEnc, fTotal: fTot, iTotal,
  }
}
