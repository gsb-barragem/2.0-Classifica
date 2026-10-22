import { supabase, isSupabaseConfigured } from '../supabaseClient';

export type AuditAction = 'LOGIN_SUCCESS' | 'LOGIN_FAIL' | 'LOGOUT' | 'CREATE_OPINION' | 'EDIT_OPINION' | 'DELETE_OPINION' | 'DELETE_OFICIO' | 'DELETE_NOTIFICACAO' | 'USER_CREATED' | 'USER_DELETED' | 'USER_PROFILE_UPDATED' | 'ACCESS_REQUEST_APPROVED' | 'ACCESS_REQUEST_REJECTED' | 'PASSWORD_CHANGED' | 'DOWNLOAD_DOCUMENT' | 'USER_PASSWORD_RESET' | 'USER_ACTIVATED' | 'USER_INACTIVATED';

export async function logActivity(action: AuditAction, details: Record<string, unknown> = {}) {
  if (!isSupabaseConfigured()) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const userEmail = user?.email || 'Sistema/Anônimo';
    const userName = typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : userEmail;
    await supabase.from('audit_logs').insert({
      user_email: userEmail,
      user_name: userName,
      user_role: user ? 'Usuário autenticado' : 'Convidado',
      action,
      details,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
  } catch (error) {
    // Auditoria nunca deve derrubar o fluxo principal nem registrar credenciais.
    console.error('Falha ao registrar atividade:', error);
  }
}
