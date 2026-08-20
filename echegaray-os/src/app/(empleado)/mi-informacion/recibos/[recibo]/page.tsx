import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { Aviso, Estado } from '@/shared/components/ds'
import { PantallaEmpleado, Seccion } from '@/features/empleado/components/ShellEmpleado'
import { Dato, Fila, Nada } from '@/features/empleado/components/Filas'
import { getMisRecibos } from '@/features/empleado/services/empleadoService'
import { etiquetaDePeriodo, lecturaDeRecibo, pesos } from '@/features/empleado/services/recibos'
import { hh } from '@/features/mi-cuenta/services/horas'
import { dm } from '@/features/empleado/services/fecha'

// DETALLE DE RECIBO — el neto arriba, y el PDF abajo.
//
// «El detalle que se muestra es el que la liquidación publica. El OS no calcula tu sueldo». Hoy la
// liquidación no publica nada por persona, así que el neto y los días dicen que faltan. Lo que SÍ
// hay es el PDF, que es el documento que vale y el que la gente viene a buscar.

export const dynamic = 'force-dynamic'

export default async function DetalleDeReciboPage({ params }: { params: Promise<{ recibo: string }> }) {
  const { recibo: id } = await params
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')

  const recibos = await getMisRecibos(supabase)
  if (recibos.error) {
    return (
      <PantallaEmpleado titulo="Recibo" volver={{ href: '/mi-informacion/recibos', label: 'Recibos' }}>
        <Aviso tono="neg" titulo="No se pudo leer el recibo." testid="recibo-error">{recibos.error}</Aviso>
      </PantallaEmpleado>
    )
  }
  const r = (recibos.data ?? []).find((x) => x.id === id)
  if (!r) notFound()

  const l = lecturaDeRecibo(r)

  return (
    <PantallaEmpleado
      titulo={etiquetaDePeriodo(r)}
      volver={{ href: '/mi-informacion/recibos', label: 'Recibos' }}
    >
      <div data-testid="cabecera-recibo">
        <p className="text-[11px] text-faint">Neto cobrado</p>
        {l.neto ? (
          <p className="mt-1 font-mono text-[30px] leading-none tabular-nums text-ink" data-testid="neto">{l.neto}</p>
        ) : (
          // NUNCA $ 0. Se dice que el importe no está publicado, y quién lo publica.
          <p className="mt-1 text-[15px] text-faint" data-testid="neto-sin-publicar">
            Todavía no liquidado — el importe no está publicado en el OS
          </p>
        )}
        <p className="mt-2"><Estado tono={l.tono} clave={l.estado}>{l.estado}</Estado></p>
      </div>

      <Seccion titulo="DETALLE">
        <div data-testid="detalle-recibo">
          <Dato rotulo="Período" valor={etiquetaDePeriodo(r)} />
          <Dato rotulo="Días trabajados" valor={r.dias == null ? null : String(r.dias)} falta="no publicado" />
          <Dato rotulo="HH imputadas" valor={r.hh == null ? null : hh(r.hh)} falta="no publicado" />
          <Dato rotulo="Categoría" valor={r.categoria} falta="no publicada" />
          <Dato rotulo="Fecha de emisión" valor={dm(r.fecha_emision) ?? dm(r.fecha_documento)} falta="no publicada" />
          <Dato rotulo="Pago" valor={r.fecha_pago ? `${pesos(r.neto ?? 0)} el ${dm(r.fecha_pago)}` : null} falta="no publicado" />
        </div>
      </Seccion>

      <Seccion titulo="EL RECIBO">
        {r.drive_file_id ? (
          <Fila
            testid="pdf-recibo"
            href={`https://drive.google.com/file/d/${r.drive_file_id}/view`}
            titulo={r.nombre ?? 'Recibo'}
            detalle={r.fecha_documento ? `del ${dm(r.fecha_documento)}` : 'sin fecha'}
            senal="Ver"
          />
        ) : (
          <Nada testid="sin-pdf">Este período no tiene un recibo cargado en tu legajo.</Nada>
        )}
      </Seccion>

      <p className="mt-6 text-[11.5px] leading-relaxed text-faint">
        El detalle que se muestra es el que la liquidación publica. El OS no calcula tu sueldo.
      </p>
    </PantallaEmpleado>
  )
}
