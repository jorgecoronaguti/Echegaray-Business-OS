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
import { fechaEnPalabras, fechaLegible } from '../../lib/asistencia-servicio/fechas.mjs'
import { extrasDe, novedadDe } from '../../lib/asistencia-servicio/mapeo.mjs'
import { urlAccionDeEntorno } from '../secreto-compartido.mjs'

/**
 * URL pública que Mattermost llama al apretar una acción, CON el secreto de la integración.
 * Configurable por entorno. Sin el secreto los botones existen pero el servidor los deniega:
 * por eso lo arma `urlAccionDeEntorno` y no una concatenación suelta acá.
 */
export const URL_ACCION_DEFAULT = urlAccionDeEntorno()

/** Barra de color del attachment: es el estado del formulario de un vistazo. */
export const COLOR = Object.freeze({
  FECHA: '#1e325c',
  OBRA: '#166de0',
  CUADRILLA: '#166de0',
  CONFIRMADO: '#3db887',
  AVISO: '#f5ab00',
  CANCELADO: '#8b8d94',
})

/**
 * Tipo de novedad. Son los tres ámbitos del núcleo (`lib/asistencia-motivos.mjs`) hechos
 * visibles: cuál se elige decide QUÉ formulario se abre y qué motivos entran en él.
 */
export const TIPO = Object.freeze({
  AUSENCIA: 'ausencia', // no vino: 0 horas, motivo de ausencia
  PARCIAL: 'parcial', // vino e hizo menos que la jornada: motivo de jornada parcial
  EXTRA: 'extra', // vino e hizo de más: sin motivo, el extra lo calcula el núcleo
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
      // Los ids van SIN guión bajo a propósito: viajan dentro de la URL de la API de
      // Mattermost (`/api/v4/posts/{post}/actions/{id}`) y ese segmento sólo acepta
      // alfanuméricos. Con `fecha_hoy` la ruta no matcheaba y el cliente mostraba
      // "Sorry, we could not find the page" sin que el pedido llegara nunca acá.
      boton('fechahoy', 'Hoy', { paso: 'fecha', valor: 'hoy' }, { url }),
      boton('fechaayer', 'Ayer', { paso: 'fecha', valor: 'ayer' }, { url }),
      boton('fechaotra', 'Otra fecha…', { paso: 'fecha', valor: 'otra' }, { url }),
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
  aviso = null, confirmacion = null, sinAcciones = false,
} = {}) {
  const lineas = personal.map((p) => lineaPersona(p, novedadDe(p, marcas), jornada))
  const principal = {
    fallback: `Asistencia ${obra?.nombre ?? ''} — ${fechaLegible(fecha)}`,
    color: confirmacion ? COLOR.AVISO : COLOR.CUADRILLA,
    title: `${obra?.nombre ?? 'Obra'} — ${fechaEnPalabras(fecha)}`,
    text: [`${textoJornada(jornada)}`, '', ...lineas].join('\n'),
    fields: camposResumen(resumen),
    // Sin acciones cuando el formulario ya no existe: un botón que el post sigue mostrando y
    // que sólo puede contestar «este formulario ya se cerró» es peor que ningún botón.
    actions: sinAcciones ? [] : accionesCuadrilla({ personal, url, confirmacion }),
  }
  const attachments = [principal]
  if (resumen.sin_horas > 0) {
    attachments.push(attachmentAviso(
      `Falta indicar las horas de ${resumen.sin_horas} persona(s): ese día la planilla no define la jornada. Marcalas una por una antes de registrar.`))
  }
  if (aviso) attachments.push(attachmentAviso(aviso))
  return { message: '', props: { attachments } }
}

/**
 * TRES desplegables de excepción + Registrar + Cancelar.
 *
 * POR QUÉ TRES Y NO UNO (31/07). Antes había uno solo —"Marcar excepción"— y el diálogo
 * preguntaba "¿Trabajó?" con el CATÁLOGO ENTERO de motivos. Se podía elegir "trabajó 5 horas ·
 * Faltó con aviso" y recién al guardar saltaba el error: la validación estaba bien, la
 * experiencia mal.
 *
 * Un diálogo de Mattermost es ESTÁTICO: no hay evento de cambio, no se puede refrescar la lista
 * de motivos cuando el jefe cambia una respuesta. Así que la pregunta se mueve ANTES: se elige
 * el TIPO de novedad y se abre un formulario que ya sólo puede producir combinaciones válidas.
 * Son los mismos tres ámbitos que el núcleo ya distingue (ausencia · parcial · extra), ahora
 * visibles en la pantalla.
 */
