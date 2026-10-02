// LOS RECIBOS EMITIDOS DE UNA PERSONA — la lectura del legajo.
//
// Sale de `recibo_liquidacion_emitido`, que agrega `es_ultimo` por (persona, quincena): de la misma quincena
// puede haber varios y la ficha marca cuál fue el último, sin esconder los anteriores — también se
// entregaron, y borrar uno sería perder la prueba de qué firmó la persona.
//
// SIN PERMISO NO SE VIAJA: la tabla tiene RLS de sueldos y la respuesta para el jefe de obra sería cero
// filas sin error. «No emitió ningún recibo» y «no podés verlo» se dibujarían iguales, que es exactamente el
// control que no puede decir que no.

import type { SupabaseClient } from '@supabase/supabase-js'
import { esEstado } from '@/shared/recibo/ciclo'
import type { ReciboEnElLegajo, RenglonesSellados } from './reciboEmitido.ts'
import { conBancoDesglosado } from './reimpresionDesglosada.ts'
import { nombresDeUsuarios } from '../../../shared/personas/nombresDeUsuarios.ts'

const numero = (v: unknown): number | null =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v)

const texto = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** Lo que dura el enlace a la foto del papel firmado: se mira ahora, no se comparte. */
const SEGUNDOS_DEL_ENLACE = 300

/** Un jsonb que no tenga la forma esperada no se dibuja como un papel vacío: se dibuja como nada. */
function renglonesDe(v: unknown): RenglonesSellados {
  const o = (v ?? {}) as { horas?: unknown; medios?: unknown }
  return {
    horas: Array.isArray(o.horas) ? (o.horas as RenglonesSellados['horas']) : [],
    medios: Array.isArray(o.medios) ? (o.medios as RenglonesSellados['medios']) : [],
  }
}

/**
 * «REEMPLAZADO POR RP-…»: de cada reemplazado, el código del que lo reemplazó. Se pide APARTE y sólo si hay algún
 * reemplazado: la columna `reemplazado_por` nace con la migración 20261002T2000, y pedirla en el select principal
 * rompería la ficha entera mientras no esté aplicada. Si la lectura falla, el recibo se dibuja «reemplazado» a
 * secas —no se inventa por cuál— y la ficha no se cae.
 */
