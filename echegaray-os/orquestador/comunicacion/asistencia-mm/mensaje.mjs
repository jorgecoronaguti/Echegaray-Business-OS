// LA INTERFAZ. Acá vive toda la UX de asistencia dentro de Mattermost, y nada más:
// este archivo es PURO — no toca red, ni base, ni la planilla, ni el reloj.
//
// POR QUÉ ES UN ARCHIVO APARTE Y PURO. La pantalla web anterior se rechazó, y con ella se
// fue la única forma que había de mirar la interfaz antes de publicarla. Un módulo puro que
// devuelve el JSON exacto que se le manda a Mattermost se puede testear entero, comparar
// contra el contrato de attachments y revisar leyéndolo, sin encender nada.
//
// LAS DOS DECISIONES DE DISEÑO QUE MANDAN
//
// 1. EL DEFAULT ES EL CASO NORMAL. Toda la cuadrilla viene presente con la jornada del día.
//    El jefe que no tiene novedades aprieta Registrar y listo: dos toques desde que se
//    publica el mensaje. Cada excepción cuesta lo suyo, el caso normal no cuesta nada.
//
// 2. EL DEFAULT ES SILENCIOSO Y LA EXCEPCIÓN GRITA. Un presente con jornada completa se
//    escribe con un guion al margen; un ausente, una jornada partida o una celda que no se
//    puede tocar llevan marca visible y el motivo escrito al lado. Se lee de un vistazo en
//    la pantalla de un celular, parado en la obra, que es donde se usa.
//
// FORMATO. Nada de negritas ni cursivas dentro del texto de los attachments: Mattermost le
// aplica la conversión de compatibilidad con Slack y los asteriscos se transforman de
// maneras distintas según la versión. La jerarquía se hace con `title`, `fields` y sangría,
// que son estructura del propio attachment y se renderizan igual en todas las versiones.
//
// LÍMITES REALES DE MATTERMOST QUE ESTE ARCHIVO RESPETA (documentación oficial):
//   · un diálogo admite HASTA 5 elementos → la excepción entra exacta con los 5 del pedido;
//   · `title` de un diálogo: máximo 24 caracteres;
//   · `display_name` de un elemento: 24 · `help_text`: 150 · `placeholder` de texto: 150.
// Los tres se recortan acá, no se confía en que el dato de origen sea corto.

import { fmt } from '../../lib/horas-extra.mjs'
import { fechaEnPalabras, fechaLegible } from './fechas.mjs'
import { extrasDe, novedadDe } from './mapeo.mjs'

/** URL pública que Mattermost llama al apretar una acción. Configurable por entorno. */
export const URL_ACCION_DEFAULT =
  process.env.ASISTENCIA_ACCION_URL || 'https://chat.ecsas.com.ar/asistencia/accion'

/** Barra de color del attachment: es el estado del formulario de un vistazo. */
export const COLOR = Object.freeze({
  FECHA: '#1e325c',
  OBRA: '#166de0',
  CUADRILLA: '#166de0',
  CONFIRMADO: '#3db887',
  AVISO: '#f5ab00',
  CANCELADO: '#8b8d94',
})

/** Marca al margen de cada persona. Silenciosa para lo normal, visible para la excepción. */
export const MARCA = Object.freeze({
  NORMAL: '–',
  EXCEPCION: '⚠️',
  BLOQUEADA: '🔒',
  SIN_CAMBIO: '➖',
  SIN_HORAS: '❓',
})

/** Topes del contrato de Mattermost. No son estéticos: pasarlos rompe el render. */
const TOPE = Object.freeze({
  TITULO_DIALOGO: 24, NOMBRE_ELEMENTO: 24, AYUDA: 150, PLACEHOLDER: 150,
  OPCION: 60, ELEMENTOS_DIALOGO: 5, ACLARACION: 500,
})

const recortar = (s, max) => {
  const v = String(s ?? '').trim()
  return v.length <= max ? v : `${v.slice(0, max - 1)}…`
}

const boton = (id, name, context, { url, style } = {}) => ({
  id, name, type: 'button',
  ...(style ? { style } : {}),
  integration: { url: url ?? URL_ACCION_DEFAULT, context },
})

const menu = (id, name, options, context, { url } = {}) => ({
  id, name, type: 'select', options,
  integration: { url: url ?? URL_ACCION_DEFAULT, context },
})

