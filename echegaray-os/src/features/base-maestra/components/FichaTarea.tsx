// PANTALLA 17 · LA FICHA DE UNA TAREA TIPO — seis solapas.
//
// Server component: no hay un solo dato que el navegador tenga que ir a buscar después. La solapa
// abierta viaja en la URL (`?s=analisis`), igual que la tarea seleccionada, así que un enlace a
// «HA-140, solapa Rendimiento» abre exactamente ahí.
//
// LA SOLAPA `Análisis` NO SE RENDERIZA SIN PERMISO ECONÓMICO. No se muestra vacía ni con guiones:
// no existe. El contrato lo pide («esconder por completo, no mostrar —») y el motivo es que una
// columna de guiones sigue diciendo cuántas líneas tiene el análisis y cuál es el insumo más caro.

import Link from 'next/link'
import { Aviso, Nulo, TituloPanel } from '@/shared/components/ds'
import type { FichaTarea as Ficha } from '../types'
import { motivoDelEstado, numero, pesosCierran, sumaDePesos } from '../services/reglas'
import { EstadoAnalisisCelda, N, Rotulo, Texto } from './celdas'
import { SolapaAnalisis } from './SolapaAnalisis'

export const SOLAPAS = ['resumen', 'analisis', 'secuencia', 'rendimiento', 'versiones', 'uso'] as const
export type Solapa = (typeof SOLAPAS)[number]

const ETIQUETA: Record<Solapa, string> = {
  resumen: 'Resumen', analisis: 'Análisis', secuencia: 'Secuencia',
  rendimiento: 'Rendimiento', versiones: 'Versiones', uso: 'Uso',
}

export function solapaDe(v: string | undefined, economia: boolean): Solapa {
  const s = (SOLAPAS as readonly string[]).includes(v ?? '') ? (v as Solapa) : 'resumen'
  // Pedir `?s=analisis` sin permiso no abre una solapa vacía: cae en Resumen. Si no, la dirección
  // sería una manera de saber que la solapa existe y de dejarla a medio pintar.
  return s === 'analisis' && !economia ? 'resumen' : s
}

export function FichaTarea({
  ficha, solapa, economia, hrefSolapa, hrefCerrar,
}: {
  ficha: Ficha
  solapa: Solapa
  economia: boolean
  hrefSolapa: (s: Solapa) => string
  hrefCerrar: string
}) {
  const { tarea } = ficha
  const visibles = SOLAPAS.filter((s) => s !== 'analisis' || economia)

  return (
    <aside
      data-testid="ficha-tarea"
      className="min-w-0 shrink-0 border-t border-line pt-4 lg:w-[412px] lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 xl:w-[412px]"
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10.5px] text-faint">
            {tarea.codigo}{tarea.division ? ` · ${tarea.division}` : ''}
          </div>
          <TituloPanel className="mt-1">{tarea.nombre}</TituloPanel>
          {/* El estado va en la CABECERA y no sólo en la lista: quien entró por un enlace directo a
              la ficha nunca vio la fila, y el estado es lo primero que decide si este análisis sirve. */}
          <div className="mt-1.5">
            <EstadoAnalisisCelda estado={tarea.estado} titulo={motivoDelEstado(tarea.estado, tarea.falta)} />
          </div>
        </div>
        <Link href={hrefCerrar} scroll={false} data-testid="cerrar-ficha" className="shrink-0 text-[13px] text-faint hover:text-ink">
          ✕
        </Link>
      </header>

      <div className="mt-4 flex divide-x divide-[#EFEEEA] border-y border-[#EFEEEA] py-3">
        <Bloque rotulo="Hs / unidad">
          <span className="font-mono text-[18px] font-semibold tabular-nums text-ink">
            {numero(tarea.hs_unitarias, 2) ?? <Nulo>sin dato</Nulo>}
          </span>
        </Bloque>
        <Bloque rotulo="Unidad"><span className="text-[12.5px] text-ink">{tarea.unidad}</span></Bloque>
        <Bloque rotulo="Medición">
          <Texto v={etiquetaMedicion(tarea.metodo_medicion)} falta="sin definir" className="text-ink" />
        </Bloque>
      </div>

      <nav data-testid="solapas-ficha" className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {visibles.map((s) => (
          <Link
            key={s}
            href={hrefSolapa(s)}
            scroll={false}
            data-testid={`solapa-${s}`}
            aria-current={s === solapa ? 'true' : undefined}
            className={`pb-[3px] text-[11.5px] transition-colors ${
              s === solapa
                ? 'border-b-[1.5px] border-ink font-medium text-ink'
                : 'border-b-[1.5px] border-transparent text-muted hover:text-ink'
            }`}
          >
            {ETIQUETA[s]}
          </Link>
        ))}
      </nav>

      {ficha.avisos.length > 0 && (
        <div className="mt-4 space-y-2">
          {ficha.avisos.map((a) => <Aviso key={a} tono="warn">{a}</Aviso>)}
        </div>
      )}

      <div className="mt-4" data-testid={`panel-${solapa}`}>
        {solapa === 'resumen' && <Resumen ficha={ficha} />}
        {solapa === 'analisis' && economia && <SolapaAnalisis ficha={ficha} />}
        {solapa === 'secuencia' && <Secuencia ficha={ficha} />}
        {solapa === 'rendimiento' && <Rendimiento ficha={ficha} />}
        {solapa === 'versiones' && <Versiones ficha={ficha} />}
        {solapa === 'uso' && <Uso ficha={ficha} />}
      </div>
    </aside>
  )
}

