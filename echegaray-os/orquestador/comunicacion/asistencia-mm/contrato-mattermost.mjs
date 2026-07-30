// EL CONTRATO DE MATTERMOST, ESCRITO COMO CÓDIGO.
//
// POR QUÉ EXISTE. Un attachment mal formado no da error: Mattermost publica el post y el
// bloque interactivo simplemente NO APARECE. El jefe de obra ve un mensaje mudo y nadie se
// entera de por qué. Un `select` sin `options`, un `default` que no está entre las opciones,
// un diálogo con 6 elementos o un `display_name` de 30 caracteres fallan así: en silencio.
//
// Estas reglas NO se inventaron: salen de la documentación oficial de mensajes interactivos
// y de diálogos interactivos (elementos ≤ 5 por diálogo; `title` y `display_name` ≤ 24;
// `help_text` ≤ 150; `placeholder` ≤ 150 en texto y ≤ 3000 en textarea y select).
//
// Lo único propio es el techo de acciones por attachment: la documentación NO declara un
// máximo, así que acá se fija uno de diseño (5) por legibilidad en un celular. Es un
// presupuesto de UX, no un límite de la plataforma, y está marcado como tal.
//
// Puro y sin dependencias: se puede llamar antes de publicar cualquier cosa.

export const TOPE = Object.freeze({
  TITULO_DIALOGO: 24, NOMBRE_ELEMENTO: 24, AYUDA: 150,
  PLACEHOLDER_TEXTO: 150, PLACEHOLDER_LARGO: 3000,
  CALLBACK: 300, NOMBRE_ELEMENTO_CLAVE: 300,
  ELEMENTOS_DIALOGO: 5,
  ACCIONES_POR_ATTACHMENT: 5, // presupuesto propio de legibilidad, no un límite de MM
})

const TIPOS_ACCION = new Set(['button', 'select'])
const ESTILOS = new Set(['default', 'primary', 'success', 'good', 'warning', 'danger'])
const TIPOS_ELEMENTO = new Set(['text', 'textarea', 'select', 'bool', 'radio'])
const CON_OPCIONES = new Set(['select', 'radio'])

const esTexto = (v) => typeof v === 'string' && v.trim() !== ''

/** ¿Sobrevive al viaje por HTTP sin perder nada? `undefined` desaparece en silencio. */
function serializable(valor, ruta, fallas) {
  if (valor === undefined) { fallas.push(`${ruta}: undefined (se pierde al serializar)`); return }
  if (valor === null || typeof valor !== 'object') return
  if (Array.isArray(valor)) {
    valor.forEach((v, i) => serializable(v, `${ruta}[${i}]`, fallas))
    return
  }
  for (const [k, v] of Object.entries(valor)) serializable(v, `${ruta}.${k}`, fallas)
}

function validarOpciones(opciones, ruta, fallas) {
  if (!Array.isArray(opciones) || !opciones.length) {
    fallas.push(`${ruta}: un desplegable necesita al menos una opción`)
    return []
  }
  const valores = []
  opciones.forEach((o, i) => {
    if (!esTexto(o?.text)) fallas.push(`${ruta}[${i}].text vacío`)
    if (!esTexto(o?.value)) fallas.push(`${ruta}[${i}].value vacío`)
    else valores.push(o.value)
  })
  return valores
}

function validarAccion(a, ruta, fallas, ids) {
  if (!esTexto(a?.id)) fallas.push(`${ruta}.id vacío`)
  else if (ids.has(a.id)) fallas.push(`${ruta}.id repetido: ${a.id}`)
  else ids.add(a.id)
  if (!esTexto(a?.name)) fallas.push(`${ruta}.name vacío`)
  if (!TIPOS_ACCION.has(a?.type)) fallas.push(`${ruta}.type inválido: ${a?.type}`)
  if (a?.style != null && !ESTILOS.has(a.style)) fallas.push(`${ruta}.style inválido: ${a.style}`)
  if (!esTexto(a?.integration?.url)) fallas.push(`${ruta}.integration.url vacío`)
  if (a?.integration?.context != null && typeof a.integration.context !== 'object') {
    fallas.push(`${ruta}.integration.context tiene que ser un objeto`)
  }
  if (a?.type === 'select') {
    if (!a.data_source) validarOpciones(a.options, `${ruta}.options`, fallas)
  } else if (a?.options != null) {
    fallas.push(`${ruta}: un botón no lleva options`)
  }
}

/**
 * Valida el `{message, props:{attachments}}` que se le manda a Mattermost.
 * @returns {{ok:boolean, fallas:string[]}}
 */
