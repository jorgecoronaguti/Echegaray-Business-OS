---
paths:
  - "orquestador/**/*.test.mjs"
  - "src/**/*.test.ts"
  - "src/**/*.test.tsx"
---

# Tests

El test es la evidencia de cierre de este repo. Se escribe para que falle por la razón correcta.

## Reglas

- **Primero el test que falla.** Un test escrito después de la corrección prueba que el código hace
  lo que hace, no lo que debe.
- **Contra el español real del dueño**, no contra español de manual: escribe `q` por "que", `cdo`
  por "cuando", sin acentos y con typos. Un parser probado con frases limpias acierta en el test y
  falla en la conversación.
- **Un test que se autolimpia** o no es un test: los que tocan datos autenticados dejan el mundo
  como lo encontraron.
- **No editar un test para que pase.** Si el test estaba bien, el defecto está en el código. Si
  estaba mal, se corrige explicándolo en el commit — es un cambio de contrato, no un ajuste.

## Lo que un test tiene que poder detectar

Que el número esté mal, no sólo que el proceso no tire excepción. Un control que se compara contra
la misma información que produce no es un control. Si el test lee el valor del mismo lugar donde lo
escribió, no está verificando nada.

## Correrlos

```
npm run orq:test                    # los 216 archivos, ~37 s
node --test <archivo>.test.mjs      # uno solo, mientras se itera
```
