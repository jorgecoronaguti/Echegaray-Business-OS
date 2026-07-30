// INTERFAZ DEL SKILL EN MATTERMOST — todo lo que se ve y todo lo que se entiende.
//
// DECISIÓN DE INTERFAZ. Se resuelve con MENSAJES PRIVADOS + comandos de texto cortos, no
// con diálogos interactivos. El motivo es de arquitectura, no de comodidad: el bot @os
// entra por una conexión WebSocket SALIENTE (PR-4.2) y NO hay endpoint HTTP entrante
// publicado. Los diálogos y botones de Mattermost exigen que el servidor de MM haga un
// POST a una URL nuestra — es decir, exponer un endpoint, ruta en Caddy y configuración
// de integraciones. Eso es infraestructura nueva y una decisión de Nivel E, no algo que
// este skill deba activar por su cuenta.
//
// El flujo de texto funciona HOY, idéntico en web y en móvil, sin nada nuevo expuesto, y
// cumple lo que se pidió de la interfaz: marcar todos presentes, tocar sólo las
// excepciones, revisar, confirmar, volver, cancelar, sin un mensaje por trabajador.
// Este módulo es PURO (render + parseo): el día que se habilite el endpoint, la misma
// máquina de estados se dibuja con botones cambiando sólo este archivo.
//
// El cliente NUNCA manda nombres, coordenadas, pestañas ni el archivo: manda el NÚMERO
// de la fila que está viendo. La traducción número → trabajador la hace el servidor
// contra la planilla recién leída.

import { ESTADO, fmt } from '../lib/horas-extra.mjs'
import { RE_NUM_HORAS } from '../lib/jornales-estructura.mjs'
/** Igual que RE_NUM_HORAS pero sin tope de decimales: se captura TODO lo que el jefe
 *  escribió, para poder rechazarlo con su valor real en vez de truncarlo. */
const RE_NUM_HORAS_LARGO = String.raw`\d{1,3}(?:[.,]\d+)?`
// Los helpers de fecha/texto viven en lib/ porque los comparte con las consultas. Se
// re-exportan para que la superficie de este módulo no cambie.
import { TIMEZONE, fechaOperativaSanJuan, fechaAr, nombreDia, fechaDesdeTexto, limpiar } from '../lib/fecha-operativa.mjs'

export { TIMEZONE, fechaOperativaSanJuan, fechaAr, nombreDia, fechaDesdeTexto, limpiar }
export const COMANDO = 'asistencia'

const ICONO = { presente: '✓', ausente: '✕', tarde: '◔', parcial: '◐', sin_cambio: '=' }

/**
 * Parsea la intención. Se matchea por RAÍCES, no por conjugación: el dueño escribe con
 * voseo ("confirmá", "cancelá", "marcá") y un verbo exacto no alcanza.
 * Devuelve `{ tipo, ... }`; `null` si el texto no es para este skill.
 */
/** Cancelar/volver son destructivos para el formulario: sólo el comando SOLO los dispara.
 *  Se admite la mención al bot y un signo final, nada más. */
const RE_CANCELAR = /^(?:@[\w.-]+\s+)?(cancelar|cancelo|cancela|salir|abortar|aborta)[.!]?$/
const RE_VOLVER = /^(?:@[\w.-]+\s+)?(volver|volve|atras|back)[.!]?$/

