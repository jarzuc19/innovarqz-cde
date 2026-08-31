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
    try {
        const { data, error } = await supabaseClient
            .from('usuarios')
            .select('*')
            .eq('email', 'gerencia@innovarqzsas.com')
            .maybeSingle();

        if (data) {
            usuarioActual = data;
            document.getElementById('userInfo').innerHTML = `<strong>${data.nombre_completo}</strong> (${data.cargo})`;
        } else {
            document.getElementById('userInfo').innerText = 'Usuario Corporativo';
        }
    } catch (e) {
        document.getElementById('userInfo').innerText = 'Sesión Activa';
    }
}

async function cargarProyectos() {
    const select = document.getElementById('projectSelect');
    select.innerHTML = '<option value="">Cargando proyectos...</option>';

    const { data: proyectos, error } = await supabaseClient
        .from('proyectos')
        .select('*')
        .order('codigo_proyecto', { ascending: true });

    select.innerHTML = '<option value="">Seleccione un proyecto...</option>';

    if (error) {
        console.error('Error cargando proyectos:', error);
        return;
    }

    if (proyectos && proyectos.length > 0) {
        proyectos.forEach(p => {
            const nombreMostrar = p.nombre || p.nombre_proyecto || 'Proyecto sin nombre';
            select.innerHTML += `<option value="${p.id}">${p.codigo_proyecto} - ${nombreMostrar}</option>`;
        });
    } else {
        select.innerHTML = '<option value="">No hay proyectos registrados</option>';
    }
}

function cambiarEstadoISO(estado) {
    estadoIsoSeleccionado = estado;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Asigna la clase activa al botón presionado
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    cargarArchivosProyecto();
}

async function cargarArchivosProyecto() {
    const proyectoId = document.getElementById('projectSelect').value;
    const tableBody = document.getElementById('filesTableBody');

    if (!proyectoId) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Seleccione un proyecto para visualizar sus archivos...</td></tr>';
        return;
    }

    tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Cargando archivos desde Supabase...</td></tr>';

    // Consulta de auditoría de archivos según el estado ISO 19650
    const { data: logs, error } = await supabaseClient
        .from('audit_logs')
        .select('*')
        .eq('proyecto_id', proyectoId)
        .eq('estado_destino', estadoIsoSeleccionado);

    if (error) {
        console.error('Error al obtener archivos:', error);
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #ff6b6b;">Error al cargar datos. Verificar esquema de Supabase.</td></tr>`;
        return;
    }

    if (!logs || logs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center;">No hay archivos en la carpeta ${estadoIsoSeleccionado}.</td></tr>`;
        return;
    }

    let rows = '';
    logs.forEach(log => {
        const nombreArchivo = log.archivo_nombre || log.nombre_archivo || 'Archivo sin nombre';
        const urlDrive = log.drive_file_url || '#';
        const version = log.version || 'V1.0';
        const disciplina = log.estado_origen || 'General';

        rows += `
            <tr>
                <td><strong>${nombreArchivo}</strong></td>
                <td><span class="badge">${version}</span></td>
                <td>${disciplina}</td>
                <td>
                    <a href="${urlDrive}" target="_blank" class="btn-link" style="color: #00bcd4; text-decoration: none;">
                        📂 Abrir en Drive
                    </a>
                </td>
            </tr>
        `;
    });
    
    tableBody.innerHTML = rows;
}
