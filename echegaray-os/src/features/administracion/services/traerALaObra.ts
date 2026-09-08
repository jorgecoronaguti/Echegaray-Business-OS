// TRAER A ALGUIEN A ESTA OBRA — a quién se puede ofrecer, sin base de datos.
//
// El dueño (08/09/2026, tarde), textual: *«al comenzar el día tengo que marcar la asistencia de las
// personas, pero ¿qué pasa si no modifiqué el lugar de trabajo? Tenés que habilitar a los jefes de
// obra a poder modificar las obras asignadas del personal»*.
//
// El proceso real es ése: a las 7 de la mañana el jefe abre la carga del día, ve la cuadrilla que
// el sistema cree que tiene, y la de verdad es otra porque anoche se movió gente. Si para arreglarlo
// hay que llamar a Administración, la asistencia se carga en la obra equivocada — y con ella el
// costo de mano de obra. Así que la corrección vive DONDE se detecta el problema.
//
// ═══ QUIÉN ENTRA EN LA LISTA ═══
//
// Todo el plantel MENOS los que hoy ya están en esta obra: ofrecer a alguien que ya está haría que
// la acción contestara «ya estaba» y el gesto no significara nada. No se recorta por obra ni por
// cuadrilla: mover a alguien de otra obra es exactamente lo que el dueño pidió habilitar. Quien no
// se pueda nombrar queda afuera —`persona_plantel` publica sólo a quien está en la empresa— porque
// una fila sin nombre no se puede elegir con criterio.
//
// ═══ LA OBRA ACTUAL VA ENTRE PARÉNTESIS, Y «SIN OBRA» TAMBIÉN ═══
//
// Elegir a alguien CIERRA su asignación de hoy. Sin ver de dónde viene, traer a Pérez desde otra
// obra activa se ve igual que traer a alguien que no está en ninguna, y son dos decisiones
// distintas: una le saca gente a un compañero. `null` no se dibuja como vacío: dice «sin obra».

export interface CandidatoParaTraer {
  id: string
  nombre: string
  /** El nombre de la obra donde está hoy. `null` es «no tiene ninguna vigente». */
  obraActual: string | null
}

/** Lo mínimo de una asignación para decidir si hoy está abierta. */
export interface AsignacionParaTraer {
  persona_id: string | null
  obra_id: string | null
  desde: string | null
  hasta: string | null
}

/** Una asignación está VIGENTE en `fecha` si ya empezó y todavía no cerró. `desde` nulo se toma como
 *  «desde siempre»: es una fila incompleta, no una fila futura, y descartarla escondería gente. */
export function vigenteEnFecha(a: { desde: string | null; hasta: string | null }, fecha: string): boolean {
  if (a.desde && a.desde > fecha) return false
  if (a.hasta && a.hasta < fecha) return false
  return true
}

/**
 * A quién se le puede ofrecer «traer» a `obraId` el día `fecha`.
 *
 * Ordenado por nombre: es una lista que se recorre con el pulgar buscando a una persona concreta,
 * no un ranking. El orden alfabético es el único que no cambia entre una apertura y la siguiente.
 */
export function candidatosParaTraer({ plantel, asignaciones, nombresDeObra, obraId, fecha }: {
  plantel: { id: string; nombre_completo: string | null }[]
  asignaciones: AsignacionParaTraer[]
  nombresDeObra: Record<string, string>
  obraId: string
  fecha: string
}): CandidatoParaTraer[] {
  const dondeEsta = new Map<string, string[]>()
  for (const a of asignaciones) {
    if (!a.persona_id || !a.obra_id || !vigenteEnFecha(a, fecha)) continue
    dondeEsta.set(a.persona_id, [...(dondeEsta.get(a.persona_id) ?? []), a.obra_id])
  }

  const salida: CandidatoParaTraer[] = []
  for (const p of plantel) {
    const nombre = (p.nombre_completo ?? '').trim()
    if (!nombre) continue
    const obras = dondeEsta.get(p.id) ?? []
    if (obras.includes(obraId)) continue
    salida.push({
      id: p.id,
      nombre,
      // CON VARIAS VIGENTES SE NOMBRAN TODAS. Mostrar una sola escondería que traerlo acá va a
      // cerrarle dos asignaciones, que es justo lo que hay que poder ver antes de tocar.
      // Sin catálogo se escribe el id: feo, pero mentir con «sin obra» sería peor.
      obraActual: obras.length === 0
        ? null
        : obras.map((o) => nombresDeObra[o] ?? o).sort().join(' y '),
    })
  }
  return salida.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** Sin tildes y en minúsculas. En obra se tipea «peres» buscando a PÉREZ, y con el teclado del
 *  teléfono la tilde es un toque más que nadie da. */
function plano(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/**
 * El buscador de la lista. Filtra por CADA palabra tipeada por separado: en el plantel los nombres
 * están cargados «APELLIDO NOMBRE» y a veces al revés (`nombre-dado-vuelta`, abril/26), así que
 * exigir que «juan perez» aparezca en ese orden dejaría la lista vacía con la persona ahí adelante.
 */
export function filtrarCandidatos(lista: CandidatoParaTraer[], texto: string): CandidatoParaTraer[] {
  const palabras = plano(texto).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return lista
  return lista.filter((c) => {
    const aguja = plano(c.nombre)
    return palabras.every((p) => aguja.includes(p))
  })
}