export function parsearComando(texto, { isoContexto } = {}) {
  const t = limpiar(texto)
  if (!t) return null

  // Cierre y navegación primero: son cortos y no deben quedar tapados por otra regla.
  // PERO por coincidencia INEQUÍVOCA, no por subcadena: `/\bcancel/` hacía que
  // "no canceles, 3 ausente" cancelara el formulario, y "volver a marcar a todos
  // presentes" no marcara a nadie. Se exige el comando solo, sin nada más alrededor.
  if (RE_CANCELAR.test(t)) return { tipo: 'cancelar' }
  if (RE_VOLVER.test(t)) return { tipo: 'volver' }
  // OJO con el \b: un `\b` DESPUÉS de un grupo de prefijos exige que la palabra termine
  // ahí, y entonces "revisá"/"presente" no matchean. Los prefijos van sin cierre; las
  // palabras que sí son completas ("ver", "ok") se piden aparte.
  if (/\b(revis|previ|resum)/.test(t) || /\bver\b/.test(t)) return { tipo: 'revisar' }
  if (/\bconfirm/.test(t)) {
    const todo = /\btodo\b/.test(t)
    return {
      tipo: 'confirmar',
      sobrescribir: todo || /\b(sobrescrib|sobreescrib|pisa|igual)/.test(t),
      // Reemplazar una fórmula que no se pudo descomponer es un sí APARTE del de
      // sobrescribir: no es lo mismo cambiar un 9 por un 8 que borrar `=9-2,5+2`.
      reemplazar_formula: todo || /\bformula/.test(t),
    }
  }
  if (/\btod\w*\s+(present|vinieron)/.test(t) || /\btod\w*\s+ok\b/.test(t) || /\bpresente\s+tod/.test(t)) {
    return { tipo: 'todos_presentes' }
  }
  // "obra 2" / "obra: 2"
  const obra = /\b(obra|cliente)\s*:?\s*(\d{1,2})\b/.exec(t)
  if (obra) return { tipo: 'obra', indice: Number(obra[2]) }

  // "3 ausente" | "ausente 3" | "5 parcial 5,5" | "parcial 5 5,5"
  const marca = parsearMarca(t)
  if (marca) return marca

  if (new RegExp(`\\b${COMANDO}`).test(t) || /\bpresentism/.test(t)) {
    return { tipo: 'iniciar', fecha: fechaDesdeTexto(t, isoContexto) }
  }
  // Una fecha suelta cambia la fecha del formulario abierto.
  const f = fechaDesdeTexto(t, isoContexto)
  if (f && /^[\d/\-\s]+$/.test(t)) return { tipo: 'fecha', fecha: f }
  return null
}

/** Verbos que dicen explícitamente "quiero CARGAR", no "quiero VER". */
const RE_VERBO_REGISTRO = /\b(carg|registr|corrig|corregi|modific|anot|complet)\w*\s+(la\s+|el\s+)?(asistencia|presentism)/

/**
 * CLASIFICADOR de ruteo entre registrar y consultar. Existe porque las dos cosas empiezan
 * con la misma palabra y se pisaban: `asistencia de hoy` arrancaba el formulario de carga
 * en vez de responder quién trabajó hoy.
 *
 * La regla, en este orden — y el orden es la parte que importa:
 *   1. un verbo explícito de carga ("cargar/registrar/corregir asistencia") → REGISTRO;
 *   2. un PASO DEL FORMULARIO (`obra 2`, `3 ausente`, `1 extra 2`, `revisar`, `confirmar`,
 *      `volver`, `cancelar`, `todos presentes`) → REGISTRO. Son inequívocos y sólo tienen
 *      sentido dentro de un formulario abierto. Si esto se evaluara DESPUÉS de las
 *      consultas, `1 extra 2` (marcar 2 horas extra) se confundía con una consulta de
 *      horas extra;
 *   3. si el parser de consultas lo reconoce → CONSULTA;
 *   4. `asistencia` sola → REGISTRO (es el único caso que quedaba ambiguo);
 *   5. si no → no es de este skill.
 *
 * `parsearConsulta` entra INYECTADO para que este módulo no dependa del de consultas (y
 * para poder testear el ruteo sin él).
 */
export function clasificar(texto, { parsearConsulta, isoContexto } = {}) {
  const t = limpiar(texto)
  if (!t) return { destino: null }
  const cmd = parsearComando(texto, { isoContexto })

  if (RE_VERBO_REGISTRO.test(t)) {
    return { destino: 'registro', intencion: cmd ?? { tipo: 'iniciar', fecha: fechaDesdeTexto(t, isoContexto) } }
  }
  // Un paso del formulario es cualquier intención que NO sea "arrancar".
  if (cmd && cmd.tipo !== 'iniciar' && cmd.tipo !== 'fecha') {
    return { destino: 'registro', intencion: cmd }
  }
  if (typeof parsearConsulta === 'function') {
    const c = parsearConsulta(texto, { isoContexto })
    if (c) return { destino: 'consulta', consulta: c }
  }
  if (cmd) return { destino: 'registro', intencion: cmd }
  return { destino: null }
}

