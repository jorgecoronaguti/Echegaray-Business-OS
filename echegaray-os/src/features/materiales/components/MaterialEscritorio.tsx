'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import { Aviso, Boton, Drawer, Estado, Filtros, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { diaMesAnioISO } from '@/shared/utils/fecha'
import { PASOS_PEDIDO } from '@/shared/lib/estadoPedidoMaterial'
import {
  FILTROS_ESTADO, hrefMaterialEscritorio, rotuloOrigen, rotuloUrgencia, textoCantidad, type Filtro, type Pedido,
} from '../logica/pedidos'
import { cambiarEstadoPedido } from '../services/acciones'
import { FormPedirMaterial, type ObraElegible } from './FormPedirMaterial'

// MATERIAL EN LA COMPUTADORA — la lista de todas las obras para ADMINISTRAR: filtrar, cambiar el
// estado ítem por ítem, y pedir desde un panel lateral sin irse de la lista.
//
// La tabla es la pantalla (Asana); el panel lateral edita sin abandonar el contexto (Figma); una
// fila por ítem, densa, con el número alineado (las 25 reglas). El estado se cambia EN la fila con
// un selector: lo que Administración hace cien veces por semana no merece un panel.

const ESTADO_SELECT =
  'h-[26px] rounded-control border border-line bg-surface px-1.5 text-[12px] text-ink-soft hover:border-line-strong focus:border-ink/30 disabled:opacity-60'

export function MaterialEscritorio({
  pedidos,
  total,
  filtro,
  obras,
}: {
  /** Ya filtradas por la página. */
  pedidos: Pedido[]
  total: number
  filtro: Filtro
  obras: ObraElegible[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()

  const cambiar = (idPedido: string, estado: string) => {
    setError(null)
    startTransition(async () => {
      const r = await cambiarEstadoPedido(idPedido, estado)
      if (r.error) setError(r.error)
      else router.refresh()
    })
  }

  const alGuardar = useCallback((m: string) => {
    setAbierto(false)
    setMensaje(m)
    router.refresh()
  }, [router])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Filtros
          testid="filtros-estado"
          opciones={FILTROS_ESTADO.map((f) => ({
            label: f.label,
            href: hrefMaterialEscritorio({ obra: filtro.obra, estado: f.id }),
            activo: f.id === filtro.estado,
            testid: `filtro-${f.id}`,
          }))}
          cuenta={{ n: pedidos.length, total }}
        />
        <Boton variante="primaria" className="ml-auto" onClick={() => setAbierto(true)} data-testid="abrir-pedir">
          Pedir material
        </Boton>
      </div>

      {mensaje && (
        <Aviso tono="info" titulo={mensaje} testid="material-ok">
          Queda como «Pedido» hasta que alguien lo vea.
        </Aviso>
      )}
      {error && (
        <Aviso tono="neg" titulo="No se pudo cambiar el estado." testid="material-error">
          {error}
        </Aviso>
      )}

      {pedidos.length === 0 ? (
        <Vacio accion={<button type="button" onClick={() => setAbierto(true)} className="text-ink underline">Pedir material</button>}>
          {total === 0 ? 'Todavía no hay pedidos.' : 'Nada con este filtro.'}
        </Vacio>
      ) : (
        <Tabla testid="tabla-material" minWidth={820}>
          <THead>
            <Th>Fecha</Th>
            <Th>Obra</Th>
            <Th>Material</Th>
            <Th num>Cantidad</Th>
            <Th>Para cuándo</Th>
            <Th>Estado</Th>
            <Th>Nota</Th>
            <Th>Origen</Th>
          </THead>
          <tbody>
            {pedidos.map((p) => (
              <Tr key={p.id_pedido} compacta data-testid="fila-pedido" data-id={p.id_pedido}>
                <Td className="whitespace-nowrap">{diaMesAnioISO(p.fecha) ?? '—'}</Td>
                <Td fuerte><span className="block max-w-[220px] truncate">{p.obra_rotulo ?? <span className="text-faint">sin obra</span>}</span></Td>
                <Td fuerte>{p.material ?? '—'}</Td>
                <Td num className="whitespace-nowrap">{textoCantidad(p.cantidad, p.unidad)}</Td>
                <Td className="whitespace-nowrap">{rotuloUrgencia(p.urgencia) ?? <span className="text-faint">—</span>}</Td>
                <Td>
                  <span className="flex items-center gap-2">
                    <Estado tono={p.lectura.tono} clave={p.lectura.clave}>{p.lectura.label}</Estado>
                    <select
                      aria-label={`Estado de ${p.material ?? p.id_pedido}`}
                      value={PASOS_PEDIDO.some((s) => s.clave === p.lectura.clave) ? p.lectura.clave : ''}
                      onChange={(e) => cambiar(p.id_pedido, e.target.value)}
                      disabled={pendiente}
                      className={ESTADO_SELECT}
                      data-testid="estado-pedido"
                    >
                      {!PASOS_PEDIDO.some((s) => s.clave === p.lectura.clave) && <option value="">cambiar…</option>}
                      {PASOS_PEDIDO.map((s) => (
                        <option key={s.valor} value={s.clave}>{s.label}</option>
                      ))}
                    </select>
                  </span>
                </Td>
                <Td><span className="block max-w-[260px] truncate" title={p.nota ?? undefined}>{p.nota ?? ''}</span></Td>
                <Td><span className="text-faint">{rotuloOrigen(p.origen)}</span></Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      )}

      {abierto && (
        <Drawer
          titulo="Pedir material"
          subtitulo="Queda como «Pedido» para la obra que elijas."
          onCerrar={() => setAbierto(false)}
          ancho={440}
          testid="panel-pedir"
          pie={
            <>
              <Boton type="submit" form="form-pedir-material" variante="primaria" data-testid="guardar-pedido">
                Pedir material
              </Boton>
              <Boton type="button" variante="discreta" onClick={() => setAbierto(false)}>
                Cancelar
              </Boton>
            </>
          }
        >
          <FormPedirMaterial obras={obras} cara="escritorio" sinBoton alGuardar={alGuardar} />
        </Drawer>
      )}
    </div>
  )
}
