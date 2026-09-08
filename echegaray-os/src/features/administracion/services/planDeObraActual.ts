// CAMBIAR LA OBRA ACTUAL DE UNA PERSONA — la decisión, sin base de datos.
//
// El dueño (08/09/2026): *"la asignación de personal en cada obra es imposible… necesito algo mucho
// más sencillo; por el momento que sea desde planilla asistencia con un dropdown de obra actual"*.
// Elegir otra obra en la grilla de asistencia es UN gesto, pero son DOS escrituras sobre
// `obra_asignacion`: cerrar la vigente y abrir la nueva. Qué se cierra, con qué fecha y qué se abre
// se decide acá, sin red, para que se pueda probar sin base.
//
// ═══ CERRAR NO ES BORRAR ═══
//
// La asignación anterior recibe `hasta`; la fila queda. Es lo que respalda las horas que la persona
// imputó mientras estuvo, y es lo que hace que la cronología de la ficha pueda mostrar el cambio.
// Un `delete` haría que cada rotación de plantel borrara el pasado de la obra.
//
// ═══ POR QUÉ `hasta` ES AYER Y NO HOY ═══
//
// El cambio rige DESDE HOY: la nueva abre con `desde = hoy`. Si la anterior cerrara hoy, las dos
// serían vigentes hoy y la grilla tendría que elegir una por horas — el cambio se vería a medias.
// Con `hasta = ayer` el día de hoy tiene una sola obra.
//
// ═══ SALVO QUE LA ANTERIOR HAYA EMPEZADO HOY ═══
//
// Corregir en el momento una asignación recién creada dejaría `hasta` ANTES de `desde`: un período
// que afirma que la persona trabajó menos que ningún día. Ahí `hasta = desde`, que es lo único
// cierto — estuvo asignada ese día. No se borra: alguien la creó y eso es historia.

// ═══ QUIÉN PUEDE MOVER A ALGUIEN DE OBRA (dueño, 08/09/2026) ═══
//
// *"sólo usuarios admin puedan hacer eso, y que jefe de obra pueda seguir con las funciones
// normales de registrar asistencia"*. El jefe de obra CARGA y CORRIGE la jornada; no decide en qué
// obra está una persona, porque esa decisión mueve el costo de mano de obra entre obras y es de
// Administración.
//
// NO alcanza `es_administracion()` de la base: desde la migración 20260819T4900 esa función
// INCLUYE al jefe de obra —por eso ve el área— y la RLS de `obra_asignacion` lo deja escribir
// dentro de `ve_obra`. Acá manda el ROL DEL PERFIL, que es más angosto. La regla vive una vez y la
// aplican las dos puntas: la pantalla para no ofrecer un control que va a rebotar, y la acción
// —que es la puerta de verdad— para rechazar la llamada venga de donde venga.
export const ROLES_QUE_MUEVEN_DE_OBRA = ['direccion', 'administracion'] as const

export function puedeCambiarObraActual(rol: string | null | undefined): boolean {
  return typeof rol === 'string' && (ROLES_QUE_MUEVEN_DE_OBRA as readonly string[]).includes(rol)
}

/** Una asignación ABIERTA de la persona: `hasta is null`, en cualquier obra y con cualquier `desde`
 *  —también sin `desde`—. El nombre viene resuelto: el acuse nunca escribe un id. */
export interface AsignacionAbierta {
  id: string
  obra_id: string
  /** El nombre real de la obra. Nunca el id. */
  nombre: string
  /** Hay filas abiertas sin `desde` (las creó la web antes de exigirlo). No son un error de lectura. */
  desde: string | null
}

export interface CierreDeAsignacion {
  id: string
  hasta: string
}

export interface PlanDeObraActual {
  cerrar: CierreDeAsignacion[]
  /** La obra que se abre `desde = hoy`. `null` cuando el destino es «Sin obra» o ya estaba abierta. */
  abrir: { obra_id: string; desde: string } | null
  /** No hay nada que escribir: ya estaba exactamente así. */
  sinCambio: boolean
  /** La línea que lee quien tocó el desplegable. Siempre con nombres, nunca con ids. */
  acuse: string
}

/** El día anterior en ISO. Se calcula en UTC a propósito: la fecha ya viene como `YYYY-MM-DD` y
 *  construirla con la zona local movería el día en cada máquina con offset negativo. */
export function diaAnterior(iso: string): string {
  const t = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(t)) throw new Error(`Fecha inválida: ${iso}`)
  return new Date(t - 86_400_000).toISOString().slice(0, 10)
}

