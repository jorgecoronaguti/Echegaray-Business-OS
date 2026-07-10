// Parser de archivos .env (formato de `vercel env pull`) para los scripts de la
// VM. Funciones puras (sin side effects, sin leer process.env) para poder
// testearlas sin exponer secretos: ver scripts/lib/env-file.test.mjs.
//
// Regla de diseño: las variables reales del entorno SIEMPRE tienen prioridad;
// el archivo solo cubre las que falten (loadEnvLocalInto no pisa claves ya
// presentes en el objeto destino).

import { existsSync, readFileSync } from 'fs'

// Interpreta el valor crudo de la derecha de un `=`:
//  - quita espacios de los extremos;
//  - si está entre comillas simples o dobles balanceadas, saca las comillas;
//  - en comillas dobles, desescapa \n \r \t \" \\ (como las genera Vercel);
//  - en comillas simples, se toma el contenido literal (sin desescapar);
//  - sin comillas, devuelve el token ya trimmeado.
export function parseEnvValue(raw) {
  const v = raw.trim()
  if (v.length >= 2) {
    const q = v[0]
    if ((q === '"' || q === "'") && v[v.length - 1] === q) {
      const inner = v.slice(1, -1)
      if (q === '"') {
        return inner.replace(/\\([nrt"\\])/g, (_, c) =>
          c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c,
        )
      }
      return inner
    }
  }
  return v
}

// Parsea el texto completo de un .env a un objeto { clave: valor }.
//  - ignora líneas vacías y comentarios (que empiezan con #);
//  - divide únicamente por el PRIMER '=' (no rompe valores que contienen '=');
//  - trimmea la clave; el valor pasa por parseEnvValue.
export function parseEnvFile(text) {
  const out = {}
  for (const linea of text.split('\n')) {
    const l = linea.trim()
    if (!l || l.startsWith('#')) continue
    const eq = l.indexOf('=')
    if (eq === -1) continue
    const clave = l.slice(0, eq).trim()
    if (!clave) continue
    out[clave] = parseEnvValue(l.slice(eq + 1))
  }
  return out
}

// Aplica el .env de `filePath` sobre `env` (típicamente process.env) SIN pisar
// las claves que ya existen: el entorno real manda, el archivo solo completa.
// Si el archivo no existe, no hace nada.
export function loadEnvLocalInto(env, filePath) {
  if (!existsSync(filePath)) return
  const parsed = parseEnvFile(readFileSync(filePath, 'utf8'))
  for (const [clave, valor] of Object.entries(parsed)) {
    if (!(clave in env)) env[clave] = valor
  }
}