function accionesCuadrilla({ personal, url, confirmacion }) {
  const marcables = personal.filter((p) => !p.bloqueado)
  const acciones = []
  if (marcables.length) {
    const gente = marcables.map((p) => ({ text: recortar(p.nombre, TOPE.OPCION), value: p.ref }))
    acciones.push(menu('novino', 'No vino', gente, { paso: 'excepcion', tipo: TIPO.AUSENCIA }, { url }))
    acciones.push(menu('menoshoras', 'Hizo menos horas', gente, { paso: 'excepcion', tipo: TIPO.PARCIAL }, { url }))
    acciones.push(menu('horasextra', 'Hizo horas extra', gente, { paso: 'excepcion', tipo: TIPO.EXTRA }, { url }))
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
 *          columna?:string|null}} o
 */
export function mensajeConfirmado({
  resumen = {}, celdas = [], actor = {}, fecha, obra, pestana = null, columna = null,
} = {}) {
  const quien = actor?.username ? `@${actor.username}` : (actor?.userId ?? 'alguien')
  const donde = [pestana, columna ? `columna ${columna}` : null].filter(Boolean).join(' · ')
  const cuerpo = [
    `${obra?.nombre ?? 'Obra'} — ${fechaEnPalabras(fecha)}`,
    celdas.length
      ? `${celdas.length} ${celdas.length === 1 ? 'celda escrita' : 'celdas escritas'}${donde ? ` en ${donde}` : ''}.`
      : 'No había nada para cambiar: la planilla ya decía lo mismo.',
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
  persona = {}, motivos = [], obras = [], jornada, triggerId, url, estado = {},
  tipo = TIPO.PARCIAL,
} = {}) {
  const n = persona.novedad ?? persona
  const opcionesMotivo = (motivos || []).map((m) => ({
    text: recortar(m.etiqueta ?? m.clave, TOPE.OPCION), value: m.clave,
  }))
  const aclaracion = (placeholder) => ({
    display_name: recortar('Aclaración', TOPE.NOMBRE_ELEMENTO),
    name: 'aclaracion', type: 'textarea', optional: true,
    default: n.aclaracion ?? '',
    max_length: TOPE.ACLARACION,
    placeholder: recortar(placeholder, TOPE.PLACEHOLDER),
  })

  // Un formulario por tipo. Cada uno pregunta SÓLO lo que corresponde a su ámbito, así no
  // existe la combinación inválida: no hay dónde elegirla.
  const elementos = tipo === TIPO.AUSENCIA
    ? [
      elementoSelect({
        nombre: 'motivo', etiqueta: 'Motivo de la falta', valor: n.motivo, opciones: opcionesMotivo,
        ayuda: 'Por qué no vino. Las horas del día quedan en 0.', obligatorio: true,
      }),
      aclaracion('Una línea. Obligatoria en accidente, accidente in itinere, licencia especial y «Otro».'),
    ]
    : tipo === TIPO.EXTRA
      ? [
        elementoHoras({ n, jornada, tipo }),
        aclaracion('Opcional: para qué se quedó.'),
      ]
      : [
        elementoHoras({ n, jornada, tipo }),
        elementoSelect({
          nombre: 'motivo', etiqueta: 'Motivo', valor: n.motivo, opciones: opcionesMotivo,
          ayuda: 'Por qué hizo menos que la jornada.', obligatorio: true,
        }),
        elementoSelect({
          nombre: 'obra_realizada', etiqueta: 'Estuvo en otra obra', valor: n.obra_realizada,
          opciones: (obras || []).map((o) => ({ text: recortar(o.nombre, TOPE.OPCION), value: o.clave })),
          ayuda: 'Sólo si esas horas las hizo en otra obra de la planilla.',
        }),
        aclaracion('Una línea. Obligatoria en accidente, accidente in itinere, licencia especial y «Otro».'),
      ]

  return armarDialogo({
    triggerId, url, callbackId: 'asistencia.excepcion', estado: { ...estado, tipo },
    titulo: recortar(persona.nombre ?? 'Excepción', TOPE.TITULO_DIALOGO),
    intro: `${persona.nombre ?? ''} · ${textoJornada(jornada)}`.trim(),
    elementos: elementos.filter(Boolean),
    submit: 'Guardar',
  })
}

