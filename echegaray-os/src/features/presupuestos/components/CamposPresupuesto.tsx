// LOS CAMPOS DEL PRESUPUESTO — alta y edición de cabecera comparten el mismo marcado.
//
// ═══ LOS PORCENTAJES SE PIDEN EN ESCALA 0–100 Y SE GUARDAN EN FRACCIÓN ═══
//
// Nadie escribe «0,27» cuando piensa «27 % de gastos generales». La conversión la hace la acción,
// una sola vez, y el campo dice `%` al lado para que no queden dudas de en qué escala está
// escribiendo. El factor financiero es la excepción y por eso NO lleva `%`: es una fracción de
// período (0,5 = medio período), no un porcentaje.
//
// ═══ LOS VALORES POR DEFECTO YA NO VIVEN ACÁ ═══
//
// Hasta la migración 4300, este archivo tenía `12 · 6 · 17 · 0 · 3,5` tipeados en una constante.
// Eran una DECISIÓN EMPRESARIAL viviendo en un componente de React: sin historial, invisibles para
// el chat, y editables por quien tocara el `.tsx`. Peor todavía, no eran los de la empresa — daban
// un coeficiente de 1,4287 contra el 1,682 del libro con el que se cotiza de verdad.
//
// Ahora llegan de `parametro_comercial` por props, leídos en el server component. Si no hubiera
// ninguno vigente, los campos nacen VACÍOS y se dice por qué: inventar un default acá sería volver
// exactamente al problema.

import { Campo, CTRL } from '@/shared/components/ui'
import type { ParametroComercial, PresupuestoCascada } from '../types'
import type { ObraDestino } from '../services/conversionService'

export interface ClienteOpcion { id: string; nombre: string }

/** La fracción de la base vuelve a escala 0–100 para el campo. `0,027` → `2,7`. */
const aCampo = (fraccion: number | null | undefined): string =>
  fraccion === null || fraccion === undefined
    ? ''
    : String(Math.round(fraccion * 1000000) / 10000).replace('.', ',')

/** El factor financiero NO es un porcentaje: se escribe tal cual, `0,5`. */
const aCampoFactor = (v: number | null | undefined): string =>
  v === null || v === undefined ? '' : String(v).replace('.', ',')

export function CamposPresupuesto({
  p,
  clientes,
  obras,
  parametro,
}: {
  p?: PresupuestoCascada
  clientes: ClienteOpcion[]
  obras: ObraDestino[]
  /** El vigente de `parametro_comercial`. `null` = no hay ninguno cargado, y se dice. */
  parametro: ParametroComercial | null
}) {
  // El presupuesto que ya existe manda sobre el parámetro: sus porcentajes son los que se ofertó.
  const de = (
    campo: 'pct_gastos_generales' | 'pct_beneficio' | 'pct_financiero' | 'pct_iibb'
      | 'pct_ganancias' | 'pct_cheque' | 'pct_iva',
  ): string => aCampo(p ? p[campo] : parametro?.[campo])
  const factor = aCampoFactor(p ? p.factor_financiero : parametro?.factor_financiero)

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
          La cascada comercial
        </legend>

        <input type="hidden" name="parametro_comercial_id" value={p?.parametro_comercial_id ?? parametro?.id ?? ''} />

        <div className="grid gap-3 sm:grid-cols-4">
          <Campo label="Gastos generales %">
            <input name="pct_gastos_generales" inputMode="decimal" defaultValue={de('pct_gastos_generales')}
              className={CTRL} data-testid="campo-gg" />
          </Campo>
          <Campo label="Beneficio %">
            <input name="pct_beneficio" inputMode="decimal" defaultValue={de('pct_beneficio')}
              className={CTRL} data-testid="campo-beneficio" />
          </Campo>
          <Campo label="Financiero %">
            <input name="pct_financiero" inputMode="decimal" defaultValue={de('pct_financiero')}
              className={CTRL} data-testid="campo-financiero" />
          </Campo>
          <Campo label="Factor financiero" ayuda="Qué fracción del período se financia. 0,5 = medio período.">
            <input name="factor_financiero" inputMode="decimal" defaultValue={factor}
              className={CTRL} data-testid="campo-factor-financiero" />
          </Campo>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Campo label="IIBB + Lote Hogar %">
            <input name="pct_iibb" inputMode="decimal" defaultValue={de('pct_iibb')}
              className={CTRL} data-testid="campo-iibb" />
          </Campo>
          <Campo label="Ganancias %">
            <input name="pct_ganancias" inputMode="decimal" defaultValue={de('pct_ganancias')}
              className={CTRL} data-testid="campo-ganancias" />
          </Campo>
          <Campo label="Impuesto al cheque %">
            <input name="pct_cheque" inputMode="decimal" defaultValue={de('pct_cheque')}
              className={CTRL} data-testid="campo-cheque" />
          </Campo>
          <Campo label="IVA %">
            <input name="pct_iva" inputMode="decimal" defaultValue={de('pct_iva')}
              className={CTRL} data-testid="campo-iva" />
          </Campo>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-faint" data-testid="nota-cascada">
          Gastos generales sobre el costo directo → costo industrial. Beneficio y financiero sobre el
          industrial. IIBB y Ganancias sobre industrial + beneficio. El impuesto al cheque sobre el
          subtotal, y el IVA sobre la venta. La cuenta la hace la base, no esta pantalla.
        </p>
        {parametro ? (
          <p className="mt-1 text-[11px] text-faint" data-testid="fuente-parametro">
            Vienen de los parámetros comerciales v{parametro.version} · {parametro.fuente}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-warn" data-testid="sin-parametro">
            No hay parámetros comerciales vigentes cargados: los campos nacen vacíos a propósito. Un
            valor por defecto inventado acá es lo que hacía que la empresa cotizara con un
            coeficiente de 1,43 en vez del 1,68 con el que cotiza de verdad.
          </p>
        )}
      </fieldset>
    </div>
  )
}
