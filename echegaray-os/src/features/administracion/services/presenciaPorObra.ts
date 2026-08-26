// 19b v2 · LA JORNADA AGRUPADA POR OBRA — que es como se mira en el campo.
//
// ═══ POR QUÉ CAMBIA EL AGRUPADO ═══
//
// La versión anterior agrupaba por ESTADO: «en obra», «sin cerrar», «ya cerraron», «sin registrar».
// Contesta «¿quién tiene la jornada abierta?», que es una pregunta administrativa. La que se hace de
// verdad a las siete de la mañana es «¿está completo el equipo del Depósito Norte?», y ésa se
// contesta mirando una obra entera junta. El estado no se pierde: viaja en el punto y en la hora de
// cada tarjeta.
//
// ═══ «NO FICHÓ» NO ES «AUSENTE» ═══
//
// Es la regla que gobierna esta pantalla entera. Sin marca están el que no tiene teléfono, el que le
// negó el permiso al GPS y el que faltó — y hasta que la jornada cierre no se puede distinguir a
// ninguno de los tres. Por eso el grupo se llama por el hecho («no fichó») y no por la conclusión, y
// por eso su conteo NUNCA se llama ausencias.
//
// ═══ EL DENOMINADOR ES QUIÉN SE ESPERABA ═══
//
// «5 de 6» sale de los fichados de esa obra más los esperados de esa obra que todavía no marcaron.
// Un denominador tomado de otra consulta —el plantel de la obra, por ejemplo— podría no coincidir
// con la lista dibujada debajo, y ahí la fracción diría una cosa y las tarjetas otra.

import type { Esperado, FilaPresencia } from './presencia.ts'

export interface GenteEnObra {
  personaId: string
  nombre: string
  rol: string | null
  /** `HH:MM` de la entrada. `null` = marcó sin hora legible. */
  entrada: string | null
  estado: FilaPresencia['estado']
  /**
   * LA MARCA ENTERA, para los tres controles que el mockup no dibuja y que esta pantalla no puede
   * perder: el reloj de la jornada abierta, el punto activo y DÓNDE ARRANCÓ. La ubicación decide
   * discusiones sobre si alguien estaba donde dijo; sacarla porque el artboard no la muestra sería
   * cambiar un control por un dibujo. `null` = esta persona no marcó.
   */
  marca: FilaPresencia | null
}

export interface ObraDeLaJornada {
  obraId: string | null
  nombre: string
  gente: GenteEnObra[]
  /** Fichados + esperados de esa obra que todavía no marcaron. Es el denominador de «5 de 6». */
  esperados: number
}

export interface JornadaPorObra {
  obras: ObraDeLaJornada[]
  /** Marcó, y su marca no trae obra: está trabajando y sus horas no van a ninguna. */
  sinObra: GenteEnObra[]
  /** Tenía asignación vigente y hoy no hay marca suya. NO es una lista de ausentes. */
  sinFichar: Esperado[]
  /** Cuántos marcaron, contando una sola vez a cada persona. */
  fichados: number
  /** Cuántos se esperaban: los que marcaron más los que no. */
  plantel: number
}

/** `2026-08-26T07:05:00-03:00` → `07:05`. `null` cuando no hay hora o no se puede leer. */
export function horaDe(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const deFila = (f: FilaPresencia): GenteEnObra => ({
  personaId: f.persona_id,
  nombre: f.nombre_completo,
  rol: f.categoria ?? f.puesto ?? null,
  entrada: horaDe(f.entrada),
  estado: f.estado,
  marca: f,
})

export function jornadaPorObra(marcas: FilaPresencia[], sinFichar: Esperado[]): JornadaPorObra {
  const porObra = new Map<string, ObraDeLaJornada>()
  const sinObra: GenteEnObra[] = []
  const personas = new Set<string>()

  for (const f of marcas) {
    personas.add(f.persona_id)
    if (!f.obra_id) { sinObra.push(deFila(f)); continue }
    const ya = porObra.get(f.obra_id)
    if (ya) ya.gente.push(deFila(f))
    else {
      porObra.set(f.obra_id, {
        obraId: f.obra_id,
        // El nombre sale de la marca. Sin él se usa el id: una fila sin nombre legible sigue siendo
        // una obra con gente adentro, y esconderla sería peor que mostrar un identificador.
        nombre: f.obra?.trim() || f.obra_id,
        gente: [deFila(f)],
        esperados: 0,
      })
    }
  }

  // El denominador: los que no marcaron suman a la obra donde se los esperaba.
  for (const e of sinFichar) {
    if (!e.obra_actual_id) continue
    const ya = porObra.get(e.obra_actual_id)
    if (ya) ya.esperados += 1
    else {
      porObra.set(e.obra_actual_id, {
        obraId: e.obra_actual_id,
        nombre: e.obra_actual?.trim() || e.obra_actual_id,
        gente: [],
        esperados: 1,
      })
    }
  }

  const obras = [...porObra.values()]
    .map((o) => ({ ...o, esperados: o.gente.length + o.esperados }))
    // De más gente a menos: la obra con veinte personas es la que hay que mirar primero.
    .sort((a, b) => b.gente.length - a.gente.length || a.nombre.localeCompare(b.nombre, 'es'))

  return {
    obras,
    sinObra,
    sinFichar,
    fichados: personas.size,
    plantel: personas.size + sinFichar.length,
  }
}

/** El titular: «12 de 16 fichados hoy». Nunca dice cuántos faltaron — eso no se sabe todavía. */
export function titularDeLaJornada(j: JornadaPorObra): string {
  if (j.plantel === 0) return 'Todavía no marcó nadie y no hay nadie con asignación vigente'
  const partes = [`${j.obras.length} ${j.obras.length === 1 ? 'obra' : 'obras'}`]
  if (j.sinObra.length > 0) {
    partes.push(`${j.sinObra.length} sin obra en la marca`)
  }
  if (j.sinFichar.length > 0) {
    partes.push(`${j.sinFichar.length} sin fichar todavía`)
  }
  return partes.join(' · ')
}
