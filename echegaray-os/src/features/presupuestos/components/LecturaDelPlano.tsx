'use client'

// EL RAZONAMIENTO DEL COTIZADOR, DIBUJADO — «Presupuestos v5 · Lectura del plano».
//
// Los pasos NO son un stepper fijo: los generó el motor leyendo el plano, y la cotización es su
// consecuencia. Cada paso muestra su pregunta, sus mediciones con la lámina de la que salieron y
// su estado DERIVADO de los datos: «firme» con cita, «sin dato» con el faltante nombrado,
// «revisar» cuando el barrido dejó documentos sin leer. En modo progresivo (el arranque) los
// pasos aparecen uno por uno, como el mockup: «Leyendo el plano · paso N de 7».

import { useEffect, useRef, useState } from 'react'
import type { PasoLectura } from '@/features/presupuestos/services/lecturaPlano'

const CHIP: Record<PasoLectura['estado'], string> = {
  firme: 'text-emerald-700',
  'sin dato': 'text-slate-500',
  revisar: 'text-amber-700',
}

// El ritmo del mockup («normal»: 620 ms por paso). Sin animación cuando no es progresivo.
const RITMO_MS = 620

export function LecturaDelPlano({ pasos, progresivo = false }: { pasos: PasoLectura[]; progresivo?: boolean }) {
  const [hechos, setHechos] = useState(progresivo ? 0 : pasos.length)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!progresivo || hechos >= pasos.length) return
    timer.current = setTimeout(() => setHechos((h) => h + 1), RITMO_MS)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [progresivo, hechos, pasos.length])

  if (!pasos.length) return null
  const leyendo = hechos < pasos.length
  const visibles = pasos.slice(0, hechos)

  return (
    <div data-testid="lectura-del-plano">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">
          {leyendo ? `Leyendo el plano · paso ${hechos} de ${pasos.length}` : 'Razonamiento del cotizador — la cotización deriva de estos pasos'}
        </p>
        <span className="h-1 w-24 overflow-hidden rounded bg-slate-100" aria-hidden>
          <span
            className={`block h-full ${leyendo ? 'bg-slate-700' : 'bg-amber-400'}`}
            style={{ width: `${Math.round((hechos / pasos.length) * 100)}%`, transition: 'width 300ms' }}
          />
        </span>
      </div>
      <ol className="space-y-3">
        {visibles.map((p) => (
          <li key={p.id} className="rounded-lg border border-slate-200 bg-white p-3" data-testid={`paso-${p.id}`}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm">
                <span className="font-mono text-[12px] font-semibold text-slate-400">{p.etiqueta}</span>
                <span className="ml-2 font-semibold text-slate-900">{p.titulo}</span>
                <span className="ml-2 text-slate-500">{p.pregunta}</span>
              </p>
              <span className={`whitespace-nowrap text-[11px] font-semibold ${CHIP[p.estado]}`}>{p.estado}</span>
            </div>
            <p className="mt-1 text-[13px] text-slate-600">{p.resumen}</p>
            {p.filas.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                {p.filas.map((f, i) => (
                  <li key={`${f.k}-${i}`} className="flex items-baseline gap-2 text-[12.5px]">
                    <span className="w-14 flex-none font-mono text-[11px] text-slate-400">{f.k}</span>
                    <span className={`min-w-0 flex-1 truncate ${f.falta ? 'text-slate-400' : 'text-slate-700'}`}>
                      {f.d}
                      {f.sub ? <span className="text-slate-400"> · {f.sub}</span> : null}
                    </span>
                    <span className={`font-mono tabular-nums ${f.falta ? 'text-slate-400' : 'text-slate-900'}`}>
                      {f.n}{f.u ? ` ${f.u}` : ''}
                    </span>
                    {f.v ? <span className="hidden font-mono text-[11px] text-slate-400 sm:inline">{f.v}</span> : null}
                  </li>
                ))}
              </ul>
            )}
            {p.faltan.length > 0 && (
              <p className="mt-2 text-[12px] text-amber-800">
                ⚠ {p.faltan.join(' · ')}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
