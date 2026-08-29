// DE LAS FILAS DE POSTGRES A LA FORMA QUE EL COTIZADOR ENTIENDE. PURO — no toca la base.
//
// ═══ POR QUÉ ESTE ARCHIVO ES PROVISORIO, Y POR QUÉ NO SE ESCONDE ═══
//
// El CORE está construyendo sus adaptadores de Postgres en paralelo. Mientras tanto la pantalla
// necesita el estado del presupuesto en la forma del contrato, y la única fuente real es la que el
// módulo ya lee hoy: `cotizacion_cascada` y `cotizacion_partida_valorizada`. Esto traduce, y NADA
// más: no recalcula un solo número, no completa ningún hueco y no inventa un issue que las filas no
// respalden.
//
// Cuando el CORE entregue sus adaptadores, este archivo se borra y la server action importa los
// suyos. La costura es una sola función —`estadoDesdeFilas`— a propósito: es lo que hay que cambiar
// de lugar, no una capa repartida por seis componentes.
//
// ═══ LA COLA QUE SE ARMA ACÁ ES PARCIAL, Y LO DICE ═══
//
// `orquestador.correr()` deriva la cola de las once etapas, que necesitan documentos, elementos y
// composiciones — el pipeline de plano, que es otro frente. Acá sólo se pueden ver los huecos que
// las FILAS delatan: cantidad ausente, subcontrato sin precio, partida sin análisis. Son reales
// todos, pero no son todos los que hay. `parcial: true` viaja en el resultado para que la pantalla
// pueda decir «esto es lo que se ve desde la base», que no es lo mismo que «esto es todo».

import { ESTADO, SEVERIDAD, TIPO_ISSUE, issue } from './contrato.mjs'
import { colaDeAtencion } from './atencion.mjs'
import { gateDeCongelado } from './freeze.mjs'

/** Los ocho de la cascada, de `snake_case` de Postgres al `camelCase` del motor. PURA. */
export function politicaDesdeFila(p) {
  if (!p) return null
  const n = (v) => (v === null || v === undefined ? null : Number(v))
  return Object.freeze({
    pctGastosGenerales: n(p.pct_gastos_generales), pctBeneficio: n(p.pct_beneficio),
    pctFinanciero: n(p.pct_financiero), factorFinanciero: n(p.factor_financiero),
    pctIibb: n(p.pct_iibb), pctGanancias: n(p.pct_ganancias),
    pctCheque: n(p.pct_cheque), pctIva: n(p.pct_iva),
    version: p.version ?? null, origen: 'cotizacion_cascada', fuente: `presupuesto ${p.numero ?? p.id}`,
  })
}

/**
 * LA CASCADA YA CALCULADA, con el nombre que el gate espera. PURA.
 *
 * `venta_sin_iva` sale de la vista y puede ser `null` —sin partidas, o sin costo afirmable—. Se
 * propaga tal cual: el gate trata ese `null` como «no hay número que fijar» y se niega a congelar,
 * que es lo correcto. Convertirlo en 0 acá haría que un presupuesto vacío se congelara en cero.
 */
export function cascadaDesdeFila(p) {
  if (!p) return null
  const n = (v) => (v === null || v === undefined ? null : Number(v))
  return Object.freeze({
    estado: p.venta_sin_iva === null || p.venta_sin_iva === undefined ? ESTADO.FALTA_DATO : ESTADO.CALCULADO,
    costoDirecto: n(p.costo_directo), ventaSinIva: n(p.venta_sin_iva),
    ventaFinal: n(p.venta_final), iva: n(p.iva),
    coeficienteSinIva: n(p.coeficiente_sin_iva),
    porQue: p.venta_sin_iva === null || p.venta_sin_iva === undefined
      ? 'la vista no devolvió precio de venta: el presupuesto no tiene partidas valorizadas'
      : null,
  })
}

