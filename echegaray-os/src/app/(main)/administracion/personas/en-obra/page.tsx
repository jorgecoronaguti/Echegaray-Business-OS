import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { PageShell } from '@/shared/components/ui'
import { Aviso, Estado, Eyebrow, Vacio } from '@/shared/components/ds'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { RelojDeJornada, PuntoActivo } from '@/features/administracion/components/RelojDeJornada'
import {
  getEsperados, getObrasConGente, getPresencia,
} from '@/features/administracion/services/presenciaService'
import {
  agrupar, lecturaDePunto, mapa, resumen, type Esperado, type FilaPresencia,
} from '@/features/administracion/services/presencia'

// «EN OBRA AHORA» — quién está, desde qué hora y dónde arrancó el día.
//
// ═══ QUIÉN LA VE ═══
//
// Dirección, Administración y Jefe de obra. El nivel campo NO: ni siquiera puede abrir
// `/administracion` (`CAMPO_RUTAS_PERMITIDAS`), y aunque llamara a PostgREST a mano, la policy de
// `asistencia_marca` le devuelve su propia fila y nada más. Esta comprobación es LA PUERTA —evita
// dibujar una pantalla que la base va a vaciar—, no la cerradura.
//
// ═══ LO QUE ESTA PANTALLA NO AFIRMA ═══
//
// «Sin registrar» no es «ausente», y no se cuenta como falta en ningún lado. Un operario sin
// teléfono, uno que le negó el permiso al GPS y uno que faltó se ven idénticos desde acá. Convertir
// esa ignorancia en una ausencia sería fabricar una novedad de liquidación con cara de dato.
//
// Y donde no hay coordenada dice «sin ubicación». Nunca el punto de la obra: un dato inventado se
// ve exactamente igual que uno real, y éste decide discusiones sobre si alguien estaba donde dijo.

export const dynamic = 'force-dynamic'

const hora = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const hoyISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default async function EnObraPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string }>
}) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilActual(supabase, user.id)
  if (!esAdministracion(perfil.data?.rol)) redirect('/obras')

  const { obra } = await searchParams
  const fecha = hoyISO()

  const [presencia, esperados, obras] = await Promise.all([
    getPresencia(supabase, fecha, obra),
    getEsperados(supabase, obra),
    getObrasConGente(supabase),
  ])

  if (presencia.error) {
    return (
      <PageShell title="En obra ahora">
        <NavAdministracion />
        <Aviso tono="neg" titulo="No pude leer la presencia" testid="presencia-error">{presencia.error}</Aviso>
      </PageShell>
    )
  }

  const g = agrupar(presencia.data ?? [], esperados.data ?? [])
  const hayAlgo = g.enObra.length + g.cerradas.length + g.faltaSalida.length + g.sinRegistrar.length > 0

  return (
    <PageShell
      title="En obra ahora"
      subtitle={
        <span data-testid="resumen-presencia">
          {hayAlgo ? resumen(g) : 'Todavía no marcó nadie hoy'}
          <span className="text-faint"> · {fecha.slice(8, 10)}/{fecha.slice(5, 7)}</span>
        </span>
      }
    >
      <NavAdministracion />

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <nav className="flex flex-wrap gap-1" data-testid="filtro-obra">
          <FiltroObra href="/administracion/personas/en-obra" activo={!obra}>Todas las obras</FiltroObra>
          {(obras.data ?? []).map((o) => (
            <FiltroObra
              key={o.id}
              href={`/administracion/personas/en-obra?obra=${encodeURIComponent(o.id)}`}
              activo={obra === o.id}
            >
              {o.nombre}
            </FiltroObra>
          ))}
        </nav>
        <Link href="/administracion/personas" className="ml-auto text-[12.5px] text-muted hover:text-ink">
          Personal →
        </Link>
      </div>

      {!hayAlgo && (
        <Vacio>
          Nadie marcó asistencia hoy y no hay nadie con asignación vigente en esta obra. La marca la
          hace cada persona desde su teléfono, en «Hoy»; las asignaciones las carga Administración
          desde la solapa Personal de la obra.
        </Vacio>
      )}

      {g.enObra.length > 0 && (
        <Bloque titulo="EN OBRA" cuenta={g.enObra.length} testid="bloque-en-obra">
          {g.enObra.map((f) => <Fila key={f.persona_id} f={f} activo />)}
        </Bloque>
      )}

      {g.faltaSalida.length > 0 && (
        <Bloque titulo="SIN CERRAR" cuenta={g.faltaSalida.length} testid="bloque-sin-cerrar">
          <p className="mb-2 text-[11.5px] leading-relaxed text-faint">
            Entraron y nunca marcaron la salida. No están trabajando: falta el dato, y lo corrige
            Administración.
          </p>
          {g.faltaSalida.map((f) => <Fila key={`${f.persona_id}-${f.fecha}`} f={f} />)}
        </Bloque>
      )}

      {g.cerradas.length > 0 && (
        <Bloque titulo="YA CERRARON" cuenta={g.cerradas.length} testid="bloque-cerradas">
          {g.cerradas.map((f) => <Fila key={f.persona_id} f={f} />)}
        </Bloque>
      )}

      {g.sinRegistrar.length > 0 && (
        <Bloque titulo="SIN REGISTRAR" cuenta={g.sinRegistrar.length} testid="bloque-sin-registrar">
          <p className="mb-2 text-[11.5px] leading-relaxed text-faint">
            Tienen asignación vigente y hoy no hay marca suya. <strong className="font-medium">No es
            una lista de ausentes</strong>: acá entra igual el que no tiene teléfono y el que no le
            dio permiso a la ubicación. Quién faltó lo declara el jefe de obra.
          </p>
          {g.sinRegistrar.map((e) => <FilaEsperado key={e.id} e={e} />)}
        </Bloque>
      )}
    </PageShell>
  )
}

