import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { ALL_MOCK_DATA } from '../../constants';

interface NotificationContextType {
  pendingCount: number;
  importantUpdate: boolean;
  setImportantUpdate: (val: boolean) => void;
  refreshPendingCount: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  pendingCount: 0,
  importantUpdate: false,
  setImportantUpdate: () => {},
  refreshPendingCount: () => {},
});

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [pendingCount, setPendingCount] = useState(0);
  const [importantUpdate, setImportantUpdate] = useState(false);

  const refreshPendingCount = () => {
    const count = ALL_MOCK_DATA.filter(item => item.status === 'Rascunho').length;
    setPendingCount(count);
  };

  useEffect(() => {
    refreshPendingCount();
  }, []);

  return (
    <NotificationContext.Provider value={{ pendingCount, importantUpdate, setImportantUpdate, refreshPendingCount }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);
