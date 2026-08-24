'use client'

// PANTALLA 17 · LA LISTA DE TAREAS TIPO — porte literal de `17 · Base Maestra Tareas.dc.html`.
//
// ═══ MEDIDO DEL CANÓNICO ═══
//
//   grilla   `62px minmax(0,1.6fr) 48px 92px 108px 84px 56px` · `gap:10px`
//   fila     44px · divisor `#F1F0EC` · `padding:0 14px` · seleccionada `#FEF9E6`
//   código   mono 11,5px `#6B6B67` · tarea 12,5px `#1F1F1E` · unidad 12px `#3A3A38`
//   HH/UN.   mono 12px a la derecha · REAL OBRA icono + número, teñidos por el desvío
//   pie      `TAREAS · CON DATO REAL · DESACTUALIZADAS`, adentro de la caja sobre `#FAFAF8`
//
// La caja, el encabezado de 38px y el pie vienen de `shared/components/canon/ListaCanon`; los
// filtros, de `ChipsCanon`. El porqué de no usar `ds/Tabla` está en `ListaCanon`.
//
// ═══ DOS COLUMNAS DEL CANÓNICO QUE NO SE PUEDEN DIBUJAR COMO ÉL LAS DIBUJA ═══
//
//   COMPOSICIÓN  el mockup pone tres iconos (mano de obra · material · equipo) según de qué está
//                hecha la tarea. Ese dato existe en `analisis_linea.tipo`, que esta pantalla NO lee
//                —lee el listado, no las líneas de las 223 tareas— y el atajo por `analisis_costo`
//                (¿tiene costo de materiales?) es una TRAMPA: esos importes salen de
//                `recurso_precio`, que la RLS le vacía al jefe de obra, así que él vería tareas sin
//                materiales. En su lugar va ANÁLISIS —completo · sin revisar · sin análisis—, que
//                contesta la misma pregunta al nivel que el dato sostiene y además es accionable.
//   USOS         «en cuántos presupuestos entró». Ninguna fuente del listado lo cuenta; la ficha sí
//                lo lee, por tarea. Va MUESTRA, que es cuántos registros de obra sostienen el real
//                —el dato que decide si el «real de obra» de la fila de al lado se puede creer—.
//
// Las dos son DESVÍOS DECLARADOS respecto del canónico, no olvidos del porte.
//
// ═══ ES DE CLIENTE POR UNA SOLA RAZÓN ═══
//
// El buscador filtra MIENTRAS SE ESCRIBE. Las 223 filas ya vinieron del servidor, así que teclear no
// vuelve a consultar la base. Y LO QUE CRUZA LA FRONTERA SON DATOS, NUNCA FUNCIONES: este componente
// recibía `hrefDe` y `hrefDivision`, y una función que no serializa deja la pantalla clavada en el
// esqueleto PARA SIEMPRE, con el registro diciendo `200 in 3.5s`. Costó media hora encontrarlo.

import { useState } from 'react'
import Link from 'next/link'
import {
  CabezaCanon, FilaCanon, ListaCanon, PieCanon, RotuloCanon, VacioCanon,
} from '@/shared/components/canon/ListaCanon'
import { ChipsCanon } from '@/shared/components/canon/ChipsCanon'
import type { TareaTipoFila } from '../types'
import { ETIQUETA_ANALISIS, desvioObservado, filtrar, motivoDelEstado, numero } from '../services/reglas'
import { BuscadorVivo } from './BuscadorVivo'

// LOS TRES CORTES QUE SE MIRAN DE VERDAD, Y NINGUNO ES UN UMBRAL DE PANTALLA.
//
// El canónico ofrece «Todo · Con desvío · Sin dato real», y «con desvío» ahí es `real/base > 1,1`
// calculado en la pantalla. Acá el corte equivalente es «Con recomendación», que pregunta por
// `hs_recomendado` —lo decide el motor de aprendizaje en Postgres—: es la única lista que se puede
// trabajar, porque cada fila tiene una decisión concreta esperando. Un umbral propio traería tareas
// medidas una sola vez, sobre las que no hay nada que hacer, mezcladas con las que sí.
const CORTES = {
  todo: { rotulo: 'Todo', cumple: () => true },
  recomendacion: { rotulo: 'Con recomendación', cumple: (t: TareaTipoFila) => t.hs_recomendado != null },
  sinMedir: { rotulo: 'Sin medir', cumple: (t: TareaTipoFila) => t.muestra === 0 },
  sinAnalisis: { rotulo: 'Sin análisis', cumple: (t: TareaTipoFila) => t.estado === 'sin_analisis' },
} as const
type Corte = keyof typeof CORTES

const COLS = '62px minmax(0,1.6fr) 48px 92px 108px 84px 56px'

const TINTA_ESTADO: Record<TareaTipoFila['estado'], string> = {
  completo: 'text-pos', sin_revisar: 'text-warn', sin_analisis: 'text-neg',
}