/**
 * Marca de un trabajador por NÚMERO de la lista mostrada.
 *
 * Gramática:
 *   `3 ausente`                    · `3 tarde 7`         (7 = horas normales trabajadas)
 *   `5 parcial 5,5`                · `5 parcial 5,5 extra 2`
 *   `1 presente extra 2`           · `1 extra 2`         (sólo cambia las extras)
 *
 * Las extras se separan ANTES de leer el resto de los números: si no, "extra 2" se comía
 * el lugar de las horas normales.
 */
function parsearMarca(t) {
  let extras = null
  let resto = t
  const mExtra = new RegExp(`\\bextra\\w*\\s*:?\\s*(-?${RE_NUM_HORAS_LARGO})`).exec(t)
  if (mExtra) { extras = mExtra[1]; resto = t.replace(mExtra[0], ' ') }

  const estado = /\b(ausent|falt|no vino|no fue)/.test(resto) ? ESTADO.AUSENTE
    : /\b(tard|llego)/.test(resto) ? ESTADO.TARDE
      : /\b(parcial|medi)/.test(resto) ? ESTADO.PARCIAL
        : (/\b(present|vino)/.test(resto) || /\bok\b/.test(resto)) ? ESTADO.PRESENTE : null

  // Se capturan los números COMPLETOS, con signo y con todos sus decimales. Antes el
  // regex recortaba: "1 parcial -5" daba normales "5" (se comía el menos) y "3 parcial
  // 5,555" daba "5,55". Un valor inválido tiene que rechazarse, no achicarse en silencio.
  const nums = [...resto.matchAll(new RegExp(`(-?${RE_NUM_HORAS_LARGO})`, 'g'))].map((m) => m[1])
  if (!nums.length) return null
  const indice = Number(String(nums[0]).replace(',', '.'))
  if (!Number.isInteger(indice)) return null
  const normales = nums[1] ?? null

  if (!estado) {
    // `1 extra 2`: no cambia el estado, sólo agrega/corrige las horas extra.
    if (extras != null) return { tipo: 'marcar', indice, extras, solo_extras: true }
    return null
  }
  // Tarde y parcial NECESITAN las horas normales: no se inventan.
  if ((estado === ESTADO.TARDE || estado === ESTADO.PARCIAL) && normales == null) {
    return { tipo: 'marcar', indice, estado, normales: null, extras, faltan_horas: true }
  }
  return { tipo: 'marcar', indice, estado, normales, extras }
}

// ── RENDER ──────────────────────────────────────────────────────────────────
// Markdown de Mattermost. Nada de datos de asistencia fuera de un canal privado: el
// handler garantiza el destino, este módulo garantiza que el texto sea legible.

export function renderAyuda() {
  return [
    '**Registrar asistencia**',
    '',
    `\`${COMANDO}\` — arranca con la fecha de hoy (San Juan)`,
    `\`${COMANDO} 29/07\` — arranca con otra fecha`,
    '`obra 2` — elegís la obra de la lista',
    '`todos presentes` — marca toda la cuadrilla',
    '`3 ausente` — corrige sólo la excepción',
    '`3 tarde 7` — llegó tarde: 7 horas trabajadas',
    '`5 parcial 5,5` — jornada parcial en horas',
    '`1 extra 2` — 2 horas extra (se suman a las normales)',
    '`revisar` · `confirmar` · `volver` · `cancelar`',
  ].join('\n')
}

export function renderObras({ fecha, diaSemana, obras, jornada, pestana }) {
  const l = [
    `**Asistencia — ${fechaAr(fecha)}** (${nombreDia(diaSemana)})`,
    `_Planilla:_ JORNALES · pestaña ${pestana}`,
    jornada?.requiere_manual
      ? '⚠️ Para este día no hay jornada completa de referencia: cada presente necesita horas (`N parcial 5,5`).'
      : `_Jornada completa de este día:_ **${jornada.horas} h** (${jornada.origen === 'calibrado' ? `según ${jornada.muestras} cargas del mismo bloque` : 'valor de referencia'})`,
    '',
    '**¿Qué obra?**',
  ]
  obras.forEach((o, i) => l.push(`${i + 1}. ${o.etiqueta} — ${o.personas} ${o.personas === 1 ? 'persona' : 'personas'}`))
  l.push('', 'Respondé `obra 1`, `obra 2`… o `cancelar`.')
  return l.join('\n')
}