function FiltroObra({ href, activo, children }: { href: string; activo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={activo ? 'page' : undefined}
      className={`rounded-control px-2.5 py-1 text-[12.5px] ${
        activo ? 'bg-surface-quiet font-medium text-ink' : 'text-muted hover:text-ink'
      }`}
    >
      {children}
    </Link>
  )
}

function Bloque({
  titulo, cuenta, testid, children,
}: { titulo: string; cuenta: number; testid: string; children: React.ReactNode }) {
  return (
    <section className="mb-7" data-testid={testid}>
      <div className="flex items-baseline gap-2">
        <Eyebrow>{titulo}</Eyebrow>
        <span className="font-mono text-[11.5px] tabular-nums text-faint">{cuenta}</span>
      </div>
      <div className="mt-2 border-t border-line">{children}</div>
    </section>
  )
}

function Fila({ f, activo = false }: { f: FilaPresencia; activo?: boolean }) {
  const punto = lecturaDePunto(f)
  const enlace = mapa(f.lat, f.lon)
  return (
    <div
      data-testid="fila-presencia"
      data-persona={f.persona_id}
      data-estado={f.estado}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#EFEEEA] py-2.5"
    >
      <span className="flex min-w-[190px] flex-1 items-center gap-2">
        {activo && <PuntoActivo />}
        <span className="min-w-0">
          <span className="block truncate text-[14px] text-ink">{f.nombre_completo}</span>
          <span className="block text-[11.5px] text-faint">
            {f.categoria ?? f.puesto ?? 'sin categoría'}
            {f.obra ? ` · ${f.obra}` : ' · sin obra en la marca'}
          </span>
        </span>
      </span>

      <span className="w-[74px] text-right">
        <span className="block text-[10.5px] text-faint">entrada</span>
        <span className="font-mono text-[14px] tabular-nums text-ink">{hora(f.entrada)}</span>
      </span>

      <span className="w-[74px] text-right">
        <span className="block text-[10.5px] text-faint">{f.salida ? 'salida' : 'lleva'}</span>
        {f.salida
          ? <span className="font-mono text-[14px] tabular-nums text-ink">{hora(f.salida)}</span>
          : <RelojDeJornada entrada={f.entrada} />}
      </span>

      <span className="w-[112px]">
        <Estado
          tono={f.estado === 'activo' ? 'pos' : f.estado === 'falta_salida' ? 'warn' : 'nulo'}
          clave={f.estado}
        >
          {f.estado === 'activo' ? 'Activo' : f.estado === 'falta_salida' ? 'Falta salida' : 'Cerrada'}
        </Estado>
      </span>

      <span className="w-[168px] text-[12px]">
        {enlace ? (
          <a
            href={enlace}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="ubicacion-marca"
            className={`underline ${punto.fiable ? 'text-muted hover:text-ink' : 'text-warn'}`}
          >
            Dónde arrancó <span className="text-faint">· {punto.texto}</span>
          </a>
        ) : (
          <span className="text-faint" data-testid="sin-ubicacion">{punto.texto}</span>
        )}
      </span>
    </div>
  )
}

function FilaEsperado({ e }: { e: Esperado }) {
  return (
    <div
      data-testid="fila-esperado"
      data-persona={e.id}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#EFEEEA] py-2.5"
    >
      <span className="min-w-[190px] flex-1">
        <span className="block truncate text-[14px] text-ink-soft">{e.nombre_completo}</span>
        <span className="block text-[11.5px] text-faint">
          {e.categoria ?? 'sin categoría'}
          {e.obra_actual ? ` · ${e.obra_actual}` : ''}
          {e.cuadrilla ? ` · ${e.cuadrilla}` : ''}
        </span>
      </span>
      <span className="w-[112px]"><Estado tono="nulo" clave="sin_registrar">Sin marca</Estado></span>
    </div>
  )
}
