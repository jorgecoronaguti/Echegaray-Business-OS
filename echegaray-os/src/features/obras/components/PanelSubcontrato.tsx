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
// Con permiso económico: CONTRATO y CERTIFICADO. Sin permiso: ALCANCE y PLAZO. No es una tarjeta de
// plata tapada —una caja vacía donde iba un número pregunta qué dice y la respuesta no le sirve a
// nadie—: es el dato que ese rol sí decide, en el mismo lugar.
//
// ═══ CUATRO SOLAPAS PORQUE SON CUATRO PREGUNTAS DISTINTAS (Design canónico, pantalla 10) ═══
//
// El panel era un rollo: lo que decide —bloqueo, avance, plata— arriba, y abajo tres formularios
// largos que empujaban fuera de la vista justo eso. Resumen · Certificaciones · Documentos ·
// Personal son las cuatro cosas que se vienen a mirar, y ninguna tapa a la otra. La solapa es
// estado del cliente: los datos de las cuatro ya viajaron en el primer render.

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  BarraAvance, CAMPO, Campo, Estado, Plegable, SubTabs, TituloPanel,
} from '@/shared/components/ds'
import { BotonAccion, FormAccion } from '@/shared/components/ui'
import type { AccionFormulario, ResultadoAccion } from '@/shared/components/ui'
import {
  IconoAbrir, IconoAdjuntar, IconoBloqueo, IconoCerrar, IconoCompletar, IconoDependencia,
  IconoDocumento, IconoFecha, IconoHH, IconoPersona, IconoProveedor,
} from '@/shared/components/iconos'
import { cantidad as fmtCantidad, fecha as fmtFecha, plata } from './formato'
import { Aportes, Documentacion, PersonalExterno } from './PanelSubcontratoSecciones'
import { SIN_REGISTRO_DE_CERTIFICACIONES } from '../services/subcontratosReglas'
import type { FilaComparacion } from '../services/subcontratosReglas'
import type { Paquete } from '../services/subcontratosService'

type Solapa = 'resumen' | 'certificaciones' | 'documentos' | 'personal'

export interface AccionesPaquete {
  aporte: AccionFormulario
  persona: AccionFormulario
  documento: AccionFormulario
  precio: AccionFormulario
  estado: (subcontratoId: string, estado: string) => Promise<ResultadoAccion>
}

