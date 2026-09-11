---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/uploader.tsx","src/app/datos-form.tsx","src/app/chat.tsx","src/app/lista-registros.tsx"]
---

# Superficie: la aplicación de Extracto (`/`)

Ámbito: la única página del producto — subir, revisar, confirmar, archivo y preguntas.
Modo del visitante: **Operate**. El visitante viene a corregir lo que el modelo leyó y
a dejarlo guardado; la expresión nunca puede estorbar a esa tarea.

Audiencia: desarrolladores y clientes evaluando la demo (dos minutos, documento
propio), y el archivador que revisa sus facturas. Contenido real: documentos españoles
con NIF/CIF, IVA y euros; nada de clientes, métricas ni precios inventados.

## Direction contract

THESIS: el estándar de la categoría ejecutado a plena fidelidad, elegido por el usuario
frente a tres mundos de autor. Rechaza la novedad visual: la vara es Stripe · Mercury ·
Ramp.

OWN-WORLD: superficies blancas sobre #F7F8FA, texto slate #0F172A, etiquetas #64748B,
filetes #E2E8F0; índigo #4F46E5 sólo en la acción primaria, ámbar #B45309 sólo en un
campo que reclama atención, verde #047857 sólo en lo confirmado. Cifras tabulares
siempre. Radios 8px, sombras casi imperceptibles.

STORY: veo mi documento a tamaño de lectura, entiendo en un vistazo qué campo no cuadra
y por qué, lo corrijo, lo confirmo, y le pregunto al archivo sin cambiar de pantalla.

FIRST VIEWPORT: barra fina con el nombre y las fichas de documento; debajo, división al
50% — documento a la izquierda con su toolbar, inspector de campos por secciones a la
derecha, el campo en conflicto con filete ámbar y su explicación literal; abajo, barra
de pregunta persistente con la última respuesta y su cita.

FORM: comp-c, tercera de tres composiciones, mundo canon; semilla e83ae0d3.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Sin resolver

- Comportamiento del archivo guardado: la composición aprobada lo relega; se resuelve
  en la construcción como vista conmutable desde la barra superior.
