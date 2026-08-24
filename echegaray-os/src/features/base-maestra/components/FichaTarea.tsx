// PANTALLA 17 · LA FICHA DE UNA TAREA TIPO — seis solapas.
//
// Server component: no hay un solo dato que el navegador tenga que ir a buscar después. La solapa
// abierta viaja en la URL (`?s=analisis`), igual que la tarea seleccionada, así que un enlace a
// «HA-140, solapa Esfuerzo» (`?s=rendimiento`) abre exactamente ahí.
//
// LA SOLAPA `Análisis` NO SE RENDERIZA SIN PERMISO ECONÓMICO. No se muestra vacía ni con guiones:
// no existe. El contrato lo pide («esconder por completo, no mostrar —») y el motivo es que una
// columna de guiones sigue diciendo cuántas líneas tiene el análisis y cuál es el insumo más caro.
//
// ═══ LAS CINCO PREGUNTAS, EN ESTE ORDEN ═══
//
// Qué es · cómo se mide · cuánto rinde · qué necesita · qué aprendimos. Resumen las contesta las
// cinco sin que haya que abrir nada; la composición completa —que es la respuesta larga a «qué
// necesita»— queda plegada, porque son diez líneas que casi nunca se leen enteras y que empujan el
// aprendizaje fuera de la pantalla.

import Link from 'next/link'
import { Aviso, Nulo, Plegable, TituloPanel } from '@/shared/components/ds'
// `Campo` de este archivo es la fila rótulo/valor de la ficha; el del formulario es otro. Se
// renombra en el import en vez de tocar el local: el local lo usan seis solapas.
import { IconoCerrar } from '@/shared/components/iconos'
import type { FichaTarea as Ficha, LineaAnalisis } from '../types'
import {
  desvioObservado, motivoDelEstado, numero, pesosCierran, sumaDePesos,
} from '../services/reglas'
import { MAGNITUD, productividad } from '../services/vocabulario'
import { EstadoAnalisisCelda, EsfuerzoObservado, N, Rotulo, Texto } from './celdas'
import { SolapaAnalisis } from './SolapaAnalisis'
import { SolapaRendimiento } from './SolapaRendimiento'

// LA CLAVE `rendimiento` NO SE RENOMBRA, EL RÓTULO SÍ (22/08/2026). La clave viaja en la URL
// (`?s=rendimiento`) y está en enlaces mandados por chat, en marcadores y en los tests: cambiarla
// rompe los que ya existen para no arreglar nada. Lo que estaba mal es la PALABRA en pantalla — el
// número que muestra la solapa es hs/unidad, o sea ESFUERZO, y un esfuerzo mejora cuando baja.
export const SOLAPAS = ['resumen', 'analisis', 'secuencia', 'rendimiento', 'versiones', 'uso'] as const
export type Solapa = (typeof SOLAPAS)[number]