async function codigosDeLosQueReemplazan(
  supabase: SupabaseClient, filas: readonly Record<string, unknown>[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const reemplazados = filas.filter((f) => f.estado === 'reemplazado').map((f) => String(f.id))
  if (reemplazados.length === 0) return mapa
  const { data } = await supabase.from('recibo_liquidacion').select('id, reemplazado_por').in('id', reemplazados)
  const codigoDe = new Map(filas.map((f) => [String(f.id), texto(f.codigo)]))
  for (const f of (data ?? []) as { id: string; reemplazado_por: string | null }[]) {
    const c = f.reemplazado_por ? codigoDe.get(f.reemplazado_por) : null
    if (c) mapa.set(f.id, c)
  }
  return mapa
}

export interface RecibosDelLegajo {
  puedeVer: boolean
  recibos: ReciboEnElLegajo[]
  error: string | null
}

export async function getRecibosEmitidos(
  supabase: SupabaseClient, p: { personaId: string; puedeVer: boolean },
): Promise<RecibosDelLegajo> {
  if (!p.puedeVer) return { puedeVer: false, recibos: [], error: null }
  const { data, error } = await supabase
    .from('recibo_liquidacion_emitido')
    .select('id, codigo, persona_id, nombre, categoria, quincena_desde, quincena_hasta, horas, banco, efectivo, total, renglones, emitido_en, emitido_por, es_ultimo, estado, enviado_en, trazo, firmado_en, firmado_desde, papel_path, papel_subido_en, papel_sin_foto_en, papel_sin_foto_por, archivado_en, observacion')
    .eq('persona_id', p.personaId)
    .order('quincena_desde', { ascending: false })
    .order('emitido_en', { ascending: false })
  if (error) {
    // La migración todavía no está aplicada: se dice tal cual, y NO se dibuja «sin recibos».
    const falta = error.code === '42P01' || /recibo_liquidacion_emitido/.test(error.message)
    return {
      puedeVer: true, recibos: [],
      error: falta
        ? 'Todavía no puedo mostrar los recibos emitidos: falta aplicar la migración en la base.'
        : `No pude leer los recibos emitidos: ${error.message}`,
    }
  }
  const filas = (data ?? []) as Record<string, unknown>[]
  // QUIÉN LO EMITIÓ, CON NOMBRE. Un uuid recortado no le dice nada a nadie, y sólo se piden los emisores
  // que aparecen en lo que se va a dibujar. Sin nombre cargado queda `null` y la pantalla escribe «sin
  // identificar», que es más honesto que un uuid con pinta de nombre.
  const ids = [...new Set(filas.flatMap((f) => [f.emitido_por, f.papel_sin_foto_por]).filter((v): v is string => typeof v === 'string'))]
  const nombres = ids.length > 0 ? await nombresDeUsuarios(supabase) : new Map<string, string>()
  const reemplazadoPor = await codigosDeLosQueReemplazan(supabase, filas)
  const recibos = filas.map((f): ReciboEnElLegajo => ({
    id: String(f.id),
    codigo: typeof f.codigo === 'string' ? f.codigo : null,
    // EL CICLO (D13): un estado que la base no conoce NO se dibuja como «emitido» —eso diría que falta
    // firmarlo cuando quizá ya está archivado—; se deja `observado`, que es el que obliga a mirar.
    estado: esEstado(f.estado) ? f.estado : 'observado',
    enviadoEn: texto(f.enviado_en),
    trazo: texto(f.trazo),
    firmadoEn: texto(f.firmado_en),
    firmadoDesde: texto(f.firmado_desde),
    papelPath: texto(f.papel_path),
    papelUrl: null,
    papelSubidoEn: texto(f.papel_subido_en),
    papelSinFotoEn: texto(f.papel_sin_foto_en),
    papelSinFotoPor: typeof f.papel_sin_foto_por === 'string' ? nombres.get(f.papel_sin_foto_por) ?? 'sin identificar' : null,
    archivadoEn: texto(f.archivado_en),
    observacion: texto(f.observacion),
    reemplazadoPor: reemplazadoPor.get(String(f.id)) ?? null,
    personaId: String(f.persona_id),
    nombre: String(f.nombre ?? ''),
    categoria: (f.categoria as string | null) ?? null,
    quincenaDesde: String(f.quincena_desde ?? '').slice(0, 10),
    quincenaHasta: String(f.quincena_hasta ?? '').slice(0, 10),
    horas: numero(f.horas),
    banco: numero(f.banco),
    efectivo: numero(f.efectivo),
    total: numero(f.total),
    renglones: renglonesDe(f.renglones),
    emitidoEn: String(f.emitido_en ?? ''),
    emitidoPor: typeof f.emitido_por === 'string' ? nombres.get(f.emitido_por) ?? null : null,
    esUltimo: f.es_ultimo === true,
  }))
  // LA FOTO DEL PAPEL FIRMADO, MIRABLE (D13: «verificar antes de archivar»). El bucket es privado: sin
  // enlace firmado la pantalla mostraría el nombre de un archivo que nadie puede abrir, y verificar una
  // firma que no se puede ver es exactamente el control que no puede decir que no. Un enlace que no sale
  // deja `papelUrl` en null y la pantalla dice que no pudo abrirla, no que no hay papel.
  for (const r of recibos) {
    if (!r.papelPath) continue
    const { data: firmado } = await supabase.storage
      .from('comprobantes').createSignedUrl(r.papelPath, SEGUNDOS_DEL_ENLACE)
    r.papelUrl = firmado?.signedUrl ?? null
  }
  return { puedeVer: true, recibos: await conBancoDesglosado(supabase, p.personaId, recibos), error: null }
}
