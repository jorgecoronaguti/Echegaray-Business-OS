'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { VERSIONES_DE_CUENTA, type ParteDeCuenta } from '@/shared/utils/cuentaPropia'
import type { ReactNode } from 'react'
import { CONTEXTOS, contextoActivo, esRaiz } from './shell-logica'
import { MarcoMovil, BarraContextos, TopBarDetalle } from '@/shared/components/movil/Piezas'
import { C } from '@/shared/components/movil/tokens'
import type { NombreIcono } from '@/shared/components/movil/Iconos'

// NO se re-exporta `inicialesDe` acá: este módulo es de cliente, y re-exportar una función pura
// desde un módulo de cliente la vuelve inllamable desde el servidor. Se importa de `shell-logica`.

// EL MARCO DEL PERFIL EMPLEADO — porte literal de M02 y M09.
//
// ═══ QUÉ SE FUE EL 24/08, Y POR QUÉ ═══
//
// Este archivo dibujaba TRES cosas: la barra de marca del teléfono, un header de escritorio con los
// mismos contextos, y la barra inferior. Los nueve mockups M01…M09 no tienen header de escritorio:
// son un teléfono de 390px, y el contrato de este perfil dice que no es «desktop reducido» ni al
// revés. El header de escritorio se fue con su fila de email y su botón de salir; salir vive ahora
// donde el mockup lo pone, que es M09 («Salir de la aplicación», al pie de la ficha).
//
// La barra de marca también se fue de acá: M02 la tiene y M09 no —M09 abre con la ficha de la
// persona, avatar de 56 y nombre en 18/600—, así que el encabezado lo dibuja cada pantalla, que es
// la que sabe cuál le toca.
//
// ═══ LA BARRA SE QUEDA EN LAS CUATRO RAÍCES AUNQUE M03 Y M06 NO LA DIBUJEN ═══
//
// Los `.dc.html` de «Mi trabajo» y «Mis horas» abren con una flecha de volver y sin barra. Pero M02
// y M09 dibujan la barra con CUATRO destinos —Hoy · Trabajo · Horas · Yo— y dos de esos cuatro son
// justamente esas pantallas: sacarles la barra al llegar las convierte en un viaje de ida. Se
// conserva, con el aspecto medido en M02, y las cuatro raíces no llevan flecha: su salida es la
// barra. Esa invariante la mide `pantallas-empleado.test.ts`.

const ICONO: Record<string, NombreIcono> = {
  '/hoy': 'casa',
  '/mi-trabajo': 'tarea',
  '/mi-informacion/horas': 'reloj',
  '/mi-informacion': 'gente',
}

/**
 * `barraPropia`: los destinos de OTRA barra para quien no es operario (hoy, el jefe de obra en
 * «Mi información»). Se dibuja en los mismos lugares que la del operario y ninguno se enciende: las
 * pantallas de este perfil no son ninguno de sus cuatro contextos.
 */
export function ShellEmpleado({ children, barraPropia = null }: {
  children: ReactNode
  barraPropia?: { href: string; label: string; icono: NombreIcono; testid: string }[] | null
}) {
  // La ruta la pone el navegador, no el servidor: un layout de App Router no recibe el pathname, y
  // pasarlo por `headers()` obligaría a que TODA pantalla del perfil fuera dinámica sólo para
  // pintar una pestaña.
  const ruta = usePathname() ?? ''
  const activo = contextoActivo(ruta)
  const raiz = esRaiz(ruta)

  return (
    <MarcoMovil conBarra={raiz}>
      <div data-testid="shell-empleado">{children}</div>
      {raiz && (
        <BarraContextos
          testid={barraPropia ? 'barra-jefe' : 'barra-contextos'}
          items={barraPropia ? barraPropia.map((b) => ({ ...b, activo: false })) : CONTEXTOS.map((c) => ({
            href: c.href,
            label: c.label,
            icono: ICONO[c.href] ?? 'casa',
            activo: activo === c.href,
            testid: c.testid,
          }))}
        />
      )}
    </MarcoMovil>
  )
}

/**
 * EL CONTENEDOR DE UNA PANTALLA DEL PERFIL.
 *
 * ═══ QUIÉN DIBUJA EL TOPBAR DE UNA PANTALLA DE DETALLE ═══
 *
 * Lo dibuja acá y no en `ShellEmpleado` porque el título y el destino de la flecha los sabe la
 * pantalla, y el marco es un componente de cliente que sólo conoce la ruta. La contrapartida es que
 * una pantalla de detalle SIN `volver` quedaría sin topbar y sin barra —encerrada—, y por eso esa
 * invariante no queda en la buena voluntad: la mide `pantallas-empleado.test.ts`.
 */
export function PantallaEmpleado({
  titulo, sub, volver, children, acciones, franja, parte,
}: {
  titulo: string
  sub?: ReactNode
  volver?: { href: string; label: string }
  /** Qué parte de la cuenta es (legajo, horas, documentos): con eso se ofrece la MISMA pantalla en
   *  su versión de escritorio, sólo desde `lg`. Ver `shared/utils/cuentaPropia.ts`. */
  parte?: ParteDeCuenta
  children: ReactNode
  /** El objetivo de 44 de la derecha del topbar: historial, buscar, «más». */
  acciones?: ReactNode
  /** Lo que cuelga debajo del topbar sin separación: la franja de pastillas de M03 y M08. */
  franja?: ReactNode
}) {
  return (
    <>
      <TopBarDetalle volver={volver} titulo={titulo} sub={sub} accion={acciones} extra={franja} />
      {/* LAS DOS CARAS SE ENLAZAN (dueño, 23/09/2026 · duda 8): en una pantalla ancha esta misma
          pantalla existe con header y tabla; en el teléfono el enlace no se dibuja. */}
      {parte && (
        <Link href={VERSIONES_DE_CUENTA[parte].escritorio} prefetch={false} data-testid="ir-version-escritorio" className="hidden lg:block" style={{ padding: '10px 16px 0', fontSize: 12.5, color: C.muted, textDecoration: 'underline' }}>
          Ver en la versión de escritorio
        </Link>
      )}
      <div style={{ padding: '16px 16px 24px' }}>{children}</div>
    </>
  )
}

/**
 * EL ENCABEZADO DE UN GRUPO — el de M08, no la versalita del handoff viejo.
 *
 * Era una versalita gris de 10,5px con `letterSpacing:.14em`. Los mockups la dibujan en caja normal
 * a 14/600 en tinta, con el conteo a la derecha en monoespaciada: la versalita pesaba menos que el
 * bloque que titulaba y en 390px la sección se leía como un pie de la anterior.
 */
export function Seccion({ titulo, extra, children }: { titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1E' }}>{titulo}</h2>
        {extra != null && <span style={{ marginLeft: 'auto', fontSize: 12.5 }}>{extra}</span>}
      </div>
      {children}
    </section>
  )
}
