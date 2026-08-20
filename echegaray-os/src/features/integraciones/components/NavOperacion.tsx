import { SubTabs } from '@/shared/components/ds'

// LA NAVEGACIÓN DE OPERACIÓN GLOBAL — nivel 3, texto subrayado, nunca una segunda barra.
//
// Las cuatro vistas son LA MISMA pantalla mirando distinto: qué se pidió, qué hay, qué se movió y de
// dónde sale todo eso. Por eso comparten título («Operación») y se cambian con un subrayado, no
// navegando a cuatro pantallas que se ven como cuatro módulos.
//
// EL CONTADOR SÓLO APARECE CUANDO SE SABE. Cada página lee su propia lista; pintar los otros tres
// contadores obligaría a tres consultas más por pantalla, y ponerlos en cero sería peor: un «0»
// afirma que no hay herramientas cuando lo que pasa es que nadie las contó todavía.

export type VistaOperacion = 'pedidos' | 'herramientas' | 'movimientos' | 'fuentes'

const VISTAS: { id: VistaOperacion; label: string; href: string }[] = [
  { id: 'pedidos', label: 'Pedidos', href: '/integraciones/pedidos-materiales' },
  { id: 'herramientas', label: 'Herramientas', href: '/integraciones/herramientas' },
  { id: 'movimientos', label: 'Movimientos', href: '/integraciones/movimientos' },
  { id: 'fuentes', label: 'Fuentes', href: '/integraciones' },
]

export function NavOperacion({ activa, cuenta }: { activa: VistaOperacion; cuenta?: number | null }) {
  return (
    <SubTabs
      testid="nav-operacion"
      items={VISTAS.map((v) => ({
        href: v.href,
        label: v.label,
        activo: v.id === activa,
        cuenta: v.id === activa ? (cuenta ?? null) : null,
        testid: `ir-${v.id}`,
      }))}
    />
  )
}