const ETIQUETA: Record<Solapa, string> = {
  resumen: 'Resumen', analisis: 'Análisis', secuencia: 'Secuencia',
  rendimiento: 'Esfuerzo', versiones: 'Versiones', uso: 'Uso',
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
  const { tarea, rendimiento } = ficha
  const visibles = SOLAPAS.filter((s) => s !== 'analisis' || economia)

  return (
    <aside
      data-testid="ficha-tarea"
      className="min-w-0 shrink-0 border-t border-line pt-4 lg:w-[412px] lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 xl:w-[412px]"
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10.5px] text-faint">
            {tarea.codigo}
            {tarea.division ? ` · ${tarea.division}` : ''}
            {/* LA VERSIÓN VIVE ACÁ Y NO SÓLO EN LA SOLAPA ECONÓMICA. Saber con qué versión se está
                mirando una tarea no es un dato de precio: es lo que permite decir si el análisis que
                cotizó una obra es éste o el anterior. */}
            {tarea.version != null ? ` · v${tarea.version}` : ''}
          </div>
          <TituloPanel className="mt-1">{tarea.nombre}</TituloPanel>
          {/* El estado va en la CABECERA y no sólo en la lista: quien entró por un enlace directo a
              la ficha nunca vio la fila, y el estado es lo primero que decide si este análisis sirve.
              Al lado, el método de medición como TEXTO —nunca una pastilla— según §Method chip. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <EstadoAnalisisCelda estado={tarea.estado} titulo={motivoDelEstado(tarea.estado, tarea.falta)} />
            <span className="text-[11.5px] text-muted">
              Mide por <Texto v={etiquetaMedicion(tarea.metodo_medicion)} falta="sin definir" className="text-[11.5px]" />
            </span>
          </div>
        </div>
        <Link
          href={hrefCerrar}
          scroll={false}
          data-testid="cerrar-ficha"
          title="Cerrar"
          aria-label="Cerrar la ficha"
          className="shrink-0 text-faint transition-colors hover:text-ink"
        >
          <IconoCerrar className="h-[15px] w-[15px]" />
        </Link>
      </header>

      {/* LOS DOS NÚMEROS QUE DECIDEN, ENFRENTADOS. Con qué se cotiza y qué pasó cuando se hizo: la
          comparación es el objeto de esta pantalla, y separados en dos lugares no se compara nada. */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Cifra rotulo="Esfuerzo base" pie={MAGNITUD.esfuerzo.unidad(tarea.unidad)}>
          {numero(tarea.hs_unitarias, 2) ?? <Nulo>sin análisis</Nulo>}
        </Cifra>
        <Cifra
          rotulo="Real de obra"
          pie={
            rendimiento && rendimiento.muestra > 0
              ? `${rendimiento.obras} ${rendimiento.obras === 1 ? 'obra medida' : 'obras medidas'}`
              : 'todavía no se midió'
          }
        >
          <EsfuerzoObservado base={tarea.hs_unitarias} observado={tarea.hs_observado} />
        </Cifra>
      </div>

      {/* LA ACCIÓN APARECE CUANDO EL MOTOR PROPUSO ALGO, NO CUANDO LA PANTALLA CALCULA UNA
          DIFERENCIA. `hs_recomendado` en NULL significa que la muestra no alcanza para decidir, y
          ofrecer «actualizar la base» ahí invitaría a meter un caso raro en la base para siempre. */}
      {tarea.hs_recomendado != null && solapa !== 'rendimiento' && (
        <Link
          href={hrefSolapa('rendimiento')}
          scroll={false}
          data-testid="ir-a-decidir"
          className="mt-3 flex items-center gap-2 rounded-card border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] text-ink transition-colors hover:border-warn/60"
        >
          <span className="min-w-0 flex-1">
            Actualizar la base con el real
            <span className="mt-0.5 block text-[11px] text-muted">
              pasar de <span className="font-mono tabular-nums">{numero(tarea.hs_unitarias, 2) ?? 'sin dato'}</span> a{' '}
              <span className="font-mono tabular-nums">{numero(tarea.hs_recomendado, 2)}</span>{' '}
              {MAGNITUD.esfuerzo.unidad(tarea.unidad)} afecta los presupuestos que vengan
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-faint">›</span>
        </Link>
      )}

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
        {solapa === 'rendimiento' && <SolapaRendimiento ficha={ficha} />}
        {solapa === 'versiones' && <Versiones ficha={ficha} />}
        {solapa === 'uso' && <Uso ficha={ficha} />}
      </div>
    </aside>
  )
}

const etiquetaMedicion = (m: string | null) =>
  m === 'pasos' ? 'Pasos ponderados' : m === 'cantidad' ? 'Cantidad' : m === 'manual' ? 'Manual' : null

/** Un número grande con su rótulo y su pie. No es un panel: es peso tipográfico y espacio. */
function Cifra({ rotulo, pie, children }: { rotulo: string; pie: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-card bg-surface-quiet px-3 py-2.5">
      <Rotulo>{rotulo}</Rotulo>
      <div className="mt-1 font-mono text-[17px] font-semibold tabular-nums text-ink">{children}</div>
      <div className="mt-0.5 truncate text-[11px] text-muted">{pie}</div>
    </div>
  )
}