const etiquetaMedicion = (m: string | null) =>
  m === 'pasos' ? 'Pasos ponderados' : m === 'cantidad' ? 'Cantidad' : m === 'manual' ? 'Manual' : null

function Bloque({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1 px-3 first:pl-0 last:pr-0">
      <Rotulo>{rotulo}</Rotulo>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function Fila({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[#EFEEEA] py-2 last:border-b-0">
      <span className="shrink-0 text-[11.5px] text-faint">{rotulo}</span>
      <span className="min-w-0 text-right text-[12.5px] text-ink-soft">{children}</span>
    </div>
  )
}

// ═══ RESUMEN — la definición en prosa de la tarea tipo ══════════════════════════════════════════
//
// Los cinco bloques del contrato. Ninguno se inventa: si el dato no está, el bloque lo dice. «QUÉ
// APRENDIMOS» sólo aparece cuando hay muestra REAL de obra — con una sola obra medida no hay
// aprendizaje, hay un dato, y así lo declara `rendimiento_recomendado.lectura`.
function Resumen({ ficha }: { ficha: Ficha }) {
  const { tarea, rendimiento, plantilla } = ficha
  const recomendable = rendimiento?.hs_recomendado != null
  return (
    <div className="space-y-4" data-testid="resumen-tarea">
      <Campo rotulo="Qué es">
        <Texto v={tarea.descripcion} falta="sin descripción cargada" className="leading-relaxed text-ink-soft" />
      </Campo>
      <Campo rotulo="Cómo se mide">
        {plantilla
          ? `${etiquetaMedicion(tarea.metodo_medicion) ?? 'Pasos ponderados'} · ${plantilla.pasos.length} pasos`
          : <Texto v={etiquetaMedicion(tarea.metodo_medicion)} falta="sin definir" />}
      </Campo>
      <Campo rotulo="Cuánto rinde">
        {tarea.hs_unitarias == null ? (
          <Nulo>sin análisis: no aporta HH</Nulo>
        ) : (
          <span>
            <span className="font-mono tabular-nums">{numero(tarea.hs_unitarias, 2)}</span> {tarea.unidad
              ? `hs/${tarea.unidad}` : 'hs'} presupuestado
            {rendimiento?.hs_observado_mediana != null && (
              <span className="text-warn">
                {' · '}<span className="font-mono tabular-nums">{numero(rendimiento.hs_observado_mediana, 2)}</span> observado
              </span>
            )}
          </span>
        )}
      </Campo>
      <Campo rotulo="Qué necesita">
        {ficha.costo
          ? `${ficha.costo.n_lineas} líneas de análisis${ficha.costo.tiene_mano_obra ? ' · con mano de obra' : ''}${
              ficha.costo.tiene_cargas_sociales ? ' · con cargas sociales' : ''}`
          : <Nulo>sin análisis cargado</Nulo>}
      </Campo>
      <Campo rotulo="Qué aprendimos">
        {rendimiento && rendimiento.muestra > 0 ? (
          <span className={recomendable ? 'text-warn' : undefined}>
            {rendimiento.obras} {rendimiento.obras === 1 ? 'obra medida' : 'obras medidas'} ·{' '}
            {rendimiento.muestra} {rendimiento.muestra === 1 ? 'registro' : 'registros'}. {rendimiento.lectura}.
          </span>
        ) : (
          <Nulo>sin base: todavía no se midió en obra</Nulo>
        )}
      </Campo>
      {tarea.estado !== 'completo' && (
        <Aviso tono={tarea.estado === 'sin_analisis' ? 'neg' : 'warn'} titulo="Deuda de carga">
          {motivoDelEstado(tarea.estado, tarea.falta) ?? 'Falta completar el análisis.'}
        </Aviso>
      )}
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <Rotulo>{rotulo}</Rotulo>
      <div className="mt-1 text-[13px] leading-relaxed text-ink-soft">{children}</div>
    </div>
  )
}

// ═══ SECUENCIA ═════════════════════════════════════════════════════════════════════════════════
function Secuencia({ ficha }: { ficha: Ficha }) {
  const p = ficha.plantilla
  if (!p) {
    return (
      <p className="text-[12.5px] text-muted" data-testid="secuencia-vacia">
        Esta tarea tipo no tiene plantilla de secuencia asignada: se mide por cantidad, no por pasos.
      </p>
    )
  }
  const suma = sumaDePesos(p.pasos)
  const cierra = pesosCierran(p.pasos)
  return (
    <div data-testid="secuencia-tarea">
      <Rotulo>Plantilla de secuencia</Rotulo>
      <p className="mt-1 text-[12.5px] text-ink">{p.nombre}</p>
      <ul className="mt-3">
        {p.pasos.map((paso) => (
          <li key={paso.orden} className="flex items-center gap-3 border-b border-[#EFEEEA] py-2 last:border-b-0">
            <span className="w-[14px] shrink-0 font-mono text-[10.5px] tabular-nums text-faint">{paso.orden}</span>
            <span className="min-w-0 flex-1 text-[12.5px] text-ink-soft">{paso.nombre}</span>
            {paso.tiempo_tecnico && (
              <span className="shrink-0 whitespace-nowrap text-[10.5px] text-warn">
                no comprimible{paso.dias_tecnicos != null ? ` · ${numero(paso.dias_tecnicos, 0)} d` : ''}
              </span>
            )}
            <span className="w-[42px] shrink-0 text-right font-mono text-[11.5px] tabular-nums text-ink-soft">
              {numero(paso.peso, 0)} %
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-baseline justify-between border-t border-line-strong pt-2">
        <span className="text-[12px] text-ink-soft">Suma</span>
        {/* Si no cierran en 100, marcar todos los pasos NO daría 100 % de avance. Se dice. */}
        <span className={`font-mono text-[12.5px] font-semibold tabular-nums ${cierra ? 'text-pos' : 'text-neg'}`}>
          {numero(suma, 0)} %
        </span>
      </div>
      {!cierra && (
        <Aviso tono="neg" titulo="Los pesos no cierran en 100">
          Marcar todos los pasos daría {numero(suma, 0)} % de avance, no 100 %.
        </Aviso>
      )}
      {p.se_repite_por?.length ? (
        <div className="mt-4">
          <Rotulo>Se repite por</Rotulo>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {p.se_repite_por.map((r) => (
              <span key={r} className="rounded-control border border-line px-2 py-[3px] text-[11.5px] text-muted">{r}</span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ═══ RENDIMIENTO ═══════════════════════════════════════════════════════════════════════════════
//
// La cadena teórico → real → recomendado sale entera de `rendimiento_recomendado`. CON UNA SOLA
// OBRA MEDIDA NO HAY RECOMENDACIÓN: la vista devuelve `hs_recomendado` en NULL y su `lectura` dice
// por qué. La pantalla repite esa lectura en vez de mostrar un número que parecería una conclusión.
function Rendimiento({ ficha }: { ficha: Ficha }) {
  const r = ficha.rendimiento
  const u = ficha.tarea.unidad
  if (!r || r.muestra === 0) {
    return (
      <div data-testid="rendimiento-tarea">
        <Fila rotulo="Presupuestado vigente"><N v={ficha.tarea.hs_unitarias} falta="sin dato" /></Fila>
        <p className="mt-3 text-[12.5px] text-muted">
          Todavía no se midió en obra: no hay rendimiento real ni recomendación.
        </p>
      </div>
    )
  }
  return (
    <div data-testid="rendimiento-tarea">
      <p className="mb-2 text-[11.5px] text-faint">Todo en hs/{u}.</p>
      <Fila rotulo="Presupuestado vigente"><N v={r.hs_analisis ?? ficha.tarea.hs_unitarias} falta="sin dato" /></Fila>
      <Fila rotulo="Real observado · promedio"><N v={r.hs_observado_promedio} falta="sin base" /></Fila>
      <Fila rotulo={`Real observado · mediana de ${r.obras} ${r.obras === 1 ? 'obra' : 'obras'}`}>
        <span className="font-semibold text-warn"><N v={r.hs_observado_mediana} falta="sin base" /></span>
      </Fila>
      <Fila rotulo="Dispersión de la muestra"><N v={r.dispersion} falta="sin base" /></Fila>
      <Fila rotulo="Recomendado">
        {r.hs_recomendado == null ? <Nulo>sin recomendación</Nulo> : <N v={r.hs_recomendado} className="font-semibold" />}
      </Fila>
      <div className="mt-3 rounded-card bg-surface-quiet px-3 py-2.5">
        <div className="text-[12.5px] text-ink-soft">{r.lectura}</div>
        <div className="mt-1 text-[11.5px] text-faint">
          Muestra: {r.obras} {r.obras === 1 ? 'obra' : 'obras'}, {r.muestra} {r.muestra === 1 ? 'registro' : 'registros'}.
        </div>
      </div>
    </div>
  )
}

// ═══ VERSIONES ═════════════════════════════════════════════════════════════════════════════════
function Versiones({ ficha }: { ficha: Ficha }) {
  if (!ficha.versiones.length) {
    return <p className="text-[12.5px] text-muted">Esta tarea tipo todavía no tiene ningún análisis cargado.</p>
  }
  return (
    <ul data-testid="versiones-tarea">
      {ficha.versiones.map((v) => (
        <li key={v.id} className="flex items-baseline gap-3 border-b border-[#EFEEEA] py-2.5 last:border-b-0">
          <span className="w-[64px] shrink-0 font-mono text-[10.5px] tabular-nums text-faint">
            {new Date(v.creado_en).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-[12px] text-ink">
              Versión {v.version}{v.vigente ? ' · vigente' : ''}
            </span>
            <span className="mt-0.5 block text-[10.5px] text-muted">
              {v.motivo ?? 'sin motivo declarado'}
            </span>
          </span>
          <span className="w-[52px] shrink-0 text-right">
            <N v={v.hs_unitarias} falta="—" className="text-[11.5px]" />
          </span>
        </li>
      ))}
    </ul>
  )
}

// ═══ USO ═══════════════════════════════════════════════════════════════════════════════════════
function Uso({ ficha }: { ficha: Ficha }) {
  if (!ficha.uso.length) {
    return (
      <p className="text-[12.5px] text-muted" data-testid="uso-vacio">
        Ninguna obra usa esta tarea tipo todavía. Se vinculan al convertir un presupuesto en plan de obra.
      </p>
    )
  }
  return (
    <ul data-testid="uso-tarea">
      {ficha.uso.map((u, i) => (
        <li key={`${u.obra_id}-${i}`} className="flex items-baseline gap-3 border-b border-[#EFEEEA] py-2.5 last:border-b-0">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] text-ink">{u.obra_nombre}</span>
            <span className="mt-0.5 block text-[10.5px] text-faint">
              {[u.referencia, u.estado].filter(Boolean).join(' · ') || 'sin referencia'}
            </span>
          </span>
          <span className="shrink-0 text-right">
            {u.cantidad == null
              ? <Nulo>sin cantidad</Nulo>
              : <span className="font-mono text-[11.5px] tabular-nums">{numero(u.cantidad, 2)} {u.unidad ?? ''}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}
