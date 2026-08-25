'use client'

// 17 · BASE MAESTRA TAREAS — porte literal de `echegaray-design/17 · Base Maestra Tareas.dc.html`.
//
// ═══ MEDIDO DEL CANÓNICO ═══
//
//   grilla   `62px minmax(0,1.6fr) 48px 92px 108px 84px 56px` · `gap:10px` (línea 231)
//   fila     44px · divisor #F1F0EC · `padding:0 14px` · seleccionada #FEF9E6
//   columnas CÓD. · TAREA · UN. · HH / UN. · REAL OBRA · COMPOSICIÓN · USOS
//   chips    Todo · Con desvío · Sin dato real, DENTRO de la banda de nivel 3
//   pie      TAREAS · CON DATO REAL · (DESACTUALIZADAS), adentro de la caja sobre #FAFAF8
//
// La versión anterior dibujaba ANÁLISIS y MUESTRA en lugar de COMPOSICIÓN y USOS, y lo declaraba:
// «esta pantalla NO lee las líneas de las 223 tareas». Ahora las lee —`getComposiciones`, una
// lectura paginada de `analisis_linea` y otra de `recurso`, ninguna de las dos económica— así que
// las dos columnas del canónico vuelven con su dato real. Lo que NO se perdió es la deuda de carga:
// la celda de COMPOSICIÓN escribe «sin análisis» cuando no hay ninguno, y el triángulo del canónico
// se enciende con el motivo puesto en el `title`.
//
// ═══ DOS RÓTULOS QUE NO SON LOS DEL ZIP, Y POR QUÉ ═══
//
//   DESACTUALIZADAS → CON AVISO. El canónico cuenta ahí `t.aviso`, que en sus datos de ejemplo son
//     tres cosas distintas (desvío, sin actualizar, sin rendimiento). Contarlas bajo «desactualizadas»
//     diría que una tarea SIN ANÁLISIS está desactualizada, que es otra cosa y se arregla de otra
//     manera.
//   ANCHO DE LA BANDA. El zip la dibuja de borde a borde de la ventana; acá arranca donde arranca el
//     contenido de la aplicación, como la barra de Administración que tiene encima. Alinearla con el
//     borde y dejar la de arriba adentro sería peor que las dos iguales.
//
// ═══ ES DE CLIENTE POR UNA SOLA RAZÓN ═══
//
// El buscador filtra MIENTRAS SE ESCRIBE, y los chips recortan sin volver al servidor. Las tareas ya
// vinieron enteras. LO QUE CRUZA LA FRONTERA SON DATOS, NUNCA FUNCIONES: este componente recibía un
// `hrefDe`, y una función que no serializa deja la pantalla clavada en el esqueleto PARA SIEMPRE con
// el registro diciendo `200 in 3.5s`. El panel entra como `children`, ya renderizado en el servidor.

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  ALTO, BotonMarca, C, CeldaTexto, CuentaChip, EncabezadoCanon, FilaCanon, IcoAlerta,
  IcoBaja, IcoCuadrilla, IcoEquipo, IcoIgual, IcoMas, IcoMaterial, IcoSube, PAGINA, PieCanon,
  TarjetaTabla, VacioCanon,
} from '@/shared/components/canon'
import type { TareaTipoFila } from '../types'
import {
  desvioObservado, motivoDelEstado, numero, type DireccionDesvio, type TipoComposicion,
} from '../services/reglas'
import { CORTES_TAREA, ROTULO_CORTE, coincideTarea, cumpleCorte, type CorteTarea } from '../services/vistas'
import { BandaBaseMaestra, type SolapaBM } from './NavBaseMaestra'
import { BuscadorCajaViva } from './BuscadorCajaViva'
import { ChipCorte } from './controles'

/** `17`, línea 231. Sin USOS cuando quien mira no puede contarlos: la columna no se dibuja vacía. */
const COLS = '62px minmax(0,1.6fr) 48px 92px 108px 84px 56px'
const COLS_SIN_USOS = '62px minmax(0,1.6fr) 48px 92px 108px 84px'

