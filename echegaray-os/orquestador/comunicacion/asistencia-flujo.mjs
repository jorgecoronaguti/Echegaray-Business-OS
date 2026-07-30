// SKILL `personal.registrar_asistencia` — la máquina de estados del flujo.
//
// Determinística de punta a punta: NO pasa por el Director IA ni por un especialista.
// Qué fila, qué columna y qué número se escriben lo decide código sobre la planilla
// leída, no un modelo. Un modelo acá sólo podría equivocarse más caro.
//
// Contrato: entra el texto del jefe de obra, sale el texto de respuesta (privado) y los
// eventos de auditoría ya emitidos. No conoce Mattermost (ni channel_id ni post_id): eso
// lo maneja el handler. No conoce celdas: eso lo maneja el adaptador de JORNALES.
//
// El cliente sólo manda NÚMEROS de la lista que está viendo. El orden de esas listas vive
// en la sesión (servidor) y la cuadrilla se RE-LEE de la planilla en cada paso, así un
// número nunca puede apuntar a un trabajador de otra obra ni a una fila corrida.
//
// Todas las dependencias con efecto (sesiones, permisos, auditoría, Sheets) entran
// inyectadas: por eso el flujo entero se prueba sin base y sin red.

import {
  contextoParaFecha, listarObrasPorFecha, listarPersonalPorObraYFecha, planificarAsistencia,
  registrarAsistencia, MOTIVO,
} from '../lib/tools/jornales-asistencia.mjs'
import { tienePermiso, PERMISO_ASISTENCIA_WRITE } from '../lib/asistencia-permisos.mjs'
import { crearAuditor, EVENTO, payloadConfirmacion, sanitizarError } from '../lib/asistencia-auditoria.mjs'
import { ESTADO, normalizarHoras } from '../lib/horas-extra.mjs'
import { responderConsulta, renderConsulta } from '../lib/asistencia-consultas.mjs'
import { SesionesPostgres, ESTADO_SESION, RECHAZO } from './asistencia-sesion.mjs'
import * as ui from './asistencia-ui.mjs'

/** Contenedor del estado de listas + marcas que se guarda en la sesión. */
const vacio = () => ({ obras: [], personal: [], marcas: {} })
const leerEstado = (s) => ({ ...vacio(), ...(s?.marcas ?? {}) })
const diaDe = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay()
const fechaIso = (s) => (s?.fecha_operativa instanceof Date
  ? s.fecha_operativa.toISOString().slice(0, 10)
  : String(s?.fecha_operativa ?? '').slice(0, 10))

/**
 * Punto de entrada del skill.
 * @param {object} o
 * @param {{query:Function, withTx:Function}} [o.port]  pool del OS (para los defaults)
 * @param {object} o.google           cliente de Google (inyectado)
 * @param {{plataforma_user_id:string, plataforma_username?:string}} o.actor
 * @param {string} o.texto
 * @param {object} [o.sesiones]       repo de sesiones (memoria en tests)
 * @param {Function} [o.permisos]     verificador de permiso
 * @param {Function} [o.auditar]      emisor de eventos de auditoría
 * @returns {Promise<{texto:string, privado:true, estado:string}>}
 */
