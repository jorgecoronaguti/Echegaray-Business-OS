// EL CUADRO QUE VE EL DUEÑO — una corrida en catorce números (§38).
//
// ═══ POR QUÉ ES UN MÓDULO Y NO UN `console.log` EN UN SCRIPT ═══
//
// El cuadro se compara entre corridas y entre proyectos: Quattropani contra el caso ciego, hoy
// contra la semana que viene. Si cada script lo arma a su manera, dos cuadros del mismo motor no se
// pueden poner al lado. Acá se arma una vez y es puro, así que además se puede testear.
//
// ═══ LA REGLA QUE GOBIERNA CADA CELDA ═══
//
// **Ninguna celda se rellena para que quede linda.** Un contador que no se pudo calcular sale
// `s/d` y no `0`. La cobertura de una corrida sin partidas es `—`, no `100 %`. «78 % honesto >
// 100 % verde falso» no es una frase del programa: es lo que decide qué se imprime.

const pct = (x) => (x === null || x === undefined ? 's/d' : `${(Number(x) * 100).toFixed(1)} %`)
const num = (x) => (x === null || x === undefined ? 's/d' : Number(x).toLocaleString('es-AR'))
const plata = (x) => (x === null || x === undefined ? 'NO SE AFIRMA' : `$ ${Math.round(Number(x)).toLocaleString('es-AR')}`)

/**
 * EL CUADRO DE UNA CORRIDA. PURA.
 *
 * `corrida` es lo que devuelve `correr()`. `extra` trae lo que el motor no puede saber por sí mismo
 * —cuántos documentos tenía el proyecto en el corpus, cuánto tardó— y se pasa desde afuera en vez
 * de inventarse.
 */
export function cuadroDeCorrida(corrida, { nombre, documentosCorpus = null, conocimientos = null, msFrio = null, msTibio = null } = {}) {
  const m = corrida.metricas
  const cd = corrida.costoDirecto
  const partidasConCantidad = corrida.partidas.filter((p) => p.cantidad !== null && p.cantidad !== undefined).length
  const cobertura = corrida.partidas.length ? partidasConCantidad / corrida.partidas.length : null
  const conComposicion = corrida.costos.filter((c) => (c.lineas ?? []).length > 0).length

  return Object.freeze({
    nombre,
    filas: Object.freeze([
      ['documentos del corpus', num(documentosCorpus)],
      ['conocimientos leídos', num(conocimientos)],
      ['partidas', num(corrida.partidas.length)],
      ['· incluidas por alcance', num(corrida.partidas.filter((p) => p.alcance === 'INCLUIDO').length)],
      ['· excluidas por contrato', num(corrida.partidas.filter((p) => p.alcance === 'EXCLUIDO').length)],
      ['· sin decidir', num(corrida.partidas.filter((p) => p.alcance === 'POR_DEFINIR').length)],
      // El número que justifica el cruce doble. Sin publicarlo, la corrección de la vuelta 4 no
      // llega a ninguna pantalla y «excluidas por contrato: 0» sigue siendo lo único que se ve.
      ['plata excluida por contrato', corrida.etapas?.find((e) => e.etapa === 'SCOPE')?.result?.excluidoEnPlata
        ? plata(corrida.etapas.find((e) => e.etapa === 'SCOPE').result.excluidoEnPlata) : '$ 0'],
      ['· excluidas sin valorizar', num(corrida.etapas?.find((e) => e.etapa === 'SCOPE')?.result?.excluidasSinValorizar)],
      ['cantidades resueltas', `${num(partidasConCantidad)} / ${num(corrida.partidas.length)}`],
      ['cobertura de cómputo', cobertura === null ? '—' : pct(cobertura)],
      ['composiciones resueltas', `${num(conComposicion)} / ${num(corrida.costos.length)}`],
      ['recursos explotados', num(corrida.explosion?.nRecursos)],
      ['· sin precio', num(corrida.explosion?.nSinPrecio)],
      ['precios vigentes / vencidos / faltantes', `${num(m.precios_vigentes)} / ${num(m.precios_vencidos)} / ${num(m.precios_faltantes)}`],
      ['HH previstas', cd.hh === null ? `NO SE AFIRMA (${num(cd.nSinHh)} partida(s) sin HH)` : `${num(cd.hh)} h`],
      ['FALTA_DATO en la cola', num(m.no_bloqueantes === null ? null : corrida.cola.issues.filter((i) => i.type === 'FALTA_DATO').length)],
      ['CONFLICTO en la cola', num(m.conflictos)],
      ['bloqueantes', num(m.bloqueantes)],
      ['· sin impacto medido', num(corrida.cola.bloqueantesSinMedir)],
      ['preguntas dirigidas', num(m.preguntas_humanas)],
      ['plata en riesgo', corrida.cola.plataEnRiesgo === null ? 'no medida' : plata(corrida.cola.plataEnRiesgo)],
      ['COSTO DIRECTO', plata(cd.total)],
      ['· parcial (lo que sí cerró)', plata(cd.parcial)],
      ['reconciliación explosión ↔ costo', corrida.reconciliacion?.cuadra === null ? 'no comparable' : (corrida.reconciliacion?.cuadra ? `cuadra (residuo $${corrida.reconciliacion.residuo})` : `NO CUADRA ($${corrida.reconciliacion.residuo})`)],
      ['VENTA SIN IVA', plata(corrida.cascada.ventaSinIva)],
      ['coeficiente', corrida.cascada.coeficienteSinIva ?? 's/d'],
      ['margen sobre precio', corrida.cascada.margenSobrePrecioPct === null || corrida.cascada.margenSobrePrecioPct === undefined ? 's/d' : `${corrida.cascada.margenSobrePrecioPct} %`],
      ['llamadas al modelo', num(m.llamadas_llm)],
      ['CLAUDE AVOIDANCE RATE', m.claude_avoidance_rate === null ? '—' : pct(m.claude_avoidance_rate)],
      ['AUTONOMOUS RESOLUTION RATE', m.autonomous_resolution_rate === null ? '—' : pct(m.autonomous_resolution_rate)],
      ['incertidumbre NO declarada', num(m.incertidumbre_no_declarada)],
      ['latencia fría / tibia', msFrio === null ? 's/d' : `${Math.round(msFrio)} ms / ${msTibio === null ? 's/d' : `${Math.round(msTibio)} ms`}`],
      ['huella de entradas', corrida.huella.sha256.slice(0, 16)],
      ['ESTADO', corrida.gate.ready ? 'LISTO PARA OFERTAR' : `BLOQUEADO (${corrida.gate.blocking_issues.length})`],
    ]),
  })
}

/** El cuadro como tabla de Markdown. PURA. */
export function comoMarkdown(cuadros = []) {
  if (!cuadros.length) return ''
  const claves = cuadros[0].filas.map(([k]) => k)
  const cab = `| | ${cuadros.map((c) => c.nombre).join(' | ')} |`
  const sep = `|---|${cuadros.map(() => '---').join('|')}|`
  const filas = claves.map((k, i) => `| **${k}** | ${cuadros.map((c) => c.filas[i]?.[1] ?? '—').join(' | ')} |`)
  return [cab, sep, ...filas].join('\n')
}

/** Los bloqueos de una corrida, en castellano y ordenados. PURA. */
export const bloqueosLegibles = (corrida, limite = 12) =>
  corrida.gate.blocking_issues.slice(0, limite).map((b, i) => `${i + 1}. **${b.tipo}** · ${b.entidad} — ${String(b.detalle ?? '').slice(0, 200)}`)