export function TareasTipo({
  tareas, q, seleccionada, economia, cuentas, ruta, otros, hrefNueva, panel,
}: {
  tareas: TareaTipoFila[]
  q: string
  seleccionada: string | null
  /** Decide si la columna USOS tiene un número que se pueda sostener. Ver `getUsosDeTareas`. */
  economia: boolean
  cuentas: Partial<Record<SolapaBM, number | null>>
  ruta: string
  otros: Record<string, string | undefined>
  hrefNueva: string
  panel?: ReactNode
}) {
  const router = useRouter()
  const [consulta, setConsulta] = useState(q)
  const [corte, setCorte] = useState<CorteTarea>('todo')

  const visibles = tareas.filter((t) => coincideTarea(t, consulta) && cumpleCorte(t, corte))
  const cols = economia ? COLS : COLS_SIN_USOS

  const href = (cambios: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...otros, q: consulta || undefined, ...cambios })) {
      if (v) p.set(k, v)
    }
    const qs = p.toString()
    return qs ? `${ruta}?${qs}` : ruta
  }

  return (
    <>
      <BandaBaseMaestra activa="tareas" cuentas={cuentas}>
        <BuscadorCajaViva
          value={consulta}
          onChange={setConsulta}
          placeholder="Buscar tarea o código"
          ancho={230}
          testid="buscador-tareas-q"
        />
        <div data-testid="filtros-corte" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {CORTES_TAREA.map((k) => (
            <ChipCorte key={k} activo={corte === k} onClick={() => setCorte(k)} testid={`corte-${k}`}>
              {ROTULO_CORTE[k]}
              <CuentaChip n={tareas.filter((t) => cumpleCorte(t, k)).length} activo={corte === k} />
            </ChipCorte>
          ))}
        </div>
        <BotonMarca href={hrefNueva} testid="nueva-tarea">
          <IcoMas s={14} /> Nueva tarea
        </BotonMarca>
      </BandaBaseMaestra>

      <div style={{ ...PAGINA.cuerpo, paddingTop: 14 }}>
        <TarjetaTabla testid="tabla-tareas-tipo">
          <EncabezadoCanon
            cols={cols}
            columnas={[
              { rotulo: 'CÓD.' },
              { rotulo: 'TAREA' },
              { rotulo: 'UN.' },
              // ESFUERZO Y NO «RENDIMIENTO»: son hs por unidad, y bajan cuando la tarea mejora.
              { rotulo: 'HH / UN.', alineacion: 'derecha' },
              { rotulo: 'REAL OBRA', alineacion: 'derecha' },
              { rotulo: 'COMPOSICIÓN' },
              ...(economia ? [{ rotulo: 'USOS', alineacion: 'derecha' as const }] : []),
            ]}
          />

          {visibles.map((t) => (
            <Fila
              key={t.id}
              t={t}
              cols={cols}
              economia={economia}
              seleccionada={t.id === seleccionada}
              // Abrir otra tarea limpia la solapa: la de la anterior puede no existir acá.
              onAbrir={() => router.push(href({ t: t.id, s: undefined }), { scroll: false })}
            />
          ))}

          {visibles.length === 0 && (
            <VacioCanon testid="tareas-vacio">{vacioDe(consulta, corte, tareas.length)}</VacioCanon>
          )}

          {/* EL PIE CUENTA SOBRE EL TOTAL, NO SOBRE LO VISIBLE: es el estado de la base maestra, no
              el de la búsqueda de este momento. */}
          <PieCanon
            totales={[
              { rotulo: 'TAREAS', valor: String(tareas.length), testid: 'pie-tareas' },
              {
                rotulo: 'CON DATO REAL',
                valor: String(tareas.filter((t) => t.hs_observado != null).length),
                color: C.pos,
              },
              {
                rotulo: 'CON AVISO',
                valor: String(tareas.filter((t) => avisoDe(t) != null).length),
                color: C.warn,
              },
            ]}
          />
        </TarjetaTabla>

        {panel}
      </div>
    </>
  )
}

/**
 * EL AVISO DE LA FILA — el triángulo del canónico, con el motivo puesto en el `title`.
 *
 * El orden importa: la deuda de carga manda sobre la recomendación. Una tarea sin análisis no tiene
 * nada que «actualizar con el real»: lo que le falta es la composición, y ése es el trabajo.
 */
function avisoDe(t: TareaTipoFila): string | null {
  const deuda = motivoDelEstado(t.estado, t.falta)
  if (deuda) return deuda
  if (t.hs_recomendado != null) {
    return `El real de obra propone ${numero(t.hs_recomendado, 2)} HH/${t.unidad}: hay una recomendación sin decidir`
  }
  return null
}

const ICONO_COMPOSICION: Record<TipoComposicion, { ico: ReactNode; tip: string }> = {
  mano_obra: { ico: <IcoCuadrilla s={13} />, tip: 'Mano de obra' },
  material: { ico: <IcoMaterial s={13} />, tip: 'Materiales' },
  equipo: { ico: <IcoEquipo s={13} />, tip: 'Equipos' },
}

