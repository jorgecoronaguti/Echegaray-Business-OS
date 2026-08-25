// 18 · EL PANEL DE UN RECURSO — porte literal del panel de `18 · Base Maestra Recursos.dc.html`.
//
// ═══ MEDIDO DEL CANÓNICO (líneas 141-215) ═══
//
//   panel    `width:372px;marginLeft:12px` · caja blanca, borde #E7E6E2, radio 10
//   cabeza   «Actualizar precio» amarillo `7px 13px` · ✕ a la derecha
//   título   icono del tipo + nombre 15,5px/600 · «{tipo} · por {unidad}» 11,5px
//   cifras   PRECIO ACTUAL / VARIACIÓN 6 M · valor mono 16px/600
//   listas   Historial de precio · Se usa en · aviso de impacto
//
// ═══ POR QUÉ EL HISTORIAL ES LA MITAD DEL PANEL ═══
//
// Un precio suelto no se puede defender: 152.000 el m³ puede ser de esta semana o de 2017, y las dos
// cosas se ven idénticas en una celda. El historial es lo que convierte el número en un dato con
// procedencia y lo que permite ver la variación real.
//
// ═══ AHORA «ACTUALIZAR PRECIO» ESCRIBE ═══
//
// Hasta hoy este panel decía, textual, que el botón del canónico no existía porque «los precios
// entran por la ingestión de la Planilla para Cotizar y un botón que no escribe nada es peor que no
// tenerlo». Ya escribe: `actualizarPrecioRecurso` agrega un precio nuevo y baja el anterior sin
// perder la historia. El panel de carga se abre EN EL LUGAR (`?precio=<id>`), no en otra página.
//
// ═══ EL IMPACTO SE DICE CON EL NÚMERO QUE SE PUEDE SOSTENER ═══
//
// El canónico promete «3 presupuestos abiertos usan este recurso en 4 partidas». Eso exige atravesar
// presupuesto → partida → análisis → línea, y los presupuestos CONGELADOS guardan su propia copia de
// la composición: contarlos ahí daría un número que no se movería aunque el precio cambie. Lo que se
// afirma es lo leído: cuántas tareas tipo lo usan en su versión vigente.

import Link from 'next/link'
import { C, IcoCerrar, IcoCuadrilla, IcoEditar, IcoEquipo, IcoMaterial, IcoPaquete, BotonIcono, BotonMarca, PANEL } from '@/shared/components/canon'
import { Aviso } from '@/shared/components/ds'
import { RUTA_TAREAS } from './NavBaseMaestra'
import type { FichaRecurso as Ficha, RecursoFila } from '../types'
import { diasEntre, fechaCorta, numero, porcentaje } from '../services/reglas'
import { CajaPanel, Cifra, FILA_PANEL, Linea, Seccion } from './panel'

const RUBRO: Record<RecursoFila['tipo'], { rotulo: string; ico: React.ReactNode }> = {
  mano_obra: { rotulo: 'Mano de obra', ico: <IcoCuadrilla s={17} /> },
  carga_social: { rotulo: 'Carga social', ico: <IcoCuadrilla s={17} /> },
  material: { rotulo: 'Material', ico: <IcoMaterial s={17} /> },
  equipo: { rotulo: 'Equipo', ico: <IcoEquipo s={17} /> },
  otro: { rotulo: 'Otro', ico: <IcoPaquete s={17} /> },
}

