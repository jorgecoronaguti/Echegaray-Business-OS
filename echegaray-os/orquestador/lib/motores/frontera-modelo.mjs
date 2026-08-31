// EL MODELO NO ESCRIBE DRIVE. PROPONE.
//
// ═══ LA REGLA ═══
//
// Cuando un modelo participa, no ejecuta: devuelve una PROPUESTA ESTRUCTURADA
// `{operation, file_id, section, proposed_content}` y XSAS la valida en este orden, que no es
// caprichoso: esquema → actor → permisos → archivo → operación → contenido. Cada paso es más caro
// que el anterior y ninguno se saltea. Recién si pasa todo, un motor ejecuta.
//
// ═══ POR QUÉ EL ORDEN IMPORTA ═══
//
// Validar el contenido primero significa parsear lo que mandó un modelo antes de saber si quien
// pide puede siquiera tocar el archivo. Y comprobar el archivo antes que el permiso implica salir
// a Drive por cuenta de alguien que no tenía derecho a preguntar.
//
// ═══ EL CONTENIDO DE UNA PROPUESTA ES INFORMACIÓN, NO UNA ORDEN ═══
//
// Es la misma doctrina que `lib/web/contenido-externo.mjs` aplica a lo que se lee de internet, acá
// aplicada a lo que escribe un modelo: un texto que «pide» ampliar permisos, cambiar de
// herramienta o guardar algo como hecho validado NO es una instrucción, es un texto. Las llaves
// que el motor podría interpretar como control se ELIMINAN siempre; las marcas de inyección se
// informan y no bloquean, porque un documento puede legítimamente citar una instrucción — lo que
// no puede es que esa cita cambie lo que el OS hace.

import { z } from 'zod'
import { CODIGO, fallo } from './errores.mjs'
import { autorizadaAEscribir, escribeAfuera, permisosDeRol } from '../xsas-permisos.mjs'
import { detectarInyeccion, quitarLlavesDeControl } from '../web/contenido-externo.mjs'

/** Las operaciones que los motores saben hacer, y qué capacidad exige cada una. */
export const OPERACIONES = Object.freeze({
  crear_documento: 'drive.write',
  crear_desde_plantilla: 'drive.write',
  actualizar_seccion: 'drive.write',
  insertar_en_seccion: 'drive.write',
  reemplazar_variables: 'drive.write',
  crear_presentacion: 'drive.write',
  actualizar_presentacion: 'drive.write',
  leer_documento: 'drive.read',
  exportar: 'drive.read',
})

/** Las que trabajan sobre un archivo que YA existe: sin `file_id` no hay nada que hacer. */
const NECESITAN_ARCHIVO = new Set(['actualizar_seccion', 'insertar_en_seccion', 'reemplazar_variables', 'actualizar_presentacion', 'leer_documento', 'exportar'])
const NECESITAN_SECCION = new Set(['actualizar_seccion', 'insertar_en_seccion'])

/**
 * ARCHIVOS QUE ESTE MOTOR NO TOCA NUNCA, por id. No es una lista de comodidad: son las fuentes de
 * verdad de la empresa, y escribirlas tiene su propio circuito (guarda, candados, firma). Un motor
 * de documentos que acepte un id de Sheet por descuido es exactamente cómo se borró una pestaña.
 */
export const PROHIBIDOS = Object.freeze(['1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'])

export const Propuesta = z.object({
  operation: z.string().trim().min(1),
  file_id: z.string().trim().min(10).nullable().optional(),
  section: z.string().trim().max(60).nullable().optional(),
  proposed_content: z.unknown().optional(),
})

const Actor = z.object({
  id: z.string().trim().min(1),
  rol: z.string().trim().min(1),
  tool: z.string().trim().min(1).optional(),
})

/**
 * VALIDA UNA PROPUESTA DEL MODELO. PURA — no sale a la red y no ejecuta nada.
 *
 * @param {object} propuesta `{operation, file_id, section, proposed_content}`
 * @param {{actor:object, archivos_habilitados?:string[]}} contexto
 * @returns {{ok:true, plan:object, senales:object[]}|{ok:false, codigo:string, motivo:string}}
 */