export async function manejarAsistencia(o = {}) {
  const { port, google, actor, texto, correlationId, ahora = new Date() } = o
  const d = {
    google,
    actor,
    sesiones: o.sesiones ?? new SesionesPostgres(port),
    permisos: o.permisos ?? ((a) => tienePermiso(port, { plataformaUserId: a, permiso: PERMISO_ASISTENCIA_WRITE })),
    auditar: o.auditar ?? crearAuditor(port, { correlationId }),
  }
  const hoy = ui.fechaOperativaSanJuan(ahora)
  const intencion = ui.parsearComando(texto, { isoContexto: hoy })
  if (!intencion) return resp(ui.renderAyuda(), 'ayuda')

  const permiso = await d.permisos(actor?.plataforma_user_id)
  if (!permiso.ok) {
    await d.auditar(EVENTO.DENIED, {
      status: 'denied', mattermost_user_id: actor?.plataforma_user_id ?? null,
      mattermost_username: actor?.plataforma_username ?? null,
      error_code: permiso.motivo, modo_permisos: permiso.modo ?? null,
    })
    return resp(ui.renderDenegado(permiso.motivo), 'denegado')
  }
  d.modo_permisos = permiso.modo ?? null

  try {
    switch (intencion.tipo) {
      case 'iniciar':
      case 'fecha': return await iniciar(d, intencion.fecha ?? hoy)
      case 'obra': return await elegirObra(d, intencion.indice)
      case 'todos_presentes': return await marcarTodos(d)
      case 'marcar': return await marcarUno(d, intencion)
      case 'revisar': return await revisar(d)
      case 'confirmar': return await confirmar(d, intencion)
      case 'volver': return await volver(d)
      case 'cancelar': return await cancelar(d)
      default: return resp(ui.renderAyuda(), 'ayuda')
    }
  } catch (e) {
    // El detalle va a la auditoría, NUNCA al chat: un error del driver de Postgres publicaría
    // nombres de tablas internas en Mattermost. El jefe necesita saber que no se hizo, no por qué.
    await d.auditar(EVENTO.FAILED, { status: 'failed', error_message_sanitized: sanitizarError(e) })
    return resp(ui.renderError({ mensaje: 'hubo un problema del lado del sistema. No se escribió nada' }), 'error')
  }
}

const resp = (texto, estado) => ({ texto, privado: true, estado })

/** Traduce un fallo de lectura en el mensaje exacto que corresponde. */
function respuestaLectura(r, fecha) {
  if (r.motivo === MOTIVO.FECHA_NO_EN_JORNALES) {
    return resp(ui.renderFechaInexistente({ fecha, pestana: r.pestana }), 'fecha_inexistente')
  }
  if (r.motivo === MOTIVO.PESTANA_NO_ENCONTRADA) {
    return resp(ui.renderError({ mensaje: `no encontré la pestaña de obreros del año de ${ui.fechaAr(fecha)} en JORNALES` }), 'sin_pestana')
  }
  return resp(ui.renderError({ mensaje: `no pude leer JORNALES (${r.motivo})` }), 'error_lectura')
}

/** Abre (o reabre) el formulario para una fecha y muestra las obras de ese bloque. */
async function iniciar(d, fecha) {
  await d.auditar(EVENTO.STARTED, {
    status: 'started', fecha_operativa: fecha, modo_permisos: d.modo_permisos ?? null,
    mattermost_user_id: d.actor?.plataforma_user_id, mattermost_username: d.actor?.plataforma_username,
  })
  const obras = await listarObrasPorFecha(d.google, { fecha })
  await d.auditar(EVENTO.SHEET_READ, {
    status: obras.ok ? 'ok' : 'sin_datos', fecha_operativa: fecha,
    sheet_name: obras.pestana ?? null, error_code: obras.ok ? null : obras.motivo,
  })
  if (!obras.ok) return respuestaLectura(obras, fecha)

  const s = await d.sesiones.abrir({
    plataformaUserId: d.actor?.plataforma_user_id, plataformaUsername: d.actor?.plataforma_username,
    channelId: d.actor?.channel_id, rootPostId: d.actor?.root_post_id, fechaOperativa: fecha,
  })
  await d.sesiones.guardarMarcas(s.id, { ...vacio(), obras: obras.obras.map((x) => x.clave) })
  await d.sesiones.guardarContexto(s.id, { fechaOperativa: fecha, pestana: obras.pestana })
  return resp(ui.renderObras({
    fecha, diaSemana: diaDe(fecha), obras: obras.obras, jornada: obras.jornada, pestana: obras.pestana,
  }), 'obras')
}

/** Sesión abierta + su estado, o la respuesta de rechazo ya renderizada. */
async function conSesion(d) {
  const r = await d.sesiones.abiertaDe({ plataformaUserId: d.actor?.plataforma_user_id })
  if (!r.ok) {
    const texto = r.motivo === RECHAZO.VENCIDA ? ui.renderVencida()
      : 'No tenés un registro de asistencia abierto. Escribí `asistencia` para empezar.'
    return { fallo: resp(texto, r.motivo) }
  }
  return { sesion: r.sesion, estado: leerEstado(r.sesion) }
}

const faltaObra = () => resp('Primero elegí la obra (`obra 1`).', 'falta_obra')

