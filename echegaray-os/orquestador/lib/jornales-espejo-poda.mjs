// LA PODA DEL ESPEJO: lo que la planilla ya no dice, se va de `jornales_bloque_persona`.
//
// ═══ EL DEFECTO, MEDIDO EL 14/09/2026 ═══
//
// La identidad de una fila del espejo es su POSICIÓN (pestaña, fila del bloque, fila de la persona),
// y el UPSERT sólo agrega o pisa. El dueño insertó 2 filas arriba en «Obreros 26»: el bloque 01–15/09
// pasó de la fila 558 a la 560, la corrida siguiente insertó 15 filas nuevas y dejó vivas las 15
// viejas. La quincena quedó duplicada (1009 h ×2) y la Liquidación decía «2 bloques leídos».
//
// Cambiar la clave por el nombre no lo arregla: dos homónimos colapsarían (ver `SQL_UPSERT`). Lo que
// falta es la otra mitad de un espejo: lo que no está en la foto actual, no está.
//
// ═══ UN CONTROL QUE NO PUDO MIRAR NO DICE «NO ESTÁ» ═══
//
// Se poda SOLAMENTE una pestaña que se leyó entera y trajo al menos un bloque. Una lectura vacía, una
// pestaña que no apareció o una corrida recortada por ventana (`--desde/--hasta`) no borran nada: si
// la API devolvió una grilla vacía, borrar sería publicar «esta quincena no existe» sobre algo que
// nadie miró. Y un bloque DESCARTADO por la lectura (fechas repetidas, excepción) protege sus filas:
// se leyó, pero no se pudo fotografiar.
//
// ═══ EL TOPE ═══
//
// Una poda legítima es un bloque corrido, no media pestaña. Si fuera a borrar más del 30 % de las
// filas que la pestaña tiene hoy en la base, no borra nada de esa pestaña y el script sale ≠ 0: eso
// huele a un layout que el detector dejó de entender, y lo decide una persona.
//
// SÓLO CALCULA. No escribe: el que borra es `jornales-espejo-bloques.mjs`, en la misma transacción
// que el UPSERT.

export const TOPE_PODA = 0.3

const clave = (bloqueFila1, fila1) => `${Number(bloqueFila1)}:${Number(fila1)}`
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d))

/**
 * @param {object} a
 * @param {Array<{id, pestana, bloque_fila1, fila1, quincena_desde, quincena_hasta}>} a.existentes filas hoy en la base
 * @param {Array<{pestana, bloques: number}>} a.leidas pestañas leídas en esta corrida
 * @param {Array<{pestana, bloque_fila1, personas: Array<{fila1}>}>} a.bloques TODOS los bloques leídos, sin recorte de ventana
 * @param {Array<{tipo, pestana, fila1}>} [a.hallazgos]
 * @param {boolean} [a.lecturaCompleta] false si la corrida se recortó por ventana
 */
export function planDePoda({ existentes, leidas, bloques, hallazgos = [], lecturaCompleta = true, tope = TOPE_PODA }) {
  const porPestana = []
  const borrar = []
  const pestanas = new Set(existentes.map((e) => e.pestana))
  for (const pestana of [...pestanas].sort()) {
    const enBase = existentes.filter((e) => e.pestana === pestana)
    const leida = leidas.find((l) => l.pestana === pestana)
    const suyos = bloques.filter((b) => b.pestana === pestana)
    const base = { pestana, existentes: enBase.length, aBorrar: 0, quincenas: [] }
    if (!lecturaCompleta) { porPestana.push({ ...base, estado: 'lectura_recortada' }); continue }
    if (!leida || suyos.length === 0) { porPestana.push({ ...base, estado: 'sin_lectura' }); continue }

    const vigentes = new Set(suyos.flatMap((b) => b.personas.map((p) => clave(b.bloque_fila1, p.fila1))))
    const protegidos = new Set(hallazgos
      .filter((h) => h.tipo === 'bloque_descartado' && h.pestana === pestana && h.fila1 != null)
      .map((h) => Number(h.fila1)))
    const sobran = enBase.filter((e) => !vigentes.has(clave(e.bloque_fila1, e.fila1))
      && !protegidos.has(Number(e.bloque_fila1)))
    const quincenas = [...new Set(sobran.map((e) => `${iso(e.quincena_desde)}..${iso(e.quincena_hasta)} f${e.bloque_fila1}`))].sort()
    const r = { ...base, aBorrar: sobran.length, quincenas }
    if (sobran.length > 0 && sobran.length > enBase.length * tope) {
      porPestana.push({ ...r, estado: 'tope' })
      continue
    }
    porPestana.push({ ...r, estado: 'ok' })
    borrar.push(...sobran)
  }
  return { borrar, porPestana, frenada: porPestana.some((p) => p.estado === 'tope') }
}

/** Filas de la pestaña, para leerlas dentro de la misma transacción que las borra. */
export const SQL_EXISTENTES = `
select id, pestana, bloque_fila1, fila1, quincena_desde, quincena_hasta
  from public.jornales_bloque_persona
 where pestana = any($1::text[])
 for update`

export const SQL_BORRAR = 'delete from public.jornales_bloque_persona where id = any($1::uuid[])'