// ═══ RESUMEN — la definición en prosa de la tarea tipo ══════════════════════════════════════════
//
// Los cinco bloques del contrato. Ninguno se inventa: si el dato no está, el bloque lo dice. «QUÉ
// APRENDIMOS» sólo aparece cuando hay muestra REAL de obra — con una sola obra medida no hay
// aprendizaje, hay un dato, y así lo declara `rendimiento_recomendado.lectura`.
function Resumen({ ficha }: { ficha: Ficha }) {
  const { tarea, rendimiento, plantilla, lineas } = ficha
  const recomendable = rendimiento?.hs_recomendado != null
  const desvio = desvioObservado(tarea.hs_unitarias, tarea.hs_observado)
  const cuadrilla = lineas.filter((l) => l.tipo === 'mano_obra')
  const insumos = lineas.filter((l) => l.tipo === 'material' || l.tipo === 'equipo')

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
      {/* ESFUERZO, NO «CUÁNTO RINDE». El número es hs/unidad: MEJORA CUANDO BAJA. Rotulado como
          rendimiento, «subió de 30 a 36,5» se leía como una buena noticia siendo un 22 % más de
          mano de obra por unidad — y es el número con el que se cotiza. La productividad (la misma
          medición al derecho) va al lado para que la dirección de la mejora quede a la vista. */}
      <Campo rotulo={`${MAGNITUD.esfuerzo.rotulo} · ${MAGNITUD.esfuerzo.unidad(tarea.unidad)}`}>
        {tarea.hs_unitarias == null ? (
          <Nulo>sin análisis: no aporta HH</Nulo>
        ) : (
          <span>
            <span className="font-mono tabular-nums">{numero(tarea.hs_unitarias, 2)}</span> presupuestado
            {tarea.hs_observado != null && (
              <span className={desvio?.direccion === 'peor' ? 'text-warn' : undefined}>
                {' · '}<span className="font-mono tabular-nums">{numero(tarea.hs_observado, 2)}</span> observado
              </span>
            )}
          </span>
        )}
      </Campo>
      <Campo rotulo={`${MAGNITUD.productividad.rotulo} · ${MAGNITUD.productividad.unidad(tarea.unidad)}`}>
        {productividad(tarea.hs_unitarias) == null
          ? <Nulo>sin esfuerzo cargado</Nulo>
          : <span className="font-mono tabular-nums">{numero(productividad(tarea.hs_unitarias), 3)}</span>}
      </Campo>
      {/* LA CUADRILLA NO ES UN CAMPO DEL MODELO: ES LA MANO DE OBRA DEL ANÁLISIS. Un puesto y sus
          horas por unidad — eso es con quién se hace la tarea, y sale de las líneas que ya están
          leídas. Inventar una tabla de «cuadrilla tipo» al lado sería una segunda definición del
          mismo hecho, y la que cotiza es ésta. */}
      <Campo rotulo="Con qué cuadrilla">
        {cuadrilla.length === 0
          ? <Nulo>sin mano de obra en el análisis</Nulo>
          : <span>{cuadrilla.map((l) => `${l.nombre} ${numero(l.cantidad, 2)} ${l.unidad}`.trim()).join(' · ')}</span>}
      </Campo>
      <Campo rotulo="Qué necesita">
        {ficha.costo
          ? `${ficha.costo.n_lineas} líneas · ${insumos.length} entre materiales y equipos${
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

      {/* LA COMPOSICIÓN COMPLETA, BAJO DEMANDA. Sin precios: las cantidades son operativas y las ve
          cualquiera; el costo de cada línea vive en la solapa Análisis, que sólo existe con permiso
          económico. Cerrada por defecto — son diez líneas que empujan el aprendizaje fuera de la
          pantalla y casi nunca se leen enteras. */}
      {lineas.length > 0 && (
        <Plegable titulo="Composición por unidad" cuenta={lineas.length} testid="composicion-plegada">
          <ul>
            {lineas.map((l) => <LineaComposicion key={l.id} linea={l} />)}
          </ul>
        </Plegable>
      )}

      {tarea.estado !== 'completo' && (
        <Aviso tono={tarea.estado === 'sin_analisis' ? 'neg' : 'warn'} titulo="Deuda de carga">
          {motivoDelEstado(tarea.estado, tarea.falta) ?? 'Falta completar el análisis.'}
        </Aviso>
      )}
    </div>
  )
}

const RUBRO: Record<LineaAnalisis['tipo'], string> = {
  mano_obra: 'mano de obra', carga_social: 'carga social', material: 'material', equipo: 'equipo', otro: 'otro',
}

function LineaComposicion({ linea }: { linea: LineaAnalisis }) {
  return (
    <li className="flex items-baseline gap-3 border-b border-[#EFEEEA] py-1.5 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] text-ink-soft">{linea.nombre}</span>
        <span className="text-[10px] text-faint">{RUBRO[linea.tipo]}</span>
      </span>
      <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-soft">
        {numero(linea.cantidad, 2)} {linea.unidad}
      </span>
    </li>
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
