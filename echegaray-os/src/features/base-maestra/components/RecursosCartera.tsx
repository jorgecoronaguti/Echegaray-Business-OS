'use client'

// 18 · BASE MAESTRA RECURSOS — porte literal de `echegaray-design/18 · Base Maestra Recursos.dc.html`.
//
// ═══ MEDIDO DEL CANÓNICO ═══
//
//   grilla   `134px minmax(0,1.5fr) 44px 104px 96px minmax(0,1fr) 52px` · `gap:10px` (línea 235)
//   fila     44px · divisor #F1F0EC · seleccionada #FEF9E6
//   columnas TIPO · RECURSO · UN. · PRECIO · ACTUALIZADO · PROVEEDOR · USOS
//   chips    Todo · Mano de obra · Materiales · Con problema, con su icono, DENTRO de la banda
//   buscador 224px · pie RECURSOS · SIN PRECIO · DESACTUALIZADOS
//
// ═══ UNA SOLA LISTA, NO TRES SUB-VISTAS ═══
//
// La versión anterior partía esto en «Insumos», «Mano de obra» y «Equipos» como tres entradas de
// navegación distintas. El canónico dibuja UNA lista con una columna TIPO y chips para recortarla —
// que es lo que `recurso_costo` es de verdad: una tabla con una columna `tipo`. Los enlaces viejos
// (`?v=insumos`, `?v=equipos`) siguen abriendo: ver `vistas.ts`.
//
// ═══ TRES COLUMNAS DESAPARECEN SIN PERMISO ECONÓMICO, Y NO SE DIBUJAN VACÍAS ═══
//
// PRECIO, ACTUALIZADO y PROVEEDOR salen las tres de `recurso_precio`, que la RLS le devuelve VACÍA
// a un jefe de obra. Dibujarlas con guiones diría «nadie cargó 409 precios» y mandaría a alguien a
// cargarlos otra vez. Con el chip «Con problema» pasa lo mismo: su pregunta es sobre el precio, así
// que sin permiso no se ofrece.

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  ALTO, BotonMarca, C, CeldaTexto, CuentaChip, EncabezadoCanon, FilaCanon, IcoAlerta,
  IcoCuadrilla, IcoEquipo, IcoLista, IcoMas, IcoMaterial, IcoPaquete, IcoReloj, PAGINA, PieCanon,
  TarjetaTabla, VacioCanon,
} from '@/shared/components/canon'
import type { RecursoFila } from '../types'
import { fechaCorta, numero, type Frescura } from '../services/reglas'
import {
  CORTES_RECURSO, ROTULO_CORTE_RECURSO, coincideRecurso, cumpleCorteRecurso, type CorteRecurso,
} from '../services/vistas'
import { BandaBaseMaestra, type SolapaBM } from './NavBaseMaestra'
import { BuscadorCajaViva } from './BuscadorCajaViva'
import { ChipCorte } from './controles'

/** `18`, línea 235. Sin las tres columnas de precio cuando quien mira no las puede ver. */
const COLS = '134px minmax(0,1.5fr) 44px 104px 96px minmax(0,1fr) 52px'
const COLS_SIN_ECONOMIA = '134px minmax(0,1.5fr) 44px 52px'

const TIPO: Record<RecursoFila['tipo'], { rotulo: string; ico: ReactNode }> = {
  mano_obra: { rotulo: 'Mano de obra', ico: <IcoCuadrilla s={14} /> },
  carga_social: { rotulo: 'Carga social', ico: <IcoCuadrilla s={14} /> },
  material: { rotulo: 'Material', ico: <IcoMaterial s={14} /> },
  equipo: { rotulo: 'Equipo', ico: <IcoEquipo s={14} /> },
  otro: { rotulo: 'Otro', ico: <IcoPaquete s={14} /> },
}

const ICONO_CHIP: Record<CorteRecurso, ReactNode> = {
  todo: <IcoLista s={13} />,
  mano_obra: <IcoCuadrilla s={13} />,
  material: <IcoMaterial s={13} />,
  problema: <IcoAlerta s={13} />,
  // Mismo icono que «Con problema» y no uno nuevo: es un subconjunto suyo, no otra clase de aviso.
  sin_precio: <IcoAlerta s={13} />,
}

