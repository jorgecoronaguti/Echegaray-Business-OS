// 09 · HOY EN OBRA — quién está, por cuadrilla, contra cuántos se esperaban.
//
// ═══ POR QUÉ LEE ACÁ Y NO EN LA PÁGINA ═══
//
// La solapa Personal se monta desde la ficha de obra, que sirve seis solapas con una sola lectura
// en bloque. Meter la presencia en ese bloque haría que las otras cinco esperen una consulta que
// sólo esta sección usa. Con la lectura acá adentro y un `Suspense` alrededor, la solapa se dibuja
// entera y la presencia llega cuando llega — que es lo único de esta pantalla que cambia solo.
//
// ═══ LA LECTURA ES LA MISMA QUE «EN OBRA AHORA» ═══
//
// `getPresencia` sobre `presencia_del_dia`, que corre con los permisos de quien pregunta
// (`security_invoker`). No hay un filtro por rol en TypeScript: si mañana el jefe de obra deja de
// ver otras obras, se cambia la policy y esta sección obedece sola.
//
// ═══ EL PULSO ES LA ÚNICA ANIMACIÓN, Y SIGNIFICA UNA COSA ═══
//
// «Esta jornada está abierta». Un punto quieto es una jornada cerrada, y el reloj detenido pierde el
// peso: un reloj que sigue corriendo sobre alguien que se fue a las tres es la forma más barata de
// que la pantalla mienta durante toda la tarde.

import { createClient } from '@/lib/supabase/server'
import { PuntoActivo, RelojDeJornada } from '@/features/administracion/components/RelojDeJornada'
import { lecturaDePunto } from '@/features/administracion/services/presencia'
import { getPresencia } from '@/features/administracion/services/presenciaService'
import { Aviso, Estado, Eyebrow, Vacio } from '@/shared/components/ds'
import {
  estadoDeFila, hoyEnObra, type AsignadoDeObra, type FilaHoy, type GrupoHoy,
} from '../services/presenciaObra'

const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : null)

export async function HoyEnObra({ obraId, asignaciones }: {
  obraId: string
  asignaciones: AsignadoDeObra[]
}) {
  const supabase = await createClient()
  const hoy = new Date().toISOString().slice(0, 10)
  const { data, error } = await getPresencia(supabase, hoy, obraId)

  // UN CONTROL QUE NO PUDO MIRAR NO DICE «NO ESTÁ». Si la lectura falla, la sección lo dice con el
  // error de la fuente en vez de dibujar una obra vacía, que se leería «hoy no vino nadie».
  if (error || !data) {
    return (
      <section data-testid="hoy-en-obra">
        <Eyebrow className="mb-2.5">Hoy en obra</Eyebrow>
        <Aviso tono="neg">No pude leer las marcas de hoy: {error ?? 'sin datos'}</Aviso>
      </section>
    )
  }

  const r = hoyEnObra(asignaciones, data)

  return (
    <section data-testid="hoy-en-obra">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <Eyebrow>Hoy en obra</Eyebrow>
        <p className="text-[12.5px] text-muted" data-testid="resumen-hoy">
          {r.asignados === 0 && r.sinAsignacion === 0
            ? 'nadie con asignación vigente'
            : (
              <>
                <span className="font-medium text-ink">{r.enObra}</span> en obra
                {r.cerraron > 0 && <> · {r.cerraron} ya {r.cerraron === 1 ? 'cerró' : 'cerraron'}</>}
                {/* SIN FICHAR NO ES AUSENTE: incluye al que no tiene teléfono y al que no le dio
                    permiso al GPS. Quién faltó lo declara el jefe. */}
                {r.sinFichar > 0 && <span className="text-faint"> · {r.sinFichar} sin fichar</span>}
                {r.sinAsignacion > 0 && (
                  <span className="text-warn"> · {r.sinAsignacion} sin asignación</span>
                )}
              </>
              )}
        </p>
      </div>

      {r.grupos.length === 0
        ? <Vacio>Nadie tiene una asignación vigente ni marcó hoy en esta obra. Se asigna con «+ Asignar persona».</Vacio>
        : (
          <div className="rounded-card border border-line bg-surface">
            {r.grupos.map((g) => <Grupo key={g.cuadrilla} grupo={g} />)}
          </div>
          )}
    </section>
  )
}

function Grupo({ grupo }: { grupo: GrupoHoy }) {
  const completa = grupo.asignados > 0 && grupo.presentes >= grupo.asignados
  return (
    <div data-testid="grupo-cuadrilla" data-cuadrilla={grupo.cuadrilla}>
      <div className="flex items-center justify-between gap-3 border-b border-surface-sunken bg-surface-quiet px-3 py-1.5">
        <span className="truncate text-[11.5px] font-semibold uppercase tracking-[0.04em] text-ink">
          {grupo.cuadrilla}
        </span>
        {/* «N de M» y no una barra: presentes sobre asignados es una fracción de gente, no un avance
            —y con 0 asignados no hay fracción que dibujar, hay alguien que fichó donde no debía. */}
        <span className={`shrink-0 font-mono text-[11.5px] tabular-nums ${completa ? 'text-pos' : 'text-muted'}`}>
          {grupo.asignados === 0 ? `${grupo.presentes} sin asignar` : `${grupo.presentes} de ${grupo.asignados}`}
        </span>
      </div>
      {grupo.filas.map((f) => <Fila key={f.personaId} fila={f} />)}
    </div>
  )
}

function Fila({ fila }: { fila: FilaHoy }) {
  const e = estadoDeFila(fila)
  const activo = fila.marca?.estado === 'activo'
  const punto = lecturaDePunto(fila.marca ?? { lat: null, lon: null, precision_m: null })
  return (
    <div
      className={`flex h-fila items-center gap-3 border-b border-surface-sunken px-3 last:border-b-0 ${
        fila.asignado ? '' : 'border-l-[3px] border-l-warn'
      }`}
      data-testid="fila-presencia-obra"
    >
      <span className="flex w-2 shrink-0 justify-center">
        {activo ? <PuntoActivo /> : <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-line-strong" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-ink">{fila.nombre}</span>
        {fila.rol && <span className="block truncate text-[11px] text-faint">{fila.rol}</span>}
      </span>
      <span className="w-[52px] shrink-0 text-right font-mono text-[12px] text-muted tabular-nums">
        {hora(fila.marca?.entrada ?? null) ?? <span className="text-faint">—</span>}
      </span>
      <span className="w-[68px] shrink-0 text-right">
        {activo
          ? <RelojDeJornada entrada={fila.marca!.entrada} />
          : <span className="font-mono text-[12px] text-faint tabular-nums">—</span>}
      </span>
      {/* La ubicación sólo habla cuando tiene algo que decir: un punto fiable no gasta una columna. */}
      <span className="hidden w-[96px] shrink-0 text-right text-[11px] sm:block">
        <span className={punto.hay && !punto.fiable ? 'text-warn' : 'text-faint'}>
          {fila.marca ? (punto.fiable ? '' : punto.texto) : ''}
        </span>
      </span>
      <span className="w-[112px] shrink-0 text-right">
        <Estado tono={e.tono} clave={e.texto}>{e.texto}</Estado>
      </span>
    </div>
  )
}
