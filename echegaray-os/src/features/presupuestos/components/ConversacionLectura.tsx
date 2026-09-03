'use client'

// LA COLUMNA IZQUIERDA — «Razonamiento del cotizador», porte de «Presupuestos v5 · Lectura del
// plano» (912px, líneas 50-137).
//
// ═══ LOS PASOS SON LA GUÍA, Y SE VAN COMPLETANDO ═══
//
// Pedido textual del dueño (02/09/2026): «quiero que los pasos sean la guía y que sea como un paso
// a paso que se va completando». Por eso los SIETE se dibujan desde el arranque —el backend los
// publica pendientes en el mismo update que pone LEYENDO— y lo que avanza es el ESTADO de cada uno,
// no cuántos hay en la lista. Un paso a paso que sólo muestra lo ya hecho no guía nada: se lee
// después, cuando ya no hay nada que esperar.
//
// El «3» de «paso 3 de 7» sale de `certeza.hechos`, que el backend deriva de la evidencia leída.
// Mientras midiendo, debajo de los pasos va la línea «Midiendo · <el próximo paso>» — no una etapa
// suelta que reemplaza al paso a paso entero.

import { C } from '@/shared/components/canon'
import { enCurso, progresoDeLectura, type CertezaTrabajo, type EstadoTrabajo, type PasoTrabajo } from '../services/trabajoLectura'
import { TurnoPaso } from './TurnoPaso'