/** `hasta` de una asignación que se cierra hoy: ayer, salvo que haya empezado hoy o después. Una
 *  fila sin `desde` cierra ayer: no hay ningún comienzo que el cierre pueda quedar por delante. */
function cierreDe(a: AsignacionAbierta, hoy: string): string {
  const ayer = diaAnterior(hoy)
  return a.desde && a.desde > ayer ? a.desde : ayer
}

/** Entre varias filas abiertas de la MISMA obra se conserva la de historia más larga: la del `desde`
 *  más viejo, y una sin `desde` pierde contra cualquiera que tenga fecha —es la fila incompleta que
 *  dejó la web—. El `id` desempata para que el plan no dependa del orden en que llegó la lectura. */
function masVieja(a: AsignacionAbierta, b: AsignacionAbierta): AsignacionAbierta {
  if (a.desde && b.desde) {
    const porFecha = a.desde.localeCompare(b.desde)
    if (porFecha !== 0) return porFecha <= 0 ? a : b
  } else if (a.desde || b.desde) {
    return a.desde ? a : b
  }
  return a.id.localeCompare(b.id) <= 0 ? a : b
}

/**
 * Qué escribir para que la persona quede DESDE HOY en `destino`.
 *
 * ═══ UNA PERSONA TIENE UNA OBRA ACTUAL, Y ESO INCLUYE LO QUE YA ESTABA MAL ═══
 *
 * `abiertas` son TODAS las asignaciones con `hasta is null` de la persona, sin filtrar por obra ni
 * por `desde`. En la base hay gente con dos abiertas a la vez (una la creó la web sin `desde`, la
 * otra la reconstruyó el historial de JORNALES), y ahí es donde el desplegable venía fallando: si
 * se cerraba sólo una y la otra ya era del destino, el `insert` chocaba contra el índice único
 * `obra_asignacion_una_vigente` y la persona quedaba cerrada y sin abrir — 0 vigentes.
 *
 * Por eso el plan es siempre el mismo: si YA hay una abierta en el destino se conserva ésa y se
 * cierran TODAS las demás —incluidas las duplicadas de la misma obra—; si no la hay se cierran
 * todas y se abre una sola. `destino = null` es «Sin obra»: sólo cierra.
 */
export function planDeCambioDeObra({ abiertas, destino, hoy }: {
  abiertas: AsignacionAbierta[]
  destino: { id: string; nombre: string } | null
  hoy: string
}): PlanDeObraActual {
  let seConserva: AsignacionAbierta | null = null
  for (const a of destino ? abiertas.filter((x) => x.obra_id === destino.id) : []) {
    seConserva = seConserva ? masVieja(seConserva, a) : a
  }
  const sobran = abiertas.filter((a) => a.id !== seConserva?.id)
  const cerrar = sobran.map((a) => ({ id: a.id, hasta: cierreDe(a, hoy) }))
  const abrir = destino && !seConserva ? { obra_id: destino.id, desde: hoy } : null

  if (cerrar.length === 0 && !abrir) {
    return {
      cerrar, abrir, sinCambio: true,
      acuse: destino ? `Ya estaba en ${destino.nombre}.` : 'Ya estaba sin obra.',
    }
  }
  return { cerrar, abrir, sinCambio: false, acuse: acuseDe(destino, seConserva, sobran) }
}

/** «Desde hoy en SALÓN COMERCIAL · antes PISOS INDUSTRIALES, GALPÓN 9». El «antes» nombra todo lo
 *  que se cerró: si no se cerró nada, no hubo un antes y decirlo sería inventarlo.
 *
 *  Cuando la persona YA estaba en el destino y lo único que se hace es cerrar las otras abiertas,
 *  el acuse no puede decir «desde hoy»: no empezó hoy, y lo que hay para contar es la limpieza. */
function acuseDe(
  destino: { nombre: string } | null,
  seConserva: AsignacionAbierta | null,
  cerradas: AsignacionAbierta[],
): string {
  const nombres = cerradas.map((a) => a.nombre).join(', ')
  if (destino && seConserva) {
    return `Ya estaba en ${destino.nombre} · se ${cerradas.length === 1 ? 'cerró' : 'cerraron'} ${nombres}.`
  }
  const cabeza = destino ? `Desde hoy en ${destino.nombre}` : 'Desde hoy sin obra'
  if (cerradas.length === 0) return `${cabeza}.`
  return `${cabeza} · antes ${nombres}.`
}
