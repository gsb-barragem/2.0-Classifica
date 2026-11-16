export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
  UPSERT = 'upsert',
}

function mapPgErrorMessage(error: any): string {
  const code = error?.code ? String(error.code) : '';
  switch (code) {
    case '42501':
      return 'Permissão insuficiente para executar esta operação no banco de dados.';
    case '42P01':
      return 'Estrutura de tabela ainda não provisionada no banco de dados.';
    case '23505':
      return 'Já existe um registro cadastrado com este identificador único.';
    case '23503':
      return 'Não foi possível concluir a operação pois existem registros vinculados.';
    case 'PGRST116':
      return 'Registro não encontrado ou acesso restrito.';
    default:
      return 'Erro ao comunicar com o banco de dados. Verifique suas permissões ou tente novamente.';
  }
}

export async function handleSupabaseError(error: any, operationType: OperationType, table: string | null) {
  const code = error?.code ? String(error.code) : 'UNKNOWN';
  console.error(`Supabase Runtime Error [${operationType}] [${table || 'rpc'}] (code=${code})`);
  throw new Error(mapPgErrorMessage(error));
}
