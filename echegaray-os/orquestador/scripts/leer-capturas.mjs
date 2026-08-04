// LEE LAS CAPTURAS QUE BAJÓ `traer-capturas.mjs`, EN UN PROCESO APARTE.
//
// ═══ POR QUÉ APARTE, Y NO CON LA HERRAMIENTA DE LECTURA (04/08) ═══
//
// La API rechaza una request con imágenes si ALGUNA supera 2000 px de lado cuando van varias. Una
// conversación larga arrastra las imágenes viejas dentro de la misma request: basta una captura
// grande pegada horas antes para que TODA lectura posterior falle, aunque la nueva mida 469×109.
// Medido: seis capturas de 469 px rechazadas por el tamaño de otras que ya estaban en el contexto.
//
// Acá la imagen se manda en una request propia y limpia, y de vuelta viene TEXTO. El contexto no se
// ensucia y el límite deja de existir. La clave sale de `~/.config/echegaray-orq/anthropic.env` —la
// de `.env.local` está vencida—.
//
//   set -a && . ~/.config/echegaray-orq/anthropic.env && set +a
//   node orquestador/scripts/leer-capturas.mjs [directorio]
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const DIR = process.argv[2] || '/tmp/capturas-os'
const PROMPT = `Transcribí TODO lo que se ve en esta imagen, tal cual, sin interpretar ni resumir.
Si es una tabla, devolvela como tabla con todas sus filas y columnas.
Si hay fechas, montos, porcentajes de avance o nombres de obra, copialos exactos.
No agregues nada que no esté escrito.`

const archivos = (await readdir(DIR)).filter((f) => /\.(jpg|jpeg|png)$/i.test(f)).sort()
for (const f of archivos) {
  const data = (await readFile(join(DIR, f))).toString('base64')
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
        { type: 'text', text: PROMPT },
      ] }],
    }),
  })
  const j = await r.json()
  const txt = (j?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  console.log(`\n══════ ${f} ══════`)
  console.log(txt || JSON.stringify(j).slice(0, 300))
}
