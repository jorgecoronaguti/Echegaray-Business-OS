'use client'

// EL PANEL DE UN PAQUETE — lo que hay que saber antes de dejarlo arrancar (Design canónico 23/08).
//
// Orden de lectura, de arriba abajo: quién y qué · qué lo frena · cuánto avanzó · cuánto vale ·
// los cinco datos que se consultan todos los días · y recién después lo que se carga.
//
// ═══ EL BLOQUEO ES LO PRIMERO QUE SE VE ═══
//
// «ART sin cargar · el paquete no puede iniciar» va arriba de todo y en rojo, y el botón de
// arrancar queda apagado con el motivo al lado. El botón NO es el control —la misma fila entra por
// PostgREST— y por eso `cambiarEstadoPaquete` vuelve a revisar los papeles del lado del servidor
// con la misma función.
//
// ═══ LAS DOS TARJETAS CAMBIAN CON EL PERMISO, NO SE VACÍAN ═══
//
// Con permiso económico: CONTRATO y COSTO REAL. Sin permiso: ALCANCE y PLAZO. No es una tarjeta de
// plata tapada —una caja vacía donde iba un número pregunta qué dice y la respuesta no le sirve a
// nadie—: es el dato que ese rol sí decide, en el mismo lugar.

import type { ReactNode } from 'react'
import { Aviso, BarraAvance, CAMPO, Campo, Estado, Plegable, TituloPanel } from '@/shared/components/ds'
import { BotonAccion, FormAccion } from '@/shared/components/ui'
import type { AccionFormulario, ResultadoAccion } from '@/shared/components/ui'
import {
  IconoCerrar, IconoDependencia, IconoDocumento, IconoFecha, IconoHH, IconoPersona, IconoProveedor,
} from '@/shared/components/iconos'
import { cantidad as fmtCantidad, fecha as fmtFecha, plata } from './formato'
import { Aportes, Documentacion, PersonalExterno } from './PanelSubcontratoSecciones'
import type { Paquete } from '../services/subcontratosService'

export interface AccionesPaquete {
  aporte: AccionFormulario
  persona: AccionFormulario
  documento: AccionFormulario
  precio: AccionFormulario
  estado: (subcontratoId: string, estado: string) => Promise<ResultadoAccion>
}

export function PanelSubcontrato({
  paquete, economia, onCerrar, acciones,
}: {
  paquete: Paquete
  economia: boolean
  onCerrar: () => void
  acciones: AccionesPaquete
}) {
  const p = paquete
  const bloqueado = p.revision.bloqueos.length > 0
  const hoyISO = new Date().toISOString().slice(0, 10)

  return (
    <aside className="flex flex-col gap-4" data-testid="panel-subcontrato">
      <header className="flex items-start gap-3 border-b border-line pb-3">
        <div className="min-w-0 flex-1">
          <TituloPanel>{p.vinculos[0]?.actividad ?? p.nombre}</TituloPanel>
          <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
            <IconoProveedor className="h-[13px] w-[13px] shrink-0" />
            {p.proveedor ?? 'sin subcontratista'}
          </p>
        </div>
        <Estado tono={p.estadoLegible.tono} clave={p.estadoLegible.clave}>{p.estadoLegible.label}</Estado>
        <button type="button" onClick={onCerrar} aria-label="Cerrar el panel"
          className="shrink-0 text-muted hover:text-ink" data-testid="cerrar-panel">
          <IconoCerrar className="h-[15px] w-[15px]" />
        </button>
      </header>

      {bloqueado && (
        <Aviso tono="neg" titulo={p.revision.bloqueos.join(' · ')} testid="bloqueo-inicio">
          El paquete no puede iniciar.
        </Aviso>
      )}

      <Avance paquete={p} />

      <div className="grid grid-cols-2 gap-3">
        {economia ? (
          <>
            <Tarjeta rotulo="Contrato" valor={p.precio_contratado == null ? null : plata(p.precio_contratado)}
              falta="sin precio cargado" pie={fmtCantidad(p.cantidad, p.unidad) ?? p.estado} />
            <Tarjeta rotulo="Costo real" valor={p.costo_real == null ? null : plata(p.costo_real)}
              falta="sin precio ni aportes" testid="costo-real"
              pie={p.aportes_total ? `+ ${plata(p.aportes_total)} de aportes` : 'sin aportes cargados'} />
          </>
        ) : (
          <>
            <Tarjeta rotulo="Alcance" valor={fmtCantidad(p.cantidad, p.unidad)} falta="sin cantidad" />
            <Tarjeta rotulo="Plazo" valor={p.plazo.texto} falta="sin plazo" />
          </>
        )}
      </div>

      <div>
        <Dato icono={<IconoFecha className="h-[14px] w-[14px]" />} clave="Plazo" valor={rangoDeFechas(p)}
          falta="sin fechas de plan" />
        <Dato icono={<IconoPersona className="h-[14px] w-[14px]" />} clave="Personal externo"
          valor={p.personas_externas ? `${p.personas_externas} declaradas` : null} falta="sin declarar" />
        <Dato icono={<IconoDocumento className="h-[14px] w-[14px]" />} clave="Documentación"
          valor={bloqueado ? null : resumenDocumental(p)} falta={p.revision.bloqueos.join(' · ')}
          tono={bloqueado ? 'neg' : undefined} />
        <Dato icono={<IconoDependencia className="h-[14px] w-[14px]" />} clave="Actividad"
          valor={p.vinculos.map((v) => v.actividad).join(' · ') || null} falta="sin vincular" tono="warn" />
        <Dato icono={<IconoHH className="h-[14px] w-[14px]" />} clave="HH de apoyo"
          valor={p.hh_apoyo ? `${p.hh_apoyo} HH propias` : null} falta="sin declarar" />
        <Dato icono={<IconoDocumento className="h-[14px] w-[14px]" />} clave="Alcance en palabras"
          valor={p.alcance} falta="sin describir" />
      </div>

      {economia && (
        <section data-testid="alcance-contratado">
          <Plegable titulo="Fijar el precio contratado" testid="abrir-precio">
            <FormAccion accion={acciones.precio} testid="form-precio" enviar="Guardar el precio" mensajeOk="Precio guardado.">
              <input type="hidden" name="subcontrato_id" value={p.id} />
              <Campo rotulo="Precio contratado" ayuda="Entra por la función con portero económico, no por la tabla.">
                <input name="precio_contratado" type="number" step="0.01" min="0" className={CAMPO} required />
              </Campo>
            </FormAccion>
          </Plegable>
        </section>
      )}

      <Aportes paquete={p} economia={economia} accion={acciones.aporte} />
      <Documentacion paquete={p} accion={acciones.documento} />
      <PersonalExterno paquete={p} accion={acciones.persona} hoyISO={hoyISO} />

      <section className="border-t border-line pt-3" data-testid="mover-estado">
        <div className="flex flex-wrap items-center gap-2">
          {p.estado !== 'en_curso' && p.estado !== 'terminado' && (
            <BotonAccion accion={acciones.estado} args={[p.id, 'en_curso']} testid="iniciar-paquete">
              Iniciar
            </BotonAccion>
          )}
          {p.estado === 'en_curso' && (
            <BotonAccion accion={acciones.estado} args={[p.id, 'terminado']} testid="terminar-paquete">
              Dar por terminado
            </BotonAccion>
          )}
          <span className="text-[11.5px] text-faint">guardado: {p.estado}</span>
        </div>
        {bloqueado && (
          <p className="mt-2 text-[11.5px] text-neg" data-testid="motivo-bloqueo">
            {p.revision.bloqueos.join(' · ')}: iniciar va a ser rechazado también del lado del servidor.
          </p>
        )}
      </section>
    </aside>
  )
}