export function TareasTipo({
  tareas, q, division, divisiones, seleccionada, ruta, otros, accion,
}: {
  tareas: TareaTipoFila[]
  q: string
  division: string | null
  divisiones: string[]
  seleccionada: string | null
  /** La ruta y lo que hay que preservar al buscar. Llegan del servidor: ver `BuscadorVivo`. */
  ruta: string
  otros: Record<string, string | undefined>
  /** La primaria «+ Nueva tarea», que la arma el servidor porque vive en la URL. */
  accion?: React.ReactNode
}) {
  const [consulta, setConsulta] = useState(q)
  const [corte, setCorte] = useState<Corte>('todo')

  // El filtro de división lo aplica el SERVIDOR (viaja en la URL y recorta la lectura); la consulta
  // de texto y el corte los aplica el navegador, que es lo que los hace instantáneos.
  const visibles = filtrar(tareas, consulta, (t) => [t.codigo, t.nombre, t.division, t.unidad])
    .filter(CORTES[corte].cumple)

  /** Una dirección de esta pantalla con algunos parámetros cambiados. `undefined` los quita. */
  const href = (cambios: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...otros, q: consulta || undefined, ...cambios })) {
      if (v) p.set(k, v)
    }
    const qs = p.toString()
    return qs ? `${ruta}?${qs}` : ruta
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-3.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <BuscadorVivo
          valor={consulta}
          onCambio={setConsulta}
          placeholder="Buscar tarea o código"
          resultados={visibles.length}
          total={tareas.length}
          testid="buscador-tareas"
        />
        {/* La división recorta la LECTURA, así que va por la URL y es un enlace. */}
        <ChipsCanon
          testid="filtros-division"
          opciones={[
            { clave: 'todos', label: 'Todos los rubros', href: href({ d: undefined }), activo: !division, testid: 'division-todos' },
            ...divisiones.map((d) => ({
              clave: d, label: d, href: href({ d }), activo: d === division, testid: `division-${d}`,
              cuenta: tareas.filter((t) => t.division === d).length,
            })),
          ]}
        />
        {/* El corte NO va a la URL: se calcula sobre las filas que ya están en el navegador y su
            resultado depende de lo que la base diga en este momento, así que un enlace compartido
            prometería una lista que mañana es otra. */}
        <div data-testid="filtros-corte" className="flex flex-wrap items-center gap-2">
          {(Object.keys(CORTES) as Corte[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setCorte(k)}
              data-testid={`corte-${k}`}
              aria-pressed={corte === k}
              className={`flex items-center gap-[5px] rounded-md border px-[9px] py-[4px] text-[12px] transition-colors ${
                corte === k
                  ? 'border-accent bg-accent text-white'
                  : 'border-line bg-surface text-ink-soft hover:border-line-strong'
              }`}
            >
              {CORTES[k].rotulo}
              <span className={`font-mono text-[10.5px] tabular-nums ${corte === k ? 'text-[#B9B7B1]' : 'text-faint'}`}>
                {tareas.filter(CORTES[k].cumple).length}
              </span>
            </button>
          ))}
        </div>
        {accion && <div className="ml-auto">{accion}</div>}
      </div>

      <ListaCanon testid="tabla-tareas-tipo">
        <CabezaCanon cols={COLS}>
          <RotuloCanon>CÓD.</RotuloCanon>
          <RotuloCanon>TAREA</RotuloCanon>
          <RotuloCanon>UN.</RotuloCanon>
          {/* ESFUERZO Y NO «RENDIMIENTO»: son hs por unidad, y bajan cuando la tarea mejora. */}
          <RotuloCanon alinear="right">HH / UN.</RotuloCanon>
          <RotuloCanon alinear="right">REAL OBRA</RotuloCanon>
          <RotuloCanon>ANÁLISIS</RotuloCanon>
          <RotuloCanon alinear="right">MUESTRA</RotuloCanon>
        </CabezaCanon>

        {visibles.length === 0 && (
          <VacioCanon testid="tareas-vacio">
            {vacioDe(consulta, corte, division, tareas.length)}{' '}
            {(consulta || corte !== 'todo') && (
              <button
                type="button"
                onClick={() => { setConsulta(''); setCorte('todo') }}
                className="font-medium text-ink underline underline-offset-2"
              >
                Ver todo
              </button>
            )}
          </VacioCanon>
        )}

        {visibles.map((t) => {
          const d = desvioObservado(t.hs_unitarias, t.hs_observado)
          const real = numero(t.hs_observado, 2)
          return (
            <FilaCanon key={t.id} cols={COLS} alto={44} seleccionada={t.id === seleccionada} testid={`tarea-${t.codigo}`}>
              <span className="truncate font-mono text-[11.5px] text-muted">{t.codigo}</span>
              <div className="flex min-w-0 items-center gap-2">
                {/* Abrir otra tarea limpia la solapa: la de la anterior puede no existir acá. */}
                <Link href={href({ t: t.id, s: undefined })} scroll={false} className="min-w-0 truncate text-[12.5px] text-ink hover:underline">
                  {t.nombre}
                </Link>
                {/* EL AVISO LO DISPARA EL MOTOR, NO LA PANTALLA: hay una recomendación esperando
                    decisión. Sin `hs_recomendado` no hay nada que hacer con esta fila. */}
                {t.hs_recomendado != null && (
                  <span
                    title="El real de obra propone otro esfuerzo: hay una recomendación sin decidir"
                    className="flex shrink-0 text-warn"
                    data-testid="aviso-recomendacion"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.5v.01" />
                    </svg>
                  </span>
                )}
              </div>
              <span className="truncate text-[12px] text-ink-soft">{t.unidad}</span>
              <span className="text-right font-mono text-[12px] tabular-nums text-ink">
                {/* «sin dato» y no 0: una tarea sin esfuerzo cargado aporta 0 HH al plan, que es la
                    afirmación de que no lleva mano de obra. */}
                {numero(t.hs_unitarias, 2) ?? <span className="font-sans text-[11.5px] text-faint">sin dato</span>}
              </span>
              <div className="flex items-center justify-end gap-[5px]" data-desvio={d?.direccion ?? 'sin-base'}>
                {real == null ? (
                  // «sin medir» y no «sin dato»: la tarea puede estar perfectamente cargada; lo que
                  // falta es que alguien la haya ejecutado y le haya imputado horas.
                  <span className="text-[11.5px] text-faint">sin medir</span>
                ) : (
                  <>
                    {/* LA DIRECCIÓN LA DICE EL ICONO Y EL COCIENTE. `1,32×` es más informativo que
                        una flecha sola, que sólo dice el signo. */}
                    <span className={`flex shrink-0 ${tintaDesvio(d)}`}>
                      <IconoDesvio direccion={d?.direccion ?? null} />
                    </span>
                    <span className={`font-mono text-[12px] tabular-nums ${tintaDesvio(d)}`}>{real}</span>
                    {d && <span className={`font-mono text-[11px] tabular-nums ${tintaDesvio(d)}`}>{numero(d.ratio, 2)}×</span>}
                  </>
                )}
              </div>
              <span
                className={`truncate text-[11.5px] ${TINTA_ESTADO[t.estado]}`}
                title={motivoDelEstado(t.estado, t.falta) ?? undefined}
                data-testid="estado-analisis"
              >
                {ETIQUETA_ANALISIS[t.estado]}
              </span>
              <span className="text-right font-mono text-[11.5px] tabular-nums text-muted">
                {t.muestra > 0 ? t.muestra : <span className="font-sans text-faint">—</span>}
              </span>
            </FilaCanon>
          )
        })}

        {/* EL PIE ES UN MARCADOR de la deuda de la base maestra, y cuenta sobre el TOTAL, no sobre
            lo visible: es el estado de la base, no el de la búsqueda de este momento. */}
        <PieCanon
          testid="pie-tareas"
          metricas={[
            { rotulo: 'TAREAS', valor: String(tareas.length) },
            { rotulo: 'CON DATO REAL', valor: String(tareas.filter((t) => t.muestra > 0).length), tono: 'pos' },
            { rotulo: 'CON RECOMENDACIÓN', valor: String(tareas.filter((t) => t.hs_recomendado != null).length), tono: 'warn' },
            { rotulo: 'SIN ANÁLISIS', valor: String(tareas.filter((t) => t.estado === 'sin_analisis').length), tono: 'warn' },
          ]}
        />
      </ListaCanon>
    </div>
  )
}

function tintaDesvio(d: { direccion: string } | null): string {
  if (d == null) return 'text-ink-soft'
  return d.direccion === 'peor' ? 'text-warn' : d.direccion === 'mejor' ? 'text-pos' : 'text-ink-soft'
}

/** Los tres trazos del canónico: `P.sube`, `P.baja`, `P.igual`. */
function IconoDesvio({ direccion }: { direccion: string | null }) {
  const d = direccion === 'peor' ? 'M12 19V5M6 11l6-6 6 6'
    : direccion === 'mejor' ? 'M12 5v14M6 13l6 6 6-6'
      : 'M5 10h14M5 14h14'
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

function vacioDe(consulta: string, corte: Corte, division: string | null, total: number): string {
  if (consulta) return `Nada coincide con «${consulta}».`
  if (corte !== 'todo') return `Ninguna tarea tipo queda en «${CORTES[corte].rotulo}».`
  if (division) return `No hay tareas tipo en «${division}».`
  if (total === 0) {
    return 'La base maestra todavía no tiene tareas tipo cargadas. Se cargan al importar la Planilla para Cotizar o con «Nueva tarea».'
  }
  return 'No hay tareas tipo que mostrar.'
}
