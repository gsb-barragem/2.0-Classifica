import { supabase } from '../supabaseClient';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
  UPSERT = 'upsert',
}

interface SupabaseErrorInfo {
  error: string;
  operationType: OperationType;
  table: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | undefined;
  };
}

export async function handleSupabaseError(error: any, operationType: OperationType, table: string | null) {
  const { data: { user } } = await supabase.auth.getUser();
  
  const errInfo: SupabaseErrorInfo = {
    error: error?.message || String(error),
    operationType,
    table,
    authInfo: {
      userId: user?.id,
      email: user?.email,
    },
  };

  console.error(`Supabase Security/Runtime Error [${operationType}] on table [${table}]:`, JSON.stringify(errInfo, null, 2));
  
  // Re-throw with stringified info as per system instructions for better tracking
  throw new Error(JSON.stringify(errInfo));
}