/** El color de la fecha dice cuánto se puede confiar en el precio de al lado. Sin fecha NO es viejo:
 *  es desconocido, y pintarlo de `warn` le inventaría una antigüedad que nadie midió. */
const TINTA_FRESCURA: Record<Frescura, string> = {
  nueva: C.tintaSuave, ok: C.tintaSuave, vieja: C.warn, sin_fecha: C.tenue,
}

export function RecursosCartera({
  recursos, q, seleccionado, economia, cuentas, ruta, otros, hrefNuevo, corteInicial, panel,
}: {
  recursos: RecursoFila[]
  q: string
  seleccionado: string | null
  economia: boolean
  cuentas: Partial<Record<SolapaBM, number | null>>
  ruta: string
  otros: Record<string, string | undefined>
  hrefNuevo: string
  corteInicial: CorteRecurso
  panel?: ReactNode
}) {
  const router = useRouter()
  const [consulta, setConsulta] = useState(q)
  const [corte, setCorte] = useState<CorteRecurso>(corteInicial)

  // «Con problema» y «Sin precio» son los dos hechos de PRECIO: a quien no ve economía no se le
  // ofrecen, porque `recurso_precio` le devuelve cero filas y los dos recortes le traerían la
  // cartera entera diciendo que está todo sin cargar.
  const cortes = economia
    ? CORTES_RECURSO
    : CORTES_RECURSO.filter((c) => c !== 'problema' && c !== 'sin_precio')
  const visibles = recursos.filter((r) => coincideRecurso(r, consulta) && cumpleCorteRecurso(r, corte))
  const cols = economia ? COLS : COLS_SIN_ECONOMIA

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
      <BandaBaseMaestra activa="recursos" cuentas={cuentas}>
        <BuscadorCajaViva
          value={consulta}
          onChange={setConsulta}
          placeholder="Buscar recurso"
          ancho={224}
          testid="buscador-recursos-q"
        />
        <div data-testid="filtros-tipo" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {cortes.map((k) => (
            <ChipCorte key={k} activo={corte === k} onClick={() => setCorte(k)} testid={`tipo-${k}`}>
              <span style={{ display: 'flex' }}>{ICONO_CHIP[k]}</span>
              {ROTULO_CORTE_RECURSO[k]}
              <CuentaChip n={recursos.filter((r) => cumpleCorteRecurso(r, k)).length} activo={corte === k} />
            </ChipCorte>
          ))}
        </div>
        <BotonMarca href={hrefNuevo} testid="nuevo-recurso">
          <IcoMas s={14} /> Recurso
        </BotonMarca>
      </BandaBaseMaestra>

      <div style={{ ...PAGINA.cuerpo, paddingTop: 14 }}>
        <TarjetaTabla testid="tabla-recursos" cols={cols}>
          <EncabezadoCanon
            cols={cols}
            columnas={[
              { rotulo: 'TIPO' },
              { rotulo: 'RECURSO' },
              { rotulo: 'UN.' },
              ...(economia
                ? [
                    { rotulo: 'PRECIO', alineacion: 'derecha' as const },
                    { rotulo: 'ACTUALIZADO', alineacion: 'derecha' as const },
                    { rotulo: 'PROVEEDOR' },
                  ]
                : []),
              { rotulo: 'USOS', alineacion: 'derecha' },
            ]}
          />

          {visibles.map((r) => (
            <Fila
              key={r.recurso_id}
              r={r}
              cols={cols}
              economia={economia}
              seleccionado={r.recurso_id === seleccionado}
              onAbrir={() => router.push(href({ r: r.recurso_id }), { scroll: false })}
            />
          ))}

          {visibles.length === 0 && (
            <VacioCanon testid="recursos-vacio">{vacioDe(consulta, corte, recursos.length)}</VacioCanon>
          )}

          {/* EL PIE ES EL ESTADO DE LA BASE, no el de la búsqueda de este momento: cuenta sobre el
              total. Las dos métricas de precio no se dibujan sin permiso económico. */}
          <PieCanon
            totales={[
              { rotulo: 'RECURSOS', valor: String(recursos.length), testid: 'pie-recursos' },
              ...(economia
                ? [
                    {
                      rotulo: 'SIN PRECIO',
                      valor: String(recursos.filter((r) => r.costo_base == null).length),
                      color: C.warn,
                    },
                    {
                      rotulo: 'DESACTUALIZADOS',
                      valor: String(recursos.filter((r) => r.frescura === 'vieja').length),
                      color: C.warn,
                    },
                  ]
                : []),
            ]}
          />
        </TarjetaTabla>

        {panel}
      </div>
    </>
  )
}

