// ¿TIENE ROL DECLARADO CADA HOJA DEL ARCHIVO? — la mitad de la regla 8 que nadie medía.
//
// ═══ QUÉ PREGUNTA CONTESTA, Y POR QUÉ NO LA CONTESTABA NADIE (06/09/2026) ═══
//
// La regla de oro 8 del dueño, textual: *"los cash flows semanales y mensuales tienen q reflejar
// todos los datos del sheet"*. Para medirla hacen falta dos preguntas, y el OS sólo tenía la segunda:
//
//   1. ¿Existe alguna hoja del archivo de la que NADIE dijo si su plata va al Cash Flow? ← ESTA
//   2. De las declaradas, ¿llega toda su plata?                    ← cobertura-plata.mjs
//
// `verificarCobertura()` (cash-flow-cobertura.mjs) parece contestar la 1 y no la contesta: recorre el
// `MAPA` y se pregunta si sus entradas son coherentes entre sí. Un archivo con veinte hojas nuevas y
// un MAPA de dieciséis le da verde, porque nunca mira el archivo. `problemasDeRol()` mira el Libro —
// o sea, mira lo que YA entró: una hoja con plata que ningún extractor lee no aparece en el Libro y
// por lo tanto tampoco en ese control. Las dos miran hacia adentro; ninguna cuenta las hojas.
//
// Medido el 06/09/2026: el archivo tiene 39 hojas y el MAPA declara 16. Las 23 restantes estaban
// fuera de todo control — incluida `SUBCONTRATISTAS`, que declara $53,5M contratados.
//
// ═══ POR QUÉ LA TABLA DE ABAJO NO ES UNA LISTA DE EXCEPCIONES ═══
//
// Es lo contrario: es la obligación de decir, hoja por hoja, POR QUÉ su plata no entra al Cash Flow
// por esa puerta. Una hoja que aparece nueva en el archivo y no está acá pone el control en rojo, y la
// única forma de apagarlo es escribir su rol y su porqué. Eso es lo que faltaba: hoy una pestaña nueva
// con egresos podía nacer y vivir para siempre sin que ningún control la nombrara.
//
// NO LEE GOOGLE. Recibe los títulos ya leídos y contesta sobre ellos.

import { MAPA, ROLES_SUMADOS } from './cash-flow-cobertura.mjs'

/**
 * LOS ROLES QUE ESTE ARCHIVO AGREGA. Los del `MAPA` (PARTICION · FUENTE · DERIVADA · ANCLA ·
 * INFORMATIVO) describen la relación de una hoja con el CUADRO. Los de acá describen la de una hoja
 * que no tiene relación con el cuadro, y por qué eso es correcto.
 *
 * · `INSUMO`    réplica de un dato de origen (`_ARCA_RAW`, `_F931_RAW`). Alimenta a un GENERADOR, que
 *               publica en una pestaña que sí es fuente. Su plata entra por ahí, no dos veces.
 * · `VISTA`     lee de una fuente y la muestra de otra forma. Igual que DERIVADA, pero de una fuente
 *               que no es Compras (el `MAPA` exige `deriva_de` sumada, y una vista de Cobranzas o de
 *               Jornales no encaja en su vocabulario).
 * · `SALIDA`    el producto: los dos Cash Flow y el propio `_MOVIMIENTOS`. Sumarlas sería contar el
 *               resultado como si fuera un insumo.
 * · `PARAMETRO` constantes y supuestos. No es plata: es cómo se calcula la plata.
 */
export const ROL_INSUMO = 'INSUMO'
export const ROL_VISTA = 'VISTA'
export const ROL_SALIDA = 'SALIDA'
export const ROL_PARAMETRO = 'PARAMETRO'

/** Los roles que este archivo agrega, todos "no aporta flujo propio". */
export const ROLES_SIN_FLUJO = Object.freeze([ROL_INSUMO, ROL_VISTA, ROL_SALIDA, ROL_PARAMETRO])