/**
 * Las horas, como DESPLEGABLE con los valores posibles de ese tipo — no como texto libre.
 *
 * Es la otra mitad de "que no se pueda elegir mal": en «hizo menos» sólo aparecen valores por
 * debajo de la jornada, y en «hizo horas extra» sólo por encima. Así no existe el 5 con un
 * motivo de ausencia, ni el 9 con un motivo de jornada parcial, ni el 26 de un dedazo.
 *
 * Cuando la planilla NO define la jornada del día (sábado, o un día sin calibrar) no hay contra
 * qué armar la lista: se cae a un campo de texto. Inventar una jornada para poder ofrecer
 * opciones sería fabricar el dato que falta.
 */
function elementoHoras({ n, jornada, tipo }) {
  const j = Number.isFinite(jornada?.horas) && !jornada?.requiere_manual ? Number(jornada.horas) : null
  const esExtra = tipo === TIPO.EXTRA
  const aMano = (ayuda) => ({
    display_name: recortar('Horas', TOPE.NOMBRE_ELEMENTO),
    name: 'horas', type: 'text',
    default: n.horas == null ? '' : fmt(n.horas),
    placeholder: recortar('8', TOPE.PLACEHOLDER),
    help_text: recortar(ayuda, TOPE.AYUDA),
  })
  if (j == null) return aMano('Horas trabajadas. Ese día la planilla no define la jornada.')
  const valores = []
  if (esExtra) for (let h = j + 0.5; h <= j + 6; h += 0.5) valores.push(h)
  else for (let h = 0.5; h < j; h += 0.5) valores.push(h)
  const opciones = valores.map((h) => ({ text: `${fmt(h)} h`, value: fmt(h) }))
  // JORNADA 0 h —un feriado en el que igual se trabajó— deja la lista VACÍA, y un `select`
  // sin opciones no lo publica Mattermost: el diálogo entero no abría y el jefe leía «no se
  // pudo abrir el formulario», sin manera de cargar ese día. Se cae al campo a mano, que es
  // lo mismo que se hace cuando la jornada no se conoce.
  if (!opciones.length) return aMano('Horas trabajadas. La jornada de ese día es 0 h.')
  const previo = n.horas == null ? null : fmt(n.horas)
  return {
    display_name: recortar('Horas trabajadas', TOPE.NOMBRE_ELEMENTO),
    name: 'horas', type: 'select', options: opciones,
    ...(previo && opciones.some((o) => o.value === previo) ? { default: previo } : {}),
    help_text: recortar(esExtra
      ? `La jornada del día es ${fmt(j)} h: elegí el TOTAL. El extra lo separa el sistema.`
      : `La jornada del día es ${fmt(j)} h. Elegí cuántas hizo.`, TOPE.AYUDA),
  }
}

/** Diálogo de "Otra fecha…". Un solo campo, en el formato que la gente escribe acá. */
export function dialogoFecha({ fecha, triggerId, url, estado = {} } = {}) {
  return armarDialogo({
    triggerId, url, callbackId: 'asistencia.fecha', estado,
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
function elementoSelect({ nombre, etiqueta, valor, opciones, ayuda, obligatorio = false }) {
  if (!opciones?.length) return null
  // El `default` tiene que ESTAR entre las opciones: uno que no está invalida el diálogo
  // entero y no abre. Pasaba con la novedad precargada de un feriado («franco»), que no
  // pertenece a la lista de una jornada parcial.
  const previo = valor == null ? null : String(valor)
  return {
    display_name: recortar(etiqueta, TOPE.NOMBRE_ELEMENTO),
    name: nombre, type: 'select', optional: !obligatorio,
    options: opciones,
    ...(previo && opciones.some((o) => String(o.value) === previo) ? { default: previo } : {}),
    help_text: recortar(ayuda, TOPE.AYUDA),
  }
}

/** Casco común de los diálogos: recorta el título y sella el tope de 5 elementos. */
function armarDialogo({ triggerId, url, callbackId, estado, titulo, intro, elementos, submit }) {
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
      state: JSON.stringify(estado),
    },
  }
}
