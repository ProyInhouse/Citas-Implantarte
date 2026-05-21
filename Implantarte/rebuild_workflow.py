import json, sys, re


path = 'C:/Users/User/DemoclinicaDental/workflows/flujo-completo.json'
with open(path, 'r', encoding='utf-8') as f:
    raw = f.read()

def extract_code(node_id):
    pat = node_id + r'".*?"jsCode": "(.*?)"(?=\s*\n\s*\})'
    m = re.search(pat, raw, re.DOTALL)
    if m:
        return json.loads('"' + m.group(1) + '"')
    return None

session_manager_code = extract_code('"node-session"')
verificar_code       = extract_code('"node-check-slots"')

preparar_code = (
    "// Prepara datos del evento y persiste sesion en staticData\n"
    "// para que Respuesta Confirmacion la recupere aunque Google Calendar\n"
    "// reemplace el output con solo los datos del evento creado.\n\n"
    "const input = $input.first().json;\n"
    "const session = input.session;\n"
    "const odontologo = session.odontologo;\n"
    "const slot = session.slot_confirmado;\n\n"
    "if (!slot || !odontologo) {\n"
    "  return [{ json: { ...input, error: 'Datos incompletos', respuesta: 'Error al crear la cita. Escribe hola para reiniciar.' } }];\n"
    "}\n\n"
    "const staticData = $getWorkflowStaticData('global');\n"
    "staticData.pendingConfirmation = {\n"
    "  telefono: input.telefono,\n"
    "  session: session\n"
    "};\n\n"
    "const inicio = new Date(slot.inicio);\n"
    "const fin    = new Date(slot.fin);\n\n"
    "const titulo      = 'Cita ' + odontologo.especialidad + ' - WhatsApp ' + input.telefono;\n"
    "const descripcion = 'Paciente: ' + input.telefono + '\\nServicio: ' + (session.servicio || '') + '\\nCanal: WhatsApp\\nAgendado: DentiFlow / Implantarte';\n\n"
    "return [{ json: {\n"
    "  ...input,\n"
    "  evento: {\n"
    "    titulo,\n"
    "    descripcion,\n"
    "    inicio: inicio.toISOString(),\n"
    "    fin:    fin.toISOString(),\n"
    "    calendar_id: odontologo.calendar_id || 'primary'\n"
    "  }\n"
    "}}];"
)

confirm_code = (
    "// Lee la sesion desde staticData: sobrevive al output de Google Calendar\n"
    "// que reemplaza todos los campos del input con los datos del evento.\n"
    "const staticData = $getWorkflowStaticData('global');\n"
    "const pending  = staticData.pendingConfirmation || {};\n"
    "const telefono = pending.telefono || $input.first().json.telefono || 'desconocido';\n"
    "const session  = pending.session  || $input.first().json.session  || {};\n\n"
    "const odontologo = session.odontologo      || {};\n"
    "const slot       = session.slot_confirmado || {};\n\n"
    "const inicio   = slot.inicio ? new Date(slot.inicio) : new Date();\n"
    "const fechaStr = inicio.toLocaleDateString('es-VE', { weekday:'long', day:'numeric', month:'long', year:'numeric' });\n"
    "const horaStr  = slot.label || inicio.toLocaleTimeString('es-VE', { hour:'2-digit', minute:'2-digit', hour12:true });\n\n"
    "if (staticData.sessions) {\n"
    "  staticData.sessions[telefono] = { estado: 'completado', ultima_cita: slot };\n"
    "}\n"
    "delete staticData.pendingConfirmation;\n\n"
    "const nombre       = odontologo.nombre       || 'Especialista';\n"
    "const especialidad = odontologo.especialidad || '';\n\n"
    "const lineas = [\n"
    "  '\\u2705 *\\u00a1Cita confirmada en Implantarte!*',\n"
    "  '',\n"
    "  '\\ud83d\\udc68\\u200d\\u2695\\ufe0f ' + nombre,\n"
    "  '\\ud83d\\udccb ' + especialidad,\n"
    "  '\\ud83d\\udcc5 ' + fechaStr,\n"
    "  '\\ud83d\\udd50 ' + horaStr,\n"
    "  '',\n"
    "  '\\ud83d\\udccd Implantarte - Cl\\u00ednica Dental',\n"
    "  '',\n"
    "  '*Recuerda:*',\n"
    "  '\\u2022 Llegar 10 min antes',\n"
    "  '\\u2022 Traer documentos de identificaci\\u00f3n',\n"
    "  '\\u2022 Ante cualquier cambio av\\u00edsanos con anticipaci\\u00f3n',\n"
    "  '',\n"
    "  '\\u00a1Te esperamos! \\ud83d\\ude0a',\n"
    "  '',\n"
    "  'Para nueva consulta escribe *hola*'\n"
    "];\n"
    "const respuesta = lineas.join('\\n');\n\n"
    "return [{ json: { telefono, session, respuesta } }];"
)

