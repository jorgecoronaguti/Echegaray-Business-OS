// ═══ 05 · REGISTRAR AVANCE ═══
//
// Pantalla entera y no un cajón: registrar avance es el acto con más consecuencias del módulo
// —mueve el avance de la obra, el rendimiento y la proyección de HH— y se hace mirando tres cosas a
// la vez: los pasos, las horas y la evidencia. En 412px no entran.
//
// El `actividad_id` llega por la RUTA y la acción se ata con `.bind`: el id nunca viaja en un campo
// del formulario, porque un id editable desde el navegador dejaría escribir el avance de la
// actividad de al lado.
//
// EL FORMULARIO ES EL MISMO QUE EL DEL PANEL LATERAL (`FormAvanceEmbebido`). Esta página pone el
// envase —cabecera de obra, ancho, historial—; la regla vive en el componente, una sola vez.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getObra } from '@/features/obras/services/obrasService'
import { getArbol, getHistorial, getPasos } from '@/features/obras/services/tareasService'
import { getCuadrillas } from '@/features/obras/services/personalService'
import { getPerfilActual } from '@/features/auth/services/authService'
import { registrarAvance } from '@/features/obras/services/actionsAvance'
import { CabeceraDeObra } from '@/features/obras/components/CabeceraDeObra'
import { FormAvance } from '@/features/obras/components/FormAvance'
import { fecha, porcentaje } from '@/features/obras/components/formato'

export const dynamic = 'force-dynamic'

export default async function RegistrarAvancePage({ params }: {
  params: Promise<{ obra: string; actividad: string }>
}) {
  const { obra: obraId, actividad } = await params
  const supabase = await createClient()

  const [{ data: obra }, arbol, cuadrillas, perfil] = await Promise.all([
    getObra(supabase, obraId),
    getArbol(supabase, obraId),
    getCuadrillas(supabase),
    getPerfilActual(supabase),
  ])
  if (!obra) notFound()
  const nodo = arbol.data?.find((n) => n.id === actividad)
  if (!nodo) notFound()

  const [pasos, historial] = await Promise.all([
    getPasos(supabase, actividad),
    getHistorial(supabase, actividad),
  ])

  return (
    <div className="min-h-screen bg-canvas">
      <>
        {/* LA CABECERA DE LA OBRA, igual que en las otras cinco pantallas (24/08 · C-CANON §12).
            Tenía sólo el «Volver», así que desde acá no se veía de qué obra se estaba registrando
            avance ni se podía saltar a otra solapa sin deshacer el camino.
            LA VUELTA NO ES AL PORTAFOLIO: esta pantalla se abre DESDE una actividad concreta y
            vuelve a esa actividad, con el panel abierto donde estaba. */}
        <CabeceraDeObra
          obraId={obraId}
          obra={obra}
          volverA={`/obras/${obraId}?vista=tareas&act=${actividad}`}
          volverLabel={`${obra.nombre} · Tareas`}
          vistaActiva="tareas"
          pantalla={`Registrar avance · ${nodo.nombre}`}
        />

        {/* UN CONTENEDOR NO SE MIDE, SE AGREGA: la base lo rechaza con un trigger y el formulario
            lo dice antes de que alguien lo complete. La guarda se mudó ADENTRO del componente
            (24/08): el mismo formulario se embebe en el panel lateral de la tarea, y una regla
            escrita en la página es una regla que el otro envase no cumple. */}
        <div className="mx-auto w-full max-w-[1060px] px-5 py-5">
        <FormAvance
          nodo={nodo}
          pasos={pasos.data ?? []}
          cuadrillas={cuadrillas}
          autor={perfil.data?.nombre ?? 'sin identificar'}
          hoy={new Date().toISOString().slice(0, 10)}
          registrar={registrarAvance.bind(null, obraId, actividad)}
        />

        <section className="mt-8">
          <h2 className="mb-1.5 text-[13px] font-semibold text-ink">Registros anteriores</h2>
          {(historial.data ?? []).length === 0 ? (
            <p className="text-[12.5px] text-faint">Sin avances registrados.</p>
          ) : (
            <ul className="max-w-[560px]">
              {(historial.data ?? []).slice(0, 12).map((h) => (
                <li key={h.id} className="flex items-baseline gap-2 border-b border-[#EFEEEA] py-1.5 last:border-0">
                  <span className="w-[50px] shrink-0 font-mono text-[10px] tabular-nums text-faint">{fecha(h.fecha)}</span>
                  <span className="flex-1">
                    <span className="block text-[11.5px] text-ink-soft">{h.criterio || h.comentario || 'Avance registrado'}</span>
                    <span className="block text-[10px] text-muted">
                      {h.autor ?? 'sin firma'} · {h.fuente ?? 'sin origen'}{h.masivo && ' · en lote'}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-soft">
                    {h.avance_pct !== null ? porcentaje(h.avance_pct) : h.cantidad !== null ? String(h.cantidad) : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        </div>
      </>
    </div>
  )
}