/**
 * LOS `origen.pestana` DEL LIBRO QUE NO SE LLAMAN COMO LA HOJA DE LA QUE SALEN.
 *
 * `Obras` es un origen LÓGICO: los materiales previstos salen del cuadro 5 de la hoja `OBRAS`, pero
 * el extractor los firma como "Obras" (ver `PESTANA_OBRAS` en libro-extractores-obras.mjs, que lo
 * dice con todas las letras). El mapeo va en las dos direcciones y las dos hacen falta:
 *
 *   · sin él, el control diría que el MAPA declara una hoja "Obras" que no existe — y grita por algo
 *     que está bien;
 *   · sin él, el control diría que la hoja "OBRAS" no tiene rol declarado — y grita por lo mismo al
 *     revés. Los dos son falsos positivos, y un control que grita por algo correcto se deja de mirar.
 *
 * La hoja física HEREDA el rol de su origen lógico: si mañana alguien renombra `OBRAS`, el control se
 * pone rojo por la hoja que falta, que es exactamente cuando hay que enterarse.
 *
 * @type {Readonly<Record<string, {hoja:string, porque:string}>>}
 */
export const ORIGENES_LOGICOS = Object.freeze({
  Obras: { hoja: 'OBRAS', porque: 'el plan de obras del dueño, leído del cuadro 5 de la hoja "OBRAS"' },
})

/**
 * LAS HOJAS QUE NO APORTAN FLUJO PROPIO AL CASH FLOW, CON SU PORQUÉ.
 *
 * `alimenta` dice a QUIÉN le sirve la hoja: es lo que hay que ir a mirar cuando alguien se pregunta
 * dónde terminó esta plata. Sin `alimenta`, la declaración es un "confiá en mí".
 *
 * @type {Array<{hoja:string, rol:string, alimenta:string, porque:string}>}
 */