export function PanelSubcontrato({
  paquete, economia, obraId, comparacion, onCerrar, acciones,
}: {
  paquete: Paquete
  economia: boolean
  /** Para salir a registrar el avance de la actividad que el paquete cubre. */
  obraId: string
  /** Propio vs subcontrato, ya armada por `armarComparacion`. Vive en el Resumen del panel. */
  comparacion: FilaComparacion[]
  onCerrar: () => void
  acciones: AccionesPaquete
}) {
  const p = paquete
  const [solapa, setSolapa] = useState<Solapa>('resumen')
  const bloqueado = p.revision.bloqueos.length > 0
  const hoyISO = new Date().toISOString().slice(0, 10)

  return (
    <aside className="flex flex-col gap-4" data-testid="panel-subcontrato">
      <header className="flex items-start gap-3 pb-1">
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

      <SubTabs
        testid="solapas-paquete"
        items={SOLAPAS.map(([clave, label]) => ({
          onClick: () => setSolapa(clave),
          label,
          activo: solapa === clave,
          testid: `solapa-${clave}`,
        }))}
      />

      {/* EL BLOQUEO SE VE EN LAS CUATRO SOLAPAS. Es de seguridad: gente de un tercero parada en la
          obra sin cobertura. Esconderlo detrás de «Documentos» lo dejaría a un clic de distancia de
          quien está por tocar «Iniciar».
          ES TARJETA SUAVE Y NO CARTEL DE ERROR (canónico 10): rojo de fondo apagado, el motivo en
          tinta y la flecha a la derecha. Y la flecha LLEVA A ALGÚN LADO —la solapa Documentos, que
          es donde se arregla—: una flecha dibujada que no va a ninguna parte es el botón falso que
          ya costó una pantalla entera. */}
      {bloqueado && (
        <button
          type="button"
          onClick={() => setSolapa('documentos')}
          data-testid="bloqueo-inicio"
          className="flex w-full items-center gap-2 rounded-card border border-neg/25 bg-neg-soft px-2.5 py-2 text-left"
        >
          <IconoBloqueo className="h-[14px] w-[14px] shrink-0 text-neg" />
          <span className="min-w-0 flex-1 text-[12px] font-medium text-ink">
            {p.revision.bloqueos.join(' · ')}
          </span>
          <IconoAbrir className="h-[13px] w-[13px] shrink-0 text-muted" />
        </button>
      )}

      {solapa === 'resumen' && (
        <>
          <Avance paquete={p} />

          <div className="grid grid-cols-2 gap-3">
            {economia ? (
              <>
                <Tarjeta rotulo="Contrato" valor={p.precio_contratado == null ? null : plata(p.precio_contratado)}
                  falta="sin precio cargado" pie={fmtCantidad(p.cantidad, p.unidad) ?? p.estado} />
                {/* CERTIFICADO NO ES COSTO REAL NI AVANCE VALORIZADO: es lo que se le reconoció al
                    tercero, y todavía no se registra en ningún lado. El costo real —que sí es un
                    dato— vive en «Certificaciones», al lado de los aportes que lo explican. */}
                <Tarjeta rotulo="Certificado" valor={p.certificado == null ? null : plata(p.certificado)}
                  falta="sin registro" testid="certificado"
                  pie={p.certificado == null ? SIN_REGISTRO_DE_CERTIFICACIONES : null} />
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
              valor={p.personas_externas ? `${p.personas_externas} personas declaradas` : null}
              falta="sin declarar" />
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

          <PropioVsSubcontrato paquete={p} filas={comparacion} economia={economia} />
        </>
      )}

      {solapa === 'certificaciones' && (
        <>
          {/* SE DICE QUE NO EXISTE, no se rellena con lo que hay a mano. Los aportes son plata que
              va en la dirección contraria —lo que le ponemos nosotros—: presentarlos acá como
              certificaciones sería el error caro de esta pantalla. */}
          <p className="text-[12px] text-muted" data-testid="sin-certificaciones">
            Sin certificaciones: {SIN_REGISTRO_DE_CERTIFICACIONES}. Lo que se le paga sale hoy de
            Compras, contra la factura del proveedor.
          </p>
          {economia && (
            <Tarjeta rotulo="Costo real" valor={p.costo_real == null ? null : plata(p.costo_real)}
              falta="sin precio ni aportes" testid="costo-real"
              pie={p.aportes_total ? `+ ${plata(p.aportes_total)} de aportes` : 'sin aportes cargados'} />
          )}
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
        </>
      )}

      {solapa === 'documentos' && <Documentacion paquete={p} accion={acciones.documento} />}
      {solapa === 'personal' && (
        <PersonalExterno paquete={p} accion={acciones.persona} hoyISO={hoyISO} />
      )}

      {/* ═══ EL PIE DEL PANEL (canónico 10) ═══
          Una sola barra separada por una línea: a la izquierda los dos atajos —los papeles y la
          actividad que el paquete cubre—, a la derecha la primaria. Los movimientos de estado
          quedan en el medio porque son la acción real de esta pantalla y el mockup no los dibuja:
          sacarlos por fidelidad dejaría el paquete sin manera de arrancar ni de cerrarse. */}
      <section className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3"
        data-testid="mover-estado">
        <button type="button" onClick={() => setSolapa('documentos')} title="Ver la documentación"
          aria-label="Ver la documentación" data-testid="atajo-documentos"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-control border border-line text-muted hover:border-line-strong hover:text-ink">
          <IconoAdjuntar className="h-[15px] w-[15px]" />
        </button>
        {p.vinculos[0] && (
          <Link href={`/obras/${obraId}?vista=tareas&act=${p.vinculos[0].actividad_id}`} prefetch={false}
            title="Ver la actividad vinculada" aria-label="Ver la actividad vinculada"
            data-testid="atajo-actividad"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-control border border-line text-muted hover:border-line-strong hover:text-ink">
            <IconoDependencia className="h-[15px] w-[15px]" />
          </Link>
        )}
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
        {/* EL GUARDADO SE DICE APARTE: la pastilla de arriba muestra el estado EFECTIVO —un
            paquete sin ART dice «bloqueado» aunque en la base diga «en curso»— y sin esta línea no
            hay dónde leer cuál de los dos es el que está escrito. */}
        <span className="text-[11.5px] text-faint">guardado: {p.estado}</span>
        <CertificarAvance paquete={p} obraId={obraId} />
        {bloqueado && (
          <p className="w-full text-[11.5px] text-neg" data-testid="motivo-bloqueo">
            {p.revision.bloqueos.join(' · ')}: iniciar va a ser rechazado también del lado del servidor.
          </p>
        )}
      </section>
    </aside>
  )
}

/**
 * ═══ PROPIO VS SUBCONTRATO — DENTRO DEL RESUMEN (canónico 10) ═══
 *
 * Dos barras comparables y un veredicto. No es la tabla de cuatro columnas: acá se decide una sola
 * cosa —contratarlo o hacerlo con gente propia— y para eso alcanza con ver los dos costos a la
 * misma escala.
 *
 * EL VEREDICTO NO SE FUERZA. El costo de hacerlo con plantel propio necesita el análisis de costo
 * de la actividad, que hoy no existe en el modelo: mientras falte, la barra propia queda vacía con
 * su motivo y el veredicto dice que falta un dato. Un «conviene subcontratar» calculado contra un
 * cero implícito es exactamente la recomendación que esta pantalla no puede dar.
 */
function PropioVsSubcontrato({ paquete, filas, economia }: {
  paquete: Paquete
  filas: FilaComparacion[]
  economia: boolean
}) {
  const costo = filas.find((f) => f.formato === 'plata') ?? null
  if (!costo) return null

  const sub = costo.subcontrato.valor
  const propio = costo.propio.valor
  const tope = Math.max(sub ?? 0, propio ?? 0) || 1
  const convieneSub = sub == null || propio == null ? null : sub <= propio

  return (
    <section data-testid="comparador-propio-subcontrato">
      <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink">
        Propio vs subcontrato
        <span title="Costo total del paquete: hacerlo con plantel propio o contratarlo. El lado del subcontrato es el COSTO REAL —contratado más lo que le pone Echegaray—, porque el material y la ayuda de gremio los paga la obra igual."
          className="text-faint">?</span>
      </h3>

      {!economia ? (
        <p className="text-[11.5px] text-faint" data-testid="comparacion-sin-permiso">
          El costo no se compara acá: no tenés permiso económico.
        </p>
      ) : (
        <>
          <Lado rotulo="Subcontrato" valor={sub} tope={tope} destacado={convieneSub === true}
            pie={fmtCantidad(paquete.cantidad, paquete.unidad) ?? 'sin alcance cargado'} testid="lado-subcontrato" />
          <Lado rotulo="Plantel propio" valor={propio} tope={tope} destacado={convieneSub === false}
            pie={paquete.hh_apoyo ? `${paquete.hh_apoyo} HH de apoyo declaradas` : 'sin rendimiento cargado'}
            testid="lado-propio" />
          <p className={`mt-1 flex items-start gap-1.5 text-[11.5px] font-medium ${convieneSub === null ? 'text-warn' : 'text-pos'}`}
            data-testid="veredicto-comparacion">
            {convieneSub === null
              ? <IconoBloqueo className="mt-[2px] h-[13px] w-[13px] shrink-0" />
              : <IconoCompletar className="mt-[2px] h-[13px] w-[13px] shrink-0" />}
            {convieneSub === null
              ? `Falta un dato para comparar: ${costo.falta ?? 'uno de los dos costos no existe'}`
              : convieneSub
                ? `Conviene subcontratar · ${plata((propio ?? 0) - (sub ?? 0))}`
                : `Conviene hacerlo propio · ${plata((sub ?? 0) - (propio ?? 0))}`}
          </p>
        </>
      )}
    </section>
  )
}

/** Un lado de la comparación: rótulo, monto, barra a escala del mayor y de dónde sale el número.
 *  SIN VALOR NO HAY BARRA —una pista vacía a la par de otra llena ya afirma «cuesta cero»—: hay el
 *  motivo, en el mismo renglón donde iría la plata. */
function Lado({ rotulo, valor, tope, destacado, pie, testid }: {
  rotulo: string
  valor: number | null
  tope: number
  destacado: boolean
  pie: string
  testid: string
}) {
  const tinta = destacado ? 'font-semibold text-ink' : 'text-ink-soft'
  return (
    <div className="mb-2" data-testid={testid}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-[11.5px] ${tinta}`}>{rotulo}</span>
        <span className={`font-mono text-[12.5px] tabular-nums ${valor == null ? 'text-faint' : tinta}`}>
          {valor == null ? 'sin dato' : plata(valor)}
        </span>
      </div>
      {valor != null && (
        <div className="mt-1 h-2 overflow-hidden rounded-[2px] bg-[#F0EFEB]">
          <div className={`h-full ${destacado ? 'bg-pos' : 'bg-[#B9B7B1]'}`}
            style={{ width: `${Math.round((valor / tope) * 100)}%` }} />
        </div>
      )}
      <div className="mt-0.5 text-[10.5px] text-faint">{pie}</div>
    </div>
  )
}

const SOLAPAS: [Solapa, string][] = [
  ['resumen', 'Resumen'], ['certificaciones', 'Certificaciones'],
  ['documentos', 'Documentos'], ['personal', 'Personal'],
]

/**
 * CERTIFICAR EL AVANCE DEL PAQUETE ES REGISTRAR EL AVANCE DE SU ACTIVIDAD.
 *
 * No hay una acción propia de certificación —no existe el registro—, y fabricar un botón que
 * escriba «avance del subcontrato» en otro lado crearía una segunda medición del mismo trabajo. El
 * paquete cubre una actividad de la obra: el avance se carga ahí, una sola vez, por la pantalla que
 * ya lo hace. Sin actividad vinculada no hay dónde cargarlo, y el botón lo dice en vez de llevar a
 * una pantalla que no va a saber qué medir.
 */
function CertificarAvance({ paquete, obraId }: { paquete: Paquete; obraId: string }) {
  const actividad = paquete.vinculos[0]
  if (!actividad) {
    return (
      <span className="ml-auto text-[11.5px] text-warn" data-testid="certificar-sin-actividad">
        Sin actividad vinculada: no hay dónde cargar el avance.
      </span>
    )
  }
  return (
    <Link
      href={`/obras/${obraId}/avance/${actividad.actividad_id}`}
      prefetch={false}
      data-testid="certificar-avance"
      className="ml-auto rounded-control bg-marca px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:brightness-95"
    >
      Certificar avance
    </Link>
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
