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

import { normalizarClave } from '../lib/jornales-estructura.mjs'
import { ESTADO } from '../lib/jornada-politica.mjs'

export const TIMEZONE = 'America/Argentina/San_Juan'
export const COMANDO = 'asistencia'

const ICONO = { presente: '✓', ausente: '✕', parcial: '◐' }

/**
 * FECHA OPERATIVA en la zona de la empresa. Nunca UTC: a las 21:30 de San Juan, UTC ya
 * es el día siguiente, y la asistencia se cargaría en la columna equivocada.
 */
export function fechaOperativaSanJuan(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora)
}

/** ISO → DD/MM/YYYY (como lo escribe y lo lee la empresa). */
export function fechaAr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso ?? '')
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
export const nombreDia = (d) => DIAS[d] ?? '—'

/** Texto libre de fecha ("29/07", "29/7/2026") → ISO, con el año de contexto. */
export function fechaDesdeTexto(texto, isoContexto) {
  const m = /(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/.exec(String(texto || ''))
  if (!m) return null
  const d = +m[1]
  const mes = +m[2]
  let anio = m[3] ? +m[3] : Number(String(isoContexto || '').slice(0, 4))
  if (anio < 100) anio += 2000
  if (!Number.isFinite(anio) || mes < 1 || mes > 12 || d < 1 || d > 31) return null
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Normaliza el texto entrante: saca la mención al bot, acentos y espacios repetidos. */
export function limpiar(texto) {
  return normalizarClave(String(texto ?? '').replace(/@[\w.\-]+/g, ' ')).toLowerCase()
}

/**
 * Parsea la intención. Se matchea por RAÍCES, no por conjugación: el dueño escribe con
 * voseo ("confirmá", "cancelá", "marcá") y un verbo exacto no alcanza.
 * Devuelve `{ tipo, ... }`; `null` si el texto no es para este skill.
 */
export function parsearComando(texto, { isoContexto } = {}) {
  const t = limpiar(texto)
  if (!t) return null

  // Cierre y navegación primero: son cortos y no deben quedar tapados por otra regla.
  if (/\bcancel/.test(t)) return { tipo: 'cancelar' }
  if (/\b(volv|atras|back)/.test(t)) return { tipo: 'volver' }
  // OJO con el \b: un `\b` DESPUÉS de un grupo de prefijos exige que la palabra termine
  // ahí, y entonces "revisá"/"presente" no matchean. Los prefijos van sin cierre; las
  // palabras que sí son completas ("ver", "ok") se piden aparte.
  if (/\b(revis|previ|resum)/.test(t) || /\bver\b/.test(t)) return { tipo: 'revisar' }
  if (/\bconfirm/.test(t)) {
    return { tipo: 'confirmar', sobrescribir: /\b(sobrescrib|sobreescrib|pisa|igual)/.test(t) }
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

/** Marca de un trabajador por NÚMERO de la lista mostrada. */
function parsearMarca(t) {
  const estado = /\b(ausent|falt|no vino|no fue)/.test(t) ? ESTADO.AUSENTE
    : /\b(parcial|medi|hora)/.test(t) ? ESTADO.PARCIAL
      : (/\b(present|vino)/.test(t) || /\bok\b/.test(t)) ? ESTADO.PRESENTE : null
  if (!estado) return null
  const nums = [...t.matchAll(/(\d{1,3}(?:[.,]\d{1,2})?)/g)].map((m) => m[1])
  if (!nums.length) return null
  // El primer entero es el número de la lista; si es parcial, el siguiente son las horas.
  const indice = Number(String(nums[0]).replace(',', '.'))
  if (!Number.isInteger(indice)) return null
  const horas = estado === ESTADO.PARCIAL ? (nums[1] ?? null) : null
  if (estado === ESTADO.PARCIAL && horas == null) return { tipo: 'marcar', indice, estado, faltan_horas: true }
  return { tipo: 'marcar', indice, estado, horas }
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
    '`5 parcial 5,5` — jornada parcial en horas',
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
    const m = marcas?.[p.nombre_clave]
    const marcado = m ? `${ICONO[m.estado] ?? ''} ${etiquetaEstado(m, jornada)}` : '· sin marcar'
    const ya = p.actual?.escrita ? `  _(cargado: ${p.actual.valor_crudo})_` : ''
    l.push(`${i + 1}. ${p.nombre_original.trim()} — ${marcado}${ya}`)
  })
  l.push('', '`todos presentes` · `3 ausente` · `5 parcial 5,5` · `revisar` · `cancelar`')
  return l.join('\n')
}

function etiquetaEstado(m, jornada) {
  if (m.estado === ESTADO.AUSENTE) return 'ausente (0)'
  if (m.estado === ESTADO.PARCIAL) return `parcial (${String(m.horas ?? '?').replace('.', ',')} h)`
  return `presente (${jornada?.horas ?? '?'} h)`
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
    `Presentes: **${r.presentes}** · Ausentes: **${r.ausentes}** · Parciales: **${r.parciales}**`,
    `Celdas nuevas: **${r.celdas_nuevas}** · Celdas que se modifican: **${r.celdas_modificadas}**`,
  ]
  if (r.sin_cambio) l.push(`Sin cambio (ya estaban igual): ${r.sin_cambio}`)

  const modifica = plan.items.filter((i) => i.accion === 'modifica')
  if (modifica.length) {
    l.push('', '⚠️ **Estas celdas YA tenían otro valor:**')
    for (const i of modifica) {
      l.push(`· ${i.nombre_original.trim()} — ${i.celda_a1.split('!')[1]}: \`${i.valor_actual}\` → \`${String(i.horas_nuevas).replace('.', ',')}\``)
    }
  }
  const bloq = plan.items.filter((i) => i.bloqueada)
  if (bloq.length) {
    l.push('', '🚫 **No se van a tocar** (y hay que resolverlas a mano en la planilla):')
    for (const i of bloq) l.push(`· ${(i.nombre_original ?? i.nombre_clave).trim()} — ${motivoLegible(i)}`)
  }
  l.push('', r.a_escribir === 0
    ? '_No hay nada para escribir._ `cancelar` para cerrar.'
    : (plan.requiere_confirmacion_sobrescritura
      ? 'Escribí `confirmar sobrescribir` para pisar los valores existentes, `volver` para corregir o `cancelar`.'
      : 'Escribí `confirmar`, `volver` para corregir o `cancelar`.'))
  return l.join('\n')
}

function motivoLegible(i) {
  switch (i.bloqueada) {
    case 'celda_con_formula': return `la celda tiene una fórmula (\`${i.formula_actual}\`): son horas extra calculadas`
    case 'texto_no_numerico': return `la celda tiene texto (\`${i.valor_actual}\`), no un número de horas`
    case 'jornada_requiere_manual': return 'este día no tiene jornada completa de referencia: cargá horas con `parcial`'
    case 'trabajador_no_en_bloque': return 'no figura en esta obra para esta fecha en JORNALES'
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
    `Presentes: ${r.presentes}`,
    `Ausentes: ${r.ausentes}`,
    `Jornada parcial: ${r.parciales}`,
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

export function renderDenegado() {
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
