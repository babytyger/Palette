import { useCallback, useContext, createContext, type ReactNode } from "react";
import { Toaster, toast as showToast } from "@/components/ui/toast";

type ToastFn = (msg: string, kind?: string) => void;

const ToastContext = createContext<ToastFn>(() => {});

/**
 * Shows app messages in the shadcn toaster.
 *
 * @param props.children - App tree
 */
const ToastProvider = ({ children }: { children: ReactNode }) => {
  const show = useCallback<ToastFn>((msg, kind = "") => {
    showToast.add({
      title: msg,
      type: kind === "error" ? "error" : "info",
      priority: kind === "error" ? "high" : "low",
      timeout: kind === "error" ? 5000 : 3000,
    });
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
};

/**
 * Returns the toast helper used by the rest of the app.
 */
const useToast = () => useContext(ToastContext);

export { ToastProvider, useToast };
