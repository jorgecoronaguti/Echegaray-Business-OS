// LOS CAMPOS DEL PRESUPUESTO — alta y edición de cabecera comparten el mismo marcado.
//
// ═══ LOS PORCENTAJES SE PIDEN EN ESCALA 0–100 Y SE GUARDAN EN FRACCIÓN ═══
//
// Nadie escribe «0,12» cuando piensa «12 % de indirectos». La conversión la hace la acción, una
// sola vez, y el campo dice `%` al lado para que no queden dudas de en qué escala está escribiendo.
//
// ═══ LOS VALORES POR DEFECTO SON LOS DEL CONTRATO, Y SE PUEDEN CAMBIAR ═══
//
// 12 · 6 · 17 · 0 · 3,5 son los del mockup y los que la empresa viene usando. Se ofrecen como
// arranque para que un presupuesto nuevo no nazca con cero margen —que publicaría un precio igual
// al costo—, y quedan editables porque cada obra los negocia distinto.

import { Campo, CTRL } from '@/shared/components/ui'
import type { PresupuestoCascada } from '../types'
import type { ObraDestino } from '../services/conversionService'

export interface ClienteOpcion { id: string; nombre: string }

const POR_DEFECTO = { indirectos: 12, gastos_generales: 6, margen: 17, financiero: 0, impuestos: 3.5 }

/** La fracción de la base vuelve a escala 0–100 para el campo. `0,035` → `3,5`. */
const aCampo = (fraccion: number | undefined, defecto: number): string =>
  fraccion === undefined ? String(defecto).replace('.', ',') : String(Math.round(fraccion * 1000000) / 10000).replace('.', ',')

export function CamposPresupuesto({
  p,
  clientes,
  obras,
}: {
  p?: PresupuestoCascada
  clientes: ClienteOpcion[]
  obras: ObraDestino[]
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Objeto del presupuesto" ayuda="Qué se cotiza. Es lo que se lee en la cartera.">
          <input name="obra_nombre" defaultValue={p?.obra_nombre ?? ''} required maxLength={200}
            placeholder="Ampliación de pañol" className={CTRL} data-testid="campo-objeto" />
        </Campo>
        <Campo label="Cliente" ayuda="Elegí uno de la cartera, o escribí el nombre si todavía no está.">
          <select name="cliente_id" defaultValue={p?.cliente_id ?? ''} className={CTRL} data-testid="campo-cliente-id">
            <option value="">sin cliente de la cartera</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Nombre del cliente (texto)" ayuda="Lo que se muestra si no hay cliente de la cartera.">
          <input name="cliente" defaultValue={p?.cliente ?? ''} maxLength={200} className={CTRL} data-testid="campo-cliente" />
        </Campo>
        <Campo label="Obra" ayuda="Se vincula al adjudicar: es donde van a nacer las actividades.">
          <select name="obra_canonica_id" defaultValue={p?.obra_canonica_id ?? ''} className={CTRL} data-testid="campo-obra">
            <option value="">todavía sin obra</option>
            {obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
        </Campo>
      </div>

      <fieldset className="rounded-card border border-line px-3 py-2.5">
        <legend className="px-1 text-[10px] font-medium uppercase tracking-[0.06em] text-faint">
          La cascada, en porcentaje
        </legend>
        <div className="grid gap-3 sm:grid-cols-5">
          <Campo label="Indirectos %">
            <input name="pct_indirectos" inputMode="decimal" defaultValue={aCampo(p?.pct_indirectos, POR_DEFECTO.indirectos)} className={CTRL} data-testid="campo-indirectos" />
          </Campo>
          <Campo label="Gastos generales %">
            <input name="pct_gastos_generales" inputMode="decimal" defaultValue={aCampo(p?.pct_gastos_generales, POR_DEFECTO.gastos_generales)} className={CTRL} data-testid="campo-gg" />
          </Campo>
          <Campo label="Margen %">
            <input name="pct_margen" inputMode="decimal" defaultValue={aCampo(p?.pct_margen, POR_DEFECTO.margen)} className={CTRL} data-testid="campo-margen" />
          </Campo>
          <Campo label="Financiero %">
            <input name="pct_financiero" inputMode="decimal" defaultValue={aCampo(p?.pct_financiero, POR_DEFECTO.financiero)} className={CTRL} data-testid="campo-financiero" />
          </Campo>
          <Campo label="Impuestos %">
            <input name="pct_impuestos" inputMode="decimal" defaultValue={aCampo(p?.pct_impuestos, POR_DEFECTO.impuestos)} className={CTRL} data-testid="campo-impuestos" />
          </Campo>
        </div>
        <p className="mt-2 text-[11px] text-faint">
          Indirectos y gastos generales se aplican sobre el costo directo; margen y financiero sobre
          la suma de los tres; impuestos sobre todo lo anterior. La cuenta la hace la base, no esta
          pantalla.
        </p>
      </fieldset>
    </div>
  )
}