export function ConversacionLectura({
  pasos, certeza = null, estado, etapa, error, errorTransitorio = null, filtro, abierto,
  cancelando = false, errorCancelar = null, onAbrir, onFiltrar, onRehacer, onCancelar,
}: {
  pasos: PasoTrabajo[]
  /** De dónde sale «paso 3 de 7». Del backend, nunca de un temporizador de esta pantalla. */
  certeza?: CertezaTrabajo | null
  estado: EstadoTrabajo
  etapa: string | null
  error: string | null
  /** Un fallo del SONDEO (red), no del trabajo — el worker puede seguir andando bien. Se avisa
   *  aparte del bloque de `estado==='ERROR'`, que es terminal y viene del servidor. */
  errorTransitorio?: string | null
  filtro: string | null
  abierto: string | null
  cancelando?: boolean
  /** El pedido de cancelar no llegó (red, o el trabajo terminó justo antes). Se avisa: cancelar y
   *  que no pase nada en silencio es peor que no tener el botón. */
  errorCancelar?: string | null
  onAbrir: (id: string) => void
  onFiltrar: (id: string) => void
  onRehacer: () => void
  onCancelar: () => void
}) {
  const progreso = progresoDeLectura(pasos, certeza)
  const midiendo = enCurso(estado)

  return (
    <div
      className="flex h-[480px] flex-none flex-col border-b border-line xl:h-auto xl:w-[912px] xl:border-b-0 xl:border-r"
      style={{ minHeight: 0 }}
      data-testid="columna-conversacion"
    >
      <div className="flex flex-none items-start gap-6" style={{ padding: '24px 34px 0' }}>
        <span className="flex flex-1 flex-col gap-[9px]" style={{ minWidth: 0 }}>
          <span style={{ fontSize: 17.5, fontWeight: 600, letterSpacing: '-.014em', color: C.tinta }}>
            Razonamiento del cotizador
          </span>
          <span className="font-mono text-[11px]" style={{ color: C.tenue }} data-testid="sello-etapa">{progreso.sello}</span>
        </span>
        {/* MIENTRAS CORRE, LA ACCIÓN ES CANCELAR — no rehacer. «Rehacer» sobre un trabajo vivo lo
            abandonaba en pantalla pero el worker seguía leyendo, y cada lámina que leía se pagaba
            igual. Frenarlo es lo único que ahorra plata. */}
        {midiendo ? (
          <span
            role="button" data-testid="cancelar-lectura" aria-disabled={cancelando}
            onClick={cancelando ? undefined : onCancelar}
            className="flex-none cursor-pointer whitespace-nowrap rounded-[6px] border px-3 py-2 text-[12px]"
            style={{ borderColor: C.lineaFuerte, color: cancelando ? C.apagado : C.tintaSuave }}
          >
            {cancelando ? 'Cancelando…' : 'Cancelar la lectura'}
          </span>
        ) : (
          <span role="button" data-testid="rehacer-lectura" onClick={onRehacer} className="flex-none cursor-pointer whitespace-nowrap rounded-[6px] border px-3 py-2 text-[12px]" style={{ borderColor: C.lineaFuerte, color: C.tintaSuave }}>
            Rehacer la lectura
          </span>
        )}
      </div>

      <div className="flex flex-none items-center gap-4" style={{ padding: '20px 34px 16px', borderBottom: `1px solid ${C.lineaFila}` }}>
        <span className="flex-1 overflow-hidden rounded" style={{ height: 3, background: C.lineaFila }}>
          <span className="block h-full" style={{ width: `${progreso.pctAncho}%`, background: progreso.completo ? C.marca : C.grafito }} />
        </span>
        <span className="whitespace-nowrap font-mono text-[11.5px]" style={{ color: C.apagado }} data-testid="progreso-texto">
          {progreso.texto}
        </span>
      </div>

      <div className="flex flex-1 flex-col overflow-auto" style={{ padding: '0 34px 40px', minHeight: 0 }} data-testid="lista-pasos">
        {pasos.map((p, i) => (
          <TurnoPaso
            key={p.id} paso={p} esUltimo={i === pasos.length - 1}
            abierto={abierto === p.id} filtroActivo={filtro} onAbrir={onAbrir} onFiltrar={onFiltrar}
          />
        ))}

        {midiendo && (
          <div className="flex items-center gap-3" style={{ padding: '22px 0 0 50px' }} data-testid="midiendo">
            <span className="font-mono text-[10.5px] font-semibold" style={{ letterSpacing: '.09em', color: C.info }}>XSAS</span>
            {/* El paso que se está midiendo AHORA. Si ya no queda ninguno pendiente pero el trabajo
              sigue vivo, habla la etapa del backend («leyendo lámina 4 de 5») en vez de callarse. */}
          <span className="text-[12.5px]" style={{ color: C.apagado }}>{progreso.midiendo ?? etapa ?? 'Midiendo'}</span>
          </div>
        )}

        {midiendo && errorTransitorio && (
          <div className="flex items-center gap-2" style={{ padding: '8px 0 0 50px' }} data-testid="error-transitorio">
            <span className="text-[11.5px]" style={{ color: C.neg }}>Problema de red consultando el progreso — reintentando. El trabajo sigue corriendo.</span>
          </div>
        )}

        {midiendo && errorCancelar && (
          <div className="flex items-center gap-2" style={{ padding: '8px 0 0 50px' }} data-testid="error-cancelar">
            <span className="text-[11.5px]" style={{ color: C.neg }}>No se pudo cancelar: {errorCancelar}</span>
          </div>
        )}

        {estado === 'CANCELADO' && (
          <div className="mt-5 flex flex-col gap-2 rounded-[8px] border p-3.5" style={{ borderColor: C.linea, background: C.superficieTenue }} data-testid="lectura-cancelada">
            <span className="text-[12.5px] font-semibold" style={{ color: C.tinta }}>Lectura cancelada</span>
            <span className="text-[12.5px]" style={{ color: C.tintaSuave, lineHeight: 1.6 }}>
              La frenaste vos. No se generó presupuesto y lo leído hasta acá no se guardó como cotización.
            </span>
            <span role="button" onClick={onRehacer} className="mt-1 w-fit cursor-pointer text-[12px] underline" style={{ color: C.tintaSuave }}>
              Empezar de nuevo
            </span>
          </div>
        )}

        {estado === 'ERROR' && (
          <div className="mt-5 flex flex-col gap-2 rounded-[8px] border p-3.5" style={{ borderColor: '#F3DDDA', background: '#FEF6F5' }} data-testid="error-trabajo">
            <span className="text-[12.5px] font-semibold" style={{ color: C.neg }}>No se pudo terminar la lectura</span>
            <span className="text-[12.5px]" style={{ color: C.tintaSuave, lineHeight: 1.6 }}>{error ?? 'Motivo no informado.'}</span>
            <span role="button" onClick={onRehacer} className="mt-1 w-fit cursor-pointer text-[12px] underline" style={{ color: C.tintaSuave }}>
              Rehacer la lectura
            </span>
          </div>
        )}

        {estado === 'LISTO' && (
          <div className="mt-[22px] font-mono text-[12px]" style={{ paddingTop: 20, borderTop: `1px solid ${C.linea}`, color: C.apagado }} data-testid="cierre-lectura">
            {progreso.texto}.
          </div>
        )}
      </div>
    </div>
  )
}
