"use client";

import { useRef } from "react";

/** A checkbox that, the moment it's checked, confirms then immediately
 * submits its form — no separate "run" click. Unchecking does nothing (this
 * is a one-shot trigger, not a persistent setting), and the box resets to
 * unchecked whenever the page re-renders with fresh server data. */
export function ConfirmCheckbox({
  action,
  hidden,
  confirmMessage,
  label,
}: {
  action: (formData: FormData) => void;
  hidden: Record<string, string>;
  confirmMessage: string;
  label: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      {Object.entries(hidden).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          onChange={(event) => {
            if (!event.currentTarget.checked) return;
            if (!window.confirm(confirmMessage)) {
              event.currentTarget.checked = false;
              return;
            }
            formRef.current?.requestSubmit();
          }}
        />
        {label}
      </label>
    </form>
  );
}
