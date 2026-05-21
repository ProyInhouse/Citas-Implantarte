import json

path = 'C:/Users/User/DemoclinicaDental/workflows/flujo-completo.json'

SESSION_MANAGER_CODE = r"""const body = $input.first().json;
const telefono = body.telefono || 'unknown';
const msgOriginal = (body.mensaje || '').trim();
const mensaje = msgOriginal.toLowerCase();
const staticData = $getWorkflowStaticData('global');
if (!staticData.sessions) staticData.sessions = {};
const ODONTOLOGOS = {
  '1': { id:'1', nombre:'Dr. Alejandro Contreras', especialidad:'Implantologia y Cirugia',
    calendar_id:'3e2d7a3f62231eff8e8f233ec1dbe1f8a416539f52530171c9e457d7c735e87a@group.calendar.google.com',
    dias:[1,2,3,4,5,6], inicio:'08:00', fin:'17:00', fin_sabado:'13:00', duracion_min:60 },
  '2': { id:'2', nombre:'Dra. Maria B. Fuenmayor', especialidad:'Ortodoncia',
    calendar_id:'7b66ca52aef646deff180d5d8e1fcb1767ae9f26db8304f9879c93cdaffe2dfe@group.calendar.google.com',
    dias:[1,3,5], inicio:'09:00', fin:'18:00', duracion_min:60 },
  '3': { id:'3', nombre:'Dr. German', especialidad:'Odontologia General',
    calendar_id:'cf87f5290d01e5ad24e5e8fe6f0251a57e757c1fb3b95c706ca0c924fc779930@group.calendar.google.com',
    dias:[2,3,4,5,6], inicio:'08:00', fin:'16:00', duracion_min:45 },
  '4': { id:'4', nombre:'Dra. Vanessa', especialidad:'Odontologia Estetica',
    calendar_id:'b7d0c4882de72e7b799c6f0c91291beef2dca67a9f23485428203f786ee3e4c@group.calendar.google.com',
    dias:[1,2,3,4], inicio:'10:00', fin:'19:00', duracion_min:60 },
  '5': { id:'5', nombre:'Dra. Beatriz', especialidad:'Radiologia',
    calendar_id:'b45e211b61fb2ddb7309f449c7cc507edd0a9b90e2d359bead1fdc2639b0af4f@group.calendar.google.com',
    dias:[1,2,3,4,5], inicio:'08:00', fin:'15:00', duracion_min:30 }
};
let session = staticData.sessions[telefono] || { estado: 'inicio' };
if (['menu','inicio','reiniciar','hola','hi','0','reset'].includes(mensaje)) session = { estado: 'inicio' };
let respuesta = '';
let accion = 'responder';
if (session.estado === 'inicio' || session.estado === 'menu') {
  if (['1','odontolog','cita'].some(k => mensaje.includes(k))) {
    session.servicio = 'odontologia';
    session.estado = 'seleccion_odontologo';
    respuesta = '¡Hola! 👋 Estos son nuestros especialistas:\n\n1️⃣ Dr. Alejandro Contreras — Implantología y Cirugía\n2️⃣ Dra. María B. Fuenmayor — Ortodoncia\n3️⃣ Dr. Germán — Odontología General\n4️⃣ Dra. Vanessa — Odontología Estética\n5️⃣ Dra. Beatriz — Radiología\n\nResponde con el número de tu preferencia.';
  } else {
    session.estado = 'inicio';
    respuesta = '🦷 *¡Bienvenido a Implantarte!*\n\n¿En qué puedo ayudarte hoy?\n\n1️⃣ Agendar cita de Odontología\n\nResponde con el número de tu preferencia.';
  }
} else if (session.estado === 'seleccion_odontologo') {
  const doc = ODONTOLOGOS[msgOriginal];
  if (doc) {
    session.odontologo = doc;
    session.estado = 'fecha_hora';
    respuesta = '✅ ' + doc.nombre + ' seleccionado.\n\n📅 ¿Para qué día deseas tu cita?\n\nEscribe: *hoy*, *mañana*, un día (ej. *lunes*) o una fecha (ej. *27/04/2026*).';
  } else {
    respuesta = '❌ Opción no válida. Por favor escribe un número del 1 al 5.';
  }
} else if (session.estado === 'fecha_hora') {
  session.fecha_preferida = msgOriginal;
  session.estado = 'verificando_disponibilidad';
  accion = 'verificar_calendar';
  respuesta = '🔍 Verificando disponibilidad...';
} else if (session.estado === 'confirmacion') {
  if (['1','si','confirmo','ok','dale','yes'].some(k => mensaje.includes(k))) {
    session.estado = 'crear_evento';
    accion = 'crear_evento';
    respuesta = '⏳ Creando tu cita...';
  } else if (['2','no','otro','cambiar','cancel'].some(k => mensaje.includes(k))) {
    session.estado = 'fecha_hora';
    respuesta = '📅 ¿Para qué otro día prefieres tu cita?';
  } else {
    respuesta = '¿Confirmas tu cita? Responde *1* para confirmar o *2* para elegir otro día.';
  }
}
session.updated_at = new Date().toISOString();
staticData.sessions[telefono] = JSON.parse(JSON.stringify(session));
return [{ json: { telefono, mensaje: msgOriginal, session: JSON.parse(JSON.stringify(session)), respuesta, accion } }];"""

