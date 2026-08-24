'use client'

// LA BARRA DE SELECCIÓN DE TAREAS — el cableado de la barra contextual del DS con las cuatro
// operaciones en lote de una obra. La usan la 03 (workspace) y la 06 (avance masivo): una sola
// definición de qué se puede hacer con una selección, y de qué se avisa antes de hacerlo.

import { useState } from 'react'
import { BarraContextual, ChipsValor } from '@/shared/components/ds'
import type { ResultadoMasivo } from '../services/actionsMasivas'
import {
  avanceMasivoLabel, avisoMasivo, esOperacionMasiva, OPERACION_LABEL, OPERACIONES_MASIVAS,
  resumenSeleccion, type CandidataMasiva, type OperacionMasiva,
} from '../services/avance'
import { ESTADO_LABEL } from '../types'

const AVANCES = ['0', '25', '50', '75', '100'] as const
const ESTADOS = ['pendiente', 'en_curso', 'hecha'] as const
const CORRIMIENTOS = ['1', '2', '5', '-1'] as const

/** El valor por defecto de cada operación: el que se elige nueve de cada diez veces. */
export const VALOR_INICIAL: Record<OperacionMasiva, string> = {
  avance: '100', estado: 'en_curso', responsable: '', fechas: '2',
}

/**
 * LA BARRA ES CONTROLADA DESDE AFUERA a propósito. La 06 dibuja una columna «QUEDARÁ EN» que
 * muestra, fila por fila, el valor que se va a escribir: para eso la tabla tiene que conocer la
 * operación y el valor elegidos. Con el estado escondido acá adentro, esa columna tendría que
 * adivinarlo — y adivinaría mal en cuanto alguien cambiara de operación.
 */
export function BarraTareas({
  seleccion, cuadrillas, aplicar, alLimpiar, operacion, valor, alElegirOperacion, alElegirValor,
}: {
  seleccion: CandidataMasiva[]
  cuadrillas: { id: string; nombre: string }[]
  aplicar: (form: FormData) => Promise<ResultadoMasivo>
  alLimpiar: () => void
  operacion: OperacionMasiva
  valor: string
  alElegirOperacion: (o: OperacionMasiva) => void
  alElegirValor: (v: string) => void
}) {
  const [pendiente, setPendiente] = useState(false)
  const [resultado, setResultado] = useState<ResultadoMasivo | null>(null)
  if (seleccion.length === 0) return null

  const r = resumenSeleccion(seleccion, operacion, operacion === 'avance' ? Number(valor) : null)
  const poner = alElegirValor

  async function correr() {
    const form = new FormData()
    form.set('operacion', operacion)
    form.set('valor', valor)
    for (const a of seleccion) form.append('id', a.id)
    setPendiente(true)
    try { setResultado(await aplicar(form)) } finally { setPendiente(false) }
  }

  return (
    <BarraContextual
      testid="barra-tareas"
      titulo={`${seleccion.length} ${seleccion.length === 1 ? 'actividad' : 'actividades'}`}
      subtitulo={operacion === 'avance' ? calidadDeLaSeleccion(seleccion) : undefined}
      operaciones={OPERACIONES_MASIVAS.map((o) => ({ id: o, label: OPERACION_LABEL[o] }))}
      activa={operacion}
      alElegirOperacion={(id) => { if (esOperacionMasiva(id)) { alElegirOperacion(id); setResultado(null) } }}
      aviso={avisoMasivo(r)}
      resultado={resultado ? <Resultado r={resultado} /> : null}
      alCancelar={() => { setResultado(null); alLimpiar() }}
      aplicarLabel={avanceMasivoLabel(r)}
      alAplicar={() => void correr()}
      pendiente={pendiente}
    >
      {operacion === 'avance' && (
        <ChipsValor
          valores={AVANCES.map((v) => ({ valor: v, etiqueta: `${v} %` }))}
          activo={valor} alElegir={poner} testid="chip-avance"
        />
      )}
      {operacion === 'estado' && (
        <ChipsValor
          valores={ESTADOS.map((v) => ({ valor: v, etiqueta: ESTADO_LABEL[v] }))}
          activo={valor} alElegir={poner} testid="chip-estado"
        />
      )}
      {operacion === 'fechas' && (
        <>
          <span className="text-[12.5px] text-faint">Correr</span>
          <ChipsValor
            valores={CORRIMIENTOS.map((v) => ({ valor: v, etiqueta: `${Number(v) > 0 ? '+' : ''}${v} días` }))}
            activo={valor} alElegir={poner} testid="chip-fechas"
          />
        </>
      )}
      {operacion === 'responsable' && (
        <select
          value={valor}
          onChange={(e) => poner(e.target.value)}
          aria-label="Cuadrilla que pasa a responder"
          data-testid="masiva-cuadrilla"
          className="h-7 rounded-control bg-accent-hover px-2 text-[12.5px] text-white"
        >
          <option value="">— sin cuadrilla —</option>
          {cuadrillas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      )}
    </BarraContextual>
  )
}

/**
 * CON QUÉ CALIDAD QUEDA LA SELECCIÓN — el subtítulo del Design («N con paso real · N estimadas»),
 * dicho con los métodos que esta escritura acepta.
 *
 * Decía «3 por pasos · 5 otros métodos»: dos números que no contestan la pregunta de quien está por
 * escribir. Lo que importa es que una medida por cantidad se convierte en cantidad ejecutada contra
 * el objetivo —es una medición— y que manual y partes las declara una persona. Las de pasos no
 * entran, y de eso ya se ocupa el aviso y el conteo del botón.
 */
function calidadDeLaSeleccion(seleccion: CandidataMasiva[]): string | undefined {
  const medidas = seleccion.filter((a) => a.metodo_avance === 'cantidad').length
  const estimadas = seleccion.filter((a) => a.metodo_avance === 'manual' || a.metodo_avance === 'partes').length
  const partes = [
    medidas > 0 ? `${medidas} ${medidas === 1 ? 'medida' : 'medidas'}` : null,
    estimadas > 0 ? `${estimadas} ${estimadas === 1 ? 'estimada' : 'estimadas'}` : null,
  ].filter((p): p is string => p !== null)
  return partes.length > 0 ? partes.join(' · ') : undefined
}

/**
 * EL RESULTADO CON LAS DOS PUNTAS: lo que entró y lo que quedó afuera, con su motivo.
 * Un «listo» genérico sobre una selección de veinte es el caso en el que una escritura toca la
 * mitad y nadie se entera.
 */
function Resultado({ r }: { r: ResultadoMasivo }) {
  if (!r.ok) return <span data-testid="masiva-resultado" className="text-[11.5px] text-white">{r.error}</span>
  return (
    <span data-testid="masiva-resultado" className="text-[11.5px] text-white">
      {r.tocadas} escrita{r.tocadas === 1 ? '' : 's'}
      {r.salteadas > 0 && (
        <span className="text-faint"> · {r.salteadas} afuera{r.motivo ? `: ${r.motivo}` : ''}</span>
      )}
    </span>
  )
}
