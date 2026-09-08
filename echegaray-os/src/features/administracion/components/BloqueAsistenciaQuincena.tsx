import Link from 'next/link'
import { Aviso, Vacio } from '@/shared/components/ds'
import { contieneEnAlguno } from '@/shared/utils/busqueda'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import {
  correrQuincena, diasDeLaQuincenaSinDomingos, esFechaISO, etiquetaDiaCorta, noLaborablesDe,
  nombreDia, quincenaDe, rotuloQuincena,
} from '../services/quincena'
import { getQuincenaPorObra } from '../services/jornadaPorObraService'
import {
  armarQuincenaPorObra, diasSinMarcar, personasPorObra, totalDeLaQuincena, totalesPorDia,
} from '../services/quincenaPorObra'
import { GrillaAsistenciaObra } from './GrillaAsistenciaObra'

// LA SOLAPA «ASISTENCIA» DE PERSONAL — la QUINCENA, por obra.
//
// ═══ POR QUÉ ACÁ Y NO EN UNA PANTALLA PROPIA ═══
//
// Es la MISMA población que la solapa Personal —el plantel— mirada por otra pregunta: no «quién
// trabaja acá» sino «cuántas horas puso cada uno en cada obra en esta quincena». Una pantalla nueva
// obligaría a elegir desde el menú entre dos listas de las mismas personas.
//
// ═══ POR QUÉ QUINCENA Y NO SEMANA ═══
//
// El dueño: *"la vista tiene q ser por quincena"*. Los jornales se pagan del 1 al 15 y del 16 a fin
// de mes; una grilla lunes→domingo obliga a sumar dos semanas y media a mano para cerrar contra la
// liquidación, y a decidir qué hacer con la semana que cruza el 15. El corte no se define acá: sale
// de `services/quincena.ts`, que a su vez reusa `ventanaDe('quincena')`.
//
// La quincena viaja en la URL (`?quincena=2026-09-16`): así se puede pasar «mirá la quincena
// pasada» por mensaje, y recargar no devuelve a hoy.

export async function BloqueAsistenciaQuincena({
  quincenaPedida, hoy, q, hrefDe, puedeCorregir, puedeCambiarObra,
}: {
  /** Cualquier día de la quincena que se quiere ver. Lo que no sea una fecha vuelve a la de hoy. */
  quincenaPedida?: string
  hoy: string
  /** El texto del buscador. Filtra DESPUÉS de armar la grilla — ver abajo. */
  q?: string
  hrefDe: (quincena: string) => string
  /** Corregir la OBRA de un día es de Administración. La policy decide de verdad; esto evita
   *  ofrecer un botón que va a rebotar contra un `permission denied`. */
  puedeCorregir: boolean
  /** Quién puede mover a una persona de obra: dirección y administración, no el jefe de obra. */
  puedeCambiarObra: boolean
}) {
  const quincena = quincenaDe(esFechaISO(quincenaPedida) ? quincenaPedida : hoy)
  const supabase = await createClient()
  const datos = await getQuincenaPorObra(supabase, quincena.desde, quincena.hasta)

  if (datos.error || !datos.data) {
    // UNA GRILLA VACÍA PORQUE LA CONSULTA FALLÓ se leería como «no trabajó nadie en toda la
    // quincena», que es una afirmación distinta y falsa.
    return (
      <div style={{ padding: '12px 0' }}>
        <Aviso tono="neg" titulo="No pude leer la asistencia de la quincena" testid="asistencia-error">
          {datos.error ?? 'Sin datos.'}
        </Aviso>
      </div>
    )
  }

  // LOS DOMINGOS NO SON COLUMNA. Orden del dueño del 08/09/2026: no se trabaja, sale de la
  // consideración. La ventana que se le pide a la base sigue siendo la quincena ENTERA —abajo
  // `quincena.desde`/`quincena.hasta`—, así que un registro en domingo se lee igual; lo que no
  // hace es ocupar dos casillas de guiones por período.
  const dias = diasDeLaQuincenaSinDomingos(quincena)
  // EL SÁBADO ENTRA A LOS NO LABORABLES. Sin esto se dibujaría «sin marcar» —el rojo que reclama—
  // en todas las filas. Un sábado TRABAJADO se sigue viendo: lo declarado manda sobre el almanaque.
  const noLaborables = noLaborablesDe(dias, datos.data.noLaborables)
  const todas = armarQuincenaPorObra({ ...datos.data, noLaborables, dias, hoy })
  // UNA FILA POR PERSONA: si dos filas comparten `clave`, la grilla está duplicando gente. Es la
  // afirmación que el dueño rechazó en producción, y acá cuesta una línea comprobarla.
  if (new Set(todas.map((f) => f.clave)).size !== todas.length) {
    throw new Error('La grilla armó dos filas para la misma persona.')
  }
  // EL TEXTO FILTRA DESPUÉS DE ARMAR LA GRILLA, nunca antes. Filtrar los registros crudos sacaría a
  // una persona de las celdas de sus propios compañeros y un día marcado pasaría a «sin marcar».
  const filas = q?.trim()
    ? todas.filter((f) => contieneEnAlguno([f.persona.nombre, f.rotuloObra, f.persona.nota], q))
    : todas
  // LOS CHIPS, LOS TOTALES Y EL RECLAMO SON DE LA QUINCENA ENTERA, no de lo que sobrevive al
  // buscador: un total que cambia al escribir deja de ser el total de la quincena.
  const totales = totalesPorDia(todas, dias)
  const chips = personasPorObra(todas)
  const sinMarcar = diasSinMarcar(todas)
  // LAS OBRAS A LAS QUE SE PUEDE MOVER UN DÍA: las activas que la sesión ve. La jornada de cada una
  // viaja junta —es lo que vale una ausencia— y sale del mismo viaje, no de dos.
  const obras = await obrasElegibles(supabase)
  const jornadaPorObra = Object.fromEntries(obras.map((o) => [o.id, o.jornada]))
  const tenues = new Set(noLaborables)

  return (
    <div data-testid="bloque-asistencia">
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, padding: '4px 0 12px',
      }}>
        <span style={{ fontSize: '13px', color: V.tinta }} data-testid="rotulo-quincena">
          {rotuloQuincena(quincena)}
        </span>
        {chips.map((c) => (
          <span key={c.rotulo} data-testid="chip-obra" style={{
            fontSize: '12px', color: V.apagado, border: `1px solid ${V.linea}`,
            borderRadius: 999, padding: '2px 9px',
          }}>
            {c.rotulo} <span style={{ color: V.tenue }}>{c.personas}</span>
          </span>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'baseline' }}>
          {sinMarcar > 0 && (
            <span data-testid="dias-sin-marcar" style={{ fontSize: '12px', color: V.warn }}>
              {/* «SIN CARGAR», NO «SIN MARCAR». Marcar es fichar —la persona, con su teléfono— y
                  el fichaje ni siquiera está en uso; lo que falta acá es que alguien cargue las
                  horas de ese día. El rótulo acusaba del acto equivocado y a quien no fue. */}
              {sinMarcar} {sinMarcar === 1 ? 'día sin cargar' : 'días sin cargar'}
            </span>
          )}
          <Quincenas quincena={quincena} hrefDe={hrefDe} />
        </span>
      </div>

      {filas.length === 0 ? (
        <Vacio>
          {q?.trim()
            ? `Ninguna persona de esta quincena coincide con «${q.trim()}».`
            : 'Nadie tiene asignación vigente ni horas cargadas en esta quincena.'}
          {' '}La asistencia se carga por obra, desde{' '}
          <Link href="/campo/asistencia" className="underline">Campo · Asistencia</Link>.
        </Vacio>
      ) : (
        <GrillaAsistenciaObra
          filas={filas}
          dias={dias}
          etiquetas={dias.map(etiquetaDiaCorta)}
          titulos={dias.map(nombreDia)}
          columnasTenues={dias.map((d) => tenues.has(d))}
          totalesDia={totales}
          total={totalDeLaQuincena(todas)}
          jornadaPorObra={jornadaPorObra}
          obras={obras.map((o) => ({ id: o.id, nombre: o.nombre }))}
          puedeCorregir={puedeCorregir}
          puedeCambiarObra={puedeCambiarObra}
        />
      )}

      <p style={{ marginTop: 10, fontSize: '11.5px', color: V.tenue, lineHeight: 1.5 }} data-testid="pie-asistencia">
        Cada celda se edita; guarda al salir del campo. Escribí «A» para marcar que no vino: la «A»
        y la «L» van arriba, como estado; el número abajo, como cantidad.
        {' '}Un marco punteado es un día hábil sin horas cargadas — no es una falta. Un «—» es un
        día no laborable o un día sin ningún registro en ninguna obra: de eso no se puede afirmar ni
        que no se trabajó ni que nadie lo cargó.
      </p>
    </div>
  )
}

