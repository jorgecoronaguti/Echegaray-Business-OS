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
// LA ACTIVIDAD DEL PEDIDO (Cmd+Z, dueño 17/09/2026) SIGUE ACÁ: el 10 no dibuja el selector, pero es una
// superficie del deshacer de la plataforma (`deshacerCableado.test.ts`) y lo pedido por el dueño no se
// quita. Va como segunda línea de «Qué se pidió» (diseñado con la skill: edición en el lugar). Por eso
// el archivo es cliente. Las acciones llegan ya atadas con `.bind(null, obraId)` desde la página.

'use client'

import { useEffect, useRef, useState } from 'react'
import { useCeldaViva, useGuardadoDeshacible } from '@/shared/components/deshacer/DeshacerProvider'
import { useEstadoDelServidor } from '@/shared/tiempo-real/useEstadoDelServidor'
import { C } from './canon/tokens'
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

/** El selector guarda al elegir: un botón «guardar» por fila en una lista de treinta pedidos es
 *  treinta clics de más para un dato que es un solo campo.
 *
 *  CMD/CTRL+Z Y CMD/CTRL+SHIFT+Z (dueño, 17/09/2026): cada elección se apila en la pila de la
 *  plataforma y deshacer llama a la MISMA acción con la actividad anterior. La `clave` lleva el id
 *  del pedido: sin eso las treinta filas comparten paso y Cmd+Z reasigna la que no es.
 *
 *  LO ELEGIDO SE RESINCRONIZA CON LA BASE (auditoría, 18/09/2026): con `useState(valor)` el select no
 *  adoptaba lo que otra persona cargó y Cmd+Z apilaba un anterior falso (`''`) que terminaba en NULL
 *  sobre la actividad ajena. `useEstadoDelServidor` adopta cada relectura; la vuelta viaja con
 *  `esperado` y la acción rechaza si la base ya tiene otra cosa. */
function SelectActividad({
  actividades, valor, alElegir, clave, rotulo,
}: {
  actividades: Actividad[]
  valor: string | null
  alElegir: (actividadId: string, esperado?: string) => Promise<ResultadoAccion>
  clave: string
  rotulo: string
}) {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elegida, setElegida] = useEstadoDelServidor(valor ?? '')
  const elegidaRef = useRef(elegida)
  useEffect(() => { elegidaRef.current = elegida })

  const nombre = (id: string) => {
    if (id === '') return 'sin asignar'
    const a = actividades.find((x) => x.id === id)
    return a ? `${a.rubro ? `${a.rubro} · ` : ''}${a.nombre}` : 'actividad fuera de la lista'
  }

  const guardarDeshacible = useGuardadoDeshacible({
    clave, rotulo, valorAnterior: elegida, formato: nombre, protegido: true,
    guardar: async (v, contexto) => {
      const r = await alElegir(v, contexto?.esperado)
      return r.ok ? { ok: true as const } : { ok: false as const, error: r.error }
    },
  })

  useCeldaViva(clave, { actual: () => elegidaRef.current, aplicar: (v) => setElegida(v) })

  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <select
        value={elegida}
        disabled={guardando}
        data-testid="pedido-actividad"
        aria-label="Para la actividad"
        style={{
          height: '26px', maxWidth: '220px', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', padding: '0 6px',
          fontSize: '12px', color: C.tintaSuave, background: C.superficie, font: 'inherit',
        }}
        onChange={async (e) => {
          const anterior = elegida
          const nuevo = e.target.value
          setElegida(nuevo)
          setGuardando(true)
          setError(null)
          const r = await guardarDeshacible(nuevo)
          if (!r.ok) { setElegida(anterior); setError(r.error) }
          setGuardando(false)
        }}
      >
        <option value="">sin asignar</option>
        {actividades.map((a) => (
          <option key={a.id} value={a.id}>{a.rubro ? `${a.rubro} · ` : ''}{a.nombre}</option>
        ))}
      </select>
      {error && <span style={{ fontSize: '11px', color: C.neg }}>{error}</span>}
    </span>
  )
}

export function TabOperacion({
  sub, obraId, nombreObra, errorFuente = null, pedidos, compras, equipos, impedimentos, actividades,
  crearImpedimento, liberarImpedimento, veEconomia, nuevo = false, hoyIso, asignarActividadAPedido,
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
  /** Decir para qué actividad es un pedido. Sin ella no se dibuja el selector. `esperado` viene del deshacer. */
  asignarActividadAPedido?: (idPedido: string, actividadId: string, esperado?: string) => Promise<ResultadoAccion>
}) {
  const visibles = subsVisibles(veEconomia)
  const elegibles = actividades.filter((a) => a.tipo !== 'resumen' && !a.archivada && !a.actividad_padre_id)
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
      {/* El cuerpo: 24/30/32 en escritorio (el marco de la página ya pone 20 por lado y 24 abajo). En el
          teléfono queda el marco de 20: el M dibuja 16, y achicar el marco con un `-mx-` distinto de
          `-mx-5` saca contenido del documento (`geometria-obras.test.ts`). */}
      <div className="pt-4 md:px-2.5 md:pb-2 md:pt-6">
        {errorFuente && actual !== 'impedimentos' && (
          <AvisoDeLectura mensaje={errorFuente} que="la operación de esta obra" testid="operacion-lectura-fallida" />
        )}
        {actual === 'impedimentos' && (
          <Impedimentos impedimentos={impedimentos} actividades={actividades} crear={crearImpedimento} liberar={liberarImpedimento}
            nuevo={nuevo} obraId={obraId} sub={actual} hoyIso={hoyIso} />
        )}
        {!errorFuente && actual === 'pedidos' && (
          <Pedidos pedidos={pedidos} actividades={actividades}
            actividadDe={asignarActividadAPedido && elegibles.length > 0 ? (p) => (
              <SelectActividad
                actividades={elegibles}
                valor={p.actividad_id}
                clave={`actividad-del-pedido-${p.id_pedido}`}
                rotulo={`Actividad del pedido ${p.id_pedido}`}
                alElegir={(id, esperado) => asignarActividadAPedido(p.id_pedido, id, esperado)}
              />
            ) : undefined} />
        )}
        {!errorFuente && actual === 'equipos' && equipos && <Equipos equipos={equipos} nombreObra={nombreObra} />}
        {!errorFuente && actual === 'compras' && veEconomia && <Compras compras={compras} />}
      </div>
    </div>
  )
}
