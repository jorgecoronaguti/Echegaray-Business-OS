import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
import { Aviso, Eyebrow } from '@/shared/components/ds'
import { leerDatosCampo } from './datos'
import { puedeCargarParte } from './permisos'
import { senalHerramientas, senalImpedimentos, senalPedidos, senalParte, type Senal } from './senales'

// `/campo` — LA ENTRADA DE OBRA EN EL TELÉFONO.
//
// ═══ QUÉ SE FUE, Y POR QUÉ ═══
//
// Tres tarjetas de gradiente con emoji (📦 celeste, 🛠️ violeta, 🔄 verde). El handoff lo dice sin
// vueltas: sin gradientes, sin emojis, sin tarjetas de color. No es una preferencia estética — el
// color acá no significaba nada (el violeta no quería decir «herramientas», era decoración), y
// cuando todo grita, la única fila que sí importa hoy —el parte sin cargar— no se distingue.
//
// Lo que queda es una lista sobria donde el ÚNICO color es la señal de estado: `warn` en lo que hay
// que hacer, `faint` en lo que es contexto. Objetivos de 60px de alto, primaria de 48 fija abajo.
//
// ═══ LO QUE ESTA PANTALLA NO PUEDE HACER SOLA ═══
//
// El rol `campo` no puede ESCRIBIR partes ni impedimentos: las policies de `obra_ejecucion` y
// `obra_restriccion` exigen dirección, administración o jefe de obra. En vez de ofrecer un botón que
// va a rebotar contra la base, la pantalla lo dice y ofrece lo que sí puede hacer.

export const dynamic = 'force-dynamic'

interface Acceso {
  href: string
  titulo: string
  detalle: string
  senal: Senal | null
  testid: string
}

export default async function CampoPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilActual(supabase)
  const nombre = perfil.data?.nombre || user.email || 'Operario'
  const rol = perfil.data?.rol ?? null
  const escribe = puedeCargarParte(rol)

  const d = await leerDatosCampo(supabase)
  const donde = d.obras.length === 1 ? d.obras[0].nombre : d.obras.length > 1 ? `${d.obras.length} obras` : null

  const accesos: Acceso[] = [
    {
      href: '/campo/parte',
      titulo: 'Parte del día',
      detalle: 'Cuánto se hizo y qué pasó',
      senal: senalParte(d.partesHoy),
      testid: 'ir-parte',
    },
    {
      href: '/integraciones/pedidos-materiales',
      titulo: 'Pedir material',
      detalle: 'Y ver el estado de lo pedido',
      senal: senalPedidos(d.pedidosSinEntregar),
      testid: 'ir-pedidos',
    },
    {
      href: '/integraciones/herramientas',
      titulo: 'Herramientas',
      detalle: 'Qué tengo en obra',
      senal: senalHerramientas(d.herramientasEnObra),
      testid: 'ir-herramientas',
    },
    {
      href: '/integraciones/movimientos',
      titulo: 'Movimientos',
      detalle: 'Registrar un traslado',
      senal: null,
      testid: 'ir-movimientos',
    },
    {
      href: '/campo/impedimento',
      titulo: 'Anotar impedimento',
      detalle: 'Qué está frenando el trabajo',
      senal: senalImpedimentos(d.impedimentosAbiertos),
      testid: 'ir-impedimento',
    },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-surface" data-testid="campo">
      <header className="flex h-[44px] shrink-0 items-center gap-2 border-b border-line px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/isotipo.png" alt="" className="h-[22px] w-[22px]" />
        <span className="text-[12.5px] font-semibold tracking-[0.12em] text-ink">ECHEGARAY</span>
        <span className="text-[11px] text-faint">Campo</span>
        <span className="ml-auto text-[12px] text-muted">
          <LogoutButton />
        </span>
      </header>

      <div className="px-4 pt-[18px]">
        {donde ? (
          <div className="text-[11.5px] text-faint">{donde}</div>
        ) : (
          <div className="text-[11.5px] text-faint">sin obra asignada</div>
        )}
        <h1 className="mt-1 text-[19px] font-semibold tracking-[-0.01em] text-ink">
          Hola, {nombre.split(' ')[0]}
        </h1>
      </div>

      {d.error && (
        <div className="px-4 pt-4">
          <Aviso tono="neg" titulo="No se pudo leer todo lo de esta pantalla." testid="campo-error">
            {d.error}
          </Aviso>
        </div>
      )}

      <nav className="px-4 pt-5">
        <Eyebrow>Hoy</Eyebrow>
        <ul className="mt-2">
          {accesos.map((a, i) => (
            <li key={a.href} className={i === accesos.length - 1 ? '' : 'border-b border-[#EFEEEA]'}>
              <Link
                href={a.href}
                data-testid={a.testid}
                className="flex min-h-[60px] items-center gap-3 py-2.5 active:bg-surface-quiet"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-ink">{a.titulo}</span>
                  <span className="mt-0.5 block text-[12px] text-faint">{a.detalle}</span>
                </span>
                {a.senal && (
                  <span className={`whitespace-nowrap text-[12px] ${a.senal.pendiente ? 'text-warn' : 'text-faint'}`}>
                    {a.senal.texto}
                  </span>
                )}
                <span aria-hidden className="pl-2 text-[15px] text-line-strong">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex-1" />

      <footer className="sticky bottom-0 border-t border-line bg-surface px-4 py-3.5">
        {escribe ? (
          <>
            <Link
              href="/campo/parte"
              data-testid="cargar-parte"
              className="flex h-[48px] w-full items-center justify-center rounded-control bg-marca text-[15px] font-semibold text-[color:var(--os-on-marca)]"
            >
              Cargar parte de hoy
            </Link>
            <p className="mt-2.5 text-center text-[11px] text-faint">
              Se guarda al instante. Sin señal no se envía: te lo va a decir, no lo da por hecho.
            </p>
          </>
        ) : (
          <>
            <Link
              href="/integraciones/pedidos-materiales"
              data-testid="pedir-material"
              className="flex h-[48px] w-full items-center justify-center rounded-control bg-marca text-[15px] font-semibold text-[color:var(--os-on-marca)]"
            >
              Pedir material
            </Link>
            <p className="mt-2.5 text-center text-[11px] text-faint">
              El parte y los impedimentos los carga el jefe de obra: tu usuario no tiene permiso para escribirlos.
            </p>
          </>
        )}
      </footer>
    </div>
  )
}
