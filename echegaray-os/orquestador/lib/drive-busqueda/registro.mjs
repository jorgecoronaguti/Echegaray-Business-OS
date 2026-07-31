// EL RASTRO: qué se buscó, qué se propuso, qué confirmó la persona y qué se aprendió de eso.
//
// El ranking anterior era bueno y opaco. Elegía bien casi siempre, y el día que eligiera mal
// no había con qué reconstruir por qué: lo único guardado era un contador de aceptaciones sin
// contexto. "El buscador anda bien" era una impresión, no un dato.
//
// ── LA REGLA QUE ORDENA TODO ESTE ARCHIVO ────────────────────────────────────────────
//
// PROPONER NO ES APRENDER. El OS registra siempre lo que hizo; aprende sólo cuando una persona
// confirmó. Antes, un resultado "dominante" se anotaba solo como si alguien lo hubiera elegido:
// eso es fabricar una preferencia y después reforzarla con su propio eco. Una búsqueda que
// nadie confirmó queda en el registro como lo que es —una propuesta sin respuesta— y no mueve
// un solo peso del ranking.
//
// Cero modelo, como el resto del buscador: son consultas SQL y aritmética.

import { tokenizar } from './normalizar.mjs'

/** Cuántos candidatos se guardan por búsqueda. Los de más abajo no explican nada y engordan
 *  la tabla: con los cinco que se le mostraron a la persona alcanza para auditar. */
const MAX_CANDIDATOS = 5

/** Qué hace falta para que el OS convierta una costumbre en un alias. */
export const PROMOCION = Object.freeze({
  MIN_CONFIRMACIONES: 3,   // menos que esto es una casualidad, no una costumbre
  DOMINANCIA: 0.8,         // si las confirmaciones se reparten, el alias es ambiguo: no va
})

const seguro = async (fn, alFallar = false) => {
  try { return await fn() } catch { return alFallar }
}

/** Un candidato del ranking → lo que se guarda de él. El desglose de señales viaja entero:
 *  es lo único que después permite contestar "¿por qué ganó éste?". */
const aCandidato = (e) => ({
  id: e.drive_file_id,
  name: e.name,
  score: e.score,
  texto: e.texto,
  senales: e.senales ?? {},
  rescatado: Boolean(e.rescatado),
})

/**
 * Deja constancia de una búsqueda. Devuelve el id del evento, que es con lo que después se
 * confirma, se rechaza o se explica.
 *
 * Nunca tira: que falle el registro no puede romper una búsqueda que salió bien.
 */
export async function registrarBusqueda(port, { usuario = '', canal = 'desconocido', resultado } = {}) {
  if (!port?.query || !resultado?.consulta) return null
  const { consulta } = resultado
  return seguro(async () => {
    const { rows } = await port.query(
      `insert into public.drive_busqueda_evento
         (usuario, canal, consulta, consulta_norm, tokens, tipo_pedido, etapa, confianza,
          elegido, candidatos, evaluados, ms)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12) returning id`,
      [
        usuario ?? '', canal ?? 'desconocido', consulta.original ?? '', consulta.norm ?? '',
        consulta.tokens ?? [], consulta.tipo ?? null, resultado.etapa ?? null,
        resultado.confianza ?? 'baja', resultado.ganador?.drive_file_id ?? null,
        JSON.stringify((resultado.opciones ?? []).slice(0, MAX_CANDIDATOS).map(aCandidato)),
        resultado.evaluados ?? 0, Math.round(resultado.ms ?? 0),
      ],
    )
    return rows?.[0]?.id ?? null
  }, null)
}

/** El evento, con sus candidatos. Es lo que lee la auditoría y lo que necesita el feedback. */
export async function leerEvento(port, id) {
  if (!port?.query || !id) return null
  return seguro(async () => {
    const { rows } = await port.query(
      `select id, creado_at, usuario, canal, consulta, consulta_norm, etapa, confianza,
              elegido, confirmado, confirmado_at, rechazado_at, candidatos, evaluados, ms
         from public.drive_busqueda_evento where id = $1`,
      [id],
    )
    return rows?.[0] ?? null
  }, null)
}

/** La última búsqueda de una persona. Sirve para contestar "¿por qué ese?" sin pedir un id. */
export async function ultimoEvento(port, usuario) {
  if (!port?.query) return null
  return seguro(async () => {
    const { rows } = await port.query(
      `select id, consulta, consulta_norm, elegido, candidatos, confianza, etapa
         from public.drive_busqueda_evento
        where usuario = $1 order by creado_at desc limit 1`,
      [usuario ?? ''],
    )
    return rows?.[0] ?? null
  }, null)
}