/** Jornada del día en una frase. Si no se conoce, se dice — no se inventa un número. */
function textoJornada(jornada) {
  if (jornada?.feriado) return `feriado${jornada.etiqueta ? ` (${jornada.etiqueta})` : ''} · 0 h`
  if (jornada?.requiere_manual || jornada?.horas == null) return 'jornada sin definir para ese día'
  return `jornada ${fmt(jornada.horas)} h`
}

// ── 1 · MENSAJE INICIAL ─────────────────────────────────────────────────────────
// Fecha arriba (hoy por defecto) y el desplegable de obras abajo. Dos attachments y no
// uno: en un celular, una fila con tres botones y un desplegable queda apretada, y
// separarlos le pone título propio a cada decisión.

/**
 * @param {{fecha:string, obras:Array<{clave:string,nombre:string,cantidad?:number}>,
 *          jornada:object, url?:string, aviso?:string|null}} o
 * @returns {{message:string, props:{attachments:Array<object>}}}
 */
export function mensajeInicial({ fecha, obras = [], jornada, url, aviso = null } = {}) {
  const attachments = [{
    fallback: `Asistencia — ${fechaLegible(fecha)}`,
    color: COLOR.FECHA,
    title: 'Asistencia',
    text: `${fechaEnPalabras(fecha)} · ${textoJornada(jornada)}`,
    actions: [
      boton('fecha_hoy', 'Hoy', { paso: 'fecha', valor: 'hoy' }, { url }),
      boton('fecha_ayer', 'Ayer', { paso: 'fecha', valor: 'ayer' }, { url }),
      boton('fecha_otra', 'Otra fecha…', { paso: 'fecha', valor: 'otra' }, { url }),
    ],
  }, attachmentObras(obras, { url, aviso })]
  if (aviso && obras.length) attachments.push(attachmentAviso(aviso))
  return { message: '', props: { attachments } }
}

/** El desplegable de obras del día, o la explicación de por qué no hay ninguna. */
function attachmentObras(obras, { url, aviso }) {
  if (!obras.length) {
    return {
      fallback: 'Sin obras ese día', color: COLOR.AVISO, title: 'Obra',
      text: aviso ?? 'La planilla no tiene ninguna obra con gente para esa fecha. Probá otro día.',
      actions: [boton('cancelar', 'Cerrar', { paso: 'cancelar' }, { url })],
    }
  }
  const opciones = obras.map((o) => ({
    text: recortar(o.cantidad ? `${o.nombre} (${o.cantidad})` : o.nombre, TOPE.OPCION),
    value: o.clave,
  }))
  return {
    fallback: 'Elegí la obra', color: COLOR.OBRA, title: 'Obra',
    text: obras.length === 1 ? 'Una sola obra ese día.' : `${obras.length} obras ese día.`,
    actions: [
      menu('obra', 'Elegí la obra', opciones, { paso: 'obra' }, { url }),
      boton('cancelar', 'Cancelar', { paso: 'cancelar' }, { url }),
    ],
  }
}

// ── 2 · MENSAJE DE CUADRILLA ────────────────────────────────────────────────────

/**
 * Cómo se muestra una persona: la excepción se ve, el caso normal no molesta.
 *
 * El nombre se recorta para MOSTRAR. En la planilla real hay nombres con espacio final
 * ("Quiroga Sebastian ") y ese espacio, tal cual, deja un guion suelto en el medio de la
 * línea. No se altera nada al escribir: la identidad de escritura es la `ref` estructural,
 * y el nombre original sigue intacto en el plan y en la auditoría.
 */