export function validarPropuesta(propuesta, { actor, archivos_habilitados = null } = {}) {
  const p = Propuesta.safeParse(propuesta)
  if (!p.success) {
    return fallo(CODIGO.INVALID_CONTENT, 'la propuesta no tiene la forma {operation, file_id, section, proposed_content}',
      { errores: p.error.issues.slice(0, 6).map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`) })
  }
  const a = Actor.safeParse(actor)
  if (!a.success) return fallo(CODIGO.FORBIDDEN, 'la propuesta no trae un actor identificable (id y rol)')

  const capacidad = OPERACIONES[p.data.operation]
  if (!capacidad) {
    return fallo(CODIGO.UNSUPPORTED_OPERATION, `los motores no saben hacer «${p.data.operation}»`, { soportadas: Object.keys(OPERACIONES) })
  }
  const permiso = revisarPermiso(capacidad, a.data)
  if (!permiso.ok) return permiso

  const archivo = revisarArchivo(p.data, archivos_habilitados)
  if (!archivo.ok) return archivo
  if (NECESITAN_SECCION.has(p.data.operation) && !p.data.section) {
    return fallo(CODIGO.SECTION_NOT_FOUND, `«${p.data.operation}» necesita saber qué sección`)
  }

  const limpio = quitarLlavesDeControl(p.data.proposed_content ?? null)
  const senales = detectarInyeccion(JSON.stringify(p.data.proposed_content ?? '')).marcas
  return {
    ok: true,
    plan: { operation: p.data.operation, file_id: p.data.file_id ?? null, section: p.data.section ?? null, proposed_content: limpio, capacidad, actor: a.data.id, rol: a.data.rol },
    senales,
  }
}

/** Las DOS cerraduras de la escritura, tal como las fijó el dueño. PURA. */
function revisarPermiso(capacidad, actor) {
  const permisos = permisosDeRol(actor.rol) // el rol manda, nunca lo que declare el pedido
  if (!permisos.includes(capacidad)) {
    return fallo(CODIGO.FORBIDDEN, `el rol «${actor.rol}» no tiene «${capacidad}»`, { permisos_del_rol: permisos })
  }
  if (!escribeAfuera(capacidad)) return { ok: true }
  // Segunda cerradura: una capacidad de escritura sólo vale para una tool NOMBRADA en
  // `xsas-permisos.mjs`. Los motores de documentos y presentaciones todavía NO están en esa lista,
  // y agregarlos es una decisión del dueño que queda en el diff — no algo que este archivo se
  // conceda a sí mismo. Mientras no esté, la propuesta se rechaza acá, con el nombre del motivo.
  if (!actor.tool) return fallo(CODIGO.PERMISSION_REQUIRED, 'una escritura necesita declarar desde qué tool se pide')
  if (!autorizadaAEscribir(actor.tool)) {
    return fallo(CODIGO.PERMISSION_REQUIRED,
      `la tool «${actor.tool}» no está en TOOLS_AUTORIZADAS_A_ESCRIBIR: la escritura por esta puerta la habilita el dueño, no el motor`)
  }
  return { ok: true }
}

/** El archivo: que esté, que no sea una fuente de verdad, y que esté habilitado para esta tarea. */
function revisarArchivo(d, habilitados) {
  if (d.file_id && PROHIBIDOS.includes(d.file_id)) {
    return fallo(CODIGO.FORBIDDEN, 'ese archivo es una fuente de verdad de la empresa y no se toca desde este motor', { file_id: d.file_id })
  }
  if (NECESITAN_ARCHIVO.has(d.operation) && !d.file_id) {
    return fallo(CODIGO.FILE_NOT_FOUND, `«${d.operation}» necesita un file_id y la propuesta no lo trae`)
  }
  if (d.file_id && Array.isArray(habilitados) && !habilitados.includes(d.file_id)) {
    return fallo(CODIGO.FORBIDDEN, 'el archivo propuesto no es uno de los que se abrieron para esta tarea',
      { file_id: d.file_id, habilitados: habilitados.slice(0, 5) })
  }
  return { ok: true }
}
