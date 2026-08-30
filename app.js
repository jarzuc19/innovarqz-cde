// Configuración de Supabase con tus credenciales corporativas
const SUPABASE_URL = 'https://nmebcabmlsrcdljlfzoo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zZKN3h00iPUwgJx4C_2yxQ_pc0EXCcL';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let usuarioActual = null;
let estadoIsoSeleccionado = '01_WIP';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('CDE InnovArqZ Inicializado...');
    await cargarPerfilUsuario();
    await cargarProyectos();
});

async function cargarPerfilUsuario() {
    // Consulta al SuperAdmin guardado en la tabla usuarios
    const { data, error } = await supabaseClient
        .from('usuarios')
        .select('*')
        .eq('email', 'gerencia@innovarqzsas.com')
        .single();

    if (data) {
        usuarioActual = data;
        document.getElementById('userInfo').innerHTML = `<strong>${data.nombre_completo}</strong> (${data.cargo})`;
    } else {
        document.getElementById('userInfo').innerText = 'Usuario invitado';
    }
}

async function cargarProyectos() {
    const { data: proyectos, error } = await supabaseClient
        .from('proyectos')
        .select('*');

    const select = document.getElementById('projectSelect');
    select.innerHTML = '<option value="">Seleccione un proyecto...</option>';

    if (proyectos && proyectos.length > 0) {
        proyectos.forEach(p => {
            select.innerHTML += `<option value="${p.id}">${p.codigo_proyecto} - ${p.nombre}</option>`;
        });
    }
}

function cambiarEstadoISO(estado) {
    estadoIsoSeleccionado = estado;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    cargarArchivosProyecto();
}

async function cargarArchivosProyecto() {
    const proyectoId = document.getElementById('projectSelect').value;
    const tableBody = document.getElementById('filesTableBody');

    if (!proyectoId) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Seleccione un proyecto...</td></tr>';
        return;
    }

    // Consulta de auditoría de archivos segun el estado ISO 19650
    const { data: logs, error } = await supabaseClient
        .from('audit_logs')
        .select('*')
        .eq('proyecto_id', proyectoId)
        .eq('estado_destino', estadoIsoSeleccionado);

    if (!logs || logs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center;">No hay archivos en la carpeta ${estadoIsoSeleccionado}.</td></tr>`;
        return;
    }

    let rows = '';
    logs.forEach(log => {
        rows += `
            <tr>
                <td>${log.archivo_nombre}</td>
                <td>${log.version}</td>
                <td>${log.estado_origen}</td>
                <td><a href="${log.drive_file_url || '#'}" target="_blank" style="color: var(--accent-copper);">Ver en Drive</a></td>
            </tr>
        `;
    });
    tableBody.innerHTML = rows;
}
