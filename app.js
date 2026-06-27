// ══════════════════════════════════════════════════════
// app.js — REUNIFICAR Venezuela
// Compatible con base de datos v1.0:
//   tablas: casos, custodias
// ══════════════════════════════════════════════════════

// ── NAVEGACIÓN ──────────────────────────────────────
function ir(id) {
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
  document.getElementById(id).classList.add('activa');
  window.scrollTo(0, 0);
  if (id === 'p-admin') cargarAdmin();
  actualizarContadores();
}

// ── FOTOS ────────────────────────────────────────────
const fotosBase64 = {};

function prevFoto(input, uaId, prevId, fdId) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById(prevId).src = e.target.result;
    document.getElementById(prevId).style.display = 'block';
    document.getElementById(uaId).classList.add('ok');
    fotosBase64[fdId] = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function subirFoto(base64, carpeta) {
  if (!base64) return null;
  try {
    const blob = await fetch(base64).then(r => r.blob());
    const ext  = blob.type.split('/')[1] || 'jpg';
    const nombre = `${carpeta}/${Date.now()}_${Math.random().toString(36).substr(2,6)}.${ext}`;
    const { error } = await db.storage
      .from('fotos-reunificar')
      .upload(nombre, blob, { contentType: blob.type, upsert: false });
    if (error) { console.error('Error foto:', error); return null; }
    const { data: urlData } = db.storage.from('fotos-reunificar').getPublicUrl(nombre);
    return urlData.publicUrl;
  } catch(err) {
    console.error('Error subiendo foto:', err);
    return null;
  }
}

// ── HELPERS ──────────────────────────────────────────
function v(id) { return document.getElementById(id)?.value?.trim() || ''; }

function mostrarExito(ico, titulo, desc, id) {
  document.getElementById('ex-ico').textContent    = ico;
  document.getElementById('ex-titulo').textContent = titulo;
  document.getElementById('ex-desc').textContent   = desc;
  document.getElementById('ex-id').textContent     = 'Número de caso: ' + id;
  ir('p-exito');
}

function limpiarFoto(prevId, uaId) {
  const el = document.getElementById(prevId);
  if (el) { el.style.display = 'none'; el.src = ''; }
  document.getElementById(uaId)?.classList.remove('ok');
}

// ════════════════════════════════════════════════════
// FORM 1 — MENOR ENCONTRADO
// Guarda en: casos (tipo='encontrado') + custodias
// ════════════════════════════════════════════════════
async function enviarEncontrado(e) {
  e.preventDefault();

  const sexo  = document.querySelector('input[name="e-sexo"]:checked');
  const salud = document.querySelector('input[name="e-salud"]:checked');
  const tipo  = document.querySelector('input[name="e-tipo"]:checked');
  if (!sexo || !salud || !tipo) {
    alert('Por favor completa todos los campos obligatorios (sexo, salud y tipo de lugar).');
    return;
  }

  const btn = document.getElementById('btn-enc-submit');
  btn.disabled = true; btn.textContent = '⏳ Guardando...';

  // Subir fotos
  const fotoMenorUrl = await subirFoto(fotosBase64['fd-menor'], 'menores');
  const fotoRespUrl  = await subirFoto(fotosBase64['fd-resp'],  'responsables');

  // ── 1. Insertar en CASOS ──
  const caso = {
    tipo:               'encontrado',
    nombre:             v('e-nombre') || 'Sin identificar',
    edad:               v('e-edad'),
    sexo:               sexo.value,
    descripcion:        v('e-senas'),
    estado_salud:       salud.value,
    lugar_rescate:      v('e-ciudad-rescate'),          // ciudad (pública)
    ubicacion_actual:   tipo.value + ' — ' + v('e-nombre-lugar'), // referencia general
    fecha_rescate:      v('e-fecha') || null,
    foto_url:           fotoMenorUrl,
    nombre_reportante:  v('e-rep-nom'),
    telefono_reportante: v('e-rep-tel'),
  };

  const { data: casoData, error: casoError } = await db
    .from('casos')
    .insert([caso])
    .select('id')
    .single();

  if (casoError) {
    btn.disabled = false; btn.textContent = '✅ Registrar menor encontrado';
    alert('Error al guardar el caso: ' + casoError.message);
    return;
  }

  // ── 2. Insertar en CUSTODIAS (datos sensibles, solo admin) ──
  const custodia = {
    caso_id:             casoData.id,
    nombre_responsable:  v('e-resp-nom'),
    foto_responsable:    fotoRespUrl,
    telefono:            v('e-resp-tel'),
    institucion:         v('e-nombre-lugar'),
    cargo:               v('e-resp-cargo'),
    observaciones:       'Dirección: ' + v('e-dir') + ' | Relación rescatista: ' + v('e-rep-rel') + ' | ' + v('e-adicional'),
  };

  const { error: custodiaError } = await db.from('custodias').insert([custodia]);

  btn.disabled = false; btn.textContent = '✅ Registrar menor encontrado';

  if (custodiaError) {
    // El caso se guardó pero la custodia falló — avisamos pero no bloqueamos
    console.error('Error custodia:', custodiaError);
    alert('El menor fue registrado pero hubo un error guardando los datos del responsable. Anota el ID y repórtalo: ' + casoData.id);
  }

  mostrarExito(
    '🔵',
    '¡Menor registrado!',
    'El menor ha sido registrado y es visible en la galería pública. Los familiares pueden encontrarlo.',
    casoData.id
  );

  document.getElementById('form-enc').reset();
  fotosBase64['fd-menor'] = null;
  fotosBase64['fd-resp']  = null;
  limpiarFoto('pi-menor', 'ua-menor');
  limpiarFoto('pi-resp',  'ua-resp');
}

