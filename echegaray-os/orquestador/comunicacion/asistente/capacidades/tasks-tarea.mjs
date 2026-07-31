// "ANOTAME QUE TENGO QUE LLAMAR AL CONTADOR EL VIERNES" → una tarea REAL en Google Tasks.
//
// LA TRAMPA DEL VENCIMIENTO. La API de Tasks recibe el `due` en RFC3339 UTC pero guarda
// SÓLO EL DÍA: la hora se descarta del lado de Google. Dos consecuencias que este archivo
// trata explícitamente:
//   · si se manda el instante crudo, "el viernes a las 21" (21:00-03:00 = sábado 00:00Z)
//     queda vencida el SÁBADO. Por eso se convierte a la fecha de PARED argentina primero.
//   · si la persona dijo una hora, se le avisa que Tasks no la guarda. Prometer una hora que
//     el sistema tira a la basura es la clase de mentira chica que se descubre tarde.
//
// UNA TAREA DUPLICADA NO ES GRAVE, ES RUIDO — y el ruido es lo que hace que la lista de
// pendientes deje de mirarse. Mismo título y mismo día ⇒ se devuelve la que ya está.

import {
  CAPACIDAD, ERROR, errorAsistente, resultadoOk, resultadoError, zGoogleTarea,
} from '../contratos.mjs'
import { paredAR, formatearAR } from '../tiempo.mjs'
import {
  clasificarErrorGoogle, googlePropioDisponible, permiteEfectoExterno, errorSinCuenta, errorCuentaAjena,
} from '../google-cliente.mjs'

const LISTA_DEFECTO = '@default'
const dosDig = (n) => String(n).padStart(2, '0')
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()

/** Instante ISO → el DÍA de pared argentino ("2026-07-31"), que es lo único que Tasks guarda. */
function diaAR(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const p = paredAR(d)
  return { dia: `${p.y}-${dosDig(p.m)}-${dosDig(p.d)}`, conHora: p.hh !== 0 || p.mm !== 0 }
}

/**
 * La lista donde va la tarea. `@default` sin preguntar nada; cualquier otra se resuelve
 * contra las listas reales del usuario — por id o por nombre. Una lista que no existe se
 * dice, no se reemplaza por la default en silencio (la tarea aparecería donde nadie la busca).
 */
async function resolverLista(google, pedida) {
  if (!pedida || pedida === LISTA_DEFECTO) return { id: LISTA_DEFECTO }
  const listas = (await google.tasksLists()) || []
  const objetivo = norm(pedida)
  const hit = listas.find((l) => l.id === pedida || norm(l.title) === objetivo)
  if (hit) return { id: hit.id, titulo: hit.title }
  return { error: errorAsistente(
    ERROR.NO_ENCONTRADO,
    `No tenés una lista de tareas llamada "${pedida}". Tus listas son: ${listas.map((l) => l.title).join(', ') || '(ninguna)'}.`,
  ) }
}

/** ¿Ya existe una tarea con este título y este vencimiento en la lista? */
async function tareaYaExistente(google, { titulo, dia, lista }) {
  const tareas = (await google.tasksList({ tasklist: lista, includeCompleted: false, max: 100 })) || []
  const t = norm(titulo)
  return tareas.find((x) => norm(x.title) === t && String(x.due ?? '').slice(0, 10) === (dia ?? '')) ?? null
}

function textoCreada({ titulo, vence, conHora }) {
  const partes = [`Listo. Anoté "${titulo}"`]
  partes[0] += vence ? ` para el ${formatearAR(vence, { conHora: false })}.` : ' en tus tareas.'
  if (vence && conHora) partes.push('Google Tasks guarda sólo el día, no la hora.')
  return partes.join(' ')
}

export const capacidad = {
  id: CAPACIDAD.TASKS_TAREA_CREAR,
  nombre: 'Crear una tarea en Google Tasks',
  descripcion: 'anotarte un pendiente en tus tareas de Google, con vencimiento si me lo decís',
  version: '1.0.0',
  orden: 40,
  permisos: ['tasks.write'],
  efectoExterno: true,
  ejemplos: ['anotame llamar al contador el viernes', 'agregá a mis tareas pedir el certificado de obra'],
  entrada: zGoogleTarea,
  habilitada: (ctx) => googlePropioDisponible(ctx, ctx?.googleDeps),

  async ejecutar(params, ctx = {}) {
    const p = zGoogleTarea.safeParse(params)
    if (!p.success) {
      return resultadoError(CAPACIDAD.TASKS_TAREA_CREAR, errorAsistente(
        ERROR.DATO_FALTANTE, '¿Qué anoto? Decime la tarea en una frase.', p.error.message,
      ))
    }
    const { titulo, notas, vence, lista } = p.data
    if (!ctx.google) return resultadoError(CAPACIDAD.TASKS_TAREA_CREAR, errorSinCuenta())
    if (!permiteEfectoExterno(ctx.google)) {
      return resultadoError(CAPACIDAD.TASKS_TAREA_CREAR, errorCuentaAjena(ctx.google))
    }
    const v = diaAR(vence)

    try {
      const dest = await resolverLista(ctx.google, lista)
      if (dest.error) return resultadoError(CAPACIDAD.TASKS_TAREA_CREAR, dest.error)

      const ya = await tareaYaExistente(ctx.google, { titulo, dia: v?.dia ?? '', lista: dest.id })
      if (ya) {
        return resultadoOk(
          CAPACIDAD.TASKS_TAREA_CREAR,
          `Esa tarea ya estaba anotada${v ? ` para el ${formatearAR(vence, { conHora: false })}` : ''}. No dupliqué nada.`,
          { tarea: { id: ya.id, titulo, vence: ya.due ?? null, enlace: null }, duplicado: true },
        )
      }

      const r = await ctx.google.taskCreate({
        title: titulo,
        notes: notas ?? undefined,
        // El día de pared AR: `taskCreate` le agrega el T00:00:00.000Z que Tasks espera.
        due: v?.dia ?? undefined,
        tasklist: dest.id,
      })
      if (!r?.id) {
        return resultadoError(CAPACIDAD.TASKS_TAREA_CREAR, errorAsistente(
          ERROR.DEFINITIVO, 'Google aceptó el pedido pero no me devolvió la tarea. No te la doy por creada: revisá tus tareas.',
          JSON.stringify(r ?? null).slice(0, 200),
        ))
      }
      return resultadoOk(
        CAPACIDAD.TASKS_TAREA_CREAR,
        textoCreada({ titulo, vence, conHora: v?.conHora }),
        // Tasks no devuelve enlace público a una tarea: se deja null en vez de inventar una URL.
        { tarea: { id: r.id, titulo, vence: r.due ?? null, enlace: null }, duplicado: false },
      )
    } catch (e) {
      return resultadoError(CAPACIDAD.TASKS_TAREA_CREAR, clasificarErrorGoogle(e, { que: 'tus tareas' }))
    }
  },
}
