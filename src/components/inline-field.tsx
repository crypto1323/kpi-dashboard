"use client";

import { useRef } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Spreadsheet-style cell: its own tiny form, saves on blur/Enter with no visible button. */
export function InlineTextField({
  action,
  name,
  defaultValue,
  hidden,
  className,
  type = "text",
}: {
  action: (formData: FormData) => void;
  name: string;
  defaultValue: string;
  hidden: Record<string, string>;
  className?: string;
  type?: "text" | "date";
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      {Object.entries(hidden).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <Input
        type={type}
        name={name}
        defaultValue={defaultValue}
        className={className}
        onBlur={() => formRef.current?.requestSubmit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      />
    </form>
  );
}

/** Same idea for a Select cell — saves the moment a new option is picked. */
export function InlineSelectField({
  action,
  name,
  defaultValue,
  items,
  hidden,
  className,
}: {
  action: (formData: FormData) => void;
  name: string;
  defaultValue: string;
  items: Record<string, string>;
  hidden: Record<string, string>;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      {Object.entries(hidden).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <Select
        name={name}
        defaultValue={defaultValue}
        items={items}
        onValueChange={() => {
          // Let the hidden select input's value commit before submitting.
          requestAnimationFrame(() => formRef.current?.requestSubmit());
        }}
      >
        <SelectTrigger className={className}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(items).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </form>
  );
}