/** El avance, con barra SÓLO cuando el número es una fracción. Sin medición se dice de dónde
 *  saldría —y no se dibuja ni la pista: una pista vacía ya afirma una proporción. */
function Avance({ paquete }: { paquete: Paquete }) {
  const pct = paquete.avance.pct
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.05em] text-faint">Avance</span>
        <span className={`font-mono text-[13px] font-semibold tabular-nums ${pct == null ? 'text-faint' : 'text-ink'}`}>
          {pct == null ? 'sin medición' : `${pct} %`}
        </span>
      </div>
      {pct == null
        ? <p className="mt-1 text-[11px] text-muted">{paquete.avance.base}</p>
        : <div className="mt-1.5"><BarraAvance pct={pct} alto={5} /></div>}
    </div>
  )
}

const rangoDeFechas = (p: Paquete): string | null =>
  p.fecha_inicio_plan && p.fecha_fin_plan
    ? `${fmtFecha(p.fecha_inicio_plan)} → ${fmtFecha(p.fecha_fin_plan)}`
    : (p.fecha_fin_plan ? `→ ${fmtFecha(p.fecha_fin_plan)}` : null)

/** Cuántos de los papeles exigidos están al día. `null` cuando no se pudo revisar ninguno: cero de
 *  cero se lee como «no tiene papeles», que es lo contrario de «no pude mirar». */
const resumenDocumental = (p: Paquete): string | null => {
  const n = p.revision.filas.length
  if (n === 0) return null
  const ok = p.revision.filas.filter((f) => f.estado === 'ok').length
  return ok === n ? 'completa' : `${ok} de ${n}`
}

function Tarjeta({ rotulo, valor, falta, pie, testid }: {
  rotulo: string
  valor: string | null
  falta: string
  pie?: string | null
  testid?: string
}) {
  return (
    <div className="rounded-card border border-[#EFEEEA] bg-surface-quiet px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.05em] text-faint">{rotulo}</div>
      <div data-testid={testid}
        className={`font-mono text-[15px] font-semibold tabular-nums ${valor ? 'text-ink' : 'text-faint'}`}>
        {valor ?? falta}
      </div>
      {pie && <div className="mt-0.5 text-[11px] text-muted">{pie}</div>}
    </div>
  )
}

function Dato({ icono, clave, valor, falta, tono }: {
  icono: ReactNode
  clave: string
  valor: string | null
  falta: string
  /** El color de la ausencia. Sin tono, lo que falta es `faint`: no todo hueco es un problema. */
  tono?: 'neg' | 'warn'
}) {
  const color = valor ? 'text-ink' : tono === 'neg' ? 'text-neg' : tono === 'warn' ? 'text-warn' : 'text-faint'
  return (
    <div className="flex items-center gap-2.5 border-b border-[#EFEEEA] py-[7px] last:border-0">
      <span className="flex shrink-0 text-faint">{icono}</span>
      <span className="w-[104px] shrink-0 text-[11.5px] text-muted">{clave}</span>
      <span className={`min-w-0 flex-1 truncate text-right text-[12.5px] ${color}`}>{valor ?? falta}</span>
    </div>
  )
}