VERIFICAR_DISPONIBILIDAD_CODE = r"""const input = $input.first().json;
const session = input.session;
const odontologo = session.odontologo;
const fechaPref = session.fecha_preferida || '';
function parsearFecha(texto) {
  const hoy = new Date();
  const t = texto.toLowerCase();
  if (t.includes('hoy')) return new Date(hoy);
  if (t.includes('mañana') || t.includes('manana')) {
    const m = new Date(hoy); m.setDate(m.getDate() + 1); return m;
  }
  const diasMap = { lunes:1, martes:2, miercoles:3, jueves:4, viernes:5, sabado:6 };
  for (const [nombre, num] of Object.entries(diasMap)) {
    if (t.includes(nombre)) {
      const d = new Date(hoy);
      const diff = (num - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return d;
    }
  }
  const m1 = texto.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m1) return new Date(m1[3] + '-' + m1[2].padStart(2,'0') + '-' + m1[1].padStart(2,'0') + 'T12:00:00');
  const def = new Date(hoy); def.setDate(def.getDate() + 1); return def;
}
const fecha = parsearFecha(fechaPref);
const rawDay = fecha.getDay();
const diaSemana = rawDay === 0 ? 7 : rawDay;
const trabajaEseDia = odontologo.dias.includes(diaSemana);
const esSabado = diaSemana === 6;
const horaFin = (esSabado && odontologo.fin_sabado) ? odontologo.fin_sabado : odontologo.fin;
function generarSlots(f, inicio, fin, durMin) {
  const slots = [];
  const [hI, mI] = inicio.split(':').map(Number);
  const [hF, mF] = fin.split(':').map(Number);
  let cur = new Date(f); cur.setHours(hI, mI, 0, 0);
  const finD = new Date(f); finD.setHours(hF, mF, 0, 0);
  while (cur < finD) {
    if (cur.getHours() !== 12) {
      const end = new Date(cur.getTime() + durMin * 60000);
      if (end <= finD) slots.push({
        inicio: cur.toISOString(),
        fin: end.toISOString(),
        label: cur.getHours() + ':' + String(cur.getMinutes()).padStart(2,'0')
      });
    }
    cur = new Date(cur.getTime() + durMin * 60000);
  }
  return slots;
}
const staticData = $getWorkflowStaticData('global');
if (!staticData.sessions) staticData.sessions = {};
const s = JSON.parse(JSON.stringify(staticData.sessions[input.telefono] || {}));
s.odontologo = odontologo;
let respuesta = '';
if (!trabajaEseDia) {
  const diasNombres = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const nombreDia = diasNombres[rawDay] || '';
  respuesta = '😔 Lo sentimos, ' + odontologo.nombre + ' no atiende ese día (' + nombreDia + ').\n\n📅 ¿Qué otro día te queda bien?';
  s.estado = 'fecha_hora';
} else {
  const slots = generarSlots(fecha, odontologo.inicio, horaFin, odontologo.duracion_min);
  const primeros = slots.slice(0, 3);
  if (primeros.length > 0) {
    s.estado = 'confirmacion';
    s.slots_propuestos = primeros;
    s.slot_confirmado = primeros[0];
    const fechaStr = fecha.toLocaleDateString('es-VE', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    respuesta = '📅 Horarios disponibles con ' + odontologo.nombre + ' para el ' + fechaStr + ':\n\n' +
      primeros.map((sl, i) => (i+1) + '️⃣ ' + sl.label + ' hrs').join('\n') +
      '\n\nTe asignamos el primer horario: *' + primeros[0].label + ' hrs*\n\n¿Confirmas? Responde *1* para confirmar o *2* para elegir otro día.';
  } else {
    respuesta = '😔 No hay horarios disponibles ese día. ¿Qué otro día prefieres?';
    s.estado = 'fecha_hora';
  }
}
staticData.sessions[input.telefono] = s;
return [{ json: Object.assign({}, input, { respuesta, session: JSON.parse(JSON.stringify(s)) }) }];"""

with open(path, 'r', encoding='utf-8') as f:
    wf = json.load(f)

fixed = 0
for node in wf['nodes']:
    if node['id'] == 'node-session' and node['parameters'].get('jsCode') is None:
        node['parameters']['jsCode'] = SESSION_MANAGER_CODE
        fixed += 1
        print('Fixed: node-session (Session Manager)')
    elif node['id'] == 'node-check-slots' and node['parameters'].get('jsCode') is None:
        node['parameters']['jsCode'] = VERIFICAR_DISPONIBILIDAD_CODE
        fixed += 1
        print('Fixed: node-check-slots (Verificar Disponibilidad)')

with open(path, 'w', encoding='utf-8') as f:
    json.dump(wf, f, ensure_ascii=True, indent=2)

# Validate
with open(path, 'r', encoding='utf-8') as f:
    test = json.load(f)

null_nodes = [n['name'] for n in test['nodes'] if n['type'] == 'n8n-nodes-base.code' and n['parameters'].get('jsCode') is None]
print('Fixed', fixed, 'nodes')
print('Null code nodes remaining:', null_nodes if null_nodes else 'none')
print('Total nodes:', len(test['nodes']))
print('Valid JSON: OK')
