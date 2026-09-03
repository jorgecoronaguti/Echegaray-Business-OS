'use client'

// LA COLUMNA IZQUIERDA — «Razonamiento del cotizador», porte de «Presupuestos v5 · Lectura del
// plano» (912px, líneas 50-137). Un turno por paso, en el orden en que el backend los publica —el
// esqueleto es siempre de 7, así que «paso 3 de 7» es una cuenta real contra ese total, no una
// estimación.

import { C } from '@/shared/components/canon'
import { progresoDeLectura, type EstadoTrabajo, type PasoTrabajo } from '../services/trabajoLectura'
import { TurnoPaso } from './TurnoPaso'

export function ConversacionLectura({
  pasos, estado, etapa, error, filtro, abierto, onAbrir, onFiltrar, onRehacer,
}: {
  pasos: PasoTrabajo[]
  estado: EstadoTrabajo
  etapa: string | null
  error: string | null
  filtro: string | null
  abierto: string | null
  onAbrir: (id: string) => void
  onFiltrar: (id: string) => void
  onRehacer: () => void
}) {
  const progreso = progresoDeLectura(pasos.length)
  const midiendo = estado === 'ENCOLADO' || estado === 'LEYENDO'

  return (
    <div
      className="flex h-[480px] flex-none flex-col border-b border-line xl:h-auto xl:w-[912px] xl:border-b-0 xl:border-r"
      style={{ minHeight: 0 }}
      data-testid="columna-conversacion"
    >
      <div className="flex flex-none items-start gap-6" style={{ padding: '24px 34px 0' }}>
        <span className="flex-1" style={{ fontSize: 17.5, fontWeight: 600, letterSpacing: '-.014em', color: C.tinta }}>
          Razonamiento del cotizador
        </span>
        <span role="button" data-testid="rehacer-lectura" onClick={onRehacer} className="flex-none cursor-pointer whitespace-nowrap rounded-[6px] border px-3 py-2 text-[12px]" style={{ borderColor: C.lineaFuerte, color: C.tintaSuave }}>
          Rehacer la lectura
        </span>
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
            <span className="text-[12.5px]" style={{ color: C.apagado }}>{etapa ?? 'Midiendo'}</span>
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
            {pasos.length} de 7 pasos leídos.
          </div>
        )}
      </div>
    </div>
  )
}
