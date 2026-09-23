// OPERACIÓN DE LA OBRA — Impedimentos · Pedidos · Equipos · Compras (diseño ERP Obras 09–12 · M12–M15).
//
// ═══ TODO NUEVO (mandato del dueño, 23/09/2026) ═══
//
// Ninguna pantalla vieja: las cuatro sub-vistas reproducen el fragmento aprobado a 1440 y a 390 con
// clases responsive en la misma página. Lo que el diseño no dibuja y hace falta para operar (el alta
// del impedimento, liberar, el detalle de un equipo) se diseñó con `diseno-ui-ux-producto-os` y está
// declarado en cada componente.
//
// EL NIVEL 3 SE DIBUJA ACÁ (`SubsOperacion`): en escritorio es la línea de sub-solapas dentro del
// bloque blanco de la cabecera, en el teléfono la fila de pastillas de 36px. Compras sólo para quien ve
// economía: la pastilla no se dibuja y `?sub=compras` cae en Impedimentos.
//
// EQUIPOS lee el modelo nuevo de Herramientas (`equiposDeObraService`); `herramientas` y
// `movimientos_herramienta` dejaron de consultarse.
//
// Sin `'use client'`: es un Server Component que monta hijos cliente donde hay estado. Las acciones
// llegan ya atadas con `.bind(null, obraId)` desde la página.

import { AvisoDeLectura } from '@/shared/components/estado'
import type { AccionFormulario, ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, Restriccion } from '../types'
import type { ComprasObra, PedidoOperacion, SubOperacion } from '../services/operacionService'
import type { EquiposDeObra } from '../services/equiposDeObraService'
import { SubsOperacion, subsVisibles } from './operacion/SubsOperacion'
import { Impedimentos } from './operacion/Impedimentos'
import { Pedidos } from './operacion/Pedidos'
import { Equipos } from './operacion/Equipos'
import { Compras } from './operacion/Compras'

export function TabOperacion({
  sub, obraId, nombreObra, errorFuente = null, pedidos, compras, equipos, impedimentos, actividades,
  crearImpedimento, liberarImpedimento, veEconomia, nuevo = false, hoyIso,
}: {
  sub: SubOperacion
  obraId: string
  nombreObra: string
  /** Lo que dijo la fuente cuando no se pudo leer. `null` = se leyó bien. Los impedimentos son del OS
   *  y no dependen de ella. */
  errorFuente?: string | null
  pedidos: PedidoOperacion[]
  compras: ComprasObra
  equipos: EquiposDeObra | null
  /** TODOS los de la obra: se escribe desde acá. */
  impedimentos: Restriccion[]
  actividades: Actividad[]
  crearImpedimento: AccionFormulario
  liberarImpedimento: (restriccionId: string) => Promise<ResultadoAccion>
  veEconomia: boolean
  /** `?nuevo=1`: el alta de impedimento abierta. */
  nuevo?: boolean
  hoyIso: string
}) {
  const visibles = subsVisibles(veEconomia)
  const actual: SubOperacion = visibles.includes(sub) ? sub : 'impedimentos'
  const cuenta: Record<SubOperacion, number | null> = {
    // Impedimentos cuenta lo que FRENA (no liberados); los demás cuentan filas, que no se «cierran».
    impedimentos: impedimentos.filter((r) => r.estado !== 'liberada').length,
    pedidos: errorFuente ? null : pedidos.length,
    equipos: errorFuente || !equipos ? null : equipos.enObra.length,
    compras: errorFuente ? null : (compras.nComprobantes ?? compras.filas.length),
  }

  return (
    <div className="flex flex-col" data-testid="tab-operacion">
      <SubsOperacion obraId={obraId} sub={actual} cuenta={cuenta} veEconomia={veEconomia} />
      {/* El cuerpo: 24/30/32 en escritorio (el marco de la página ya pone 20 por lado y 24 abajo);
          16 por lado en el teléfono (M: `padding 16`), donde el marco pone 20. */}
      <div className="-mx-1 pt-4 md:mx-0 md:px-2.5 md:pb-2 md:pt-6">
        {errorFuente && actual !== 'impedimentos' && (
          <AvisoDeLectura mensaje={errorFuente} que="la operación de esta obra" testid="operacion-lectura-fallida" />
        )}
        {actual === 'impedimentos' && (
          <Impedimentos impedimentos={impedimentos} actividades={actividades} crear={crearImpedimento} liberar={liberarImpedimento}
            nuevo={nuevo} obraId={obraId} sub={actual} hoyIso={hoyIso} />
        )}
        {!errorFuente && actual === 'pedidos' && <Pedidos pedidos={pedidos} actividades={actividades} />}
        {!errorFuente && actual === 'equipos' && equipos && <Equipos equipos={equipos} nombreObra={nombreObra} />}
        {!errorFuente && actual === 'compras' && veEconomia && <Compras compras={compras} />}
      </div>
    </div>
  )
}
