'use client'

// AGREGAR UNA PARTIDA AL PRESUPUESTO.
//
// ═══ LA TAREA TIPO Y EL ANÁLISIS VIAJAN JUNTOS ═══
//
// Elegir una tarea de la base maestra completa cuatro cosas de un saque: el código, la descripción,
// la unidad y el análisis vigente. Guardar el análisis SIN la tarea tipo dejaría a la partida sin
// el vínculo que después usa la conversión para sembrar el `tarea_tipo_id` de cada actividad — y
// sin eso, el rendimiento real que se mida en obra no vuelve nunca a la base maestra.
//
// ═══ UNA PARTIDA SIN ANÁLISIS SE CARGA IGUAL ═══
//
// Es deuda de carga declarada, no un error: la partida existe, se computa, se convierte, y queda
// marcada «sin análisis» hasta que alguien la complete. Obligar a elegir un análisis haría que la
// gente inventara uno parecido con tal de poder seguir, que es infinitamente peor.

import { useState } from 'react'
import { Campo, CTRL, FormAccion } from '@/shared/components/ui'
import { Aviso } from '@/shared/components/ds'
import type { OpcionTarea } from '../services/presupuestosService'
import { crearPartida } from '../services/actionsPartida'
import { rendimiento } from '../services/formato'

export function AltaPartida({
  cotizacionId,
  tareas,
  rubros,
}: {
  cotizacionId: string
  tareas: OpcionTarea[]
  /** Los rubros que el presupuesto ya tiene: escribir uno nuevo crea el grupo, elegir uno lo reusa. */
  rubros: string[]
}) {
  const [tareaId, setTareaId] = useState('')
  const elegida = tareas.find((t) => t.tarea_tipo_id === tareaId)
  const [subcontratada, setSubcontratada] = useState(false)

  return (
    <div data-testid="alta-partida">
      <h2 className="mb-3 text-[16px] font-semibold leading-tight text-ink">Nueva partida</h2>

      {tareas.length === 0 && (
        <div className="mb-3">
          <Aviso tono="warn" titulo="La base maestra no tiene análisis vigentes">
            La partida se puede cargar igual: queda marcada «sin análisis», sin costo unitario y sin
            HH. No vale $ 0 — vale lo que todavía no se cargó.
          </Aviso>
        </div>
      )}

      <FormAccion
        accion={async (form) => {
          const r = await crearPartida({ error: null }, form)
          return r.error ? { ok: false as const, error: r.error } : { ok: true as const }
        }}
        testid="form-partida"
        enviar="Agregar partida"
        limpiarAlOk
        mensajeOk="Partida agregada."
      >
        <input type="hidden" name="cotizacion_id" value={cotizacionId} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Tarea de la base maestra" ayuda="Trae código, unidad, rendimiento y análisis vigente.">
            <select
              name="tarea_tipo_id"
              value={tareaId}
              onChange={(e) => setTareaId(e.target.value)}
              className={CTRL}
              data-testid="campo-tarea-tipo"
            >
              <option value="">sin análisis (se carga después)</option>
              {tareas.map((t) => (
                <option key={t.tarea_tipo_id} value={t.tarea_tipo_id}>
                  {t.codigo} · {t.nombre} ({t.unidad})
                </option>
              ))}
            </select>
          </Campo>
          {/* El análisis viaja escondido y atado a la tarea: nunca uno sin la otra. */}
          <input type="hidden" name="analisis_id" value={elegida?.analisis_id ?? ''} />

          <Campo label="Rubro" ayuda="Agrupa las partidas en la tabla. Vacío queda en «Sin rubro».">
            <input name="rubro" list="rubros-del-presupuesto" maxLength={120} className={CTRL}
              placeholder="Fundaciones" data-testid="campo-rubro" />
            <datalist id="rubros-del-presupuesto">
              {rubros.map((r) => <option key={r} value={r} />)}
            </datalist>
          </Campo>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Campo label="Código">
            <input name="codigo" defaultValue={elegida?.codigo ?? ''} key={`c-${tareaId}`} maxLength={40}
              className={CTRL} placeholder="T1009" data-testid="campo-codigo" />
          </Campo>
          <Campo label="Descripción" ancho="sm:col-span-2">
            <input name="descripcion" defaultValue={elegida?.nombre ?? ''} key={`d-${tareaId}`} required
              minLength={2} className={CTRL} placeholder="Columna de encadenado H17" data-testid="campo-descripcion" />
          </Campo>
          <Campo label="Unidad">
            <input name="unidad" defaultValue={elegida?.unidad ?? ''} key={`u-${tareaId}`} maxLength={20}
              className={CTRL} placeholder="m³" data-testid="campo-unidad" />
          </Campo>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Campo label="Cantidad (cómputo)" ayuda="Vacío es «sin cargar», no cero.">
            <input name="cantidad" inputMode="decimal" className={CTRL} placeholder="2,16" data-testid="campo-cantidad" />
          </Campo>
          <label className="flex items-end gap-2 pb-2 text-[12.5px] text-ink-soft">
            <input type="checkbox" name="subcontratada" checked={subcontratada}
              onChange={(e) => setSubcontratada(e.target.checked)} data-testid="campo-subcontratada" />
            Es un paquete subcontratado
          </label>
          {subcontratada && (
            <Campo label="Precio del subcontrato" ayuda="El precio pactado del paquete completo.">
              <input name="precio_subcontrato" inputMode="decimal" className={CTRL} data-testid="campo-precio-subcontrato" />
            </Campo>
          )}
        </div>

        {elegida && (
          <p className="mt-2 text-[11.5px] text-faint" data-testid="pista-analisis">
            Del análisis: {rendimiento(elegida.hs_unitarias) ?? 'sin rendimiento cargado'}
            {elegida.hs_unitarias !== null && ` hs/${elegida.unidad}`} · el costo unitario sale de la
            base maestra y se congela cuando el presupuesto salga.
          </p>
        )}
        {subcontratada && (
          <p className="mt-2 text-[11.5px] text-warn" data-testid="aviso-subcontrato">
            Un paquete subcontratado NO suma su precio al costo directo: el modelo valoriza la
            partida por su análisis y una subcontratada no tiene. Queda registrada y visible, pero
            la cascada no la incluye.
          </p>
        )}
      </FormAccion>
    </div>
  )
}
