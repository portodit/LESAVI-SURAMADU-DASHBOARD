import { createContext, useContext, useState, type ReactNode } from "react";

interface ImportGuardCtx {
  isImporting: boolean;
  setIsImporting: (v: boolean) => void;
}

const ImportGuardContext = createContext<ImportGuardCtx>({
  isImporting: false,
  setIsImporting: () => {},
});

export function ImportGuardProvider({ children }: { children: ReactNode }) {
  const [isImporting, setIsImporting] = useState(false);
  return (
    <ImportGuardContext.Provider value={{ isImporting, setIsImporting }}>
      {children}
    </ImportGuardContext.Provider>
  );
}

export function useImportGuard() {
  return useContext(ImportGuardContext);
}
