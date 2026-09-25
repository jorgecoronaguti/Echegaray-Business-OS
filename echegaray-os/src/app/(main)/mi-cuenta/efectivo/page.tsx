import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { MiCuentaShell } from '@/features/mi-cuenta/components/MiCuentaShell'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { getMiEfectivo } from '@/features/efectivo/campo/datos'
import {
  MIGRACION_EFECTIVO, abiertas, destino, diaMes, estadoVisible, fechaDelTicket, pesos, resumenMiEfectivo, totalDelTicket,
} from '@/features/efectivo/campo/logica'
import type { EntregaSaldo } from '@/features/efectivo/campo/tipos'
import { PanelFirmar } from '@/features/efectivo/escritorio/PanelFirmar'
import { Aviso, BotonEnlace, Franja, Tabla, THead, Th, Tr, Td, TituloPanel, Vacio } from '@/shared/components/ds'
import { RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'

// MI EFECTIVO · COMPUTADORA (dueño, 25/09/2026: «el jefe en la PC entra a su pantalla de teléfono…
// tiene que tener un diseño de computadora»).
//
// Es D15/M03 —lo que me entregaron, lo que rendí, lo que me queda— con la forma de escritorio: una
// franja de cifras, la tabla de entregas y la de tickets, y la firma de la conformidad en un panel al
// costado. Lee lo MISMO que el teléfono (`getMiEfectivo`, con la sesión de la persona; la base sólo le
// da lo suyo por `ve_efectivo_entrega`). La cuenta no se hace acá: sale de `efectivo_entrega_saldo`.
//
// Lo que NO está: rendir un gasto (mandar la foto del ticket) y declarar una devolución. Son actos de
// obra, con la cámara en la mano, y siguen en el teléfono (`/mi-informacion/efectivo/rendir`).

export const dynamic = 'force-dynamic'

const AQUI = '/mi-cuenta/efectivo'

export default async function MiEfectivoEscritorioPage({ searchParams }: { searchParams: Promise<{ firmar?: string }> }) {
  const { firmar } = await searchParams
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  const perfil = user ? await getPerfilPropio(supabase, user.id) : null
  const personaId = perfil?.data?.persona_id ?? null
  const lectura = personaId ? await getMiEfectivo(supabase, personaId) : null

  const entregas = lectura?.estado === 'ok' ? lectura.dato.entregas : []
  const tickets = lectura?.estado === 'ok' ? lectura.dato.tickets : []
  const r = resumenMiEfectivo(entregas, tickets)
  const sinFirmar = abiertas(entregas).filter((e) => !e.conformidad).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const aFirmar = firmar ? sinFirmar.find((e) => e.id === firmar) ?? null : null
  const ordenadas = [...entregas].sort((a, b) => b.fecha.localeCompare(a.fecha))
  const codigoDe = new Map(entregas.map((e) => [e.id, e.codigo]))
  const recientes = [...tickets].sort((a, b) => b.enviado_en.localeCompare(a.enviado_en))

  return (
    <MiCuentaShell titulo="Mi efectivo">
      <RefrescarEnVivo tablas={TABLAS_DE.efectivoCampo} />
      <div className="flex flex-col gap-8" data-testid="mi-efectivo-escritorio">
        {!personaId && <SinVinculo que="el efectivo que te entregaron" disponible={perfil?.data?.vinculoDisponible !== false} />}
        {lectura?.estado === 'sin-publicar' && (
          <Aviso tono="warn" titulo="Efectivo a rendir todavía no está publicado">
            Falta la migración <code className="font-mono">{MIGRACION_EFECTIVO}</code>.
          </Aviso>
        )}
        {lectura?.estado === 'error' && <Aviso tono="neg" titulo="No se pudo leer tu efectivo">{lectura.error}</Aviso>}

        {lectura?.estado === 'ok' && (
          <>
            {sinFirmar.map((e) => (
              <Aviso
                key={e.id}
                tono="warn"
                testid="efectivo-sin-firmar"
                titulo={`Te entregaron ${pesos(e.entregado)} para ${destino(e)} · ${e.codigo}`}
                accion={<BotonEnlace href={`${AQUI}?firmar=${encodeURIComponent(e.id)}`} variante="primaria">Firmar la conformidad</BotonEnlace>}
              >
                Entregado el {diaMes(e.fecha)}. Hasta que firmes, no suma a lo que tenés para rendir.
              </Aviso>
            ))}

            <Franja
              testid="efectivo-cifras"
              metricas={[
                {
                  etiqueta: r.tengoQueRendir < 0 ? 'Rendiste de más' : 'Tengo que rendir',
                  valor: pesos(Math.abs(r.tengoQueRendir)),
                  tono: r.tengoQueRendir < 0 ? 'warn' : undefined,
                },
                { etiqueta: 'Recibí', valor: pesos(r.recibi), contexto: `${r.entregas.length} ${r.entregas.length === 1 ? 'entrega abierta' : 'entregas abiertas'}` },
                { etiqueta: 'Rendí', valor: pesos(r.rendi), contexto: 'ya en Compras' },
                {
                  etiqueta: 'Fotos sin pasar a Compras',
                  valor: String(r.pendientes.length),
                  contexto: r.pendienteMonto > 0 ? pesos(r.pendienteMonto) : undefined,
                  tono: r.piden.length > 0 ? 'warn' : undefined,
                },
              ]}
            />

            <section className="flex flex-col gap-3">
              <div className="flex items-baseline gap-3">
                <TituloPanel>Entregas</TituloPanel>
                <span className="font-mono text-[12px] text-faint">{entregas.length}</span>
              </div>
              {ordenadas.length === 0 ? (
                <Vacio>No tenés entregas de efectivo.</Vacio>
              ) : (
                <Tabla testid="tabla-entregas" minWidth={760}>
                  <THead>
                    <Th>Entrega</Th><Th>Fecha</Th><Th>Para</Th>
                    <Th num>Entregado</Th><Th num>Rendido</Th><Th num>Devuelto</Th><Th num>En tu poder</Th>
                    <Th>Conformidad</Th><Th>Estado</Th>
                  </THead>
                  <tbody>
                    {ordenadas.map((e) => <FilaEntrega key={e.id} e={e} />)}
                  </tbody>
                </Tabla>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <div className="flex items-baseline gap-3">
                <TituloPanel>Lo que rendí</TituloPanel>
                <span className="font-mono text-[12px] text-faint">{tickets.length}</span>
              </div>
              {recientes.length === 0 ? (
                <Vacio>Todavía no mandaste tickets. Se rinden desde el teléfono, con la foto.</Vacio>
              ) : (
                <Tabla testid="tabla-rendiciones" minWidth={640}>
                  <THead>
                    <Th>Fecha</Th><Th>Entrega</Th><Th>Comercio</Th><Th num>Importe</Th><Th>Estado</Th>
                  </THead>
                  <tbody>
                    {recientes.map((t) => {
                      const v = estadoVisible(t)
                      const total = totalDelTicket(t)
                      return (
                        <Tr key={t.id} compacta data-testid="fila-ticket">
                          <Td num className="!text-left">{fechaDelTicket(t)}</Td>
                          <Td><span className="font-mono">{codigoDe.get(t.entrega_id) ?? t.entrega}</span></Td>
                          <Td fuerte>{v.titulo}</Td>
                          <Td num>{total == null ? '—' : pesos(total)}</Td>
                          <Td><span className={TONO[v.tono]}>{v.etiqueta}</span></Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </Tabla>
              )}
            </section>
          </>
        )}
      </div>

      {aFirmar && (
        <PanelFirmar
          entrega={aFirmar.id}
          codigo={aFirmar.codigo}
          texto={`Recibo ${pesos(aFirmar.entregado)} en efectivo para ${destino(aFirmar)}`}
          volverA={AQUI}
        />
      )}
    </MiCuentaShell>
  )
}

const TONO: Record<'faint' | 'warn' | 'pos' | 'neg', string> = {
  faint: 'text-muted', warn: 'text-warn', pos: 'text-pos', neg: 'text-neg',
}

function FilaEntrega({ e }: { e: EntregaSaldo }) {
  const estado = e.estado === 'abierta' ? 'abierta' : e.estado === 'cerrada' ? 'cerrada' : 'anulada'
  return (
    <Tr compacta data-testid="fila-entrega">
      <Td fuerte><span className="font-mono">{e.codigo}</span></Td>
      <Td num className="!text-left">{diaMes(e.fecha)}</Td>
      <Td fuerte><span className="block max-w-[260px] truncate">{destino(e)}</span></Td>
      <Td num>{pesos(e.entregado)}</Td>
      <Td num>{pesos(e.rendido)}</Td>
      <Td num>{pesos(e.devuelto)}</Td>
      <Td num><span className="font-semibold">{pesos(e.en_su_poder)}</span></Td>
      <Td>{e.conformidad ? <span className="text-ink-soft">firmada</span> : <span className="text-warn">sin firmar</span>}</Td>
      <Td><span className={estado === 'abierta' ? 'text-ink' : 'text-muted'}>{estado}</span></Td>
    </Tr>
  )
}