export function validarMensaje(msg) {
  const fallas = []
  if (typeof msg?.message !== 'string') fallas.push('message tiene que ser una cadena')
  const att = msg?.props?.attachments
  if (!Array.isArray(att) || !att.length) {
    fallas.push('props.attachments tiene que ser una lista con al menos un attachment')
    return { ok: false, fallas }
  }
  const ids = new Set()
  att.forEach((a, i) => {
    const ruta = `attachments[${i}]`
    if (!a || typeof a !== 'object') { fallas.push(`${ruta} no es un objeto`); return }
    if (!esTexto(a.fallback)) fallas.push(`${ruta}.fallback vacío (es lo que se lee en la notificación)`)
    if (a.text != null && typeof a.text !== 'string') fallas.push(`${ruta}.text tiene que ser una cadena`)
    if (a.fields != null) validarCampos(a.fields, `${ruta}.fields`, fallas)
    if (a.actions != null) {
      if (!Array.isArray(a.actions)) fallas.push(`${ruta}.actions tiene que ser una lista`)
      else {
        if (a.actions.length > TOPE.ACCIONES_POR_ATTACHMENT) {
          fallas.push(`${ruta}.actions: ${a.actions.length} acciones, el presupuesto es ${TOPE.ACCIONES_POR_ATTACHMENT}`)
        }
        a.actions.forEach((ac, j) => validarAccion(ac, `${ruta}.actions[${j}]`, fallas, ids))
      }
    }
  })
  serializable(msg, 'mensaje', fallas)
  return { ok: fallas.length === 0, fallas }
}

function validarCampos(fields, ruta, fallas) {
  if (!Array.isArray(fields)) { fallas.push(`${ruta} tiene que ser una lista`); return }
  fields.forEach((f, i) => {
    if (!esTexto(f?.title)) fallas.push(`${ruta}[${i}].title vacío`)
    if (typeof f?.value !== 'string') fallas.push(`${ruta}[${i}].value tiene que ser una cadena`)
    if (f?.short != null && typeof f.short !== 'boolean') fallas.push(`${ruta}[${i}].short tiene que ser booleano`)
  })
}

function validarElemento(e, ruta, fallas, nombres) {
  if (!TIPOS_ELEMENTO.has(e?.type)) { fallas.push(`${ruta}.type inválido: ${e?.type}`); return }
  if (!esTexto(e?.name)) fallas.push(`${ruta}.name vacío`)
  else if (nombres.has(e.name)) fallas.push(`${ruta}.name repetido: ${e.name}`)
  else nombres.add(e.name)
  if (!esTexto(e?.display_name)) fallas.push(`${ruta}.display_name vacío`)
  else if (e.display_name.length > TOPE.NOMBRE_ELEMENTO) {
    fallas.push(`${ruta}.display_name: ${e.display_name.length} caracteres, el tope es ${TOPE.NOMBRE_ELEMENTO}`)
  }
  if (e.help_text != null && String(e.help_text).length > TOPE.AYUDA) {
    fallas.push(`${ruta}.help_text supera ${TOPE.AYUDA} caracteres`)
  }
  const topePlaceholder = e.type === 'textarea' || e.type === 'select' ? TOPE.PLACEHOLDER_LARGO : TOPE.PLACEHOLDER_TEXTO
  if (e.placeholder != null && String(e.placeholder).length > topePlaceholder) {
    fallas.push(`${ruta}.placeholder supera ${topePlaceholder} caracteres`)
  }
  validarDefault(e, ruta, fallas)
}

function validarDefault(e, ruta, fallas) {
  const valores = CON_OPCIONES.has(e.type) ? validarOpciones(e.options, `${ruta}.options`, fallas) : null
  if (e.default === undefined || e.default === null) return
  if (typeof e.default !== 'string' && typeof e.default !== 'boolean') {
    fallas.push(`${ruta}.default tiene que ser cadena o booleano`)
    return
  }
  if (valores && e.default !== '' && !valores.includes(e.default)) {
    fallas.push(`${ruta}.default «${e.default}» no está entre las opciones`)
  }
}

/**
 * Valida el `{trigger_id, url, dialog}` que se le manda a `/actions/dialogs/open`.
 * @returns {{ok:boolean, fallas:string[]}}
 */
export function validarDialogo(peticion) {
  const fallas = []
  if (!esTexto(peticion?.trigger_id)) fallas.push('trigger_id vacío')
  if (!esTexto(peticion?.url)) fallas.push('url vacía')
  const d = peticion?.dialog
  if (!d || typeof d !== 'object') { fallas.push('falta el dialog'); return { ok: false, fallas } }
  if (!esTexto(d.callback_id)) fallas.push('dialog.callback_id vacío')
  else if (d.callback_id.length > TOPE.CALLBACK) fallas.push(`dialog.callback_id supera ${TOPE.CALLBACK}`)
  if (!esTexto(d.title)) fallas.push('dialog.title vacío')
  else if (d.title.length > TOPE.TITULO_DIALOGO) {
    fallas.push(`dialog.title: ${d.title.length} caracteres, el tope es ${TOPE.TITULO_DIALOGO}`)
  }
  if (d.state != null && typeof d.state !== 'string') fallas.push('dialog.state tiene que ser una cadena')
  if (!Array.isArray(d.elements) || !d.elements.length) fallas.push('dialog.elements vacío')
  else if (d.elements.length > TOPE.ELEMENTOS_DIALOGO) {
    fallas.push(`dialog.elements: ${d.elements.length}, el tope de Mattermost es ${TOPE.ELEMENTOS_DIALOGO}`)
  } else {
    const nombres = new Set()
    d.elements.forEach((e, i) => validarElemento(e, `dialog.elements[${i}]`, fallas, nombres))
  }
  serializable(peticion, 'dialogo', fallas)
  return { ok: fallas.length === 0, fallas }
}