export const HOJAS_SIN_FLUJO_PROPIO = [
  // ── SALIDAS ────────────────────────────────────────────────────────────────────────────────────
  { hoja: 'Cash Flow Semanal', rol: ROL_SALIDA, alimenta: '—', porque: 'Es una de las dos vistas que este control mide. Sumarla sería contar el resultado como insumo.' },
  { hoja: 'Cash Flow Mensual', rol: ROL_SALIDA, alimenta: '—', porque: 'La otra vista. Mismo criterio que la Semanal: es el producto, no una fuente.' },
  { hoja: '_MOVIMIENTOS', rol: ROL_SALIDA, alimenta: 'Cash Flow Semanal · Cash Flow Mensual · CAJA', porque: 'El Libro canónico: es el consolidado de todas las fuentes, no una fuente. Es el lado CONTRA el que se mide la cobertura.' },

  // ── VISTAS: leen una fuente y la muestran de otra forma ────────────────────────────────────────
  { hoja: 'Calendario de Cobros', rol: ROL_VISTA, alimenta: 'Cobranzas', porque: 'Fórmulas sobre Cobranzas, abiertas por cliente y por fecha de cobro. Es la misma plata que ya entra por Cobranzas: sumarla la contaría dos veces.' },
  { hoja: 'Deuda viva (OS)', rol: ROL_VISTA, alimenta: 'Compras', porque: 'Dinámica sobre Compras (Estado="Pendiente" y proveedor comercial). La deuda ya entra al Libro por la fila de Compras que la origina.' },
  { hoja: 'SUBCONTRATISTAS', rol: ROL_VISTA, alimenta: 'Compras', porque: 'Los montos se calculan contra Compras y no hay un número escrito a mano: un subcontrato pagado o pendiente entra al Libro por su fila de Compras, con su rubro de caja.' },
  { hoja: 'Nómina', rol: ROL_VISTA, alimenta: 'Jornales por Quincena', porque: 'Espejo de la planilla de jornales: qué se le debe hoy a cada persona. La plata entra por "Jornales por Quincena", que es la fuente declarada en el MAPA.' },
  { hoja: 'Plantel', rol: ROL_VISTA, alimenta: 'Jornales por Quincena', porque: 'El legajo del plantel: quién es cada uno y desde cuándo. No tiene importes de caja; el costo de esa gente sale por Jornales.' },
  { hoja: '_CAJA_ANEXO', rol: ROL_VISTA, alimenta: 'CAJA', porque: 'El detalle que la pestaña CAJA remite a su anexo. CAJA aporta el SALDO (rol ANCLA en el MAPA), no un flujo: su anexo tampoco.' },
  { hoja: '_PROVEEDORES_OS', rol: ROL_VISTA, alimenta: 'Proveedores', porque: 'Insumo calculado de la pestaña Proveedores, que el MAPA ya declara DERIVADA de Compras.' },
  { hoja: '_CRUCE_ARCA', rol: ROL_VISTA, alimenta: 'Compras', porque: 'El cruce entre lo cargado en Compras y lo que ARCA declara. Es un control de completitud del registro, no una fuente de egresos.' },
  { hoja: '_OBRAS_RAW', rol: ROL_VISTA, alimenta: 'OBRAS', porque: 'Réplica de los datos de obra que la hoja OBRAS publica. Los egresos previstos entran al Libro desde el cuadro 5 de OBRAS, firmados como origen "Obras".' },

  // ── INSUMOS: dato de origen que alimenta a un generador ────────────────────────────────────────
  { hoja: '_ARCA_RAW', rol: ROL_INSUMO, alimenta: 'Impuestos y Financieros', porque: 'La réplica declarada de lo que dice ARCA. El IVA e IIBB a pagar los calcula "Impuestos y Financieros", que es la fuente que el Libro lee.' },
  { hoja: '_IIBB_RAW', rol: ROL_INSUMO, alimenta: 'Impuestos y Financieros', porque: 'Misma cadena que _ARCA_RAW, para el impuesto provincial de San Juan.' },
  { hoja: '_F931_RAW', rol: ROL_INSUMO, alimenta: 'Cargas Sociales', porque: 'La DDJJ F931 replicada. Las cargas entran al Libro por la cadena que publica "Cargas Sociales".' },
  { hoja: '_UOCRA_RAW', rol: ROL_INSUMO, alimenta: 'Cargas Sociales · Jornales por Quincena', porque: 'La escala de convenio: es el PRECIO de la hora, no un egreso. El egreso lo arma la planilla de jornales con las horas.' },
  { hoja: '_UOCRA_DDJJ_RAW', rol: ROL_INSUMO, alimenta: 'Cargas Sociales', porque: 'Las DDJJ gremiales replicadas. El aporte entra por el rubro "Nómina · Gremiales" de la cadena de cargas.' },
  { hoja: '_J_OBREROS', rol: ROL_INSUMO, alimenta: 'Jornales por Quincena', porque: 'Espejo de la planilla de obreros. Los jornales entran al Libro por los rangos con nombre de "Jornales por Quincena".' },
  { hoja: '_J_OFICINA', rol: ROL_INSUMO, alimenta: 'Jornales por Quincena', porque: 'Espejo de la planilla de oficina. Mismo camino que _J_OBREROS: el egreso lo publica la planilla.' },
  { hoja: '_RECIBOS_RAW', rol: ROL_INSUMO, alimenta: 'Nómina', porque: 'Lo que dice cada recibo de sueldo y cada transferencia a cuenta. La pestaña Nómina lo cita por fórmula; el egreso de caja sale por Jornales.' },

  // ── PARÁMETROS ─────────────────────────────────────────────────────────────────────────────────
  { hoja: 'Parámetros', rol: ROL_PARAMETRO, alimenta: 'todo el archivo', porque: 'Los supuestos con los que se calcula (tipo de cambio, tasas, tolerancias). No es plata: es cómo se convierte en plata.' },
  { hoja: '01_Valores Iniciales', rol: ROL_PARAMETRO, alimenta: 'CAJA', porque: 'El punto de partida del ejercicio. Es un SALDO, no un flujo — mismo criterio que CAJA en el MAPA: sumarlo mezclaría stock con flujo.' },
  { hoja: '_PRESUPUESTO_MENSUAL', rol: ROL_PARAMETRO, alimenta: 'Cash Flow Mensual', porque: 'Lo que el dueño ESPERA cobrar y pagar cada mes. Es la vara contra la que se compara el cuadro, no un movimiento: sumarlo duplicaría la proyección que ya arman las fuentes.' },
]

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/** Todo lo declarado en algún lado, con su rol. PURA. */
export function rolesDeclarados() {
  const m = new Map()
  for (const e of MAPA) m.set(norm(e.pestania), { rol: e.rol, porque: e.nota, fuente: 'MAPA' })
  for (const e of HOJAS_SIN_FLUJO_PROPIO) {
    m.set(norm(e.hoja), { rol: e.rol, porque: e.porque, alimenta: e.alimenta, fuente: 'HOJAS_SIN_FLUJO_PROPIO' })
  }
  // La hoja física hereda el rol de su origen lógico. Ver ORIGENES_LOGICOS.
  for (const [logico, { hoja, porque }] of Object.entries(ORIGENES_LOGICOS)) {
    const d = m.get(norm(logico))
    if (d) m.set(norm(hoja), { ...d, porque: `${porque}. ${d.porque ?? ''}`.trim() })
  }
  return m
}