/** El aviso de la fila: sin precio pesa más que precio viejo, porque sin precio no se cotiza. */
function avisoDe(r: RecursoFila): { texto: string; color: string; ico: ReactNode } | null {
  if (r.costo_base == null) {
    return { texto: 'Sin precio cargado: no aporta costo a ningún análisis', color: C.neg, ico: <IcoAlerta s={13} /> }
  }
  if (r.frescura === 'vieja') {
    return { texto: 'Precio vencido para cotizar', color: C.warn, ico: <IcoReloj s={13} /> }
  }
  if (r.frescura === 'sin_fecha') {
    return { texto: 'Precio sin fecha: no se sabe de cuándo es', color: C.warn, ico: <IcoReloj s={13} /> }
  }
  return null
}

function Fila({
  r, cols, economia, seleccionado, onAbrir,
}: {
  r: RecursoFila
  cols: string
  economia: boolean
  seleccionado: boolean
  onAbrir: () => void
}) {
  const aviso = economia ? avisoDe(r) : null

  return (
    <FilaCanon
      cols={cols}
      alto={ALTO.filaBloque}
      seleccionada={seleccionado}
      onClick={onAbrir}
      testid={`recurso-${r.codigo}`}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onAbrir() }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span title={TIPO[r.tipo].rotulo} style={{ display: 'flex', color: C.apagado, flexShrink: 0 }}>
          {TIPO[r.tipo].ico}
        </span>
        <CeldaTexto tam="11.5px" color={C.apagado}>{TIPO[r.tipo].rotulo}</CeldaTexto>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <CeldaTexto tam="12.5px" color={C.tinta} titulo={`${r.codigo} · ${r.nombre}`}>{r.nombre}</CeldaTexto>
        {aviso && (
          <span title={aviso.texto} data-testid="aviso-recurso" style={{ display: 'flex', color: aviso.color, flexShrink: 0 }}>
            {aviso.ico}
          </span>
        )}
      </div>

      <CeldaTexto tam="11.5px">{r.unidad}</CeldaTexto>

      {economia && (
        <>
          <CeldaTexto mono tam="12px" color={r.costo_base == null ? C.warn : C.tinta} alineacion="derecha">
            {/* «sin precio» y no $ 0: un cero afirmaría que el recurso no cuesta nada. */}
            {r.costo_base == null ? 'sin precio' : `$ ${numero(r.costo_base, 0)}`}
          </CeldaTexto>
          <CeldaTexto mono tam="11.5px" color={TINTA_FRESCURA[r.frescura]} alineacion="derecha">
            {fechaCorta(r.fecha_precio) ?? '—'}
          </CeldaTexto>
          <CeldaTexto tam="11.5px" color={r.proveedor ? C.tintaSuave : C.warn} titulo={r.proveedor ?? undefined}>
            {r.proveedor ?? 'sin definir'}
          </CeldaTexto>
        </>
      )}

      <CeldaTexto mono tam="11.5px" color={C.apagado} alineacion="derecha" titulo="Tareas tipo vigentes que lo usan">
        {r.usos == null ? '—' : r.usos}
      </CeldaTexto>
    </FilaCanon>
  )
}

function vacioDe(consulta: string, corte: CorteRecurso, total: number): string {
  if (consulta) return `Nada coincide con «${consulta}».`
  if (corte === 'problema') return 'Ningún recurso tiene el precio vencido ni sin cargar. La base está al día.'
  if (corte !== 'todo') return `Ningún recurso queda en «${ROTULO_CORTE_RECURSO[corte]}».`
  if (total === 0) {
    return 'La base maestra todavía no tiene recursos cargados. Entran al importar la Planilla para Cotizar o con «+ Recurso».'
  }
  return 'Nada coincide.'
}