export function renderCuadrilla({ fecha, diaSemana, obra, personal, marcas, jornada }) {
  const l = [
    `**${obra.etiqueta}** — ${fechaAr(fecha)} (${nombreDia(diaSemana)})`,
    '',
  ]
  personal.forEach((p, i) => {
    const m = marcas?.[p.ref] ?? marcas?.[p.nombre_clave]
    const marcado = m ? `${ICONO[m.estado] ?? '·'} ${etiquetaEstado(m, jornada)}` : '· sin marcar'
    // Una celda ya cargada arranca en SIN CAMBIO: se dice, no se disfraza de "sin marcar".
    const ya = p.actual?.carga && p.actual.escrita ? `  _(cargado: ${cargaCorta(p.actual.carga)})_` : ''
    l.push(`${i + 1}. ${p.nombre_original.trim()} — ${marcado}${ya}`)
  })
  l.push('', '`todos presentes` · `3 ausente` · `3 tarde 7` · `5 parcial 5,5` · `1 extra 2` · `revisar` · `cancelar`')
  return l.join('\n')
}

/** Carga existente en una línea: siempre distingue normal, extra y total. */
function cargaCorta(carga) {
  if (!carga) return '—'
  if (carga.forma === 'no_interpretable') return `${fmt(carga.total)} h · ${carga.formula_original}`
  if (carga.forma === 'error') return `valor no interpretable · ${carga.formula_original}`
  if (carga.forma === 'texto') return `texto: ${String(carga.valor_original).slice(0, 20)}`
  if (!carga.extras) return `${fmt(carga.total)} h`
  return `${fmt(carga.normales)} + ${fmt(carga.extras)} extra = ${fmt(carga.total)} h`
}

/** `presente (9 h)` · `presente (9 + 2 extra = 11 h)` · `tarde (7 h)` · `ausente (0)`.
 *  Cuando hay extras se muestra siempre el TOTAL: es el número que va a la planilla. */
function etiquetaEstado(m, jornada) {
  // Lo que ya estaba cargado y nadie pidió tocar. No es "presente" ni "sin marcar": es
  // una celda que se deja como está, y decirlo es la mitad de la protección.
  if (m.estado === 'sin_cambio') return 'sin cambio (queda como está)'
  if (m.estado === ESTADO.AUSENTE) return 'ausente (0)'
  const nor = Number(String(m.normales ?? jornada?.horas ?? '').replace(',', '.'))
  const ex = Number(String(m.extras ?? 0).replace(',', '.')) || 0
  const horas = ex > 0
    ? `${fmt(nor)} + ${fmt(ex)} extra = ${fmt(nor + ex)} h`
    : `${fmt(nor)} h`
  return `${m.estado} (${horas})`
}