// ════════════════════════════════════════════════════
// FORM 2 — BÚSQUEDA DE FAMILIAR
// Guarda en: casos (tipo='busqueda')
// ════════════════════════════════════════════════════
async function enviarBusqueda(e) {
  e.preventDefault();

  const sexo = document.querySelector('input[name="b-sexo"]:checked');
  if (!sexo) { alert('Indica el sexo de la persona buscada.'); return; }

  const btn = document.getElementById('btn-bus-submit');
  btn.disabled = true; btn.textContent = '⏳ Guardando...';

  const fotoBuscadoUrl = await subirFoto(fotosBase64['fd-buscado'], 'buscados');

  const caso = {
    tipo:               'busqueda',
    nombre:             v('b-nombre'),
    edad:               v('b-edad'),
    sexo:               sexo.value,
    descripcion:        [
                          v('b-senas'),
                          v('b-condicion') ? 'Condición médica: ' + v('b-condicion') : '',
                          v('b-info'),
                          'Autoridades: ' + (document.querySelector('input[name="b-aut"]:checked')?.value || 'No especificado'),
                          'Quien busca: ' + v('b-bnom') + ' (' + v('b-rel') + ') — País: ' + v('b-pais'),
                          v('b-email') ? 'Email: ' + v('b-email') : ''
                        ].filter(Boolean).join(' | '),
    estado_salud:       null,
    lugar_rescate:      v('b-ultimo-lugar'),
    ubicacion_actual:   v('b-estado'),
    fecha_rescate:      v('b-fecha') || null,
    foto_url:           fotoBuscadoUrl,
    nombre_reportante:  v('b-bnom'),
    telefono_reportante: v('b-tel'),
  };

  const { data, error } = await db.from('casos').insert([caso]).select('id').single();

  btn.disabled = false; btn.textContent = '🔍 Registrar búsqueda';

  if (error) { alert('Error al guardar: ' + error.message); return; }

  mostrarExito(
    '🟠',
    '¡Búsqueda registrada!',
    `Tu búsqueda está activa. Si alguien encuentra a ${caso.nombre}, este reporte los conectará.`,
    data.id
  );

  document.getElementById('form-bus').reset();
  fotosBase64['fd-buscado'] = null;
  limpiarFoto('pi-buscado', 'ua-buscado');
}

// ════════════════════════════════════════════════════
// GALERÍA PÚBLICA — solo casos tipo='encontrado'
// Solo muestra campos seguros (sin ubicación exacta)
// ════════════════════════════════════════════════════
let menoresCache = [];

