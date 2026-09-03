'use client'

// EL RAZONAMIENTO DE UNA COTIZACIÓN YA GUARDADA, DIBUJADO — el plegable de
// `/presupuestos/[presupuesto]`. Lee `cotizaciones.razonamiento`, que es una lectura TERMINADA y
// congelada: acá no hay nada avanzando.
//
// Los pasos NO son un stepper fijo: los generó el motor leyendo el plano, y la cotización es su
// consecuencia. Cada paso muestra su pregunta, sus mediciones con la lámina de la que salieron y
// su estado DERIVADO de los datos: «firme» con cita, «sin dato» con el faltante nombrado,
// «revisar» cuando el barrido dejó documentos sin leer.
//
// ═══ ACÁ VIVÍA UN PROGRESO FABRICADO ═══
//
// Este componente tenía un modo «progresivo» con un `setTimeout` de 620 ms que prendía los pasos de
// a uno y escribía «Leyendo el plano · paso 3 de 7». Los siete llegaban COMPLETOS del backend: el
// contador no medía nada, era el ritmo del mockup copiado a producción. Presentar una animación
// como el avance de una lectura es una estimación presentada como hecho, y además tapaba el
// problema real —que el backend no publicaba el progreso—. El paso a paso que sí avanza vive en
// `ConversacionLectura`, y su contador sale de `certeza.hechos`.

import type { PasoLectura } from '@/features/presupuestos/services/lecturaPlano'

const CHIP: Record<PasoLectura['estado'], string> = {
  firme: 'text-emerald-700',
  'sin dato': 'text-slate-500',
  revisar: 'text-amber-700',
}

export function LecturaDelPlano({ pasos }: { pasos: PasoLectura[] }) {
  if (!pasos.length) return null

  return (
    <div data-testid="lectura-del-plano">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">
          Razonamiento del cotizador — la cotización deriva de estos pasos
        </p>
      </div>
      <ol className="space-y-3">
        {pasos.map((p) => (
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
