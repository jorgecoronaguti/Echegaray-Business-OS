// LAS VACACIONES DEVENGADAS DEL PLANTEL DE OBRA — EL MECANISMO, SIN INVENTAR LA ESCALA.
//
// ═══ EL AGUJERO, MEDIDO (27/08/2026) ═══
//
// Las vacaciones no estaban en NINGUNA pestaña. Ni provisionadas en Cargas Sociales, ni proyectadas
// en el Cash Flow. Lo único que había era un pie en la sección 6 diciendo que faltaban — desde el
// 06/08. Un aviso de tres semanas no es una provisión: es un pasivo que devenga todos los meses y que
// el cuadro económico no ve.
//
// ═══ LO QUE FALTABA NO ERA EL DATO: ERA LA NORMA ═══
//
// La antigüedad SÍ está, y está en la fuente que se lee todos los días: la columna C de `_J_OBREROS`
// trae la fecha de ingreso de cada persona (26/6/23, 12/8/24, 20/4/26…). También está en
// `public.personas.fecha_ingreso`. Lo que falta son los DÍAS que corresponden por tramo de
// antigüedad, y eso es normativo.
//
// Los 17 obreros están bajo **UOCRA — Ley 22.250 (construcción)**, que es un régimen distinto del
// común: no hay indemnización por antigüedad de la LCT, hay Fondo de Cese. Las vacaciones se rigen
// por las reglas generales EN LO NO MODIFICADO POR EL ESTATUTO — o sea que hay que mirar dos cuerpos,
// no uno, y la interacción cambió más de una vez.
//
// **ESTA CORRIDA NO PUDO VERIFICAR LA NORMA VIGENTE** (no hubo acceso a fuente oficial). La política
// de la skill laboral es explícita y no admite atajos: los institutos se nombran, los VALORES se
// verifican. Una escala de días citada de memoria multiplicada por 17 jornales es una invención con
// aspecto de provisión, y entra al cuadro económico como si fuera un hecho.
//
// Entonces la escala viaja como PARÁMETRO —una fila por tramo, en la pestaña de Parámetros, con su
// `A VERIFICAR` al lado— igual que las alícuotas de FCL, IERIC y FODECO, que ya viven así por el
// mismo motivo. Con los tramos en 0 la provisión NO PUBLICA UN NÚMERO: publica qué falta y quién lo
// confirma. El día que el contador escribe los días, la provisión se calcula sola contra las fechas
// de ingreso REALES, sin tocar una línea de código.
//
// Lo que sí es un hecho y sí se publica desde hoy: la antigüedad de cada uno y el valor de un día de
// vacaciones al piso del convenio. Sobre eso no hay nada que verificar.

import { ALERTA } from './glifos.mjs'

/** Los cuatro tramos de antigüedad, como rangos con nombre de la pestaña de Parámetros. */
export const RANGOS_VACACIONES = [
  'VACACIONES_DIAS_HASTA_5',
  'VACACIONES_DIAS_5_A_10',
  'VACACIONES_DIAS_10_A_20',
  'VACACIONES_DIAS_MAS_20',
]

/**
 * LOS TRAMOS, POR SU CORTE DE ANTIGÜEDAD. El corte es conocimiento estable —la escala de vacaciones
 * se abre por años de antigüedad, en cuatro tramos— y por eso la ESTRUCTURA se puede escribir. Los
 * DÍAS de cada tramo son el valor, y el valor se verifica.
 */
export const TRAMOS = [
  { rango: RANGOS_VACACIONES[0], desde: 0, hasta: 5, rotulo: 'hasta 5 años' },
  { rango: RANGOS_VACACIONES[1], desde: 5, hasta: 10, rotulo: 'más de 5 y hasta 10' },
  { rango: RANGOS_VACACIONES[2], desde: 10, hasta: 20, rotulo: 'más de 10 y hasta 20' },
  { rango: RANGOS_VACACIONES[3], desde: 20, hasta: Infinity, rotulo: 'más de 20' },
]

export const GAP_ESCALA = 'los DÍAS por tramo de antigüedad son normativos y esta corrida no pudo '
  + 'verificar la norma vigente: los confirma el contador en Parámetros y la provisión se calcula sola'