/**
 * NÚCLEO PURO: las hojas REALES del archivo que nadie declaró.
 *
 * Es el hallazgo que importa: una hoja sin rol puede tener egresos que ningún extractor lee, y no hay
 * forma de enterarse mirando el Cash Flow — el cuadro cierra consigo mismo igual.
 *
 * @param {string[]} titulos los títulos de las hojas, leídos del archivo
 * @returns {Array<{hoja:string}>} vacío = todas declaradas
 */
export function hojasSinRol(titulos = []) {
  const declaradas = rolesDeclarados()
  return (titulos ?? []).map(norm).filter(Boolean)
    .filter((t) => !declaradas.has(t))
    .map((hoja) => ({ hoja }))
}

/**
 * NÚCLEO PURO: lo declarado que NO existe como hoja del archivo.
 *
 * Detecta el renombre silencioso: si alguien renombra "Estructura" y el MAPA sigue diciendo
 * "Estructura", el extractor lee vacío y la línea del cuadro se apaga sin un solo error. Los orígenes
 * lógicos (`ORIGENES_LOGICOS`) no cuentan: no son hojas y nunca lo fueron.
 *
 * @returns {Array<{declarada:string, rol:string, fuente:string}>} vacío = todo lo declarado existe
 */
export function declaradasQueNoExisten(titulos = []) {
  const reales = new Set((titulos ?? []).map(norm))
  const out = []
  for (const [nombre, d] of rolesDeclarados()) {
    const fisica = ORIGENES_LOGICOS[nombre]?.hoja
    if (reales.has(nombre) || (fisica && reales.has(norm(fisica)))) continue
    out.push({ declarada: nombre, rol: d.rol, fuente: d.fuente })
  }
  return out
}

/**
 * NÚCLEO PURO: que la tabla de este archivo sea internamente sana y no pise al MAPA.
 *
 * Una hoja declarada en los dos lados tendría dos roles, y el que gane depende del orden de un `for`.
 * @returns {string[]} vacío = está bien
 */
export function verificarTablaDeHojas() {
  const problemas = []
  const delMapa = new Set(MAPA.map((m) => norm(m.pestania)))
  const vistas = new Set()
  for (const e of HOJAS_SIN_FLUJO_PROPIO) {
    const h = norm(e.hoja)
    if (delMapa.has(h)) problemas.push(`"${e.hoja}" está en el MAPA y también acá: tendría dos roles`)
    if (vistas.has(h)) problemas.push(`"${e.hoja}" está declarada dos veces`)
    vistas.add(h)
    if (!ROLES_SIN_FLUJO.includes(e.rol)) problemas.push(`"${e.hoja}": rol desconocido (${e.rol})`)
    if (ROLES_SUMADOS.has(e.rol)) problemas.push(`"${e.hoja}" dice no aportar flujo con un rol que sí suma`)
    if (!e.porque || e.porque.length < 40) problemas.push(`"${e.hoja}" declara su rol sin explicar por qué`)
    if (!e.alimenta) problemas.push(`"${e.hoja}" no dice a quién alimenta: la declaración no se puede seguir`)
  }
  return problemas
}

/** Las líneas del informe. Una por problema; vacío = el archivo entero tiene rol declarado. PURA. */
export function informeDeHojas(titulos = []) {
  const lineas = []
  for (const p of verificarTablaDeHojas()) lineas.push(`⛔ tabla de hojas: ${p}`)
  for (const h of hojasSinRol(titulos)) {
    lineas.push(`⛔ la hoja "${h.hoja}" no tiene rol declarado: nadie dijo si su plata llega a los Cash `
      + 'Flow ni por qué camino. Se declara en cash-flow-cobertura.mjs (MAPA) si aporta flujo, o en '
      + 'cobertura-hojas.mjs (HOJAS_SIN_FLUJO_PROPIO) si no.')
  }
  for (const d of declaradasQueNoExisten(titulos)) {
    lineas.push(`⛔ "${d.declarada}" está declarada (${d.rol}, en ${d.fuente}) y NO existe como hoja del `
      + 'archivo: si la renombraron, su extractor está leyendo vacío y su línea del cuadro vale $0 sin dar error.')
  }
  return lineas
}