const cuadrilla = (r, marcas) => ui.renderCuadrilla({
  fecha: r.fecha, diaSemana: r.dia_semana, obra: r.obra, personal: r.personal, marcas, jornada: r.jornada,
})

/** Relee la cuadrilla de la sesión: la planilla pudo cambiar entre dos mensajes. */
const cuadrillaDe = (d, sesion) =>
  listarPersonalPorObraYFecha(d.google, { fecha: fechaIso(sesion), claveObra: sesion.clave_obra })

/** Elige la obra por número y muestra la cuadrilla con lo que ya está cargado. */
async function elegirObra(d, indice) {
  const { fallo, sesion, estado } = await conSesion(d)
  if (fallo) return fallo
  const clave = estado.obras[indice - 1]
  if (!clave) return resp(`No existe la obra ${indice}. Elegí una de la lista o escribí \`asistencia\` de nuevo.`, 'obra_invalida')

  const r = await listarPersonalPorObraYFecha(d.google, { fecha: fechaIso(sesion), claveObra: clave })
  if (!r.ok) {
    if (r.motivo === MOTIVO.SIN_PERSONAL) return resp(ui.renderSinPersonal({ obra: r.obra, fecha: fechaIso(sesion) }), 'sin_personal')
    return respuestaLectura(r, fechaIso(sesion))
  }
  await d.auditar(EVENTO.SHEET_READ, {
    status: 'ok', fecha_operativa: fechaIso(sesion), obra_normalizada: clave, sheet_name: r.pestana,
  })
  await d.sesiones.guardarContexto(sesion.id, { claveObra: clave, pestana: r.pestana, spreadsheetId: r.ctx.spreadsheet_id })
  await d.sesiones.guardarMarcas(sesion.id, { ...estado, personal: r.personal.map((p) => p.nombre_clave), marcas: {} })
  return resp(cuadrilla(r, {}), 'cuadrilla')
}

/** `todos presentes`: marca la cuadrilla entera y deja que se corrijan las excepciones. */
async function marcarTodos(d) {
  const { fallo, sesion, estado } = await conSesion(d)
  if (fallo) return fallo
  if (!sesion.clave_obra) return faltaObra()
  const r = await cuadrillaDe(d, sesion)
  if (!r.ok) return respuestaLectura(r, fechaIso(sesion))
  const marcas = {}
  for (const p of r.personal) marcas[p.nombre_clave] = { estado: ESTADO.PRESENTE, normales: null, extras: null }
  await d.sesiones.guardarMarcas(sesion.id, { ...estado, personal: r.personal.map((p) => p.nombre_clave), marcas })
  return resp(cuadrilla(r, marcas), 'cuadrilla')
}

/**
 * Marca UNO por número de lista: `3 ausente`, `3 tarde 7`, `5 parcial 5,5 extra 2`,
 * `1 extra 2`. Las horas normales de `tarde` y `parcial` son obligatorias: el sistema no
 * tiene forma de saber cuántas horas trabajó alguien que llegó tarde.
 */
async function marcarUno(d, intencion) {
  const { fallo, sesion, estado } = await conSesion(d)
  if (fallo) return fallo
  if (!sesion.clave_obra) return faltaObra()
  const clave = estado.personal[intencion.indice - 1]
  if (!clave) return resp(`No existe el número ${intencion.indice} en la lista.`, 'indice_invalido')
  const previa = estado.marcas?.[clave] ?? null

  // `1 extra 2`: sólo cambia las horas extra de una marca que ya existe.
  if (intencion.solo_extras) {
    if (!previa) return resp(`Primero marcá el estado del ${intencion.indice} (por ejemplo \`${intencion.indice} presente\`).`, 'sin_estado_previo')
    const v = normalizarHoras(intencion.extras, { permitirVacio: true })
    if (!v.ok) return resp('Las horas extra tienen que ser un número (ej. `1 extra 2` o `1 extra 1,5`).', 'extras_invalidas')
    return guardarYMostrar(d, sesion, estado, { ...estado.marcas, [clave]: { ...previa, extras: v.horas } })
  }

  let normales = intencion.normales ?? null
  if (intencion.estado === ESTADO.TARDE || intencion.estado === ESTADO.PARCIAL) {
    const v = normalizarHoras(normales)
    if (!v.ok) {
      const ej = intencion.estado === ESTADO.TARDE ? `${intencion.indice} tarde 7` : `${intencion.indice} parcial 5,5`
      return resp(`Necesito las horas trabajadas: \`${ej}\`.`, 'faltan_horas')
    }
    normales = v.horas
  }
  // Las extras se conservan si ya estaban marcadas y el mensaje no las menciona.
  let extras = previa?.extras ?? null
  if (intencion.extras != null) {
    const v = normalizarHoras(intencion.extras, { permitirVacio: true })
    if (!v.ok) return resp('Las horas extra tienen que ser un número (ej. `1 extra 2`).', 'extras_invalidas')
    extras = v.horas
  }
  if (intencion.estado === ESTADO.AUSENTE) extras = null // un ausente no lleva extras
  return guardarYMostrar(d, sesion, estado, {
    ...estado.marcas, [clave]: { estado: intencion.estado, normales, extras },
  })
}

