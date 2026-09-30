// REGISTRO DE LA APP — lo que `app_registro` guarda, a la vista del dueño (30/09/2026:
// «quiero q me des acceso a ese log q has creado»).
//
// Tres miradas, las mismas que `orquestador/scripts/control-de-fallas.mjs`:
//   · Fallas: los errores agrupados por firma (digest o mensaje), con quién, dónde y qué deploy.
//   · Rebotes: redirecciones y rechazos por persona — «se mete por una URL vieja», «no lo deja entrar».
//   · Persona: la línea de tiempo de una cuenta. Los pedidos de fondo (navegación interna, prefetch)
//     se esconden salvo que se pidan: son la mitad de las filas y no son lo que la persona vio.
//
// LA TABLA ES INTERNA (RLS sin política, sin GRANT a authenticated). Se lee con la clave de servicio
// y SÓLO después de comprobar que quien llama es LA cuenta del dueño (`puedeVerRegistro`, «q este solo en
// mi usuario»): ni el otro Dirección ni una sesión de «entrar como». Sólo lectura.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { puedeVerRegistro } from '@/features/auth/types/areas'
import { MiCuentaShell } from '@/features/mi-cuenta/components/MiCuentaShell'
import { Aviso, Num } from '@/shared/components/ds'
import { ROL_LABEL, type Rol } from '@/features/auth/types'
import { agrupar, rebotes, ventana, VENTANAS, TIPOS_ERROR, type FilaReg } from '@/features/registro/agrupar'
import { nombresDeUsuarios } from '../../../../shared/personas/nombresDeUsuarios.ts'

export const dynamic = 'force-dynamic'

const COLUMNAS = 'id, en, tipo, perfil_id, rol, prestada, metodo, ruta, consulta, estado, destino, dispositivo, despliegue, digest, mensaje, detalle'
const TOPE = 500

type Vista = 'fallas' | 'rebotes' | 'persona'
const VISTAS: { id: Vista; label: string }[] = [
  { id: 'fallas', label: 'Fallas' },
  { id: 'rebotes', label: 'Redirecciones y rechazos' },
  { id: 'persona', label: 'Por persona' },
]

function hora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

function etiquetaVentana(h: number): string {
  return h === 1 ? '1 h' : h < 72 ? `${h} h` : `${h / 24} días`
}

type Params = { vista?: string; horas?: string; quien?: string; fondo?: string; q?: string }

