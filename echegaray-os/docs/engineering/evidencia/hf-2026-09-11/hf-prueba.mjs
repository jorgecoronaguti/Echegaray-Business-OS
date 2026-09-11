// Prueba puntual contra el router de HF. NO usa el adapter del OS a propósito: el adapter registra
// trazas en Postgres y este experimento no puede escribir en Supabase.
import { readFileSync, writeFileSync } from 'node:fs'
const [,, modelo, promptPath, salida, imagen] = process.argv
const tk = readFileSync(`${process.env.HOME}/.config/echegaray/orquestador.env`,'utf8').match(/^ORQ_HF_TOKEN=(.+)$/m)[1].trim()
const texto = readFileSync(promptPath,'utf8')
const content = imagen
  ? [{ type:'text', text: texto }, { type:'image_url', image_url:{ url:`data:image/png;base64,${readFileSync(imagen).toString('base64')}` } }]
  : texto
const t0 = Date.now()
const res = await fetch('https://router.huggingface.co/v1/chat/completions', { method:'POST',
  headers:{ Authorization:`Bearer ${tk}`, 'Content-Type':'application/json' },
  body: JSON.stringify({ model: modelo, messages:[{ role:'user', content }], max_tokens: Number(process.env.MAXTOK || 2500), temperature: 0.2 }) })
const ms = Date.now() - t0
const j = await res.json().catch(()=>({}))
const msg = j.choices?.[0]?.message ?? {}; const out = (msg.content || "") + (msg.reasoning_content ? `\n\n[reasoning_content · ${msg.reasoning_content.length} chars]\n${msg.reasoning_content.slice(0,3000)}` : "") || JSON.stringify(j).slice(0,800)
const meta = { modelo, status: res.status, ms, usage: j.usage ?? null, costo: res.headers.get('x-inference-cost'), provider: res.headers.get('x-inference-provider') }
writeFileSync(salida, `${JSON.stringify(meta)}\n\n${out}\n`)
console.log(JSON.stringify(meta))