/** Guarda las marcas y vuelve a mostrar la cuadrilla releída de la planilla. */
async function guardarYMostrar(d, sesion, estado, marcas) {
  const r = await cuadrillaDe(d, sesion)
  if (!r.ok) return respuestaLectura(r, fechaIso(sesion))
  await d.sesiones.guardarMarcas(sesion.id, { ...estado, marcas })
  return resp(cuadrilla(r, marcas), 'cuadrilla')
}

/** Construye el plan contra la planilla FRESCA. No escribe. */
async function planDe(d, sesion, estado) {
  const ctx = await contextoParaFecha(d.google, {
    spreadsheetId: sesion.spreadsheet_id ?? undefined,
    pestana: sesion.pestana ?? undefined,
    fecha: fechaIso(sesion),
  })
  if (!ctx.ok) return { fallo: respuestaLectura(ctx, fechaIso(sesion)) }
  const marcas = Object.entries(estado.marcas ?? {}).map(([nombre_clave, m]) => ({
    nombre_clave, estado: m.estado, normales: m.normales, extras: m.extras,
  }))
  if (!marcas.length) return { fallo: resp('Todavía no marcaste a nadie. `todos presentes` o `3 ausente`.', 'sin_marcas') }
  const plan = planificarAsistencia(ctx, { claveObra: sesion.clave_obra, marcas, actor: d.actor })
  const o = (await listarObrasPorFecha(d.google, { pestana: sesion.pestana, fecha: fechaIso(sesion) }))
    ?.obras?.find((x) => x.clave === sesion.clave_obra) ?? null
  plan.obra_etiqueta = o?.etiqueta ?? sesion.clave_obra
  plan.obra_original = o ? [o.cliente_original, o.obra_original].filter(Boolean).join(' · ') : null
  await d.sesiones.guardarPlan(sesion.id, plan)
  return { plan }
}

async function revisar(d) {
  const { fallo, sesion, estado } = await conSesion(d)
  if (fallo) return fallo
  if (!sesion.clave_obra) return faltaObra()
  const r = await planDe(d, sesion, estado)
  if (r.fallo) return r.fallo
  await d.auditar(EVENTO.PREVIEWED, {
    status: 'previewed', fecha_operativa: r.plan.fecha, sheet_name: r.plan.pestana,
    obra_normalizada: r.plan.clave_obra, idempotency_key: r.plan.idempotency_key,
    cantidad_trabajadores: r.plan.resumen.trabajadores,
  })
  return resp(ui.renderPreview(r.plan), 'preview')
}

async function volver(d) {
  const { fallo, sesion, estado } = await conSesion(d)
  if (fallo) return fallo
  if (!sesion.clave_obra) {
    const obras = await listarObrasPorFecha(d.google, { pestana: sesion.pestana, fecha: fechaIso(sesion) })
    if (!obras.ok) return respuestaLectura(obras, fechaIso(sesion))
    return resp(ui.renderObras({
      fecha: obras.fecha, diaSemana: diaDe(obras.fecha), obras: obras.obras,
      jornada: obras.jornada, pestana: obras.pestana,
    }), 'obras')
  }
  const r = await cuadrillaDe(d, sesion)
  if (!r.ok) return respuestaLectura(r, fechaIso(sesion))
  return resp(cuadrilla(r, estado.marcas), 'cuadrilla')
}