export default async function RegistroPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) return <MiCuentaShell titulo="Registro de la app"><Aviso tono="neg">Tu sesión venció. Volvé a entrar.</Aviso></MiCuentaShell>
  if (!puedeVerRegistro(user.id)) {
    return (
      <MiCuentaShell titulo="Registro de la app" descripcion="El registro de la aplicación es sólo de la cuenta del dueño.">
        <Aviso tono="info" testid="registro-sin-permiso">No tenés permiso para ver esta pantalla.</Aviso>
      </MiCuentaShell>
    )
  }

  const vista: Vista = VISTAS.some((v) => v.id === sp.vista) ? (sp.vista as Vista) : 'fallas'
  const horas = ventana(sp.horas)
  const desde = new Date(Date.now() - horas * 3600_000).toISOString()
  const verFondo = sp.fondo === '1'
  const buscar = (sp.q ?? '').replace(/[^\p{L}\p{N} ._:/-]/gu, '').trim().slice(0, 80)

  const nombres = await nombresDeUsuarios(supabase)
  const quien = (id: string | null) => (id ? nombres.get(id) ?? id.slice(0, 8) : 'sin sesión')
  const personas = [...nombres.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  const elegido = sp.quien && nombres.has(sp.quien) ? sp.quien : null

  const admin = createAdminClient()
  let consulta = admin.from('app_registro').select(COLUMNAS).gte('en', desde).order('en', { ascending: false }).limit(TOPE)
  if (vista === 'fallas') {
    consulta = consulta.in('tipo', [...TIPOS_ERROR])
    if (buscar) consulta = consulta.or(`digest.eq.${buscar},mensaje.ilike.*${buscar}*,ruta.ilike.*${buscar}*`)
  } else if (vista === 'rebotes') consulta = consulta.in('tipo', ['redireccion', 'rechazo'])
  else if (elegido) consulta = consulta.eq('perfil_id', elegido)
  const { data, error } = vista === 'persona' && !elegido ? { data: [], error: null } : await consulta
  const filas = (data ?? []) as FilaReg[]
  const lleno = filas.length === TOPE

  const url = (cambio: Partial<Params>) => {
    const p = new URLSearchParams()
    const todo: Params = { vista, horas: String(horas), quien: elegido ?? undefined, fondo: verFondo ? '1' : undefined, q: buscar || undefined, ...cambio }
    for (const [k, v] of Object.entries(todo)) if (v) p.set(k, v)
    return `/mi-cuenta/registro?${p}`
  }

  const chip = (activo: boolean) =>
    `inline-flex min-h-[36px] items-center rounded-md border px-2.5 text-[12.5px] ${activo ? 'border-line-strong bg-ink font-semibold text-white' : 'border-line text-ink hover:bg-surface-quiet'}`

  return (
    <MiCuentaShell
      titulo="Registro de la app"
      descripcion="Qué se rompió, a quién y dónde: errores, redirecciones, rechazos y la navegación de cada cuenta. Navegación se guarda 14 días; errores, 90."
    >
      <div className="space-y-4" data-testid="registro-app">
        <nav className="flex flex-wrap gap-1.5" aria-label="Vista">
          {VISTAS.map((v) => (
            <Link key={v.id} prefetch={false} href={url({ vista: v.id, q: undefined })} className={chip(v.id === vista)} aria-current={v.id === vista ? 'page' : undefined} data-testid={`registro-vista-${v.id}`}>
              {v.label}
            </Link>
          ))}
        </nav>
        <nav className="flex flex-wrap items-center gap-1.5" aria-label="Ventana">
          <span className="text-[11.5px] text-faint">Últimas</span>
          {VENTANAS.map((h) => (
            <Link key={h} prefetch={false} href={url({ horas: String(h) })} className={chip(h === horas)}>{etiquetaVentana(h)}</Link>
          ))}
        </nav>

        {vista === 'fallas' && (
          <form action="/mi-cuenta/registro" className="flex flex-wrap gap-1.5">
            <input type="hidden" name="vista" value="fallas" />
            <input type="hidden" name="horas" value={horas} />
            <input name="q" defaultValue={buscar} placeholder="Digest, texto del error o ruta" className="min-h-[40px] w-full max-w-[360px] rounded-md border border-line bg-surface px-2.5 text-[13px]" data-testid="registro-buscar" />
            <button className="min-h-[40px] rounded-md border border-line px-3 text-[13px]">Buscar</button>
          </form>
        )}

        {vista === 'persona' && (
          <form action="/mi-cuenta/registro" className="flex flex-wrap items-center gap-1.5">
            <input type="hidden" name="vista" value="persona" />
            <input type="hidden" name="horas" value={horas} />
            <select name="quien" defaultValue={elegido ?? ''} className="min-h-[40px] w-full max-w-[320px] rounded-md border border-line bg-surface px-2 text-[13px]" data-testid="registro-persona">
              <option value="">Elegí una cuenta…</option>
              {personas.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
            <label className="inline-flex min-h-[40px] items-center gap-1.5 text-[12.5px] text-muted">
              <input type="checkbox" name="fondo" value="1" defaultChecked={verFondo} /> Incluir pedidos de fondo
            </label>
            <button className="min-h-[40px] rounded-md border border-line px-3 text-[13px]">Ver</button>
          </form>
        )}

        {error ? (
          <Aviso tono="neg" titulo="No pude leer el registro">{error.message}</Aviso>
        ) : (
          <>
            {lleno && <Aviso tono="warn">Se muestran las últimas {TOPE} filas de la ventana: hay más. Achicá la ventana para ver completo.</Aviso>}
            {vista === 'fallas' && <Fallas filas={filas} quien={quien} />}
            {vista === 'rebotes' && <Rebotes filas={filas} quien={quien} />}
            {vista === 'persona' && (elegido ? <Linea filas={verFondo ? filas : filas.filter((f) => !f.detalle?.fondo)} /> : <p className="text-[12.5px] text-muted">Elegí una cuenta para ver su recorrido.</p>)}
          </>
        )}
      </div>
    </MiCuentaShell>
  )
}

function Nada({ children }: { children: React.ReactNode }) {
  return <p className="text-[12.5px] text-muted" data-testid="registro-vacio">{children}</p>
}

function Fallas({ filas, quien }: { filas: FilaReg[]; quien: (id: string | null) => string }) {
  const grupos = agrupar(filas, quien)
  if (!grupos.length) return <Nada>Sin errores en la ventana.</Nada>
  return (
    <ul className="divide-y divide-line rounded-md border border-line" data-testid="registro-fallas">
      {grupos.map((g) => (
        <li key={`${g.tipo}|${g.firma}`} className="space-y-1 p-3 text-[12.5px]">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="font-semibold text-neg">{g.tipo === 'error_servidor' ? 'Servidor' : 'Navegador'}</span>
            <span className="text-ink"><Num>{g.veces}</Num> {g.veces === 1 ? 'vez' : 'veces'}</span>
            <span className="text-faint">última <Num>{hora(g.ultima)}</Num>{g.veces > 1 && <> · primera <Num>{hora(g.primera)}</Num></>}</span>
          </div>
          <div className="break-words text-ink">{g.mensaje ?? <span className="text-faint">sin mensaje</span>}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted">
            <span>{g.personas.join(', ')}</span>
            <span className="break-all font-mono text-[11.5px]">{g.rutas.slice(0, 4).join(' · ')}{g.rutas.length > 4 && ` +${g.rutas.length - 4}`}</span>
            {g.digest && <span className="font-mono text-[11.5px]">digest {g.digest}</span>}
            {g.despliegues.length > 0 && <span className="font-mono text-[11.5px]">deploy {g.despliegues.join(', ')}</span>}
          </div>
        </li>
      ))}
    </ul>
  )
}

function Rebotes({ filas, quien }: { filas: FilaReg[]; quien: (id: string | null) => string }) {
  const rs = rebotes(filas, quien)
  if (!rs.length) return <Nada>Sin redirecciones ni rechazos en la ventana.</Nada>
  return (
    <ul className="divide-y divide-line rounded-md border border-line" data-testid="registro-rebotes">
      {rs.map((r) => (
        <li key={`${r.quien}|${r.tipo}|${r.ruta}|${r.destino}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 p-3 text-[12.5px]">
          <span className="font-medium text-ink">{r.quien}</span>
          {r.rol && <span className="text-faint">{ROL_LABEL[r.rol as Rol] ?? r.rol}</span>}
          <span className={r.tipo === 'rechazo' ? 'text-neg' : 'text-warn'}>{r.tipo === 'rechazo' ? 'rechazo' : 'redirección'}</span>
          <span className="break-all font-mono text-[11.5px]">{r.ruta}{r.destino && <> → {r.destino}</>}</span>
          <span className="text-muted"><Num>{r.veces}</Num>× · <Num>{hora(r.ultima)}</Num></span>
        </li>
      ))}
    </ul>
  )
}

function Linea({ filas }: { filas: FilaReg[] }) {
  if (!filas.length) return <Nada>Sin movimientos de esta cuenta en la ventana.</Nada>
  return (
    <ul className="divide-y divide-line rounded-md border border-line" data-testid="registro-linea">
      {filas.map((f) => {
        const malo = f.tipo.startsWith('error')
        const accion = typeof f.detalle?.accion === 'string' ? f.detalle.accion : null
        return (
          <li key={f.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 p-2.5 text-[12.5px]">
            <Num>{hora(f.en)}</Num>
            <span className={malo ? 'font-semibold text-neg' : f.tipo === 'rechazo' ? 'text-neg' : f.tipo === 'redireccion' ? 'text-warn' : 'text-muted'}>{f.tipo.replace('_', ' ')}</span>
            <span className="break-all font-mono text-[11.5px] text-ink">{f.ruta}{f.consulta ?? ''}{f.destino && <> → {f.destino}</>}</span>
            {f.estado != null && <span className="text-faint">{f.estado}</span>}
            {f.dispositivo && <span className="text-faint">{f.dispositivo === 'telefono' ? 'teléfono' : 'PC'}</span>}
            {f.prestada && <span className="text-warn">entrar como</span>}
            {Boolean(f.detalle?.fondo) && <span className="text-faint">fondo</span>}
            {accion && <span className="text-muted">acción {accion}</span>}
            {f.mensaje && <span className="w-full break-words text-neg">{f.mensaje}</span>}
          </li>
        )
      })}
    </ul>
  )
}