export function renderPreview(plan) {
  const r = plan.resumen
  const l = [
    '**Revisá antes de confirmar**',
    '',
    `Fecha: **${fechaAr(plan.fecha)}** (${nombreDia(plan.dia_semana)})`,
    `Obra: **${plan.obra_etiqueta ?? plan.clave_obra}**`,
    `Planilla: ${plan.pestana} · columna ${plan.columna_letra}`,
    '',
    `Presentes: **${r.presentes}** · Ausentes: **${r.ausentes}**`
      + `${r.tardes ? ` · Tarde: **${r.tardes}**` : ''} · Parciales: **${r.parciales}**`,
    `Horas normales: **${fmt(r.horas_normales)}** · Horas extra: **${fmt(r.horas_extra)}** · Total: **${fmt(r.horas_total)}**`,
    `Celdas nuevas: **${r.celdas_nuevas}** · Celdas que se modifican: **${r.celdas_modificadas}**`,
  ]
  if (r.sin_cambio) l.push(`Sin cambio (quedan como están): ${r.sin_cambio}`)
  // "Horas extra: 0" se lee como "no hubo extras". Si la operación las está BORRANDO hay
  // que decirlo con esas palabras: es plata del jornal de alguien.
  if (r.pierden_extras) {
    l.push('', `🛑 **Se van a BORRAR ${fmt(r.horas_extra_borradas)} h extra ya cargadas** (${r.pierden_extras} ${r.pierden_extras === 1 ? 'persona' : 'personas'}):`)
    for (const i of plan.items.filter((x) => x.pierde_extras && x.accion !== 'sin_cambio' && !x.bloqueada)) {
      l.push(`· ${i.nombre_original.trim()}: tenía **${fmt(i.extras_actuales)} h extra**, queda con **${fmt(i.extras_nuevas)}**`)
    }
  }

  const modifica = plan.items.filter((i) => i.accion === 'modifica')
  if (modifica.length) {
    l.push('', '⚠️ **Estas celdas YA tenían otro valor:**')
    for (const i of modifica) {
      // Diferencia explícita: el jefe no tiene que restar de cabeza para ver qué pierde.
      const dif = (i.total_nuevo ?? 0) - (i.total_actual ?? 0)
      const signo = dif > 0 ? `+${fmt(dif)}` : fmt(dif)
      l.push(`· ${i.nombre_original.trim()}: ${detalleAnterior(i)} → **${detalleNuevo(i)}** (${signo} h)`)
    }
  }
  const conFormula = plan.items.filter((i) => i.reemplaza_formula_no_interpretable && !i.bloqueada)
  if (conFormula.length) {
    l.push('', '🔶 **Estas tienen una fórmula que no se puede separar en normal/extra:**')
    for (const i of conFormula) {
      l.push(`· ${i.nombre_original.trim()}: \`${i.formula_actual}\` (= ${fmt(i.total_actual)} h) → **${detalleNuevo(i)}**`)
    }
    l.push('_Reemplazarlas borra esa fórmula._')
  }
  const bloq = plan.items.filter((i) => i.bloqueada)
  if (bloq.length) {
    l.push('', '🚫 **No se van a tocar** (y hay que resolverlas a mano en la planilla):')
    for (const i of bloq) l.push(`· ${(i.nombre_original ?? i.nombre_clave).trim()} — ${motivoLegible(i)}`)
  }
  l.push('', instruccionConfirmar(plan))
  return l.join('\n')
}

const detalleAnterior = (i) => (i.formula_actual
  ? `\`${i.formula_actual}\` (${fmt(i.total_actual)} h)`
  : `${fmt(i.total_actual)} h`)

function detalleNuevo(i) {
  if (!i.extras_nuevas) return `${fmt(i.normales_nuevas)} h`
  return `${fmt(i.normales_nuevas)} + ${fmt(i.extras_nuevas)} extra = ${fmt(i.total_nuevo)} h`
}

/** Qué exactamente tiene que escribir el jefe para confirmar. */
function instruccionConfirmar(plan) {
  if (plan.resumen.a_escribir === 0) return '_No hay nada para escribir._ `cancelar` para cerrar.'
  const falta = []
  if (plan.requiere_confirmacion_sobrescritura) falta.push('sobrescribir')
  if (plan.requiere_confirmacion_formula) falta.push('formula')
  if (!falta.length) return 'Escribí `confirmar`, `volver` para corregir o `cancelar`.'
  return `Escribí \`confirmar ${falta.join(' ')}\` (o \`confirmar todo\`) para aceptar esos cambios, `
    + '`volver` para corregir o `cancelar`.'
}

function motivoLegible(i) {
  switch (i.bloqueada) {
    case 'texto_no_numerico': return `la celda tiene texto (\`${i.valor_actual}\`), no un número de horas`
    case 'jornada_requiere_manual': return 'este día no tiene jornada completa de referencia: cargá las horas con `parcial`'
    case 'trabajador_no_en_bloque': return 'no figura en esta obra para esta fecha en JORNALES'
    case 'ausente_con_extras': return 'un ausente no puede tener horas extra'
    case 'faltan_horas_normales': return 'faltan las horas normales trabajadas'
    case 'negativo': return 'las horas no pueden ser negativas'
    case 'no_numerico': return 'las horas tienen que ser un número'
    case 'total_mayor_al_maximo': return `el total supera el máximo permitido (${i.detalle?.max ?? 24} h)`
    default: return String(i.bloqueada)
  }
}

