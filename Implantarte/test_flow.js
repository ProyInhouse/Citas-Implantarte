const staticData = { sessions: {} };

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

function sessionManager(body) {
  const telefono = body.telefono || 'test_user';
  const msgOriginal = (body.mensaje || '').trim();
  const mensaje = msgOriginal.toLowerCase();

  let session = staticData.sessions[telefono] || { estado: 'inicio' };
  if (['menu','inicio','reiniciar','hola','hi','0','reset'].includes(mensaje)) session = { estado: 'inicio' };

  let respuesta = '', accion = 'responder';

  if (session.estado === 'inicio' || session.estado === 'menu') {
    if (['1','odontolog','cita'].some(function(k){ return mensaje.includes(k); })) {
      session.servicio = 'odontologia'; session.estado = 'seleccion_odontologo';
      respuesta = '[MENU ODONTOLOGOS]';
    } else {
      session.estado = 'inicio'; respuesta = '[BIENVENIDA]';
    }
  } else if (session.estado === 'seleccion_odontologo') {
    const doc = ODONTOLOGOS[msgOriginal];
    if (doc) {
      session.odontologo = doc; session.estado = 'fecha_hora';
      respuesta = '[SELECCIONADO: ' + doc.nombre + ']';
    } else {
      respuesta = '[ERROR: numero 1-5]';
    }
  } else if (session.estado === 'fecha_hora') {
    session.fecha_preferida = msgOriginal;
    session.estado = 'verificando_disponibilidad';
    accion = 'verificar_calendar'; respuesta = '[VERIFICANDO...]';
  } else if (session.estado === 'confirmacion') {
    if (['1','si','confirmo','ok','dale','yes'].some(function(k){ return mensaje.includes(k); })) {
      session.estado = 'crear_evento'; accion = 'crear_evento'; respuesta = '[CREANDO CITA...]';
    } else if (['2','no','otro','cambiar','cancel'].some(function(k){ return mensaje.includes(k); })) {
      session.estado = 'fecha_hora'; respuesta = '[OTRO DIA]';
    }
  }

  session.updated_at = new Date().toISOString();
  staticData.sessions[telefono] = JSON.parse(JSON.stringify(session));
  return { telefono: telefono, mensaje: msgOriginal, session: JSON.parse(JSON.stringify(session)), respuesta: respuesta, accion: accion };
}

function verificarDisponibilidad(input) {
  const session = input.session;
  const odontologo = session.odontologo;
  const fechaPref = session.fecha_preferida || '';

  function parsearFecha(texto) {
    const hoy = new Date('2026-04-27T12:00:00');
    const t = texto.toLowerCase();
    if (t.includes('hoy')) return new Date(hoy);
    if (t.includes('mañana') || t.includes('manana')) {
      const m = new Date(hoy); m.setDate(m.getDate()+1); return m;
    }
    const diasMap = { lunes:1, martes:2, miercoles:3, jueves:4, viernes:5, sabado:6 };
    for (const nombre in diasMap) {
      if (t.includes(nombre)) {
        const num = diasMap[nombre];
        const d = new Date(hoy);
        const diff = (num - d.getDay() + 7) % 7 || 7;
        d.setDate(d.getDate() + diff);
        return d;
      }
    }
    const m1 = texto.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (m1) return new Date(m1[3] + '-' + m1[2].padStart(2,'0') + '-' + m1[1].padStart(2,'0'));
    const def = new Date(hoy); def.setDate(def.getDate()+1); return def;
  }

  const fecha = parsearFecha(fechaPref);
  const rawDay = fecha.getDay();
  const diaSemana = rawDay === 0 ? 7 : rawDay;
  const trabajaEseDia = odontologo.dias.includes(diaSemana);
  const esSabado = diaSemana === 6;
  const horaFin = (esSabado && odontologo.fin_sabado) ? odontologo.fin_sabado : odontologo.fin;

  function generarSlots(fecha, inicio, fin, durMin) {
    const slots = [];
    const p1 = inicio.split(':').map(Number);
    const p2 = fin.split(':').map(Number);
    let cur = new Date(fecha); cur.setHours(p1[0], p1[1], 0, 0);
    const finD = new Date(fecha); finD.setHours(p2[0], p2[1], 0, 0);
    while (cur < finD) {
      if (cur.getHours() !== 12) {
        const end = new Date(cur.getTime() + durMin * 60000);
        if (end <= finD) {
          slots.push({
            inicio: new Date(cur), fin: new Date(end),
            label: cur.getHours() + ':' + String(cur.getMinutes()).padStart(2,'0')
          });
        }
      }
      cur = new Date(cur.getTime() + durMin * 60000);
    }
    return slots;
  }

  let respuesta = '';
  const s = JSON.parse(JSON.stringify(staticData.sessions[input.telefono] || {}));
  s.odontologo = odontologo;

  if (!trabajaEseDia) {
    respuesta = '[NO TRABAJA - diaSemana=' + diaSemana + ', dias=' + JSON.stringify(odontologo.dias) + ']';
    s.estado = 'fecha_hora';
  } else {
    const slots = generarSlots(fecha, odontologo.inicio, horaFin, odontologo.duracion_min);
    const primeros3 = slots.slice(0, 3);
    if (primeros3.length > 0) {
      s.estado = 'confirmacion';
      s.slots_propuestos = primeros3.map(function(sl) {
        return { inicio: sl.inicio.toISOString(), fin: sl.fin.toISOString(), label: sl.label };
      });
      s.slot_confirmado = s.slots_propuestos[0];
      respuesta = '[SLOTS: ' + primeros3.map(function(x){ return x.label; }).join(', ') + ']';
    } else {
      respuesta = '[SIN SLOTS]'; s.estado = 'fecha_hora';
    }
  }
  staticData.sessions[input.telefono] = s;
  return Object.assign({}, input, { respuesta: respuesta, session: JSON.parse(JSON.stringify(s)) });
}