/**
 * CONFIRMAR. Recalcula el plan contra la planilla fresca (el preview pudo quedar viejo),
 * cierra la sesión de forma atómica y de un solo uso, escribe en batch y audita.
 */
async function confirmar(d, { sobrescribir, reemplazar_formula } = {}) {
  const { fallo, sesion, estado } = await conSesion(d)
  if (fallo) return fallo
  if (!sesion.clave_obra) return faltaObra()
  // BASE DE LA CONCURRENCIA. Si el jefe revisó, se confirma EL PLAN QUE VIO — con las
  // huellas de celda de ese momento. Así, si alguien cargó una celda a mano entre el
  // preview y el confirmar, la relectura previa a la escritura lo detecta como conflicto
  // en vez de pisarlo. Sólo si confirmó sin revisar se planifica en el momento (y ahí la
  // protección es la confirmación explícita de sobrescritura).
  let plan = sesion.plan ?? null
  if (!plan) {
    const p = await planDe(d, sesion, estado)
    if (p.fallo) return p.fallo
    plan = p.plan
  }

  if (plan.requiere_confirmacion_sobrescritura && !sobrescribir) {
    return resp(ui.renderPreview(plan), 'requiere_sobrescritura')
  }
  // Reemplazar una fórmula que no se pudo descomponer necesita su propio sí.
  if (plan.requiere_confirmacion_formula && !reemplazar_formula) {
    return resp(ui.renderPreview(plan), 'requiere_confirmacion_formula')
  }

  // Nada que escribir NO es un registro. Antes se cerraba la sesión, se quemaba la clave y
  // se contestaba "✅ Asistencia registrada · Celdas actualizadas: 0" — un éxito por una
  // carga que nunca ocurrió, y de paso la clave quedaba bloqueada para el intento de verdad.
  if (!plan.escribibles?.length) return resp(ui.renderPreview(plan), 'sin_cambios')

  // Un solo uso: si esta misma confirmación ya se ejecutó, no vuelve a mutar.
  const cierre = await d.sesiones.confirmar(sesion.id, { idempotencyKey: plan.idempotency_key })
  if (cierre.duplicado) return resp(ui.renderDuplicado({ plan }), 'duplicado')
  if (!cierre.ok) return resp(ui.renderVencida(), 'sesion_cerrada')

  await d.auditar(EVENTO.CONFIRMED, {
    status: 'confirmed', fecha_operativa: plan.fecha, sheet_name: plan.pestana,
    obra_normalizada: plan.clave_obra, idempotency_key: plan.idempotency_key, sesion_id: sesion.id,
  })

  // La API de Google no siempre devuelve un fallo: a veces TIRA (503, token vencido). Si esa
  // excepción subiera al catch general, la sesión quedaría 'confirmada' con la clave tomada y
  // la planilla vacía. Se convierte en el mismo fallo controlado que cierra la sesión.
  let resultado
  try {
    resultado = await registrarAsistencia(d.google, {
      plan,
      confirmarSobrescritura: Boolean(sobrescribir),
      confirmarReemplazoFormula: Boolean(reemplazar_formula),
    })
  } catch (e) {
    resultado = { ok: false, motivo: 'error_escribiendo', error: sanitizarError(e), celdas: [] }
  }
  const base = { actor: d.actor, plan, sesion, iniciadoEn: sesion.creado_at, confirmadoEn: new Date().toISOString() }
  if (!resultado.ok) return await fallaEscritura(d, { resultado, base, sesion, plan })

  await d.auditar(EVENTO.WRITTEN, payloadConfirmacion({ ...base, resultado, status: 'written' }))
  return resp(ui.renderExito({ plan, resultado, actor: d.actor }), 'escrito')
}

/** Cada modo de falla de la escritura tiene su mensaje y su evento. Nada se reporta como
 *  éxito, y un conflicto NO se reintenta solo: es funcional, no transitorio. */
