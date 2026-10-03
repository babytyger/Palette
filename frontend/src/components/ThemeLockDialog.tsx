import { useEffect, useState, type FormEvent } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

type Props = {
  onCancel: () => void;
  onSubmit: (code: string) => void;
};

/**
 * Asks for the Edit themes code.
 *
 * @param props.onCancel - Closes the dialog without opening Edit themes
 * @param props.onSubmit - Code to check
 */
const ThemeLockDialog = ({ onCancel, onSubmit }: Props) => {
  const [code, setCode] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  /**
   * Sends the typed code.
   *
   * @param event - Form submit
   */
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(code);
  };

  return (
    <div className="modal-root open">
      <div className="modal-scrim" onClick={onCancel} />
      <form className="confirm-pop" role="dialog" aria-modal="true" aria-labelledby="theme-lock-title" onSubmit={submit}>
        <h2 id="theme-lock-title">Edit themes</h2>
        <p>Enter the code to edit themes.</p>
        <div className="theme-lock-otp">
          <InputOTP
            maxLength={4}
            value={code}
            onChange={setCode}
            pattern={REGEXP_ONLY_DIGITS}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            aria-label="Theme edit code"
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <div className="confirm-actions">
          <button className="btn" type="button" onClick={onCancel}>Cancel</button>
          <button className="btn ink" type="submit">Continue</button>
        </div>
      </form>
    </div>
  );
};

export { ThemeLockDialog };