export function renderExito({ plan, resultado, actor }) {
  const r = plan.resumen
  return [
    '✅ **Asistencia registrada**',
    '',
    `Fecha: ${fechaAr(plan.fecha)}`,
    `Obra: ${plan.obra_etiqueta ?? plan.clave_obra}`,
    `Presentes: ${r.presentes} · Ausentes: ${r.ausentes}${r.tardes ? ` · Tarde: ${r.tardes}` : ''} · Parciales: ${r.parciales}`,
    `Horas normales: ${fmt(r.horas_normales)} · Horas extra: ${fmt(r.horas_extra)} · Total: ${fmt(r.horas_total)}`,
    `Celdas actualizadas: ${resultado.escritas}`,
    `Registrado por: ${actor?.plataforma_username ?? actor?.plataforma_user_id ?? '—'}`,
  ].join('\n')
}

export function renderDuplicado({ plan }) {
  return [
    'ℹ️ **Esa carga ya estaba registrada**',
    '',
    `Fecha: ${fechaAr(plan.fecha)} · Obra: ${plan.obra_etiqueta ?? plan.clave_obra}`,
    'No se escribió nada de nuevo ni se duplicó la auditoría.',
  ].join('\n')
}

export function renderConflicto({ conflictos }) {
  const l = [
    '⚠️ **La asistencia no fue guardada.**',
    '',
    'Una o más celdas de JORNALES cambiaron mientras completabas el registro.',
    '',
  ]
  for (const c of (conflictos ?? []).slice(0, 12)) {
    l.push(`· ${(c.nombre_original ?? c.nombre_clave ?? '').trim()} — ${c.celda_a1?.split('!')[1] ?? ''}: al empezar \`${c.valor_al_planificar ?? '(vacía)'}\`, ahora \`${c.valor_ahora ?? '(vacía)'}\``)
  }
  l.push('', 'Revisá los valores actuales antes de confirmar nuevamente. Escribí `asistencia` para empezar de nuevo con la planilla al día.')
  return l.join('\n')
}

export function renderFechaInexistente({ fecha, pestana }) {
  return [
    '⚠️ **La fecha seleccionada todavía no existe en JORNALES.**',
    '',
    `${fechaAr(fecha)} no tiene columna en ${pestana ? `la pestaña ${pestana}` : 'la planilla'}.`,
    'No se creó ninguna columna ni se modificó la hoja.',
    '',
    'Cuando la quincena esté preparada en la planilla, volvé a intentar.',
  ].join('\n')
}

export function renderSinPersonal({ obra, fecha }) {
  return `No se encontró personal asignado a **${obra?.etiqueta ?? 'esa obra'}** en JORNALES para el ${fechaAr(fecha)}.`
}

/**
 * Acceso denegado. En el MVP el modo es ABIERTO, así que el único rechazo real es no
 * tener identidad (un pedido sin usuario de Mattermost, que no se puede auditar).
 */
export function renderDenegado(motivo) {
  if (motivo === 'sin_identidad') {
    return '🔒 No pude identificarte. La asistencia se registra desde tu cuenta de Mattermost, porque queda a tu nombre.'
  }
  return '🔒 No tenés permiso para registrar asistencia. Si corresponde, pedíselo a Dirección.'
}

export function renderPestanaProtegida({ pestana }) {
  return [
    '⚠️ **No se escribió nada.**',
    '',
    `La pestaña ${pestana ?? 'de JORNALES'} está tomada (candado o edición manual reciente).`,
    'Es a propósito: mientras alguien la está editando, el OS no la toca. Reintentá más tarde.',
  ].join('\n')
}

export function renderError({ mensaje }) {
  return `⚠️ No pude completar el registro: ${mensaje}. No se escribió nada en JORNALES.`
}

export function renderVencida() {
  return '⌛ El formulario venció (la planilla pudo haber cambiado). Escribí `asistencia` para empezar de nuevo.'
}

export function renderCancelada() {
  return '✖️ Registro cancelado. No se escribió nada en JORNALES.'
}