function lineaPersona(persona, novedad, jornada) {
  const nombre = String(persona.nombre ?? '').trim()
  if (persona.bloqueado) return `${MARCA.BLOQUEADA} ${nombre} — ${persona.bloqueado}`
  if (novedad.sin_cambio) {
    return `${MARCA.SIN_CAMBIO} ${nombre} — ya cargado: ${persona.carga_actual ?? 'sin cambio'}`
  }
  if (novedad.presente !== true) {
    return `${MARCA.EXCEPCION} ${nombre} — no vino${novedad.motivo ? ` · ${etiquetaMotivo(novedad.motivo)}` : ''}`
  }
  if (novedad.horas == null) return `${MARCA.SIN_HORAS} ${nombre} — faltan las horas`
  const extra = extrasDe({ horas: novedad.horas, jornada })
  const horas = extra > 0 ? `${fmt(novedad.horas)} h (${fmt(extra)} extra)` : `${fmt(novedad.horas)} h`
  const completa = !novedad.motivo && !extra
    && jornada?.horas != null && Number(novedad.horas) === Number(jornada.horas)
  const marca = completa ? MARCA.NORMAL : MARCA.EXCEPCION
  const cola = [horas, novedad.motivo ? etiquetaMotivo(novedad.motivo) : null,
    novedad.obra_realizada ? `en ${novedad.obra_realizada}` : null].filter(Boolean).join(' · ')
  return `${marca} ${nombre} — ${cola}`
}

/** Clave de motivo → algo legible, sin depender del catálogo (que es inyectado). */
const etiquetaMotivo = (clave) => String(clave ?? '').replace(/_/g, ' ')

/** El resumen como `fields`: Mattermost los apila solos en el celular. */
function camposResumen(resumen) {
  const campos = [
    { title: 'Presentes', value: String(resumen.presentes ?? 0), short: true },
    { title: 'Ausentes', value: String(resumen.ausentes ?? 0), short: true },
    { title: 'Horas', value: `${fmt(resumen.horas ?? 0)} h`, short: true },
  ]
  if (resumen.extra > 0) campos.push({ title: 'Extra', value: `${fmt(resumen.extra)} h`, short: true })
  if (resumen.sin_cambio > 0) campos.push({ title: 'Sin cambio', value: String(resumen.sin_cambio), short: true })
  if (resumen.bloqueadas > 0) campos.push({ title: 'No se tocan', value: String(resumen.bloqueadas), short: true })
  return campos
}

/**
 * La cuadrilla entera, ya precargada, con el resumen y los dos botones que cierran el caso.
 *
 * @param {{fecha:string, obra:{clave:string,nombre:string}, jornada:object,
 *          personal:Array<object>, marcas?:object, resumen:object, url?:string,
 *          aviso?:string|null, confirmacion?:{texto:string}|null}} o
 */
export function mensajeCuadrilla({
  fecha, obra, jornada, personal = [], marcas = {}, resumen = {}, url,
  aviso = null, confirmacion = null,
} = {}) {
  const lineas = personal.map((p) => lineaPersona(p, novedadDe(p, marcas), jornada))
  const principal = {
    fallback: `Asistencia ${obra?.nombre ?? ''} — ${fechaLegible(fecha)}`,
    color: confirmacion ? COLOR.AVISO : COLOR.CUADRILLA,
    title: `${obra?.nombre ?? 'Obra'} — ${fechaEnPalabras(fecha)}`,
    text: [`${textoJornada(jornada)}`, '', ...lineas].join('\n'),
    fields: camposResumen(resumen),
    actions: accionesCuadrilla({ personal, url, confirmacion }),
  }
  const attachments = [principal]
  if (resumen.sin_horas > 0) {
    attachments.push(attachmentAviso(
      `Falta indicar las horas de ${resumen.sin_horas} persona(s): ese día la planilla no define la jornada. Marcalas una por una antes de registrar.`))
  }
  if (aviso) attachments.push(attachmentAviso(aviso))
  return { message: '', props: { attachments } }
}

/** Desplegable de excepción + Registrar + Cancelar. Tres acciones, sin ruido. */
function accionesCuadrilla({ personal, url, confirmacion }) {
  const marcables = personal.filter((p) => !p.bloqueado)
  const acciones = []
  if (marcables.length) {
    acciones.push(menu('excepcion', 'Marcar excepción',
      marcables.map((p) => ({ text: recortar(p.nombre, TOPE.OPCION), value: p.ref })),
      { paso: 'excepcion' }, { url }))
  }
  acciones.push(boton('registrar', confirmacion ? 'Registrar igual' : 'Registrar',
    confirmacion ? { paso: 'registrar', confirmar: true } : { paso: 'registrar' },
    { url, style: confirmacion ? 'danger' : 'primary' }))
  acciones.push(boton('cancelar', 'Cancelar', { paso: 'cancelar' }, { url }))
  return acciones
}

// ── 3 · MENSAJE CONFIRMADO ──────────────────────────────────────────────────────
// Sin acciones a propósito: un post confirmado no se puede volver a apretar.

