// LA LECTURA DEL ESPEJO DE LA PLANILLA JORNALES. Ni una regla de negocio acá: trae filas y nada más.
//
// ═══ POR QUÉ LA WEB NO LE PREGUNTA AL SHEET ═══
//
// El pedido decía «leé por la lib en el servidor con caché de 5 min». No se puede, y el motivo está
// escrito en este repo desde antes: *«el cliente de Google del OS (`orquestador/lib/google.mjs`)
// necesita la clave de la cuenta de servicio en disco, y en Vercel esa credencial no existe»*
// (`obras/services/actionsDocumentos.ts`). Una lectura de JORNALES desde Next andaría en la VM y
// fallaría en producción, que es la peor de las dos opciones. Y `google-oauth.mjs` —el camino del
// token del dueño— entra a Postgres por conexión directa con `pg`: meterlo en el runtime de Next
// abriría un pool por instancia al lado del que ya administra Supabase.
//
// Así que el espejo se hace como todos los demás espejos de este OS (Compras, legajos, Drive): un
// script que corre en la VM lee el Sheet y escribe una tabla, y la web lee la tabla. Es además lo que
// manda REALIDAD ÚNICA: un concepto que consumen varias caras vive en Postgres.
//
// ═══ LA TABLA PUEDE NO EXISTIR TODAVÍA, Y LA PANTALLA NO SE ROMPE POR ESO ═══
//
// Las migraciones las aplica una persona. Mientras `jornales_bloque_persona` no exista, esta lectura
// devuelve `hay: false` y cada chip queda en «sin espejo» — que NO es «coincide». Es el mismo patrón
// que `leerCabecerasGuardadas` usa con las columnas `*_manual`: degradar una afirmación, nunca
// fabricarla.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Quincena } from './quincena.ts'

export interface EspejoDeLaPlanilla {
  /** `false` = no se pudo leer el bloque de la planilla. Todos los cotejos quedan en «sin espejo». */
  hay: boolean
  /** Horas que el bloque declara por persona en esta ventana. */
  horasPorPersona: Map<string, number>
  /** Cuándo se leyó el Sheet por última vez, en ISO. `null` cuando no hay espejo. */
  leidoEn: string | null
  /** Las pestañas y los bloques que cubren esta quincena, para que el sello diga de dónde sale. */
  bloques: { pestana: string; filaBloque: number; personas: number }[]
  /** Quién aparece en el bloque y no se pudo atar a una persona del padrón. No se crea a nadie. */
  sinPersona: string[]
  error: string | null
}

const VACIO: EspejoDeLaPlanilla = {
  hay: false, horasPorPersona: new Map(), leidoEn: null, bloques: [], sinPersona: [], error: null,
}

/** 42P01 = la tabla todavía no existe. Se trata como «no hay espejo», no como error de pantalla. */
const sinTabla = (e: { code?: string; message: string }): boolean =>
  e.code === '42P01' || /does not exist/i.test(e.message)

interface FilaDelEspejoEnLaBase {
  pestana: string
  bloque_fila1: number
  persona_id: string | null
  nombre_planilla: string
  horas: number | string | null
  leido_en: string
}

/**
 * EL BLOQUE DE LA PLANILLA QUE CUBRE ESTA QUINCENA.
 *
 * Se pide por la ventana EXACTA (`desde`/`hasta`) y no por solape: un bloque cuyo encabezado abarca
 * otras fechas es otra quincena, y compararlo contra ésta daría una diferencia que no existe. El
 * script escribe la ventana que leyó del encabezado (min/max de las fechas, que vienen
 * desordenadas), así que las dos puntas son las mismas que usa `quincenaDe`.
 */
export async function getEspejoDeLaPlanilla(
  supabase: SupabaseClient, q: Quincena,
): Promise<EspejoDeLaPlanilla> {
  const { data, error } = await supabase.from('jornales_bloque_persona')
    .select('pestana, bloque_fila1, persona_id, nombre_planilla, horas, leido_en')
    .eq('quincena_desde', q.desde).eq('quincena_hasta', q.hasta)
  if (error) {
    return sinTabla(error) ? VACIO : { ...VACIO, error: error.message }
  }
  const filas = (data ?? []) as FilaDelEspejoEnLaBase[]
  if (filas.length === 0) return VACIO

  const horasPorPersona = new Map<string, number>()
  const sinPersona: string[] = []
  const bloques = new Map<string, { pestana: string; filaBloque: number; personas: number }>()
  let leidoEn: string | null = null
  for (const f of filas) {
    const clave = `${f.pestana}|${f.bloque_fila1}`
    const b = bloques.get(clave)
    if (b) b.personas++
    else bloques.set(clave, { pestana: f.pestana, filaBloque: f.bloque_fila1, personas: 1 })
    if (leidoEn == null || f.leido_en > leidoEn) leidoEn = f.leido_en
    if (f.persona_id == null) { sinPersona.push(f.nombre_planilla); continue }
    // UNA PERSONA PUEDE ESTAR EN DOS BLOQUES de la misma quincena (dos obras en «Obreros 26», o una
    // fila en Obreros y otra en Oficina). La planilla suma las dos y acá también: quedarse con una
    // sola publicaría una diferencia que la planilla no tiene.
    const n = Number(f.horas)
    horasPorPersona.set(f.persona_id, (horasPorPersona.get(f.persona_id) ?? 0) + (Number.isFinite(n) ? n : 0))
  }
  return {
    hay: true,
    horasPorPersona,
    leidoEn,
    bloques: [...bloques.values()],
    sinPersona: [...new Set(sinPersona)],
    error: null,
  }
}