async function cargarGaleria() {
  const cont = document.getElementById('galeria-contenido');
  cont.innerHTML = '<div class="cargando">🔄 Cargando registros...</div>';

  const filtroNombre = document.getElementById('filtro-nombre').value.trim().toLowerCase();
  const filtroSalud  = document.getElementById('filtro-salud').value;

  // Solo campos públicos — sin ubicacion_actual exacta, sin custodias
  let query = db
    .from('casos')
    .select('id, codigo, nombre, edad, sexo, estado_salud, descripcion, lugar_rescate, foto_url, fecha_rescate')
    .eq('tipo', 'encontrado')
    .order('created_at', { ascending: false });

  if (filtroSalud) query = query.eq('estado_salud', filtroSalud);

  const { data, error } = await query;

  if (error) {
    cont.innerHTML = '<div class="vacio">Error cargando datos: ' + error.message + '</div>';
    return;
  }

  let items = data || [];

  if (filtroNombre) {
    items = items.filter(m =>
      (m.nombre       || '').toLowerCase().includes(filtroNombre) ||
      (m.descripcion  || '').toLowerCase().includes(filtroNombre) ||
      (m.lugar_rescate|| '').toLowerCase().includes(filtroNombre)
    );
  }

  menoresCache = items;

  if (!items.length) {
    cont.innerHTML = '<div class="vacio">No se encontraron registros.<br>Intenta sin filtros o vuelve más tarde.</div>';
    return;
  }

  cont.innerHTML = items.map(m => {
    const sc = m.estado_salud === 'Estable' ? 'salud-ok'
             : m.estado_salud?.includes('Crítico') ? 'salud-cri' : 'salud-her';
    const emoji = (m.sexo === 'Niña' || m.sexo === 'Femenino') ? '👧' : '👦';
    return `
      <div class="tarjeta-menor" onclick="abrirModal('${m.id}')">
        ${m.foto_url
          ? `<img src="${m.foto_url}" alt="foto" loading="lazy">`
          : `<div class="no-foto">${emoji}</div>`}
        <div class="tarjeta-info">
          <div class="tnombre">${m.nombre || 'Sin identificar'}</div>
          <div class="tdetalle">${m.edad} años · ${m.sexo}<br>📍 ${m.lugar_rescate || '—'}</div>
          ${m.estado_salud ? `<span class="tsalud ${sc}">${m.estado_salud}</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ── MODAL DETALLE MENOR ──────────────────────────────
function abrirModal(id) {
  const m = menoresCache.find(x => x.id === id);
  if (!m) return;
  const sc = m.estado_salud === 'Estable' ? 'salud-ok'
           : m.estado_salud?.includes('Crítico') ? 'salud-cri' : 'salud-her';
  const emoji = (m.sexo === 'Niña' || m.sexo === 'Femenino') ? '👧' : '👦';

  document.getElementById('modal-contenido').innerHTML = `
    <h2>${m.nombre || 'Sin identificar'}</h2>
    <p class="msub">${m.edad} años · ${m.sexo}</p>
    ${m.foto_url
      ? `<img src="${m.foto_url}" alt="foto">`
      : `<div style="text-align:center;font-size:70px;margin:16px 0">${emoji}</div>`}
    ${m.estado_salud ? `<div class="mfila"><strong>Estado de salud</strong><span class="tsalud ${sc}" style="font-size:12px">${m.estado_salud}</span></div>` : ''}
    <div class="mfila"><strong>Ciudad encontrado</strong><span>${m.lugar_rescate || '—'}</span></div>
    <div class="mfila"><strong>Señas</strong><span style="text-align:right;max-width:220px">${m.descripcion || 'Sin información adicional'}</span></div>
    <div class="malerta">
      ⚠️ La <strong>ubicación exacta</strong> y los datos de contacto están protegidos.<br>
      Si crees que esta persona es tu familiar, haz clic abajo. El administrador verificará tu identidad antes de compartir esa información.
    </div>
    <div class="macciones">
      <button class="btn-contactar" onclick="abrirFormContacto('${m.id}','${(m.nombre||'Sin identificar').replace(/'/g,"\\'")}')">
        ❤️ Es mi familiar — Solicitar información
      </button>
      <button class="btn-cerrar-modal" onclick="cerrarModalDirecto()">Cerrar</button>
    </div>`;
  document.getElementById('modal-overlay').classList.remove('oculto');
}

// ── FORMULARIO SOLICITUD CONTACTO ────────────────────
function abrirFormContacto(menorId, menorNombre) {
  document.getElementById('modal-contenido').innerHTML = `
    <div class="modal-contacto-titulo">❤️ Solicitar información de contacto</div>
    <p style="font-size:13px;color:var(--gris);margin-bottom:16px;line-height:1.5">
      Cuéntanos quién eres y tu relación con <strong>${menorNombre}</strong>.
      El administrador revisará tu solicitud y te contactará para verificar antes de dar la ubicación.
    </p>
    <form onsubmit="enviarSolicitudContacto(event,'${menorId}','${menorNombre}')">
      <label>Tu nombre completo <span class="req">*</span></label>
      <input type="text" id="sc-nombre" placeholder="Nombre completo" required>
      <label style="margin-top:10px">Relación con el menor <span class="req">*</span></label>
      <select id="sc-relacion" required>
        <option value="">Selecciona...</option>
        <option>Padre / Madre</option><option>Hijo / Hija</option>
        <option>Hermano / Hermana</option><option>Abuelo / Abuela</option>
        <option>Tío / Tía</option><option>Otro familiar</option>
      </select>
      <label style="margin-top:10px">Teléfono <span class="req">*</span></label>
      <input type="tel" id="sc-tel" placeholder="+58 412 000 0000" required>
      <label style="margin-top:10px">Correo electrónico (opcional)</label>
      <input type="email" id="sc-email" placeholder="tu@correo.com">
      <label style="margin-top:10px">País donde estás</label>
      <input type="text" id="sc-pais" placeholder="Ej: Colombia, Venezuela, España">
      <label style="margin-top:10px">¿Por qué crees que es tu familiar? <span class="req">*</span></label>
      <textarea id="sc-mensaje" rows="3"
        placeholder="Describe las señas que reconoces, cuándo se perdió, dónde se separaron..." required></textarea>
      <div class="macciones" style="margin-top:14px">
        <button type="submit" class="btn-contactar" id="btn-sc-submit">Enviar solicitud</button>
        <button type="button" class="btn-cerrar-modal" onclick="cerrarModalDirecto()">Cancelar</button>
      </div>
    </form>`;
}

async function enviarSolicitudContacto(e, menorId, menorNombre) {
  e.preventDefault();
  const btn = document.getElementById('btn-sc-submit');
  btn.disabled = true; btn.textContent = '⏳ Enviando...';

  // Guardamos la solicitud como un caso tipo='solicitud_contacto'
  // con referencia al caso del menor en descripcion
  const solicitud = {
    tipo:               'solicitud_contacto',
    nombre:             document.getElementById('sc-nombre').value.trim(),
    descripcion:        [
                          'SOLICITUD DE CONTACTO PARA MENOR ID: ' + menorId,
                          'Nombre menor: ' + menorNombre,
                          'Relación: ' + document.getElementById('sc-relacion').value,
                          'Email: ' + (document.getElementById('sc-email').value.trim() || 'No indicado'),
                          'País: ' + (document.getElementById('sc-pais').value.trim() || 'No indicado'),
                          'Mensaje: ' + document.getElementById('sc-mensaje').value.trim()
                        ].join(' | '),
    lugar_rescate:      menorId,   // usamos este campo para guardar referencia al menor
    telefono_reportante: document.getElementById('sc-tel').value.trim(),
    nombre_reportante:  document.getElementById('sc-nombre').value.trim(),
  };

  const { error } = await db.from('casos').insert([solicitud]);

  if (error) {
    btn.disabled = false; btn.textContent = 'Enviar solicitud';
    alert('Error al enviar: ' + error.message); return;
  }

  document.getElementById('modal-contenido').innerHTML = `
    <div style="text-align:center;padding:28px 16px">
      <div style="font-size:58px">✅</div>
      <h2 style="margin:12px 0 8px">¡Solicitud enviada!</h2>
      <p style="color:var(--gris);font-size:14px;line-height:1.6">
        El administrador revisará tu solicitud y verificará tu identidad.<br>
        Te contactarán al teléfono que dejaste lo antes posible.
      </p>
      <div style="background:rgba(255,255,255,.07);border-radius:8px;padding:10px;
                  font-family:monospace;font-size:12px;color:var(--amarillo);margin:14px 0">
        Menor referenciado: ${menorId}
      </div>
      <button class="btn-cerrar-modal" onclick="cerrarModalDirecto()" style="margin-top:8px">Cerrar</button>
    </div>`;
}

function cerrarModal(e) {
  if (e.target === document.getElementById('modal-overlay')) cerrarModalDirecto();
}
function cerrarModalDirecto() {
  document.getElementById('modal-overlay').classList.add('oculto');
}

// ════════════════════════════════════════════════════
// CONTADORES
// ════════════════════════════════════════════════════
async function actualizarContadores() {
  try {
    const [{ count: enc }, { count: bus }, { count: res }] = await Promise.all([
      db.from('casos').select('*', { count:'exact', head:true }).eq('tipo','encontrado'),
      db.from('casos').select('*', { count:'exact', head:true }).eq('tipo','busqueda'),
      // "reunificados" = casos con codigo que empiece en 'RES-' o usamos un campo propio
      // Por ahora contamos solicitudes aprobadas
      db.from('casos').select('*', { count:'exact', head:true }).eq('tipo','reunificado'),
    ]);
    document.getElementById('cnt-enc').textContent = enc || 0;
    document.getElementById('cnt-bus').textContent = bus || 0;
    document.getElementById('cnt-res').textContent = res || 0;
  } catch(err) {
    console.error('Error contadores:', err);
  }
}

// ════════════════════════════════════════════════════
// ADMIN — LOGIN
// ════════════════════════════════════════════════════
function loginAdmin() {
  if (document.getElementById('admin-pwd').value === ADMIN_PASSWORD) {
    ir('p-admin');
  } else {
    alert('Contraseña incorrecta.');
  }
}

// ════════════════════════════════════════════════════
// ADMIN — PANEL
// ════════════════════════════════════════════════════
let tabActual = 'enc';

function cambiarTab(tab, btn) {
  tabActual = tab;
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('on','on-nar','on-ver'));
  const clases = { enc:'on', sol:'on-nar', bus:'on-nar', res:'on-ver' };
  btn.classList.add(clases[tab] || 'on');
  ['enc','sol','bus','res'].forEach(t => {
    document.getElementById('tab-cont-'+t).style.display = t === tab ? 'block' : 'none';
  });
  cargarAdmin();
}

async function cargarAdmin() {
  const [encRes, busRes, solRes, resRes] = await Promise.all([
    db.from('casos').select('*, custodias(*)').eq('tipo','encontrado').order('created_at',{ascending:false}),
    db.from('casos').select('*').eq('tipo','busqueda').order('created_at',{ascending:false}),
    db.from('casos').select('*').eq('tipo','solicitud_contacto').order('created_at',{ascending:false}),
    db.from('casos').select('*').eq('tipo','reunificado').order('created_at',{ascending:false}),
  ]);

  const enc = encRes.data || [];
  const bus = busRes.data || [];
  const sol = solRes.data || [];
  const res = resRes.data || [];

  document.getElementById('sa-enc').textContent = enc.length;
  document.getElementById('sa-bus').textContent = bus.length;
  document.getElementById('sa-sol').textContent = sol.length;
  document.getElementById('sa-res').textContent = res.length;

  renderAdminEnc(enc);
  renderAdminSol(sol);
  renderAdminBus(bus);
  renderAdminRes(res);
}

function renderAdminEnc(items) {
  const c = document.getElementById('tab-cont-enc');
  if (!items.length) { c.innerHTML = '<div class="vacio">Sin menores encontrados registrados.</div>'; return; }
  c.innerHTML = items.map(m => {
    const cust = m.custodias?.[0] || {};
    return `
    <div class="caso">
      <div class="caso-header">
        <div>
          <div class="caso-nombre">👦 ${m.nombre} · ${m.edad} años · ${m.sexo}</div>
          <div class="caso-fecha">${m.created_at ? new Date(m.created_at).toLocaleString('es-VE') : '—'} · ID: ${m.id.slice(0,8)}...</div>
        </div>
        <span class="badge b-enc">${m.estado_salud || '—'}</span>
      </div>
      ${m.foto_url ? `<img class="foto-thumb" src="${m.foto_url}" alt="menor">` : ''}
      <div class="caso-grid">
        <div><strong>Ciudad rescate:</strong> ${m.lugar_rescate||'—'}</div>
        <div><strong>Ubicación actual:</strong> ${m.ubicacion_actual||'—'}</div>
        <div><strong>📍 Institución:</strong> ${cust.institucion||'—'}</div>
        <div><strong>Responsable:</strong> ${cust.nombre_responsable||'—'} (${cust.cargo||'—'})</div>
        <div><strong>📞 Tel. responsable:</strong> ${cust.telefono||'—'}</div>
        <div><strong>Reportante:</strong> ${m.nombre_reportante||'—'}</div>
        <div><strong>📞 Tel. reportante:</strong> ${m.telefono_reportante||'—'}</div>
      </div>
      ${m.descripcion ? `<div class="caso-nota"><strong>Señas:</strong> ${m.descripcion}</div>` : ''}
      ${cust.observaciones ? `<div class="caso-nota">${cust.observaciones}</div>` : ''}
      ${cust.foto_responsable ? `<div style="margin-top:10px"><img style="height:55px;border-radius:6px" src="${cust.foto_responsable}" alt="responsable"> <span style="font-size:11px;color:var(--gris)">Foto responsable</span></div>` : ''}
      <div class="acciones">
        <button class="btn-ac res" onclick="marcarReunificado('${m.id}')">✅ Marcar reunificado</button>
        <button class="btn-ac rech" onclick="eliminarCaso('${m.id}')">🗑 Eliminar</button>
      </div>
    </div>`;
  }).join('');
}

function renderAdminSol(items) {
  const c = document.getElementById('tab-cont-sol');
  if (!items.length) { c.innerHTML = '<div class="vacio">No hay solicitudes de contacto pendientes.</div>'; return; }
  c.innerHTML = items.map(s => {
    // Parseamos los datos de la descripción
    const desc = s.descripcion || '';
    return `
    <div class="caso">
      <div class="caso-header">
        <div>
          <div class="caso-nombre">⚠️ ${s.nombre_reportante} solicita contacto</div>
          <div class="caso-fecha">${s.created_at ? new Date(s.created_at).toLocaleString('es-VE') : '—'}</div>
        </div>
        <span class="badge b-sol">PENDIENTE</span>
      </div>
      <div class="sol-detalle">
        ${desc.split(' | ').map(d => `<div>${d}</div>`).join('')}
        <div><strong>📞 Teléfono:</strong> ${s.telefono_reportante||'—'}</div>
      </div>
      <div class="acciones">
        <button class="btn-ac apro" onclick="aprobarSolicitud('${s.id}','${s.lugar_rescate}')">✅ Aprobar — ver datos del menor</button>
        <button class="btn-ac rech" onclick="eliminarCaso('${s.id}')">❌ Descartar</button>
      </div>
    </div>`;
  }).join('');
}

function renderAdminBus(items) {
  const c = document.getElementById('tab-cont-bus');
  if (!items.length) { c.innerHTML = '<div class="vacio">Sin búsquedas registradas.</div>'; return; }
  c.innerHTML = items.map(b => `
    <div class="caso">
      <div class="caso-header">
        <div>
          <div class="caso-nombre">🔍 ${b.nombre} · ${b.edad} años · ${b.sexo}</div>
          <div class="caso-fecha">${b.created_at ? new Date(b.created_at).toLocaleString('es-VE') : '—'}</div>
        </div>
        <span class="badge b-bus">BÚSQUEDA</span>
      </div>
      ${b.foto_url ? `<img class="foto-thumb" src="${b.foto_url}" alt="buscado">` : ''}
      <div class="caso-grid">
        <div><strong>Último visto:</strong> ${b.lugar_rescate||'—'}</div>
        <div><strong>Estado/Ciudad:</strong> ${b.ubicacion_actual||'—'}</div>
        <div><strong>Quien busca:</strong> ${b.nombre_reportante||'—'}</div>
        <div><strong>📞 Contacto:</strong> ${b.telefono_reportante||'—'}</div>
      </div>
      ${b.descripcion ? `<div class="caso-nota">${b.descripcion}</div>` : ''}
      <div class="acciones">
        <button class="btn-ac res" onclick="marcarReunificado('${b.id}')">✅ Reunificado</button>
        <button class="btn-ac rech" onclick="eliminarCaso('${b.id}')">🗑 Eliminar</button>
      </div>
    </div>`).join('');
}

function renderAdminRes(items) {
  const c = document.getElementById('tab-cont-res');
  if (!items.length) { c.innerHTML = '<div class="vacio">Cuando reúnas familias, aparecerán aquí. ❤️</div>'; return; }
  c.innerHTML = items.map(m => `
    <div class="caso" style="opacity:.65">
      <div class="caso-header">
        <div class="caso-nombre">✅ ${m.nombre} · ${m.edad} años</div>
        <span class="badge b-res">REUNIFICADO</span>
      </div>
    </div>`).join('');
}

// ── ACCIONES ADMIN ───────────────────────────────────
async function marcarReunificado(id) {
  if (!confirm('¿Confirmas que esta familia fue reunificada? ❤️')) return;
  await db.from('casos').update({ tipo: 'reunificado' }).eq('id', id);
  cargarAdmin(); actualizarContadores();
}

async function eliminarCaso(id) {
  if (!confirm('¿Eliminar este caso? No se puede deshacer.')) return;
  await db.from('custodias').delete().eq('caso_id', id); // borra custodia primero
  await db.from('casos').delete().eq('id', id);
  cargarAdmin(); actualizarContadores();
}

async function aprobarSolicitud(solId, menorId) {
  // Mostrar datos del menor al admin para que pueda contactar al familiar
  const { data, error } = await db
    .from('casos')
    .select('nombre, ubicacion_actual, lugar_rescate, custodias(nombre_responsable, telefono, institucion)')
    .eq('id', menorId)
    .single();

  if (error || !data) {
    alert('No se encontraron los datos del menor (ID: ' + menorId + ')\nVerifica manualmente.');
    return;
  }

  const cust = data.custodias?.[0] || {};
  alert(
    `✅ DATOS DEL MENOR — comparte con el familiar:\n\n` +
    `👦 Nombre: ${data.nombre}\n` +
    `📍 Lugar exacto: ${data.ubicacion_actual}\n` +
    `🏥 Institución: ${cust.institucion || '—'}\n` +
    `👤 Responsable: ${cust.nombre_responsable || '—'}\n` +
    `📞 Teléfono: ${cust.telefono || '—'}\n\n` +
    `Contacta al familiar y dale esta información.`
  );

  // Marcar solicitud como procesada (cambiar tipo)
  await db.from('casos').update({ tipo: 'solicitud_procesada' }).eq('id', solId);
  cargarAdmin();
}

// ════════════════════════════════════════════════════
// EXPORTAR
// ════════════════════════════════════════════════════
async function exportarCSV() {
  const { data } = await db.from('casos').select('*, custodias(*)').order('created_at', {ascending:false});
  const header = 'Tipo,ID,Nombre,Edad,Sexo,Salud,Lugar rescate,Ubicacion,Reportante,Telefono,Fecha\n';
  const filas = (data||[]).map(c =>
    `${c.tipo},${c.id},${c.nombre||''},${c.edad||''},${c.sexo||''},${c.estado_salud||''},` +
    `"${c.lugar_rescate||''}","${c.ubicacion_actual||''}",${c.nombre_reportante||''},${c.telefono_reportante||''},${c.created_at||''}`
  );
  descargar(header + filas.join('\n'), 'reunificar_casos.csv', 'text/csv');
}

async function exportarJSON() {
  const { data } = await db.from('casos').select('*, custodias(*)').order('created_at', {ascending:false});
  descargar(
    JSON.stringify({ exportado: new Date().toISOString(), casos: data }, null, 2),
    'reunificar_casos.json',
    'application/json'
  );
}

function descargar(contenido, nombre, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  a.download = nombre;
  a.click();
}

// ════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  const ahora = new Date().toISOString().slice(0, 16);
  const ef = document.getElementById('e-fecha');
  const bf = document.getElementById('b-fecha');
  if (ef) ef.value = ahora;
  if (bf) bf.value = ahora;
  actualizarContadores();
});