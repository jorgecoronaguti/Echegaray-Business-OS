import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
import { Aviso, Eyebrow } from '@/shared/components/ds'
import { leerDatosCampo } from './datos'
import { IconoAsistencia, IconoHerramienta, IconoMaterial, IconoMovimiento, IconoParte, IconoProblema } from './iconos'
import { puedeCargarParte } from './permisos'
import { INICIO_JEFE_TELEFONO } from '@/features/auth/types/navegacion'
import { barraTelefonoDe } from '@/features/auth/types/barraTelefono'
import { BarraTelefono } from '@/shared/components/BarraTelefono'
import { hrefCargaDeAsistencia } from '@/features/administracion/services/cargaDeAsistencia'
import { senalHerramientas, senalImpedimentos, senalPedidos, senalParte, type Senal } from './senales'
import { nombreDePila } from '../../shared/personas/nombre.ts'

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
// que hacer, `faint` en lo que es contexto.
//
// ═══ TRES ACCIONES ARRIBA, EL RESTO ABAJO (22/08/2026) ═══
//
// Las cinco filas medían lo mismo y se leían igual, y tres de ellas —cargar el parte, pedir
// material, avisar que algo frena— son el 95 % de lo que se abre esta pantalla a hacer. Ahora esas
// tres son BLOQUES de 100px con su forma dibujada, arriba de todo y en posición FIJA: en obra la
// mano no busca, va. Herramientas y Movimientos quedan como lista: se consultan, no se hacen.
//
// El orden de los tres no cambia con el estado. Ordenarlos por «lo pendiente primero» leía mejor en
// la captura y peor en la mano: el pulgar aprende una posición, y una posición que se mueve sola es
// una posición que hay que volver a leer cada vez. Lo pendiente se dice con la señal, no moviendo
// el botón de lugar.
//
// ═══ LO QUE ESTA PANTALLA NO PUEDE HACER SOLA ═══
//
// El rol `campo` no puede ESCRIBIR partes ni impedimentos: las policies de `obra_ejecucion` y
// `obra_restriccion` exigen dirección, administración o jefe de obra. La acción del día del pie
// cambia por eso, y lo dice en un renglón.

export const dynamic = 'force-dynamic'

interface Acceso {
  href: string
  titulo: string
  /** Lo que dice el renglón de arriba cuando esta acción está pendiente. Corto: es un aviso, no una
   *  explicación. La REGLA de si está pendiente vive en `senales.ts`, que es lo que está probado. */
  pendiente?: string
  detalle: string
  senal: Senal | null
  icono: ReactNode
  testid: string
}

