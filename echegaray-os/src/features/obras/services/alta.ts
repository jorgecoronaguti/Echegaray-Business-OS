// EL ALTA DE OBRA EN PASOS — la definición de los pasos, y nada más.
//
// Vive separado de `actionsAlta.ts` porque un archivo `'use server'` sólo puede exportar funciones
// asíncronas: una constante como `PASOS` no puede salir de ahí. Además, así el orden de los pasos y
// la resolución de «¿en cuál estoy?» son puros y se prueban sin levantar Next ni Supabase.
//
// ═══ EL BORRADOR NO ES UN ESTADO NUEVO ═══
//
// El pedido decía «queda en borrador (`obra_canonica.estado = 'previo'`)». `previo` NO es un valor
// de `estado`: es la primera de las cinco ETAPAS. `estado` tiene desde el 19/08 un CHECK cerrado
// —`activa | pausada | cerrada`, ver `20260819T0300_estado_de_obra_es_un_dominio_cerrado.sql`— y un
// insert con `estado='previo'` lo rechaza la base. Son dos columnas distintas y la confusión estaba
// en el pedido, no en el código.
//
// Así que el borrador ES `etapa = 'previo'` con `estado = 'activa'`, y no se inventa un cuarto
// estado. Dos razones:
//
//   1. `previo` ya significa exactamente esto: *"sin baseline aprobado no se sale de 'previo'"*
//      (comentario de la migración fundacional). Una obra a medio preparar está, por definición, en
//      previo.
//   2. Un estado `borrador` obligaría a que cada consumidor —portafolio, ficha del cliente, chat,
//      vistas— aprendiera a esconderlo, y el que se olvide lo muestra igual. Peor: una obra
//      escondida es una obra que alguien vuelve a crear porque no la encontró.
//
// La obra a medio cargar SE VE en el portafolio, con su etapa en «Previo» y su checklist diciendo
// qué le falta. Eso es lo que hace que el borrador no se pierda.

import { z } from 'zod'

export const PASOS = [
  // Información y cliente van JUNTOS y no en dos pasos, aunque el pedido los listara separados:
  // son el mínimo con el que la fila puede existir (`crearObra` exige `cliente_id`, y una obra sin
  // cliente es una obra huérfana en el portafolio). Separarlos obligaría a cargar el nombre en algún
  // lado que no es la base hasta que llegue el cliente — que es justo el estado intermedio perdible
  // que «permitir borrador» existe para eliminar.
  { id: 'informacion', label: 'Información', ayuda: 'Nombre, cliente y dónde queda. Con esto la obra ya existe.' },
  { id: 'responsable', label: 'Responsable', ayuda: 'Quién responde por esta obra.' },
  { id: 'fechas', label: 'Fechas', ayuda: 'El plazo previsto. Vacío es una respuesta válida.' },
  { id: 'contrato', label: 'Contrato', ayuda: 'Lo contratado con el cliente. Sólo lo ve Administración.' },
  { id: 'drive', label: 'Drive', ayuda: 'La carpeta raíz de la obra. Los archivos no se copian: se enlazan.' },
  { id: 'equipo', label: 'Equipo', ayuda: 'Quiénes trabajan en la obra.' },
  { id: 'cronograma', label: 'Cronograma', ayuda: 'Las actividades. Sin cronograma no hay avance ni línea base.' },
  { id: 'confirmar', label: 'Confirmar', ayuda: 'Qué quedó listo y qué falta para poner la obra a producir.' },
] as const

export type PasoAlta = (typeof PASOS)[number]['id']

export const PRIMER_PASO: PasoAlta = 'informacion'

/** Los pasos que ESCRIBEN sobre la obra por su propio formulario. `equipo` y `cronograma` escriben
 *  con las acciones que ya existen (`asignarPersona`, `crearActividad`) y `confirmar` no escribe. */
export const PASOS_QUE_GUARDAN = ['responsable', 'fechas', 'contrato', 'drive'] as const
export type PasoQueGuarda = (typeof PASOS_QUE_GUARDAN)[number]

export function esPasoQueGuarda(p: string): p is PasoQueGuarda {
  return (PASOS_QUE_GUARDAN as readonly string[]).includes(p)
}

export function pasoSiguiente(actual: PasoAlta): PasoAlta | null {
  const i = PASOS.findIndex((p) => p.id === actual)
  return i >= 0 && i < PASOS.length - 1 ? PASOS[i + 1].id : null
}

export function pasoAnterior(actual: PasoAlta): PasoAlta | null {
  const i = PASOS.findIndex((p) => p.id === actual)
  return i > 0 ? PASOS[i - 1].id : null
}