/** Una fila de `cotizacion_partida_valorizada` con la forma que lee `comandos.validar()`. PURA. */
export function partidaDesdeFila(f) {
  const n = (v) => (v === null || v === undefined ? null : Number(v))
  return Object.freeze({
    id: f.partida_id,
    codigo: f.codigo ?? null,
    descripcion: f.descripcion ?? '',
    rubro: f.rubro ?? null,
    unidad: f.unidad ?? null,
    cantidad: n(f.cantidad),
    costoUnitario: n(f.costo_unitario),
    subtotal: n(f.subtotal),
    hh: n(f.hh),
    tareaTipoId: f.tarea_tipo_id ?? null,
    subcontratada: Boolean(f.subcontratada),
    subcontrato: f.subcontratada ? { precio: n(f.precio_subcontrato), proveedor: null } : null,
    sinAnalisis: Boolean(f.sin_analisis),
    congelada: Boolean(f.congelada),
    // El ALCANCE todavía no vive en `cotizacion_partida`: la tabla del §5 la creó la migración del
    // CORE (20260829T1200) y el módulo web no la escribe aún. `null` es honesto —«no se declaró»—
    // y distinto de INCLUIDO, que sería afirmar una decisión que nadie tomó.
    alcance: null,
    evidencia: null,
    genealogia: null,
  })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LOS HUECOS QUE LAS FILAS DELATAN
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * LOS ISSUES QUE SE PUEDEN VER DESDE LA BASE. PURA.
 *
 * Cada uno sale de una fila y de una columna concreta. Ninguno se infiere.
 *
 * El `impact` es plata o `null`, NUNCA cero (§22). Una partida sin cantidad no tiene subtotal, así
 * que su impacto es desconocido — y `esMaterial()` trata lo desconocido como material, que es la
 * dirección segura: la forma de dejar de bloquear por un hueco es medirlo, no ignorarlo.
 */
export function issuesDePartidas(partidas = []) {
  const out = []
  for (const p of partidas) {
    const quien = p.codigo ?? p.descripcion ?? p.id

    if (p.cantidad === null) {
      out.push(issue({
        type: TIPO_ISSUE.CANTIDAD_CRITICA_AUSENTE, severity: SEVERIDAD.BLOQUEANTE, entity: quien,
        impact: null, recommended_action: 'update_quantity',
        detalle: `«${p.descripcion}» no tiene cantidad computada: sin cantidad no hay costo, y su hueco no se puede medir`,
      }))
    }

    if (p.subcontratada && (p.subcontrato?.precio === null || p.subcontrato?.precio === undefined)) {
      out.push(issue({
        type: TIPO_ISSUE.SUBCONTRATO_SIN_PRECIO, severity: SEVERIDAD.BLOQUEANTE, entity: quien,
        impact: null, recommended_action: 'set_subcontract',
        detalle: `«${p.descripcion}» está marcada subcontratada y no tiene precio contratado. SIN_PRECIO no es $0 (§14)`,
      }))
    }

    // Una partida SIN análisis y SIN subcontrato no aporta costo y nadie lo nota: entra al total
    // sumando cero. Es el defecto que `sumable()` del contrato existe para impedir.
    if (!p.subcontratada && p.sinAnalisis) {
      out.push(issue({
        type: TIPO_ISSUE.SIN_PRECIO, severity: SEVERIDAD.ALTA, entity: quien,
        impact: null, recommended_action: 'set_resource_price',
        detalle: `«${p.descripcion}» no tiene composición cargada: hoy aporta cero al costo directo sin decirlo`,
      }))
    }
  }
  return out
}

/**
 * EL ESTADO DEL PRESUPUESTO, COMO LO ESPERA EL COMMAND LAYER. PURA.
 *
 * @returns `{partidas, politica, cascada, cola, gate, costoConocido, parcial}`
 */
export function estadoDesdeFilas({ presupuesto, partidas = [] } = {}) {
  const lista = partidas.map(partidaDesdeFila)
  const cascada = cascadaDesdeFila(presupuesto)
  // El costo conocido es la escala contra la que se mide «material». Se usa el costo directo de la
  // vista, que es lo que HOY suma; si es null, `esMaterial()` trata todo como material.
  const costoConocido = cascada?.costoDirecto ?? null
  const cola = colaDeAtencion({ issues: issuesDePartidas(lista), costoConocido })
  return Object.freeze({
    partidas: lista,
    politica: politicaDesdeFila(presupuesto),
    cascada,
    cola,
    gate: gateDeCongelado({ cascada, cola }),
    costoConocido,
    // Ver el encabezado: la cola derivada de las filas no es la cola de las once etapas.
    parcial: true,
  })
}