export function FichaRecurso({
  ficha, hoy, economia, hrefCerrar, hrefPrecio, hrefEditar,
}: {
  ficha: Ficha
  hoy: string
  economia: boolean
  hrefCerrar: string
  /** Abre el panel de carga de precio. Ausente = sin permiso económico: la acción no se dibuja. */
  hrefPrecio?: string
  hrefEditar?: string
}) {
  const { recurso, historial, usos, variacion_6m } = ficha

  return (
    <CajaPanel ancho={PANEL.cartera} testid="ficha-recurso">
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hrefPrecio && (
            <BotonMarca href={hrefPrecio} testid="actualizar-precio">
              <IcoEditar s={14} /> Actualizar precio
            </BotonMarca>
          )}
          {hrefEditar && (
            <BotonIcono href={hrefEditar} title="Editar el recurso" testid="editar-recurso">
              <IcoEditar s={15} />
            </BotonIcono>
          )}
          <Link
            href={hrefCerrar}
            scroll={false}
            data-testid="cerrar-ficha-recurso"
            title="Cerrar"
            aria-label="Cerrar la ficha del recurso"
            style={{ marginLeft: 'auto', display: 'flex', color: C.tenue }}
          >
            <IcoCerrar s={15} />
          </Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <span style={{ display: 'flex', color: C.apagado, flexShrink: 0 }}>{RUBRO[recurso.tipo].ico}</span>
          <h2 style={{ fontSize: '15.5px', fontWeight: 600, color: C.tinta, lineHeight: 1.3, minWidth: 0, margin: 0 }}>
            {recurso.nombre}
          </h2>
        </div>
        <div style={{ fontSize: '11.5px', color: C.apagado, marginTop: 3 }}>
          {RUBRO[recurso.tipo].rotulo} · por {recurso.unidad}
          {recurso.familia ? ` · ${recurso.familia}` : ''}
          {recurso.desperdicio > 0 ? ` · desperdicio ${porcentaje(recurso.desperdicio, 0)}` : ''}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 16px' }}>
        {ficha.avisos.map((a) => (
          <div key={a} style={{ marginBottom: 12 }}><Aviso tono="warn">{a}</Aviso></div>
        ))}

        {economia ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Cifra
                rotulo="PRECIO ACTUAL"
                tam="16px"
                color={recurso.costo_base == null ? C.warn : C.tinta}
                pie={<span style={{ color: pieColor(recurso.fecha_precio, hoy) }}>{antiguedad(recurso.fecha_precio, hoy)}</span>}
                testid="precio-actual"
              >
                {/* «sin precio» y no $ 0: un cero afirmaría que el recurso no cuesta nada. */}
                {recurso.costo_base == null ? 'sin precio' : `$ ${numero(recurso.costo_base, 0)}`}
              </Cifra>
              <Cifra
                rotulo="VARIACIÓN 6 M"
                tam="16px"
                color={variacion_6m == null ? C.tenue : variacion_6m.fraccion > 0 ? C.warn : C.pos}
                // SIN UN PRECIO ANTERIOR NO HAY VARIACIÓN, Y NO ES 0 %: un 0 % afirmaría que el
                // precio no se movió en seis meses, cuando lo que pasa es que no hay con qué medirlo.
                pie={variacion_6m == null ? 'sin base' : `desde ${fechaCorta(variacion_6m.desde)}`}
                testid="variacion-6m"
              >
                {variacion_6m == null
                  ? '—'
                  : `${variacion_6m.fraccion > 0 ? '+' : ''}${porcentaje(variacion_6m.fraccion, 0)}`}
              </Cifra>
            </div>

            <Seccion titulo="Historial de precio" testid="historial-precio">
              {historial.length === 0 ? (
                <Linea>
                  Nunca se cargó un precio para este recurso. Se carga acá mismo, con «Actualizar precio».
                </Linea>
              ) : (
                historial.map((p, i) => (
                  <div key={`${p.fecha_precio}-${i}`} style={FILA_PANEL}>
                    {/* LA FECHA DE UNA FILA DE HISTORIAL NO LLEVA COLOR DE FRESCURA: sobre un precio
                        ya reemplazado, «vencido para cotizar» no significa nada. El vigente se
                        distingue por peso, que es lo único que cambia entre estas filas. */}
                    <span className="font-mono tabular-nums" style={{ fontSize: '11px', color: p.vigente ? C.tinta : C.tenue, width: 52, flexShrink: 0 }}>
                      {fechaCorta(p.fecha_precio) ?? 'sin fecha'}
                    </span>
                    <span className="font-mono tabular-nums" style={{ fontSize: '12px', color: C.tinta, minWidth: 0, flex: 1 }}>
                      {p.costo == null ? 'sin cargar' : `$ ${numero(p.costo, 0)}`}
                    </span>
                    <span
                      title={p.fuente ?? p.proveedor ?? undefined}
                      style={{ fontSize: '11px', color: C.apagado, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {p.fuente ?? p.proveedor ?? 'sin origen declarado'}
                    </span>
                    <span
                      className="font-mono tabular-nums"
                      style={{ fontSize: '11.5px', flexShrink: 0, color: p.variacion == null ? C.tenue : p.variacion > 0 ? C.warn : C.pos }}
                    >
                      {p.variacion == null ? 'base' : `${p.variacion > 0 ? '+' : ''}${porcentaje(p.variacion, 0)}`}
                    </span>
                  </div>
                ))
              )}
            </Seccion>
          </>
        ) : (
          <p style={{ fontSize: '12px', color: C.tenue, margin: 0 }} data-testid="recurso-sin-economia">
            El precio y su historial son económicos: no los ves. No están vacíos.
          </p>
        )}

        <Seccion titulo="Se usa en" testid="uso-recurso">
          {usos.length === 0 ? (
            <Linea>
              Ninguna tarea tipo vigente lo incluye: cambiar su precio hoy no mueve ningún presupuesto.
            </Linea>
          ) : (
            usos.map((u) => (
              <div key={`${u.tarea_tipo_id}-${u.codigo}`} style={FILA_PANEL}>
                <span className="font-mono" style={{ fontSize: '10.5px', color: C.tenue, flexShrink: 0 }}>{u.codigo}</span>
                <Link
                  href={`${RUTA_TAREAS}?t=${u.tarea_tipo_id}`}
                  prefetch={false}
                  style={{ fontSize: '12px', color: C.tinta, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {u.nombre}
                </Link>
                <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: C.tintaSuave, flexShrink: 0 }}>
                  {numero(u.cantidad, 2)} {recurso.unidad}/{u.unidad_tarea}
                </span>
              </div>
            ))
          )}
        </Seccion>

        {economia && usos.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <Aviso tono="warn" titulo="Actualizar afecta lo que se cotice desde ahora">
              {usos.length} {usos.length === 1 ? 'tarea tipo lo usa' : 'tareas tipo lo usan'} en su versión
              vigente. Los presupuestos ya congelados no cambian: guardan su propia copia de la composición.
            </Aviso>
          </div>
        )}
      </div>
    </CajaPanel>
  )
}

/** «hace N días» — la antigüedad es parte del precio, no un adorno de la fila. */
function antiguedad(fecha: string | null, hoy: string): string {
  if (!fecha) return 'nunca cargado'
  const d = diasEntre(fecha, hoy)
  if (Number.isNaN(d)) return 'sin fecha de carga'
  if (d <= 0) return 'cargado hoy'
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
}

function pieColor(fecha: string | null, hoy: string): string {
  if (!fecha) return C.warn
  const d = diasEntre(fecha, hoy)
  return Number.isNaN(d) || d > 180 ? C.warn : C.apagado
}