function prepararEvento(input) {
  const session = input.session;
  const odontologo = session.odontologo;
  const slot = session.slot_confirmado;
  if (!slot || !odontologo) {
    return Object.assign({}, input, { error: 'DATOS INCOMPLETOS slot=' + JSON.stringify(slot) });
  }
  return Object.assign({}, input, {
    evento: {
      titulo: 'Cita ' + odontologo.especialidad + ' - ' + input.telefono,
      descripcion: 'Paciente: ' + input.telefono,
      inicio: new Date(slot.inicio).toISOString(),
      fin: new Date(slot.fin).toISOString(),
      calendar_id: odontologo.calendar_id || 'primary'
    }
  });
}

function respuestaConfirmacion(input) {
  const session = input.session || {};
  const odontologo = session.odontologo || {};
  const slot = session.slot_confirmado || {};
  const inicio = slot.inicio ? new Date(slot.inicio) : new Date();
  return Object.assign({}, input, {
    respuesta: 'CITA CONFIRMADA | ' + odontologo.nombre + ' | ' + inicio.toDateString() + ' ' + (slot.label || '')
  });
}

// ===== TEST RUNNER =====
const TEL = '04141234567';
let PASS = 0, FAIL = 0;

function check(label, cond) {
  if (cond) { console.log('  PASS: ' + label); PASS++; }
  else { console.log('  FAIL: ' + label); FAIL++; }
}

function resetSession() { staticData.sessions = {}; }

function runFlow(steps) {
  let lastOut = null;
  steps.forEach(function(step) {
    lastOut = sessionManager({ telefono: TEL, mensaje: step });
    if (lastOut.accion === 'verificar_calendar') lastOut = verificarDisponibilidad(lastOut);
  });
  return lastOut;
}

// --- ESCENARIO 1: Flujo completo Dr. Alejandro + lunes ---
console.log('\n--- T1: Flujo completo Dr. Alejandro + lunes ---');
resetSession();
runFlow(['hola', '1', '1', 'lunes']);
const confirmOut1 = sessionManager({ telefono: TEL, mensaje: '1' });
check('estado=crear_evento', confirmOut1.session.estado === 'crear_evento');
check('accion=crear_evento', confirmOut1.accion === 'crear_evento');
const p1 = prepararEvento(confirmOut1);
check('evento preparado sin error', !!p1.evento && !p1.error);
check('calendar_id no es primary', p1.evento && p1.evento.calendar_id !== 'primary');
check('calendar_id de Dr. Alejandro', p1.evento && p1.evento.calendar_id.startsWith('3e2d'));
check('fechas ISO presentes', p1.evento && !!p1.evento.inicio && !!p1.evento.fin);
check('fin > inicio', p1.evento && new Date(p1.evento.fin) > new Date(p1.evento.inicio));
check('duracion 60min', p1.evento && (new Date(p1.evento.fin) - new Date(p1.evento.inicio)) === 3600000);
const c1 = respuestaConfirmacion(p1);
check('confirmacion menciona el doctor', c1.respuesta.includes('Alejandro'));

