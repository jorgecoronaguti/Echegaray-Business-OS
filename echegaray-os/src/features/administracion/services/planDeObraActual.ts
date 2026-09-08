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

// ═══ QUIÉN PUEDE MOVER A ALGUIEN DE OBRA (dueño, 08/09/2026 — segunda decisión del día) ═══
//
// A la mañana el dueño había dicho *"sólo usuarios admin puedan hacer eso"*. A la tarde, probando
// la carga desde el teléfono, lo cambió: *"al comenzar el día tengo que marcar la asistencia de las
// personas, pero ¿qué pasa si no modifiqué el lugar de trabajo? Tenés que habilitar a los jefes de
// obra a poder modificar las obras asignadas del personal"*. Manda esta.
//
// El motivo es el proceso real, no la comodidad: quien mueve gente entre obras a las 7 de la mañana
// es el jefe, y si tiene que pedirle a Administración que reasigne antes de poder marcar la
// asistencia, la asistencia se carga en la obra equivocada o no se carga. Un plantel mal asignado
// imputa el costo de mano de obra a otra obra igual —sólo que en silencio y sin nadie que lo firme.
//
// SIGUE AFUERA `campo`. Es el único rol que la RLS acota por obra: el operario carga lo suyo y no
// decide plantel. Y sigue afuera «sin rol»: sin perfil no se mueve a nadie.
//
// NO alcanza `es_administracion()` de la base —incluye al jefe desde 20260819T4900 y ahora eso
// coincide, pero por casualidad, no por diseño—: acá manda el ROL DEL PERFIL, que es la lista que
// el dueño decidió. La regla vive una vez y la aplican las dos puntas: la pantalla para no ofrecer
// un control que va a rebotar, y la acción —que es la puerta de verdad— para rechazar la llamada
// venga de donde venga.
export const ROLES_QUE_MUEVEN_DE_OBRA = ['direccion', 'administracion', 'jefe_obra'] as const

export function puedeCambiarObraActual(rol: string | null | undefined): boolean {
  return typeof rol === 'string' && (ROLES_QUE_MUEVEN_DE_OBRA as readonly string[]).includes(rol)
}

/** Una asignación que hoy está vigente. El nombre viene resuelto: el acuse nunca escribe un id. */
export interface AsignacionVigente {
  id: string
  obra_id: string
  /** El nombre real de la obra. Nunca el id. */
  nombre: string
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

/** `hasta` de una asignación que se cierra hoy: ayer, salvo que haya empezado hoy o después. */
function cierreDe(a: AsignacionVigente, hoy: string): string {
  const ayer = diaAnterior(hoy)
  return a.desde && a.desde > ayer ? a.desde : ayer
}

/**
 * Qué escribir para que la persona quede DESDE HOY en `destino`.
 *
 * `destino = null` es «Sin obra»: sólo cierra, no abre nada. Con varias vigentes se cierran TODAS
 * las que no son el destino — el desplegable dice «obra actual», en singular, y dejarle una segunda
 * obra abierta haría que la pantalla siguiera mostrando otra cosa que la que se acaba de elegir.
 */
export function planDeCambioDeObra({ vigentes, destino, hoy }: {
  vigentes: AsignacionVigente[]
  destino: { id: string; nombre: string } | null
  hoy: string
}): PlanDeObraActual {
  const yaEstaba = destino ? vigentes.find((a) => a.obra_id === destino.id) ?? null : null
  const sobran = vigentes.filter((a) => a.obra_id !== (destino?.id ?? null))
  const cerrar = sobran.map((a) => ({ id: a.id, hasta: cierreDe(a, hoy) }))
  const abrir = destino && !yaEstaba ? { obra_id: destino.id, desde: hoy } : null

  if (cerrar.length === 0 && !abrir) {
    return {
      cerrar, abrir, sinCambio: true,
      acuse: destino ? `Ya estaba en ${destino.nombre}.` : 'Ya estaba sin obra.',
    }
  }
  return { cerrar, abrir, sinCambio: false, acuse: acuseDe(destino, sobran) }
}

/** «Desde hoy en SALÓN COMERCIAL · antes PISOS INDUSTRIALES». El «antes» nombra lo que se cerró: si
 *  no se cerró nada, no hubo un antes y decirlo sería inventarlo. */
function acuseDe(destino: { nombre: string } | null, cerradas: AsignacionVigente[]): string {
  const cabeza = destino ? `Desde hoy en ${destino.nombre}` : 'Desde hoy sin obra'
  if (cerradas.length === 0) return `${cabeza}.`
  return `${cabeza} · antes ${cerradas.map((a) => a.nombre).join(' y ')}.`
}