async function fallaEscritura(d, { resultado, base, sesion, plan }) {
  if (resultado.motivo === MOTIVO.CONFLICTO_CONCURRENCIA) {
    await d.sesiones.cerrar(sesion.id, ESTADO_SESION.CONFLICTO)
    await d.auditar(EVENTO.CONFLICT, payloadConfirmacion({ ...base, resultado, status: 'conflict' }))
    return resp(ui.renderConflicto({ conflictos: resultado.conflictos }), 'conflicto')
  }
  // La escritura no entró: se cierra como FALLIDA, no como confirmada. Si quedara
  // 'confirmada', la clave de idempotencia seguiría tomada y el reintento del jefe recibiría
  // "esa carga ya estaba registrada" con las celdas de JORNALES vacías — para siempre.
  if (resultado.motivo === MOTIVO.PESTANA_PROTEGIDA) {
    await d.sesiones.cerrar(sesion.id, ESTADO_SESION.FALLIDA)
    await d.auditar(EVENTO.FAILED, payloadConfirmacion({ ...base, resultado, status: 'pestana_protegida' }))
    return resp(ui.renderPestanaProtegida({ pestana: plan.pestana }), 'protegida')
  }
  await d.sesiones.cerrar(sesion.id, ESTADO_SESION.FALLIDA)
  await d.auditar(EVENTO.FAILED, payloadConfirmacion({ ...base, resultado, status: 'failed' }))
  return resp(ui.renderError({ mensaje: String(resultado.motivo ?? 'error desconocido') }), 'fallo')
}

async function cancelar(d) {
  const r = await d.sesiones.abiertaDe({ plataformaUserId: d.actor?.plataforma_user_id })
  if (r.ok) {
    await d.sesiones.cerrar(r.sesion.id, ESTADO_SESION.CANCELADA)
    await d.auditar(EVENTO.CANCELLED, {
      status: 'cancelled', sesion_id: r.sesion.id, fecha_operativa: fechaIso(r.sesion),
    })
  }
  return resp(ui.renderCancelada(), 'cancelado')
}

/**
 * CONSULTAR asistencia u horas extra. Camino de sólo LECTURA: no abre sesión, no planifica
 * y no escribe nada — por eso no comparte la máquina de estados del registro.
 *
 * Sigue exigiendo identidad (queda auditado quién preguntó) y sigue respondiendo en
 * privado: la asistencia del personal no sale en un canal compartido ni cuando se consulta.
 */
export async function consultarAsistencia(o = {}) {
  const { port, google, actor, consulta, correlationId, ahora = new Date() } = o
  const permisos = o.permisos ?? ((a) => tienePermiso(port, { plataformaUserId: a, permiso: PERMISO_ASISTENCIA_WRITE }))
  const auditar = o.auditar ?? crearAuditor(port, { correlationId })

  const permiso = await permisos(actor?.plataforma_user_id)
  if (!permiso.ok) {
    await auditar(EVENTO.DENIED, {
      status: 'denied', operacion: 'consulta',
      mattermost_user_id: actor?.plataforma_user_id ?? null,
      mattermost_username: actor?.plataforma_username ?? null,
      error_code: permiso.motivo, modo_permisos: permiso.modo ?? null,
    })
    return resp(ui.renderDenegado(permiso.motivo), 'denegado')
  }

  try {
    const r = await responderConsulta(google, consulta, { ahora })
    await auditar(EVENTO.SHEET_READ, {
      status: r.ok ? 'ok' : 'sin_datos', operacion: 'consulta',
      tipo_consulta: consulta?.tipo ?? null, alcance: consulta?.alcance ?? null,
      fecha_operativa: r.datos?.desde ?? consulta?.fecha ?? null,
      sheet_name: r.datos?.pestana ?? null,
      modo_permisos: permiso.modo ?? null,
      mattermost_user_id: actor?.plataforma_user_id ?? null,
      mattermost_username: actor?.plataforma_username ?? null,
      error_code: r.ok ? null : r.motivo,
    })
    // El módulo de consultas ya trae el texto para los casos de error; el render completo
    // se arma sólo cuando hay datos.
    const texto = r.ok ? renderConsulta({ consulta, datos: r.datos }) : r.texto
    return resp(texto, r.ok ? 'consulta' : `consulta_${r.motivo}`)
  } catch (e) {
    await auditar(EVENTO.FAILED, { status: 'failed', operacion: 'consulta', error_message_sanitized: sanitizarError(e) })
    return resp(ui.renderError({ mensaje: sanitizarError(e) }), 'error')
  }
}