/** Marca que la persona confirmó un documento para esa búsqueda. */
export async function marcarConfirmado(port, eventoId, driveFileId) {
  if (!port?.query || !eventoId) return false
  return seguro(async () => {
    await port.query(
      `update public.drive_busqueda_evento
          set confirmado = $2, confirmado_at = now(), rechazado_at = null
        where id = $1`,
      [eventoId, driveFileId ?? null],
    )
    return true
  })
}

/** Marca que la persona dijo que no era ese. No elige otro: sólo deja dicho que ese, no. */
export async function marcarRechazado(port, eventoId) {
  if (!port?.query || !eventoId) return false
  return seguro(async () => {
    await port.query(
      'update public.drive_busqueda_evento set rechazado_at = now() where id = $1',
      [eventoId],
    )
    return true
  })
}

// ── El motor de alias ────────────────────────────────────────────────────────

/**
 * ¿Esta consulta ya se ganó el derecho a ser un alias?
 *
 * Mira las confirmaciones REALES de esa consulta —no las propuestas— y promueve sólo si hay
 * suficientes y apuntan casi todas al mismo lado. Devuelve siempre el motivo, también cuando
 * NO promueve: "no alcanza la evidencia" y "está repartido entre dos documentos" son cosas
 * distintas y la segunda es la que hay que poder mirar.
 *
 * Un alias ambiguo es peor que no tener alias: hace que el buscador se equivoque con
 * seguridad. Por eso, si una consulta que ya era alias se vuelve ambigua, el alias se borra.
 */
export async function promoverAlias(port, aliasNorm) {
  if (!port?.query || !aliasNorm) return { promovido: false, motivo: 'sin_consulta' }
  return seguro(async () => {
    const { rows } = await port.query(
      `select confirmado as id, count(*)::int as veces,
              count(distinct usuario) filter (where usuario <> '')::int as usuarios
         from public.drive_busqueda_evento
        where consulta_norm = $1 and confirmado is not null
        group by confirmado order by veces desc`,
      [aliasNorm],
    )
    if (!rows?.length) return { promovido: false, motivo: 'sin_confirmaciones' }

    const total = rows.reduce((a, r) => a + r.veces, 0)
    const [mejor] = rows
    const confianza = mejor.veces / total
    if (total < PROMOCION.MIN_CONFIRMACIONES) {
      return { promovido: false, motivo: 'evidencia_insuficiente', total, confianza }
    }
    if (confianza < PROMOCION.DOMINANCIA) {
      await port.query(
        "delete from public.drive_alias_documento where alias_norm = $1 and origen = 'aprendido'",
        [aliasNorm],
      )
      return { promovido: false, motivo: 'ambiguo', total, confianza, candidatos: rows.length }
    }

    // `origen = 'manual'` no se pisa nunca: si una persona cargó el alias a mano, su decisión
    // le gana a la estadística.
    await port.query(
      `insert into public.drive_alias_documento
         (alias_norm, drive_file_id, confianza, origen, usos, usuarios, actualizado_at)
       values ($1, $2, $3, 'aprendido', $4, $5, now())
       on conflict (alias_norm) do update set
         drive_file_id = excluded.drive_file_id, confianza = excluded.confianza,
         usos = excluded.usos, usuarios = excluded.usuarios, actualizado_at = now()
       where public.drive_alias_documento.origen = 'aprendido'`,
      [aliasNorm, mejor.id, Number(confianza.toFixed(3)), total, mejor.usuarios],
    )
    return { promovido: true, motivo: 'evidencia_suficiente', documento: mejor.id, total, confianza }
  }, { promovido: false, motivo: 'error' })
}

/** Carga un alias a mano. Es la puerta para que una persona corrija al OS de una vez, sin
 *  esperar a juntar tres confirmaciones. Queda con `origen = 'manual'`, que no se pisa solo. */
export async function definirAlias(port, { alias, driveFileId } = {}) {
  if (!port?.query || !alias || !driveFileId) return false
  const norm = tokenizar(alias).join(' ')
  if (!norm) return false
  return seguro(async () => {
    await port.query(
      `insert into public.drive_alias_documento
         (alias_norm, drive_file_id, confianza, origen, usos, usuarios, actualizado_at)
       values ($1, $2, 1, 'manual', 0, 0, now())
       on conflict (alias_norm) do update set
         drive_file_id = excluded.drive_file_id, confianza = 1, origen = 'manual',
         actualizado_at = now()`,
      [norm, driveFileId],
    )
    return true
  })
}
