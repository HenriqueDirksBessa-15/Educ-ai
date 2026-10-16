import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent, ReactNode } from "react";

export type ConfirmOptions = {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
};

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

// Without a provider (isolated component tests), fall back to the browser.
const ConfirmContext = createContext<Confirm>(async (options) =>
  window.confirm(`${options.title}\n\n${options.body}`),
);

export function useConfirm(): Confirm {
  return useContext(ConfirmContext);
}

type Pending = ConfirmOptions & {
  resolve: (value: boolean) => void;
  returnFocus: HTMLElement | null;
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<boolean>((resolve) =>
        setPending({
          ...options,
          resolve,
          returnFocus:
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null,
        }),
      ),
    [],
  );

  const close = (value: boolean) => {
    if (!pending) return;
    pending.resolve(value);
    pending.returnFocus?.focus();
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmBox pending={pending} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmBox({
  pending,
  onClose,
}: {
  pending: Pending;
  onClose: (value: boolean) => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Cancel gets focus first so an accidental Enter never sends anything.
  useEffect(() => cancelRef.current?.focus(), []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose(false);
      return;
    }
    if (event.key !== "Tab") return;
    const first = cancelRef.current;
    const last = confirmRef.current;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className="confirm-backdrop">
      <div
        className="confirm-box"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId}>{pending.title}</h2>
        <p id={bodyId}>{pending.body}</p>
        <div className="confirm-actions">
          <button
            ref={cancelRef}
            type="button"
            className="secondary-action"
            onClick={() => onClose(false)}
          >
            Cancelar
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={pending.danger ? "danger-action" : undefined}
            onClick={() => onClose(true)}
          >
            {pending.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