/**
 * EN QUÉ PASO ESTOY. Sin obra creada todavía sólo existe el primero: cualquier `?paso=` que llegue
 * antes de que la obra exista cae ahí, porque los demás editan una fila que no está.
 *
 * Un paso desconocido NO es un error de pantalla — es un link viejo o un dedo. Cae en el primero
 * (o en el que se pueda) en vez de romper el alta a la mitad.
 */
export function resolverPaso(raw: string | undefined, hayObra: boolean): PasoAlta {
  if (!hayObra) return PRIMER_PASO
  const p = PASOS.find((x) => x.id === raw)
  return p ? p.id : PRIMER_PASO
}

/** La URL de un paso. El id de la obra viaja en la query: recuperar un borrador es pegar el link. */
export function urlPaso(obraId: string | null, paso: PasoAlta): string {
  return obraId ? `/obras/nueva?obra=${encodeURIComponent(obraId)}&paso=${paso}` : '/obras/nueva'
}

/**
 * EL ID CANÓNICO DE LA OBRA, derivado del nombre. Es la misma regla que `idDeObra` de `actions.ts`
 * —el slug estable que va en la URL— y está acá para poder probarla: la de allá vive en un archivo
 * `'use server'` junto a la escritura, y no se puede importar desde una prueba de Node.
 *
 * La regex es sobre el rango de marcas diacríticas combinantes (U+0300–U+036F), escrito por punto de
 * código a propósito: en `actions.ts` quedó pegado literal y ahí es invisible a la revisión.
 */
export function idDeObra(nombre: string): string {
  return nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
}

// ── LOS ESQUEMAS, uno por paso que guarda ───────────────────────────────────
//
// Cada paso valida SÓLO lo suyo. Un esquema único con todo en `partial()` aceptaría un formulario
// vacío en cualquier paso y guardaría nulls sobre lo cargado en los pasos anteriores.

const fechaOpt = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'), z.literal('')]).optional()

// ═══ EL VACÍO VA PRIMERO EN LA UNIÓN, Y EL ORDEN NO ES ESTILO ═══
//
// `z.union` devuelve la PRIMERA opción que valida. Con `z.coerce.number()` adelante, un campo
// numérico que nadie tocó llega como cadena vacía, `Number('')` da 0, `.nonnegative()` lo acepta —
// y el vacío se guarda como CERO. En este módulo eso no es un detalle: un contrato sin cargar
// pasaría a ser un contrato de $0, y el checklist de preparación anunciaría «monto y fechas
// cargados» sobre una obra que no tiene contrato. Justo el dato que el módulo entero existe para no
// perder (`plata(null)` da «—», jamás «$0»).
//
// Lo encontró el recorrido de navegador, no la lectura del código: la prueba unitaria de
// `columnasDelPaso` le pasaba `''` a mano y saltaba el esquema, así que pasaba en verde con el
// defecto puesto. Con `z.literal('')` adelante, el vacío se queda vacío y `vacioANull` lo convierte
// en NULL. Un cero TIPEADO sigue llegando como 0: eso sí lo dijo alguien.
const numOpt = z.union([z.literal(''), z.coerce.number().nonnegative('El monto no puede ser negativo')]).optional()

export const vacioANull = <T,>(v: T | '' | undefined) => (v === '' || v === undefined ? null : v)

export const altaSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre de la obra es obligatorio'),
  cliente_id: z.string().uuid('Elegí un cliente'),
  ubicacion: z.string().trim().optional(),
})

export const ESQUEMA_PASO = {
  responsable: z.object({ jefe_obra: z.string().trim().optional() }),
  fechas: z.object({ fecha_inicio_plan: fechaOpt, fecha_fin_plan: fechaOpt }),
  contrato: z.object({ monto_contratado: numOpt }),
  drive: z.object({ drive_carpeta_id: z.string().trim().optional() }),
} as const

/**
 * DEL FORMULARIO VALIDADO A LAS COLUMNAS. El vacío se guarda como NULL y NUNCA como cero o cadena
 * vacía: un contrato sin cargar no es un contrato de $0, y esa distinción es la que hace que el
 * checklist pueda decir «monto contratado sin cargar» en vez de «$0».
 */
export function columnasDelPaso(paso: PasoQueGuarda, d: Record<string, unknown>): Record<string, unknown> {
  switch (paso) {
    case 'responsable': return { jefe_obra: (d.jefe_obra as string) || null }
    case 'fechas': return {
      fecha_inicio_plan: vacioANull(d.fecha_inicio_plan as string),
      fecha_fin_plan: vacioANull(d.fecha_fin_plan as string),
    }
    case 'contrato': return { monto_contratado: vacioANull(d.monto_contratado as number) }
    case 'drive': return { drive_carpeta_id: (d.drive_carpeta_id as string) || null }
  }
}