/**
 * NÚCLEO PURO: años COMPLETOS de antigüedad al cierre del período.
 *
 * Años completos y no fracción: la escala se abre por tramos cerrados, y redondear para arriba mueve
 * a una persona de tramo un día antes de que le corresponda. Sin fecha devuelve `null` —no 0—: 0 años
 * es una respuesta y "no sé" es otra, y confundirlas es lo que hace que un faltante se pague como si
 * fuera el tramo más barato.
 *
 * @param {Date|null} ingreso
 * @param {Date} alCierre
 * @returns {number|null}
 */
export function antiguedadEnAnios(ingreso, alCierre = new Date()) {
  if (!(ingreso instanceof Date) || Number.isNaN(ingreso.getTime())) return null
  if (!(alCierre instanceof Date) || Number.isNaN(alCierre.getTime())) return null
  let a = alCierre.getFullYear() - ingreso.getFullYear()
  const antes = alCierre.getMonth() < ingreso.getMonth()
    || (alCierre.getMonth() === ingreso.getMonth() && alCierre.getDate() < ingreso.getDate())
  if (antes) a -= 1
  return a
}

/**
 * NÚCLEO PURO: a qué tramo cae una antigüedad. `null` cuando no hay fecha — nunca al primer tramo.
 * @returns {{rango:string, rotulo:string}|null}
 */
export function tramoDeAntiguedad(anios, tramos = TRAMOS) {
  if (typeof anios !== 'number' || Number.isNaN(anios)) return null
  const t = tramos.find((x) => anios >= x.desde && anios < x.hasta)
  return t ? { rango: t.rango, rotulo: t.rotulo } : null
}

/**
 * NÚCLEO PURO: LA PROVISIÓN DE VACACIONES DEL PLANTEL, PERSONA POR PERSONA.
 *
 * `valorDiaDe(persona)` la calcula el llamador, porque el criterio de "cuánto vale un día" depende de
 * con qué base se está valuando el plantel (jornal pactado o piso del convenio) y eso lo decide la
 * pestaña, no este archivo.
 *
 * ═══ DEVUELVE `null` Y NO 0 CUANDO NO SE PUEDE CALCULAR ═══
 *
 * Sin escala cargada, o con una persona sin fecha de ingreso, la provisión de esa fila es `null`. Un 0
 * se suma sin ruido y el total queda corto y plausible — que es exactamente el modo de falla que este
 * repositorio viene pagando. Lo que se devuelve es la cuenta de lo que no se pudo medir, para que la
 * celda lo diga en vez de publicar un total incompleto.
 *
 * @param {{personas:Array<{nombre:string, ingreso:Date|null}>, escala?:Object<string,number>,
 *          valorDiaDe:(p:object)=>number, alCierre?:Date}} d
 * @returns {{filas:Array, total:number|null, sinFecha:string[], sinEscala:string[], escalaCargada:boolean}}
 */
export function provisionVacaciones({ personas = [], escala = {}, valorDiaDe = () => 0, alCierre = new Date() } = {}) {
  // "Cargada" = algún tramo tiene días > 0. Cuatro ceros es la pestaña recién creada, no una escala.
  const escalaCargada = RANGOS_VACACIONES.some((r) => (Number(escala?.[r]) || 0) > 0)
  const sinFecha = []
  const sinEscala = []
  const filas = personas.map((p) => {
    const anios = antiguedadEnAnios(p.ingreso ?? null, alCierre)
    const tramo = tramoDeAntiguedad(anios)
    const dias = tramo ? Number(escala?.[tramo.rango]) || 0 : 0
    const valorDia = Number(valorDiaDe(p)) || 0
    if (anios === null) sinFecha.push(p.nombre)
    else if (!dias) sinEscala.push(p.nombre)
    const provision = anios === null || !dias ? null : dias * valorDia
    return { ...p, anios, tramo: tramo?.rotulo ?? null, dias: dias || null, valorDia, provision }
  })
  const medidas = filas.filter((f) => f.provision !== null)
  return {
    filas,
    // Sin una sola fila medible el total es `null`, no 0: "no se pudo" y "no corresponde nada" son
    // dos respuestas distintas y sólo una de las dos autoriza a cerrar el cuadro.
    total: medidas.length ? medidas.reduce((s, f) => s + f.provision, 0) : null,
    sinFecha,
    sinEscala,
    escalaCargada,
  }
}

