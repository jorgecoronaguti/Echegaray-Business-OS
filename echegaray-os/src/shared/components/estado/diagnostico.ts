// QUÉ DICE UNA PANTALLA QUE SE CAYÓ — `design/system/INTERACTION.md` §Error.
//
// «Texto `neg` con el MENSAJE REAL DE LA FUENTE». Esa es la regla y esta función no la relaja: el
// detalle que llega del servidor se muestra tal cual, siempre. Lo que agrega acá es la línea de
// arriba —QUÉ FALLÓ— y el paso concreto, porque `permission denied for table obras` es la verdad
// pero no dice qué hacer con ella, y quien la lee está en una obra con el teléfono en la mano.
//
// Los tres casos que más costaron en este repo están reconocidos por nombre:
//
//   · `permission denied`  →  RLS SIN GRANT. Ya pasó: una policy escrita sin el grant hacía que
//     Next mostrara un 404, y se buscó el defecto en el ruteo durante horas. Reintentar no lo
//     arregla nunca: es permiso, no es la red.
//   · el mensaje vacío de producción  →  Next BORRA el texto del error de un Server Component y
//     deja sólo un `digest`. Sin ese código en pantalla, el error no se puede encontrar en el
//     registro del servidor: es el único puente entre lo que vio la persona y lo que pasó.
//   · `fetch failed`  →  no se llegó a la base. Es el ÚNICO caso donde reintentar tiene sentido
//     por sí solo, y por eso es el único que lo dice.
//
// Un caso no reconocido no se disfraza de nada: se muestra el mensaje crudo y se admite que no
// sabemos qué fue. Inventar una causa amable es peor que no tener ninguna.

/** Lo que Next entrega a un `error.tsx`: un Error con un `digest` opcional. */
export type ErrorDeRuta = { message?: string; digest?: string; name?: string }

export type Diagnostico = {
  /** Qué falló, en una línea, sin culpar a quien está mirando. */
  causa: string
  /** El mensaje literal de la fuente. `null` sólo cuando la fuente no dejó ninguno. */
  detalle: string | null
  /** El código con el que se encuentra este error en el registro del servidor. */
  digest: string | null
  /** El paso concreto. `null` cuando reintentar es realmente lo único que se puede hacer. */
  queHacer: string | null
  /** ¿Reintentar tiene alguna chance de cambiar el resultado? */
  sirveReintentar: boolean
  /** Va al DOM: deja verificar el caso desde un test sin leer el texto ni el color. */
  clave: Clave
}

export type Clave =
  | 'permiso'
  | 'sesion'
  | 'red'
  | 'servidor-sin-detalle'
  | 'esquema'
  | 'demora'
  | 'desconocido'

/** El texto con el que Next reemplaza el mensaje real en producción. */
const MORDAZA = 'the specific message is omitted in production'

const CASOS: ReadonlyArray<{
  clave: Clave
  huellas: readonly string[]
  causa: string
  queHacer: string | null
  sirveReintentar: boolean
}> = [
  {
    clave: 'permiso',
    huellas: ['permission denied', 'row-level security', 'rls', '42501'],
    causa: 'La base rechazó la lectura: este usuario no tiene permiso sobre esos datos.',
    queHacer: 'Reintentar no lo cambia. Pedile a Administración que revise el rol y las obras asignadas.',
    sirveReintentar: false,
  },
  {
    clave: 'sesion',
    huellas: ['jwt expired', 'auth session missing', 'invalid refresh token', 'not authenticated'],
    causa: 'La sesión venció mientras esta pantalla pedía los datos.',
    queHacer: 'Entrá de nuevo y volvé a esta pantalla.',
    sirveReintentar: false,
  },
  {
    clave: 'red',
    huellas: ['fetch failed', 'failed to fetch', 'networkerror', 'enotfound', 'econnrefused', 'econnreset', 'socket hang up'],
    causa: 'No se llegó a la base de datos.',
    queHacer: null,
    sirveReintentar: true,
  },
  {
    clave: 'demora',
    huellas: ['statement timeout', '57014', 'timeout', 'etimedout'],
    causa: 'La consulta tardó más de lo que la base permite y se cortó sola.',
    queHacer: 'Probá con menos período o menos filas. Si vuelve a pasar, la consulta necesita revisión.',
    sirveReintentar: true,
  },
  {
    clave: 'esquema',
    huellas: ['does not exist', 'undefined table', 'undefined column', '42p01', '42703', 'schema cache'],
    causa: 'La base no tiene la tabla o la columna que esta pantalla pide.',
    queHacer: 'Falta aplicar una migración. Esto se arregla en el servidor, no acá.',
    sirveReintentar: false,
  },
]

/**
 * Traduce el error a lo que se muestra. NUNCA reemplaza el mensaje de la fuente: lo acompaña.
 */
export function diagnosticar(error: ErrorDeRuta | null | undefined): Diagnostico {
  const crudo = (error?.message ?? '').trim()
  const digest = (error?.digest ?? '').trim() || null
  const base = { detalle: crudo || null, digest }

  // El mensaje vacío o amordazado se trata ANTES que las huellas: buscar «permission denied» dentro
  // del párrafo de Next sería buscar en un texto que no habla del defecto.
  if (!crudo || crudo.toLowerCase().includes(MORDAZA)) {
    return {
      ...base,
      detalle: null,
      causa: 'El servidor cortó el pedido y no dejó el detalle en la pantalla.',
      queHacer: digest
        ? `El detalle está en el registro del servidor, bajo el código ${digest}. Pasalo tal cual al pedir ayuda.`
        : 'El detalle está en el registro del servidor, y este error no dejó código para encontrarlo.',
      sirveReintentar: true,
      clave: 'servidor-sin-detalle',
    }
  }

  const texto = crudo.toLowerCase()
  const caso = CASOS.find((c) => c.huellas.some((h) => texto.includes(h)))
  if (caso) {
    return { ...base, causa: caso.causa, queHacer: caso.queHacer, sirveReintentar: caso.sirveReintentar, clave: caso.clave }
  }

  return {
    ...base,
    causa: 'La pantalla no pudo cargar sus datos, y el error no es de los conocidos.',
    queHacer: null,
    sirveReintentar: true,
    clave: 'desconocido',
  }
}