/**
 * Las obras a las que se puede mover un día, con su jornada pactada. SÓLO LAS ACTIVAS.
 *
 * Una obra cerrada con un día mal imputado no queda sin salida: «Sacar lo cargado» sigue
 * funcionando sobre la fila que ya existe —el borrado no mira el estado de la obra destino— y para
 * moverlo a otra parte se reabre la obra, que es una decisión que queda registrada.
 */
async function obrasElegibles(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ id: string; nombre: string; jornada: number }[]> {
  const { data } = await supabase
    .from('obra_canonica').select('id, nombre, jornada_horas, estado').order('nombre')
  return ((data ?? []) as {
    id: string; nombre: string; jornada_horas: number | string | null; estado: string | null
  }[])
    // SÓLO LAS ACTIVAS SE OFRECEN COMO DESTINO. La acción lo rechaza igual —es la puerta— pero un
    // selector que ofrece 40 obras cerradas para que la acción las rebote una por una enseña que la
    // pantalla miente. Una obra cerrada con horas mal imputadas se corrige reabriéndola.
    .filter((o) => o.estado === 'activa')
    .map((o) => {
      const h = Number(o.jornada_horas)
      return { id: o.id, nombre: o.nombre, jornada: Number.isFinite(h) && h > 0 ? h : 0 }
    })
}

/** «‹ anterior · siguiente ›» salta de QUINCENA, no de quince días — ver `correrQuincena`. */
function Quincenas({ quincena, hrefDe }: {
  quincena: { desde: string; hasta: string }; hrefDe: (q: string) => string
}) {
  return (
    <span style={{ display: 'flex', gap: 10, fontSize: '12px' }}>
      <Link href={hrefDe(correrQuincena(quincena, -1).desde)} prefetch={false}
        data-testid="quincena-anterior" style={{ color: V.apagado }}>
        ‹ anterior
      </Link>
      <Link href={hrefDe(correrQuincena(quincena, 1).desde)} prefetch={false}
        data-testid="quincena-siguiente" style={{ color: V.apagado }}>
        siguiente ›
      </Link>
    </span>
  )
}
