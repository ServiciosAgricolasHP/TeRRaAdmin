import { createContext, useContext } from "react";

// Las notificaciones tipo toast. Lo provee `ToastProvider`.
export const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Sin provider, cae a `window.alert` en vez de lanzar.
    return {
      success: (m) => window.alert(m),
      error: (m) => window.alert(m),
      warning: (m) => window.alert(m),
      info: (m) => window.alert(m),
      dismiss: () => {},
    };
  }
  return ctx;
}