/**
 * @param {{resumen:object, celdas:Array<object>, actor:{username?:string,userId?:string},
 *          fecha?:string, obra?:{nombre?:string}, pestana?:string|null,
 *          columna?:string|null, nota?:string|null}} o
 */
export function mensajeConfirmado({
  resumen = {}, celdas = [], actor = {}, fecha, obra, pestana = null, columna = null, nota = null,
} = {}) {
  const quien = actor?.username ? `@${actor.username}` : (actor?.userId ?? 'alguien')
  const donde = [pestana, columna ? `columna ${columna}` : null].filter(Boolean).join(' · ')
  const cuerpo = [
    `${obra?.nombre ?? 'Obra'} — ${fechaEnPalabras(fecha)}`,
    celdas.length
      ? `${celdas.length} ${celdas.length === 1 ? 'celda escrita' : 'celdas escritas'}${donde ? ` en ${donde}` : ''}.`
      : (nota ?? 'No había nada para cambiar: la planilla ya decía lo mismo.'),
    '',
    ...detalleCeldas(celdas),
    '',
    `Cargó ${quien}.`,
  ].filter((l) => l !== undefined)
  return {
    message: '',
    props: {
      attachments: [{
        fallback: `Asistencia registrada — ${fechaLegible(fecha)}`,
        color: COLOR.CONFIRMADO,
        title: 'Asistencia registrada',
        text: cuerpo.join('\n'),
        fields: camposResumen({
          presentes: resumen.presentes ?? 0,
          ausentes: resumen.ausentes ?? 0,
          horas: resumen.horas_total ?? resumen.horas ?? 0,
          extra: resumen.horas_extra ?? resumen.extra ?? 0,
        }),
      }],
    },
  }
}

/** Qué se escribió, persona por persona. Se corta a 25: más que eso no se lee en el celular. */
function detalleCeldas(celdas) {
  const visibles = celdas.slice(0, 25).map((c) => {
    const extra = c.extra > 0 ? ` (${fmt(c.extra)} extra)` : ''
    return `${MARCA.NORMAL} ${String(c.nombre ?? '').trim()} — ${fmt(c.horas)} h${extra} · ${c.celda}`
  })
  if (celdas.length > 25) visibles.push(`… y ${celdas.length - 25} más.`)
  return visibles
}

// ── 4 · MENSAJES DE CIERRE Y AVISO ──────────────────────────────────────────────

/** Un aviso suelto, sin acciones. Se usa para colgar una advertencia del formulario. */
function attachmentAviso(texto) {
  return { fallback: texto, color: COLOR.AVISO, text: texto }
}

/** El formulario se cerró sin escribir nada. Terminal: sin acciones. */
export function mensajeCancelado({ motivo = 'Carga cancelada. No se escribió nada en la planilla.' } = {}) {
  return {
    message: '',
    props: { attachments: [{ fallback: motivo, color: COLOR.CANCELADO, title: 'Carga cancelada', text: motivo }] },
  }
}

// ── 5 · DIÁLOGOS ────────────────────────────────────────────────────────────────

/**
 * Diálogo de excepción de UNA persona: presente · horas · motivo · otra obra · aclaración.
 *
 * Son exactamente 5 elementos y el tope de Mattermost es 5. Entran los cinco del pedido,
 * sin recortar ninguno. No queda margen para un sexto: si mañana hace falta otro campo,
 * hay que sacar uno o partir el diálogo en dos.
 *
 * @returns {{trigger_id:string, url:string, dialog:object}} listo para POST a
 *          `/api/v4/actions/dialogs/open`
 */