const TINTA_DESVIO: Record<DireccionDesvio, string> = { peor: C.warn, mejor: C.pos, igual: C.tinta }

function Fila({
  t, cols, economia, seleccionada, onAbrir,
}: {
  t: TareaTipoFila
  cols: string
  economia: boolean
  seleccionada: boolean
  onAbrir: () => void
}) {
  const d = desvioObservado(t.hs_unitarias, t.hs_observado)
  const real = numero(t.hs_observado, 2)
  const aviso = avisoDe(t)
  const color = d ? TINTA_DESVIO[d.direccion] : C.tenue

  return (
    <FilaCanon
      cols={cols}
      alto={ALTO.filaBloque}
      seleccionada={seleccionada}
      onClick={onAbrir}
      testid={`tarea-${t.codigo}`}
      tabIndex={0}
      role="row"
      onKeyDown={(e) => { if (e.key === 'Enter') onAbrir() }}
    >
      <CeldaTexto mono tam="11.5px" color={C.apagado}>{t.codigo}</CeldaTexto>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <CeldaTexto tam="12.5px" color={C.tinta} titulo={t.nombre}>{t.nombre}</CeldaTexto>
        {aviso && (
          <span title={aviso} data-testid="aviso-tarea" style={{ display: 'flex', color: C.warn, flexShrink: 0 }}>
            <IcoAlerta s={13} />
          </span>
        )}
      </div>

      <CeldaTexto tam="12px">{t.unidad}</CeldaTexto>

      <CeldaTexto mono tam="12px" color={C.tinta} alineacion="derecha">
        {/* «sin dato» y no 0: una tarea sin esfuerzo cargado aporta 0 HH al plan, que es la
            afirmación de que no lleva mano de obra. */}
        {numero(t.hs_unitarias, 2) ?? <span style={{ fontSize: '11.5px', color: C.tenue }}>sin dato</span>}
      </CeldaTexto>

      <div
        role="cell"
        data-desvio={d?.direccion ?? 'sin-base'}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, minWidth: 0 }}
      >
        {real == null ? (
          // «sin medir» y no «sin dato»: la tarea puede estar perfectamente cargada; lo que falta es
          // que alguien la haya ejecutado y le haya imputado horas.
          <span style={{ fontSize: '11.5px', color: C.tenue }}>sin medir</span>
        ) : (
          <>
            <span style={{ display: 'flex', color, flexShrink: 0 }}>
              {d?.direccion === 'peor' ? <IcoSube s={12} /> : d?.direccion === 'mejor' ? <IcoBaja s={12} /> : <IcoIgual s={12} />}
            </span>
            <span className="font-mono tabular-nums" style={{ fontSize: '12px', color }}>{real}</span>
            {/* `1,32×` dice cuánto, no sólo el signo: es la lectura que el icono solo no da. */}
            {d && <span className="font-mono tabular-nums" style={{ fontSize: '11px', color }}>{numero(d.ratio, 2)}×</span>}
          </>
        )}
      </div>

      <div role="cell" style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        {t.composicion.length === 0 ? (
          <span
            title={t.estado === 'sin_analisis' ? 'Nadie cargó la composición: no aporta HH ni costo.' : undefined}
            style={{ fontSize: '11.5px', color: C.tenue }}
          >
            {t.estado === 'sin_analisis' ? 'sin análisis' : 'sin líneas'}
          </span>
        ) : (
          t.composicion.map((k) => (
            <span key={k} title={ICONO_COMPOSICION[k].tip} style={{ display: 'flex', color: C.apagado }}>
              {ICONO_COMPOSICION[k].ico}
            </span>
          ))
        )}
      </div>

      {economia && (
        <CeldaTexto mono tam="11.5px" color={C.apagado} alineacion="derecha" titulo="Partidas de presupuesto y actividades de obra que salieron de esta tarea">
          {t.usos == null ? '—' : t.usos}
        </CeldaTexto>
      )}
    </FilaCanon>
  )
}

function vacioDe(consulta: string, corte: CorteTarea, total: number): string {
  if (consulta) return `Nada coincide con «${consulta}».`
  if (corte !== 'todo') return `Ninguna tarea tipo queda en «${ROTULO_CORTE[corte]}».`
  if (total === 0) {
    return 'La base maestra todavía no tiene tareas tipo cargadas. Se cargan al importar la Planilla para Cotizar o con «Nueva tarea».'
  }
  return 'Nada coincide.'
}
