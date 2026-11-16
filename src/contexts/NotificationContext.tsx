import React, { createContext, useState, useContext, useEffect, useCallback, ReactNode } from 'react';
import { DataContext } from './DataContext';
import { AuthContext } from './AuthContext';
import { listChangeRequests } from '../services/administraService';
import { isAdministraConfigured } from '../lib/ecosystemClients';

interface NotificationContextType {
  pendingCount: number;
  incomingChangeRequests: number;
  importantUpdate: boolean;
  setImportantUpdate: (val: boolean) => void;
  refreshPendingCount: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
  pendingCount: 0,
  incomingChangeRequests: 0,
  importantUpdate: false,
  setImportantUpdate: () => {},
  refreshPendingCount: async () => {},
});

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { documents } = useContext(DataContext);
  const { currentUser } = useContext(AuthContext);
  const [incomingChangeRequests, setIncomingChangeRequests] = useState(0);
  const [importantUpdate, setImportantUpdate] = useState(false);

  const draftCount = documents.filter(item => item.status === 'Rascunho').length;
  const pendingCount = draftCount + incomingChangeRequests;

  const refreshPendingCount = useCallback(async () => {
    if (!currentUser || !isAdministraConfigured()) {
      setIncomingChangeRequests(0);
      return;
    }
    try {
      const { data } = await listChangeRequests('incoming');
      const openIncoming = data.filter(r => r.status === 'pendente').length;
      setIncomingChangeRequests(openIncoming);
    } catch {
      setIncomingChangeRequests(0);
    }
  }, [currentUser]);

  useEffect(() => {
    void refreshPendingCount();
  }, [refreshPendingCount]);

  return (
    <NotificationContext.Provider
      value={{
        pendingCount,
        incomingChangeRequests,
        importantUpdate,
        setImportantUpdate,
        refreshPendingCount,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);