export function dialogoExcepcion({
  persona = {}, motivos = [], obras = [], jornada, triggerId, url, estado = {}, contexto = null,
} = {}) {
  const n = persona.novedad ?? persona
  const elementos = [
    {
      display_name: recortar('¿Trabajó?', TOPE.NOMBRE_ELEMENTO),
      name: 'presente', type: 'radio',
      options: [{ text: 'Sí, trabajó', value: 'si' }, { text: 'No vino', value: 'no' }],
      default: n.presente === false ? 'no' : 'si',
    },
    {
      display_name: recortar('Horas', TOPE.NOMBRE_ELEMENTO),
      name: 'horas', type: 'text', optional: true,
      default: n.horas == null ? '' : fmt(n.horas),
      placeholder: recortar(jornada?.horas != null ? `${fmt(jornada.horas)}` : '8', TOPE.PLACEHOLDER),
      help_text: recortar('Horas trabajadas. Si no vino, 0. Si hizo de más, poné el total: el extra lo separa el sistema.', TOPE.AYUDA),
    },
    elementoSelect({
      nombre: 'motivo', etiqueta: 'Motivo', valor: n.motivo,
      opciones: (motivos || []).map((m) => ({
        text: recortar(m.etiqueta ?? m.clave, TOPE.OPCION), value: m.clave,
      })),
      ayuda: 'Obligatorio si no vino o si hizo menos que la jornada.',
    }),
    elementoSelect({
      nombre: 'obra_realizada', etiqueta: 'Estuvo en otra obra', valor: n.obra_realizada,
      opciones: (obras || []).map((o) => ({ text: recortar(o.nombre, TOPE.OPCION), value: o.clave })),
      ayuda: 'Sólo si trabajó, pero en otra obra de la planilla.',
    }),
    {
      display_name: recortar('Aclaración', TOPE.NOMBRE_ELEMENTO),
      name: 'aclaracion', type: 'textarea', optional: true,
      default: n.aclaracion ?? '',
      max_length: TOPE.ACLARACION,
      placeholder: recortar('Una línea. Obligatoria en accidente de trabajo.', TOPE.PLACEHOLDER),
    },
  ].filter(Boolean)
  return armarDialogo({
    triggerId, url, callbackId: 'asistencia.excepcion', estado, contexto,
    titulo: persona.nombre ?? 'Excepción',
    intro: `${persona.nombre ?? ''} · ${textoJornada(jornada)}`.trim(),
    elementos, submit: 'Guardar',
  })
}

/** Diálogo de "Otra fecha…". Un solo campo, en el formato que la gente escribe acá. */
export function dialogoFecha({ fecha, triggerId, url, estado = {}, contexto = null } = {}) {
  return armarDialogo({
    triggerId, url, callbackId: 'asistencia.fecha', estado, contexto,
    titulo: 'Otra fecha',
    intro: 'No se puede cargar una fecha futura.',
    submit: 'Usar esta fecha',
    elementos: [{
      display_name: recortar('Fecha', TOPE.NOMBRE_ELEMENTO),
      name: 'fecha', type: 'text',
      default: fecha ? fechaLegible(fecha) : '',
      placeholder: recortar('30/07/2026', TOPE.PLACEHOLDER),
      help_text: recortar('Día/mes/año. También se acepta 2026-07-30.', TOPE.AYUDA),
    }],
  })
}

/**
 * Un desplegable del diálogo. Devuelve `null` cuando no hay opciones: Mattermost rechaza
 * un `select` sin `options` ni `data_source`, y un campo vacío tampoco le sirve a nadie.
 * `default` se omite si no hay valor previo — mandar `null` invalida el diálogo entero.
 */
function elementoSelect({ nombre, etiqueta, valor, opciones, ayuda }) {
  if (!opciones?.length) return null
  return {
    display_name: recortar(etiqueta, TOPE.NOMBRE_ELEMENTO),
    name: nombre, type: 'select', optional: true,
    options: opciones,
    ...(valor ? { default: String(valor) } : {}),
    help_text: recortar(ayuda, TOPE.AYUDA),
  }
}

/** Casco común de los diálogos: recorta el título y sella el tope de 5 elementos. */
function armarDialogo({ triggerId, url, callbackId, estado, contexto, titulo, intro, elementos, submit }) {
  if (elementos.length > TOPE.ELEMENTOS_DIALOGO) {
    throw new Error(`dialogo ${callbackId}: Mattermost admite ${TOPE.ELEMENTOS_DIALOGO} elementos y llegaron ${elementos.length}`)
  }
  return {
    trigger_id: triggerId ?? '',
    url: url ?? URL_ACCION_DEFAULT,
    dialog: {
      callback_id: callbackId,
      title: recortar(titulo, TOPE.TITULO_DIALOGO),
      introduction_text: intro ?? '',
      elements: elementos,
      submit_label: submit,
      notify_on_cancel: false,
      state: JSON.stringify({ ...estado, ...(contexto ? { contexto } : {}) }),
    },
  }
}