// --- ESCENARIO 2: Dr. German no trabaja lunes ---
console.log('\n--- T2: Dr. German no trabaja lunes ---');
resetSession();
runFlow(['hola', '1', '3']);
const outLunes = sessionManager({ telefono: TEL, mensaje: 'lunes' });
const v2 = verificarDisponibilidad(outLunes);
check('German rechaza lunes (diaSemana=1 no en [2,3,4,5,6])', v2.session.estado === 'fecha_hora');
check('no hay slot_confirmado', !v2.session.slot_confirmado);

// --- ESCENARIO 3: Dr. German trabaja martes ---
console.log('\n--- T3: Dr. German trabaja martes ---');
resetSession();
runFlow(['hola', '1', '3']);
const outMartes = sessionManager({ telefono: TEL, mensaje: 'martes' });
const v3 = verificarDisponibilidad(outMartes);
check('German acepta martes', v3.session.estado === 'confirmacion');
check('tiene slots', v3.session.slots_propuestos && v3.session.slots_propuestos.length > 0);
check('duracion slots 45min', v3.session.slots_propuestos && v3.session.slots_propuestos.length >= 2 &&
  (new Date(v3.session.slots_propuestos[1].inicio) - new Date(v3.session.slots_propuestos[0].inicio)) === 2700000);

// --- ESCENARIO 4: Dra. Beatriz slots de 30min ---
console.log('\n--- T4: Dra. Beatriz slots de 30min ---');
resetSession();
runFlow(['hola', '1', '5']);
const outVie = sessionManager({ telefono: TEL, mensaje: 'viernes' });
const v4 = verificarDisponibilidad(outVie);
check('Beatriz acepta viernes', v4.session.estado === 'confirmacion');
check('3 slots disponibles', v4.session.slots_propuestos && v4.session.slots_propuestos.length === 3);
check('slots de 30min', v4.session.slots_propuestos && v4.session.slots_propuestos.length >= 2 &&
  (new Date(v4.session.slots_propuestos[1].inicio) - new Date(v4.session.slots_propuestos[0].inicio)) === 1800000);

// --- ESCENARIO 5: Dra. Maria solo Lun/Mie/Vie - pide jueves ---
console.log('\n--- T5: Dra. Maria Fuenmayor no trabaja jueves ---');
resetSession();
runFlow(['hola', '1', '2']);
const outJue = sessionManager({ telefono: TEL, mensaje: 'jueves' });
const v5 = verificarDisponibilidad(outJue);
check('Maria rechaza jueves', v5.session.estado === 'fecha_hora');

// --- ESCENARIO 6: Dra. Vanessa no trabaja viernes ---
console.log('\n--- T6: Dra. Vanessa no trabaja viernes (solo Lun-Jue) ---');
resetSession();
runFlow(['hola', '1', '4']);
const outVie6 = sessionManager({ telefono: TEL, mensaje: 'viernes' });
const v6 = verificarDisponibilidad(outVie6);
check('Vanessa rechaza viernes', v6.session.estado === 'fecha_hora');

// --- ESCENARIO 7: reset con hola ---
console.log('\n--- T7: Reset de sesion con hola ---');
resetSession();
sessionManager({ telefono: TEL, mensaje: '1' });
sessionManager({ telefono: TEL, mensaje: '2' });
const resetOut = sessionManager({ telefono: TEL, mensaje: 'hola' });
check('hola resetea a inicio', resetOut.session.estado === 'inicio');

// --- ESCENARIO 8: responder "2" en confirmacion cambia fecha ---
console.log('\n--- T8: Responder 2 en confirmacion vuelve a pedir fecha ---');
resetSession();
runFlow(['hola', '1', '1', 'lunes']);
const cambiarOut = sessionManager({ telefono: TEL, mensaje: '2' });
check('accion=responder al decir 2', cambiarOut.accion === 'responder');
check('estado vuelve a fecha_hora', cambiarOut.session.estado === 'fecha_hora');

// --- ESCENARIO 9: calendar_ids no vacios para todos ---
console.log('\n--- T9: Todos los calendar_ids estan configurados ---');
for (const key in ODONTOLOGOS) {
  const doc = ODONTOLOGOS[key];
  check(doc.nombre + ' tiene calendar_id', !!doc.calendar_id && doc.calendar_id !== '');
}

console.log('\n========================================');
console.log('RESULTADO: ' + PASS + ' PASS  /  ' + FAIL + ' FAIL');
console.log('========================================');
process.exit(FAIL > 0 ? 1 : 0);
