import Link from 'next/link'
import { Aviso, Vacio } from '@/shared/components/ds'
import { contieneEnAlguno } from '@/shared/utils/busqueda'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import { diasDe, etiquetaDia, rotuloSemana, semanaDe } from '../services/asistenciaSemana'
import { getSemanaPorObra } from '../services/jornadaPorObraService'
import {
  armarSemanaPorObra, diasSinMarcar, personasPorObra, totalDeLaSemanaPorObra, totalesPorDia,
} from '../services/semanaPorObra'
import { GrillaAsistenciaObra } from './GrillaAsistenciaObra'

// LA SOLAPA «ASISTENCIA» DE PERSONAL — la semana, por obra.
//
// ═══ POR QUÉ ACÁ Y NO EN UNA PANTALLA PROPIA ═══
//
// Es la MISMA población que la solapa Personal —el plantel— mirada por otra pregunta: no «quién
// trabaja acá» sino «cuántas horas puso cada uno en cada obra esta semana». Una pantalla nueva
// obligaría a elegir desde el menú entre dos listas de las mismas personas.
//
// La semana viaja en la URL (`?semana=2026-09-07`): así se puede pasar «mirá la semana pasada» por
// mensaje, y recargar no devuelve a hoy.

export async function BloqueAsistenciaSemana({ semanaPedida, hoy, q, hrefDe }: {
  semanaPedida?: string
  hoy: string
  /** El texto del buscador. Filtra DESPUÉS de armar la grilla — ver abajo. */
  q?: string
  hrefDe: (semana: string) => string
}) {
  const esFecha = /^\d{4}-\d{2}-\d{2}$/.test(semanaPedida ?? '')
  const semana = semanaDe(esFecha ? (semanaPedida as string) : hoy)
  const supabase = await createClient()
  const datos = await getSemanaPorObra(supabase, semana.desde, semana.hasta)

  if (datos.error || !datos.data) {
    // UNA GRILLA VACÍA PORQUE LA CONSULTA FALLÓ se leería como «no trabajó nadie en toda la semana»,
    // que es una afirmación distinta y falsa.
    return (
      <div style={{ padding: '12px 0' }}>
        <Aviso tono="neg" titulo="No pude leer la asistencia de la semana" testid="asistencia-error">
          {datos.error ?? 'Sin datos.'}
        </Aviso>
      </div>
    )
  }

  const dias = diasDe(semana, datos.data.registros.map((r) => r.fecha))
  const todas = armarSemanaPorObra({ ...datos.data, dias, hoy })
  // EL TEXTO FILTRA DESPUÉS DE ARMAR LA GRILLA, nunca antes. Filtrar los registros crudos sacaría a
  // una persona de las celdas de sus propios compañeros y un día marcado pasaría a «sin marcar».
  const filas = q?.trim()
    ? todas.filter((f) => contieneEnAlguno([f.persona.nombre, f.obra.nombre, f.persona.nota], q))
    : todas
  // LOS CHIPS, LOS TOTALES Y EL RECLAMO SON DE LA SEMANA ENTERA, no de lo que sobrevive al
  // buscador: un total que cambia al escribir deja de ser el total de la semana.
  const totales = totalesPorDia(todas, dias)
  const chips = personasPorObra(todas)
  const sinMarcar = diasSinMarcar(todas)
  const jornadaPorObra = await jornadasDe(supabase, chips.map((c) => c.obra_id))

  return (
    <div data-testid="bloque-asistencia">
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, padding: '4px 0 12px',
      }}>
        <span style={{ fontSize: '13px', color: V.tinta }}>{rotuloSemana(dias)}</span>
        {chips.map((c) => (
          <span key={c.obra_id} data-testid="chip-obra" style={{
            fontSize: '12px', color: V.apagado, border: `1px solid ${V.linea}`,
            borderRadius: 999, padding: '2px 9px',
          }}>
            {c.nombre} <span style={{ color: V.tenue }}>{c.personas}</span>
          </span>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'baseline' }}>
          {sinMarcar > 0 && (
            <span data-testid="dias-sin-marcar" style={{ fontSize: '12px', color: V.warn }}>
              {sinMarcar} {sinMarcar === 1 ? 'día sin marcar' : 'días sin marcar'}
            </span>
          )}
          <Semanas semana={semana.desde} hrefDe={hrefDe} />
        </span>
      </div>

      {filas.length === 0 ? (
        <Vacio>
          {q?.trim()
            ? `Ninguna persona de esta semana coincide con «${q.trim()}».`
            : 'Nadie tiene asignación vigente ni horas cargadas en esta semana.'}
          {' '}La asistencia se carga por obra, desde{' '}
          <Link href="/campo/asistencia" className="underline">Campo · Asistencia</Link>.
        </Vacio>
      ) : (
        <GrillaAsistenciaObra
          filas={filas}
          dias={dias}
          etiquetas={dias.map(etiquetaDia)}
          totalesDia={totales}
          total={totalDeLaSemanaPorObra(todas)}
          jornadaPorObra={jornadaPorObra}
        />
      )}

      <p style={{ marginTop: 10, fontSize: '11.5px', color: V.tenue, lineHeight: 1.5 }} data-testid="pie-asistencia">
        Cada celda se edita; guarda al salir del campo. Escribí «A» para marcar que no vino.
        {' '}Una celda punteada en rojo es un día que otros marcaron y éste no — «sin marcar» no es
        ausente. Un «—» es un feriado o un día sin ningún registro en ninguna obra: de eso no se
        puede afirmar ni que no se trabajó ni que nadie lo cargó.
      </p>
    </div>
  )
}

/** La jornada pactada de cada obra de la grilla: es lo que vale una ausencia cuando se escribe «A». */
async function jornadasDe(
  supabase: Awaited<ReturnType<typeof createClient>>, obraIds: string[],
): Promise<Record<string, number>> {
  if (obraIds.length === 0) return {}
  const { data } = await supabase.from('obra_canonica').select('id, jornada_horas').in('id', obraIds)
  const mapa: Record<string, number> = {}
  for (const o of (data ?? []) as { id: string; jornada_horas: number | string | null }[]) {
    const h = Number(o.jornada_horas)
    if (Number.isFinite(h) && h > 0) mapa[o.id] = h
  }
  return mapa
}

function Semanas({ semana, hrefDe }: { semana: string; hrefDe: (s: string) => string }) {
  const correr = (n: number) => {
    const d = new Date(`${semana}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  return (
    <span style={{ display: 'flex', gap: 10, fontSize: '12px' }}>
      <Link href={hrefDe(correr(-7))} prefetch={false} data-testid="semana-anterior" style={{ color: V.apagado }}>
        ‹ anterior
      </Link>
      <Link href={hrefDe(correr(7))} prefetch={false} data-testid="semana-siguiente" style={{ color: V.apagado }}>
        siguiente ›
      </Link>
    </span>
  )
}