/**
 * NÚCLEO PURO: la línea que la pestaña publica sobre la provisión — el número, o qué falta para tenerlo.
 *
 * No hay una tercera opción. Una celda que dijera "$0" con la escala sin cargar afirmaría que la
 * empresa no debe vacaciones, que es lo contrario de lo que pasa.
 */
export function lineaProvision(r) {
  if (!r?.escalaCargada) {
    return `${ALERTA} Vacaciones sin provisionar — ${GAP_ESCALA}`
  }
  const faltan = [...(r.sinFecha ?? []), ...(r.sinEscala ?? [])]
  if (!faltan.length) return null
  return `${ALERTA} Vacaciones — ${faltan.length} persona(s) sin medir: ${faltan.slice(0, 3).join(', ')}`
    + `${faltan.length > 3 ? `…y ${faltan.length - 3} más` : ''}. El total de abajo NO las incluye.`
}

/**
 * NÚCLEO PURO: LA MISMA REGLA, COMO FÓRMULA VIVA PARA LA PESTAÑA.
 *
 * Se escribe al lado de la versión JS a propósito, igual que `expresionClaveConvenio` en el piso del
 * convenio: son dos caminos al mismo criterio y el test los compara. Si un día se separan, el número
 * de la pestaña y el del log dejan de ser el mismo número — que es como un control empieza a validarse
 * contra lo que él mismo produce.
 *
 * provisión = Σ_persona [ días(antigüedad) × $/hora de la persona × jornada ]
 *
 * ═══ TRES GUARDS, Y LOS TRES POR UN DEFECTO YA PAGADO ═══
 *
 * · `N(C)>0` antes del `DATEDIF`: una fila sin fecha de ingreso rompe el DATEDIF y se lleva puesto el
 *   SUMPRODUCT entero. Con el guard esa persona aporta 0 y la fila de al lado la CUENTA, para que el
 *   total no quede corto en silencio (es el mismo criterio de `expresionSinEscala`).
 * · la escala en cero apaga la fórmula: `SUM(tramos)=0` rinde "" y no 0. Un 0 se lee como "no se debe
 *   nada de vacaciones", que es lo contrario de lo que pasa.
 * · el `$/hora` entra por `N(...)`: la columna W del espejo trae texto en las filas que no son gente.
 *
 * @param {{hoja:string, bloque:{inicio:number,fin:number}|null, jornada:number}} d
 * @returns {string} la fórmula (con `=`), separador es-AR
 */
export function formulaProvisionVacaciones({ hoja, bloque, jornada }) {
  if (!bloque) return '=""'
  const C = `'${hoja}'!$C$${bloque.inicio}:$C$${bloque.fin}`
  const W = `'${hoja}'!$W$${bloque.inicio}:$W$${bloque.fin}`
  const [d1, d2, d3, d4] = RANGOS_VACACIONES
  const conFecha = `(N(${C})>0)`
  const anios = `DATEDIF(IF(N(${C})>0;${C};TODAY());TODAY();"Y")`
  const dias = `IF(${anios}<5;${d1};IF(${anios}<10;${d2};IF(${anios}<20;${d3};${d4})))`
  const suma = `SUMPRODUCT(${conFecha}*${dias}*N(${W}))*${jornada}`
  return `=IF(SUM(${d1};${d2};${d3};${d4})=0;"";IFERROR(${suma};""))`
}

/**
 * NÚCLEO PURO: cuántas personas del bloque quedan FUERA de la provisión por no tener fecha de ingreso.
 * Va en su propia celda y no adentro de un mensaje: es el número con el que se arregla el faltante.
 */
export function formulaSinFechaDeIngreso({ hoja, bloque }) {
  if (!bloque) return '=""'
  const B = `'${hoja}'!$B$${bloque.inicio}:$B$${bloque.fin}`
  const C = `'${hoja}'!$C$${bloque.inicio}:$C$${bloque.fin}`
  return `=SUMPRODUCT((${B}<>"")*(N(${C})=0))`
}