export default async function CampoPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilActual(supabase)
  const rol = perfil.data?.rol ?? null
  // ═══ /campo ES DEL JEFE (dueño, 23/09/2026 · mapa de pantallas, duda 4) ═══
  //
  // Las seis filas de esta pantalla —parte, material, problema, asistencia, herramientas,
  // movimientos— las escribe el jefe de obra. El empleado la abría desde `/mi-trabajo` y no podía
  // hacer nada de eso: su pantalla es `/hoy`. Lo que sí es suyo (herramientas por QR) vive en
  // `/campo/herramientas` y sigue abriéndose; sólo esta raíz lo manda a su día.
  if (rol === 'campo') redirect('/hoy')
  const escribe = puedeCargarParte(rol)
  // A dónde vuelve la flecha: el jefe a J01 (`/obra/hoy`, que es quien enlaza acá); Dirección y
  // Administración a su área. Desde el 23/09/2026 su inicio en el teléfono ES esta pantalla, así que
  // `/` volvía acá mismo; y abajo tienen la barra por nivel (`BarraTelefono`) para moverse.
  const volver = rol === 'jefe_obra' ? INICIO_JEFE_TELEFONO : '/administracion'

  const d = await leerDatosCampo(supabase)
  const donde = d.obras.length === 1 ? d.obras[0].nombre : d.obras.length > 1 ? `${d.obras.length} obras` : null

  const acciones: Acceso[] = [
    {
      href: '/obra/avance-masivo',
      titulo: 'Parte',
      pendiente: 'Falta el parte de hoy',
      detalle: 'Cuánto se hizo y qué pasó',
      senal: senalParte(d.partesHoy),
      icono: <IconoParte className="h-[28px] w-[28px]" />,
      testid: 'ir-parte',
    },
    {
      // El módulo Material del teléfono (23/09/2026): antes abría la tabla de escritorio del espejo de AppSheet.
      href: '/campo/material',
      titulo: 'Material',
      detalle: 'Pedir y ver lo pedido',
      senal: senalPedidos(d.pedidosSinEntregar),
      icono: <IconoMaterial className="h-[28px] w-[28px]" />,
      testid: 'ir-pedidos',
    },
    {
      href: '/campo/impedimento',
      titulo: 'Problema',
      pendiente: 'Hay impedimentos abiertos',
      detalle: 'Qué frena el trabajo',
      senal: senalImpedimentos(d.impedimentosAbiertos),
      icono: <IconoProblema className="h-[28px] w-[28px]" />,
      testid: 'ir-impedimento',
    },
  ]

  const consultas: Acceso[] = [
    {
      // ASISTENCIA VA ACÁ Y NO ARRIBA, y no porque valga menos: los tres bloques de arriba son una
      // grilla de TRES en posición fija, y un cuarto los rompe en 3 + 1 huérfano. Mover una decisión
      // de layout ya tomada no es parte de este trabajo — si el dueño quiere la asistencia entre las
      // tres de arriba, se decide qué sale.
      // LA CARGA ÚNICA (17/09/2026): `/campo/asistencia` redirige a la de Administración desde el
      // 23/09. La pantalla ya es responsive y elige la obra en el teléfono (`ObraEnTelefono`).
      href: hrefCargaDeAsistencia({}),
      titulo: 'Asistencia',
      detalle: 'Las horas de cada uno, hoy',
      // SIN SEÑAL A PROPÓSITO: decir «falta cargar la asistencia» exige saber quién está asignado a
      // cada obra y qué días son laborables. Con una cuenta a medias, la señal diría que falta algo
      // los domingos. Aparece el día que la regla esté probada, no antes.
      senal: null,
      icono: <IconoAsistencia className="h-[22px] w-[22px]" />,
      testid: 'ir-asistencia',
    },
    {
      href: '/campo/herramientas',
      titulo: 'Herramientas',
      detalle: 'Qué tengo en obra',
      senal: senalHerramientas(d.herramientasEnObra),
      icono: <IconoHerramienta className="h-[22px] w-[22px]" />,
      testid: 'ir-herramientas',
    },
    {
      // El registro vive en el módulo Herramientas del teléfono (M07 «Mover»); el historial de
      // escritorio es `/herramientas/movimientos`. `/integraciones/movimientos` redirige ahí desde el 23/09.
      href: '/campo/herramientas/mover',
      titulo: 'Movimientos',
      detalle: 'Registrar un traslado',
      senal: null,
      icono: <IconoMovimiento className="h-[22px] w-[22px]" />,
      testid: 'ir-movimientos',
    },
  ]

  // QUÉ HAY QUE HACER, ARRIBA Y EN UNA LÍNEA. Sale de las mismas señales que pintan los bloques —no
  // hay una segunda regla— y cuando no hay nada pendiente el renglón no se dibuja: un «todo al día»
  // permanente es una línea que se deja de leer y después tapa la que sí importaba.
  const pendientes = acciones.filter((a) => a.senal?.pendiente && a.pendiente).map((a) => a.pendiente)

  return (
    <div className="flex min-h-screen flex-col bg-surface pb-20 md:pb-0" data-testid="campo">
      {/* La salida es un objetivo táctil como cualquier otro: el botón del sistema mide 24px de alto
          y acá se lo estira a 44 sin tocar el componente compartido, que también vive en escritorio. */}
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line px-4 [&_button]:h-[44px] [&_button]:px-2.5">
        {/* LA VUELTA, VISIBLE Y DE 44 (23/09/2026): esta pantalla no tenía marco ni barra, y el jefe
            que llegaba desde `/obra/hoy` quedaba sin camino de regreso salvo el gesto del navegador. */}
        <Link
          href={volver}
          prefetch={false}
          data-testid="volver-campo"
          aria-label="Volver a Hoy"
          className="-ml-2 flex h-[44px] min-w-[44px] items-center justify-center px-2 text-[18px] text-muted hover:text-ink"
        >
          ‹
        </Link>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/isotipo.png" alt="" className="h-[22px] w-[22px]" />
        <span className="text-[12.5px] font-semibold tracking-[0.12em] text-ink">ECHEGARAY</span>
        <span className="text-[11px] text-faint">Trabajo</span>
        <span className="ml-auto text-[12px] text-muted">
          <LogoutButton />
        </span>
      </header>

      <div className="px-4 pt-[18px]">
        <div className="text-[11.5px] text-faint">{donde ?? 'sin obra asignada'}</div>
        <h1 className="mt-1 text-[20px] font-semibold tracking-[-0.01em] text-ink">
          Hola, {nombreDePila(perfil.data?.nombre, user.email) || 'Operario'}
        </h1>
        {pendientes.length > 0 && (
          <p className="mt-1 text-[13px] text-warn" data-testid="pendientes-hoy">
            {pendientes.join(' · ')}
          </p>
        )}
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
        <div className="mt-2 grid grid-cols-3 gap-2.5">
          {acciones.map((a) => (
            <Link prefetch={false}
              key={a.href}
              href={a.href}
              data-testid={a.testid}
              aria-label={`${a.titulo} — ${a.detalle}`}
              className="flex min-h-[100px] flex-col items-center justify-center gap-1.5 rounded-[14px] border border-line px-1.5 text-center active:bg-surface-quiet"
            >
              <span className={a.senal?.pendiente ? 'text-warn' : 'text-ink'}>{a.icono}</span>
              <span className="text-[13px] font-medium text-ink">{a.titulo}</span>
              {a.senal && (
                <span className={`text-[11px] leading-tight ${a.senal.pendiente ? 'text-warn' : 'text-faint'}`}>
                  {a.senal.texto}
                </span>
              )}
            </Link>
          ))}
        </div>

        <ul className="mt-5">
          {consultas.map((a, i) => (
            <li key={a.href} className={i === consultas.length - 1 ? '' : 'border-b border-surface-sunken'}>
              <Link prefetch={false}
                href={a.href}
                data-testid={a.testid}
                className="flex min-h-[60px] items-center gap-3 py-2.5 active:bg-surface-quiet"
              >
                <span className="shrink-0 text-muted">{a.icono}</span>
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
          <Link
            href="/obra/avance-masivo"
            data-testid="cargar-parte"
            className="flex h-[48px] w-full items-center justify-center rounded-control bg-marca text-[15px] font-semibold text-[color:var(--os-on-marca)]"
          >
            Cargar parte de hoy
          </Link>
        ) : (
          <>
            <Link
              href="/campo/material/pedir"
              data-testid="pedir-material"
              className="flex h-[48px] w-full items-center justify-center rounded-control bg-marca text-[15px] font-semibold text-[color:var(--os-on-marca)]"
            >
              Pedir material
            </Link>
            {/* NO es explicación: es el motivo por el que la acción del día es otra. */}
            <p className="mt-2.5 text-center text-[11.5px] text-faint">
              El parte y los impedimentos los carga el jefe de obra.
            </p>
          </>
        )}
      </footer>
      {/* LA BARRA POR NIVEL (dueño, 23/09/2026): Campo es la raíz del teléfono para quien administra. */}
      <BarraTelefono items={barraTelefonoDe(rol)} />
    </div>
  )
}
