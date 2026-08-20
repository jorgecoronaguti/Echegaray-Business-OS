import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { categoriaDe } from '@/features/mi-cuenta/services/documentos'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { Aviso, Estado } from '@/shared/components/ds'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { Fila, Nada } from '@/features/empleado/components/Filas'
import { getMisDocumentos } from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import {
  accionDe, avisoDeDocumentos, ESTADO_LABEL, ESTADO_TONO, estadoEnPantalla, ordenar,
} from '@/features/empleado/services/documentos'
import { dm } from '@/features/empleado/services/fecha'

// «MIS DOCUMENTOS» — una lista legible, no una tabla de escritorio comprimida.
//
// El handoff: «Mobile: lista legible (nombre, categoría, punto + estado, vencimiento, acción a la
// derecha). Desktop: Documento | Categoría | Fecha | Vencimiento | Estado | Acción». La misma
// información en dos densidades — en 390px, seis columnas se leen con lupa o se desplazan de
// costado, y las dos cosas se abandonan.
//
// ═══ LOS RECIBOS NO ESTÁN ACÁ ═══
//
// 652 de los 847 papeles del legajo son recibos de sueldo. Dejarlos en esta lista sepulta el apto
// médico que vence bajo tres años de recibos. Tienen su propia pantalla, que es donde se buscan.
// El filtro vive en la vista `mi_documento_legajo`, no en este archivo.

export const dynamic = 'force-dynamic'

export default async function MisDocumentosPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilPropio(supabase, user.id)

  if (!perfil.data?.persona_id) {
    return (
      <PantallaEmpleado titulo="Mis documentos" volver={{ href: '/mi-informacion', label: 'Mi información' }}>
        <SinVinculo que="tus documentos" disponible={perfil.data?.vinculoDisponible !== false} />
      </PantallaEmpleado>
    )
  }

  const hoy = await hoyISO()
  const docs = await getMisDocumentos(supabase)
  const lista = ordenar(docs.data ?? [], hoy)
  const aviso = avisoDeDocumentos(docs.data ?? [], hoy)

  return (
    <PantallaEmpleado
      titulo="Mis documentos"
      volver={{ href: '/mi-informacion', label: 'Mi información' }}
      sub={aviso ? <span className="text-warn" data-testid="aviso-documentos">{aviso}</span> : undefined}
    >
      {docs.error && <Aviso tono="neg" titulo="No se pudieron leer tus documentos." testid="documentos-error">{docs.error}</Aviso>}

      {/* ── ESCRITORIO: la tabla del handoff ─────────────────────────────────────────── */}
      <div className="hidden lg:block" data-testid="tabla-documentos">
        <div className="flex items-center gap-3 border-b border-line py-2 text-[10.5px] font-semibold tracking-[0.1em] text-faint">
          <span className="flex-1">DOCUMENTO</span>
          <span className="w-[150px]">CATEGORÍA</span>
          <span className="w-[90px]">FECHA</span>
          <span className="w-[100px]">VENCIMIENTO</span>
          <span className="w-[150px]">ESTADO</span>
          <span className="w-[110px] text-right">ACCIÓN</span>
        </div>
        {lista.map((d) => {
          const e = estadoEnPantalla(d, hoy)
          return (
            <div key={d.id} data-testid="fila-documento-desktop" className="flex items-center gap-3 border-b border-[#EFEEEA] py-2.5 text-[13px]">
              <span className="flex-1 min-w-0 truncate text-ink">{d.nombre ?? categoriaDe(d.tipo_documento)}</span>
              <span className="w-[150px] text-muted">{categoriaDe(d.tipo_documento)}</span>
              <span className="w-[90px] font-mono tabular-nums text-muted">{dm(d.fecha_documento) ?? '—'}</span>
              <span className="w-[100px] font-mono tabular-nums text-muted">{dm(d.fecha_vencimiento) ?? 'no vence'}</span>
              <span className="w-[150px]"><Estado tono={ESTADO_TONO[e]} clave={e}>{ESTADO_LABEL[e]}</Estado></span>
              <span className="w-[110px] text-right">
                <a href={`/mi-informacion/documentos/${d.id}`} className="text-[12.5px] text-muted underline hover:text-ink">
                  {accionDe(e).texto}
                </a>
              </span>
            </div>
          )
        })}
      </div>

      {/* ── TELÉFONO: la lista ───────────────────────────────────────────────────────── */}
      <div className="lg:hidden" data-testid="lista-documentos">
        {lista.map((d) => {
          const e = estadoEnPantalla(d, hoy)
          return (
            <Fila
              key={d.id}
              testid="fila-documento"
              href={`/mi-informacion/documentos/${d.id}`}
              titulo={d.nombre ?? categoriaDe(d.tipo_documento)}
              detalle={
                <>
                  {categoriaDe(d.tipo_documento)}
                  {d.fecha_vencimiento ? ` · vence ${dm(d.fecha_vencimiento)}` : ''}
                </>
              }
              senal={<Estado tono={ESTADO_TONO[e]} clave={e}>{ESTADO_LABEL[e]}</Estado>}
              accion={<span className="whitespace-nowrap text-[12px] text-muted">{accionDe(e).texto}</span>}
            />
          )
        })}
      </div>

      {lista.length === 0 && (
        <Nada testid="sin-documentos">
          No hay documentos cargados en tu legajo. Los carga Administración, y cuando te pidan uno
          aparece acá con el estado «Solicitado».
        </Nada>
      )}

      <p className="mt-6 text-[11.5px] leading-relaxed text-faint">
        Sólo tus documentos. Lo que subís queda en revisión: no reemplaza al documento oficial hasta
        que Administración lo apruebe.
      </p>
    </PantallaEmpleado>
  )
}