wf = {
  "name": "Implantarte - Flujo Completo de Citas",
  "nodes": [
    {
      "parameters": {"httpMethod":"POST","path":"implantarte-citas","responseMode":"responseNode","options":{}},
      "id": "node-webhook", "name": "Webhook Entrada",
      "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [200, 400]
    },
    {
      "parameters": {"language":"javaScript","jsCode": session_manager_code},
      "id": "node-session", "name": "Session Manager",
      "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [420, 400]
    },
    {
      "parameters": {
        "rules": {"values": [
          {"conditions": {"conditions": [{"leftValue":"={{ $json.accion }}","rightValue":"verificar_calendar","operator":{"type":"string","operation":"equals"}}]}, "renameOutput":True,"outputKey":"verificar"},
          {"conditions": {"conditions": [{"leftValue":"={{ $json.accion }}","rightValue":"crear_evento","operator":{"type":"string","operation":"equals"}}]}, "renameOutput":True,"outputKey":"crear"}
        ]},
        "options": {"fallbackOutput":"extra"}
      },
      "id": "node-switch-accion", "name": "Router de Acciones",
      "type": "n8n-nodes-base.switch", "typeVersion": 3, "position": [640, 400]
    },
    {
      "parameters": {"language":"javaScript","jsCode": verificar_code},
      "id": "node-check-slots", "name": "Verificar Disponibilidad",
      "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [860, 200]
    },
    {
      "parameters": {"language":"javaScript","jsCode": preparar_code},
      "id": "node-prep-evento", "name": "Preparar Evento",
      "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [860, 580]
    },
    {
      "parameters": {
        "calendarId": {"mode":"id","value":"={{ $json.evento.calendar_id }}"},
        "start": "={{ $json.evento.inicio }}",
        "end":   "={{ $json.evento.fin }}",
        "additionalFields": {
          "summary":     "={{ $json.evento.titulo }}",
          "description": "={{ $json.evento.descripcion }}"
        }
      },
      "id": "node-gcal-create", "name": "Crear Cita en Calendar",
      "type": "n8n-nodes-base.googleCalendar", "typeVersion": 1.3,
      "position": [1080, 580],
      "credentials": {"googleCalendarOAuth2Api": {"id":"","name":"Google Calendar account 2"}}
    },
    {
      "parameters": {"language":"javaScript","jsCode": confirm_code},
      "id": "node-confirm-response", "name": "Respuesta Confirmacion",
      "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [1300, 580]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify({ ok: true, respuesta: $json.respuesta, estado: $json.session?.estado || 'unknown', telefono: $json.telefono }) }}",
        "options": {"responseHeaders": {"entries": [{"name":"Content-Type","value":"application/json"}]}}
      },
      "id": "node-respond-1", "name": "Responder al Simulador A",
      "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [1080, 400]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify({ ok: true, respuesta: $json.respuesta, estado: $json.session?.estado || 'verificando', telefono: $json.telefono }) }}",
        "options": {}
      },
      "id": "node-respond-2", "name": "Responder al Simulador B",
      "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [1080, 200]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify({ ok: true, respuesta: $json.respuesta, estado: $json.session?.estado || 'completado', telefono: $json.telefono }) }}",
        "options": {}
      },
      "id": "node-respond-3", "name": "Responder al Simulador C",
      "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [1520, 580]
    }
  ],
  "connections": {
    "Webhook Entrada":          {"main": [[{"node":"Session Manager","type":"main","index":0}]]},
    "Session Manager":          {"main": [[{"node":"Router de Acciones","type":"main","index":0}]]},
    "Router de Acciones":       {"main": [
      [{"node":"Verificar Disponibilidad","type":"main","index":0}],
      [{"node":"Preparar Evento","type":"main","index":0}],
      [{"node":"Responder al Simulador A","type":"main","index":0}]
    ]},
    "Verificar Disponibilidad": {"main": [[{"node":"Responder al Simulador B","type":"main","index":0}]]},
    "Preparar Evento":          {"main": [[{"node":"Crear Cita en Calendar","type":"main","index":0}]]},
    "Crear Cita en Calendar":   {"main": [[{"node":"Respuesta Confirmacion","type":"main","index":0}]]},
    "Respuesta Confirmacion":   {"main": [[{"node":"Responder al Simulador C","type":"main","index":0}]]}
  },
  "settings": {
    "executionOrder": "v1",
    "saveManualExecutions": True,
    "callerPolicy": "workflowsFromSameOwner"
  },
  "tags": []
}

out_path = 'C:/Users/User/DemoclinicaDental/workflows/flujo-completo.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(wf, f, ensure_ascii=True, indent=2)

print("Saved.")
with open(out_path, 'r', encoding='utf-8') as f:
    test = json.load(f)
print("Nodes: " + str(len(test["nodes"])))
print("Valid JSON: OK")
