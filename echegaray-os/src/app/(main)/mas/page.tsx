import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { puedeVerRuta } from '@/features/auth/types/areas'
import { C, R } from '@/shared/components/movil/tokens'
import { Icono, type NombreIcono } from '@/shared/components/movil/Iconos'

// «MÁS» — EL QUINTO DESTINO DE LA BARRA DE GESTIÓN DEL TELÉFONO (dueño, 24/09/2026, opción B: «Obras ·
// Personal · Compras · Datos · Más»). Lo que no entra en cuatro botones vive acá, en filas de 52px
// con el mismo lenguaje de las pantallas del teléfono (FilaAcceso de efectivo, M06).
//
// Cada fila pasa por el mismo portero que el middleware (`puedeVerRuta`): si el rol no puede abrir la
// ruta, la fila no existe. Una fila que rebota enseña que la app miente.

export const dynamic = 'force-dynamic'

interface Destino { href: string; titulo: string; detalle: string; icono: NombreIcono }

const GESTION: Destino[] = [
  { href: '/clientes', titulo: 'Clientes', detalle: 'Cartera, cobranzas y ficha de cada cliente', icono: 'gente' },
  { href: '/presupuestos', titulo: 'Presupuestos', detalle: 'Cotizaciones y su precio', icono: 'doc' },
  { href: '/administracion/impuestos', titulo: 'Impuestos', detalle: 'IVA, IIBB y cargas', icono: 'lista' },
  { href: '/administracion/usuarios', titulo: 'Usuarios', detalle: 'Quién entra y con qué nivel', icono: 'candado' },
]

const OPERACION: Destino[] = [
  { href: '/campo', titulo: 'Trabajo', detalle: 'Parte, material, problema y movimientos', icono: 'obra' },
  { href: '/campo/herramientas', titulo: 'Herramientas', detalle: 'Dónde está cada una, mover y verificar', icono: 'llave' },
]

const CUENTA: Destino[] = [
  { href: '/mi-cuenta', titulo: 'Mi cuenta', detalle: 'Legajo, horas, seguridad y avisos', icono: 'id' },
]

export default async function MasPage() {
  const supabase = await createClient()
  const rol = (await getPerfilActual(supabase)).data?.rol ?? null
  const ve = (d: Destino) => puedeVerRuta(rol, d.href)
  const grupos = [
    { rotulo: 'Gestión', filas: GESTION.filter(ve) },
    { rotulo: 'Operación', filas: OPERACION.filter(ve) },
    { rotulo: 'Cuenta', filas: CUENTA.filter(ve) },
  ].filter((g) => g.filas.length > 0)

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pt-4" data-testid="pantalla-mas">
      <h1 style={{ fontSize: 20, fontWeight: 600, color: C.ink }}>Más</h1>
      {grupos.map((g) => (
        <section key={g.rotulo} style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 10.5, color: C.faint, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8 }}>
            {g.rotulo}
          </h2>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {g.filas.map((d) => (
              <li key={d.href}>
                <Link
                  href={d.href}
                  prefetch={false}
                  data-testid={`mas-${d.href.split('/').filter(Boolean).pop()}`}
                  style={{
                    minHeight: 52, background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.control,
                    padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, color: C.ink,
                  }}
                >
                  <span style={{ display: 'flex', color: C.muted, flexShrink: 0 }}><Icono nombre={d.icono} tamano={20} /></span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 15, fontWeight: 500 }}>{d.titulo}</span>
                    <span style={{ display: 'block', fontSize: 12, color: C.muted }}>{d.detalle}</span>
                  </span>
                  <span style={{ marginLeft: 'auto', display: 'flex', color: C.tenue }}><Icono nombre="siguiente" tamano={18} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
