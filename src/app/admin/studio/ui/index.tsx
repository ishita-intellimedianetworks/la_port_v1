"use client";

/**
 * The studio's input vocabulary.
 *
 * Every step is a form over one part of `site.json`, so the same half-dozen
 * shapes recur: a labelled number, a vec3, a slider with a live read-out, a
 * dropdown over a fixed enum, a colour. Defining them once is what keeps eight
 * step files readable and, more usefully, what makes them behave the same —
 * particularly `NumberField`, which has one non-obvious job described below.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Vec3 } from "@/config/schema";

export function Panel({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-white/10 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {description && (
              <p className="mt-1 max-w-prose text-xs leading-relaxed text-slate-400">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
    </section>
  );
}

export function Group({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <fieldset className="mb-5 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <legend className="flex items-center gap-3 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {title}
        {right}
      </legend>
      <div className="space-y-3">{children}</div>
    </fieldset>
  );
}

export function Row({
  label,
  hint,
  children,
}: {
  label: string;
  /** A ReactNode rather than a string: some rows need a badge here — the
   *  lighting step marks a value the sky block is overriding, and that badge
   *  is a button. */
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="grid grid-cols-[9rem_1fr] items-center gap-3 text-sm">
      <span className="text-slate-300">
        {label}
        {hint && <span className="mt-0.5 block text-[10px] leading-tight text-slate-500">{hint}</span>}
      </span>
      <div className="min-w-0">{children}</div>
    </label>
  );
}

const inputClass =
  "w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-slate-100 " +
  "outline-none focus:border-sky-500/70 disabled:opacity-40";

export function TextField({
  value,
  onChange,
  placeholder,
  mono,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      className={`${inputClass} ${mono ? "font-mono text-xs" : ""}`}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function TextArea({
  value,
  onChange,
  rows = 3,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      className={`${inputClass} resize-y leading-relaxed`}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * A number input that lets you TYPE.
 *
 * The naive `value={n} onChange={n => set(+e.target.value)}` breaks on every
 * intermediate string a real number passes through: clear the box and `+""`
 * is 0, so the field refills with a zero under the cursor; type "-" and it is
 * NaN; type "1." and the trailing dot is parsed away the instant it is typed,
 * so no decimal can ever be entered. Every one of those is a value silently
 * written into the file being authored.
 *
 * So the input holds a STRING while focused and only commits a parse when it
 * yields a finite number. The external value flows back in whenever the field
 * is not focused — which is what lets a gizmo drag update the numbers live
 * without fighting the keyboard.
 */
export function NumberField({
  value,
  onChange,
  step = 0.01,
  disabled,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  disabled?: boolean;
  suffix?: string;
}) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  return (
    <span className="relative flex items-center">
      <input
        className={`${inputClass} font-mono text-xs ${suffix ? "pr-8" : ""}`}
        type="number"
        step={step}
        value={text}
        disabled={disabled}
        onFocus={() => { focused.current = true; }}
        onBlur={() => {
          focused.current = false;
          // Snap the box back to the committed value, so an abandoned
          // half-typed entry ("-", "1.") does not linger looking authored.
          setText(String(value));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(parsed)) onChange(parsed);
        }}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2 text-[10px] text-slate-500">{suffix}</span>
      )}
    </span>
  );
}

export function Vec3Field({
  value,
  onChange,
  step = 0.01,
  labels = ["X", "Y", "Z"],
}: {
  value: Vec3;
  onChange: (value: Vec3) => void;
  step?: number;
  labels?: [string, string, string] | string[];
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {([0, 1, 2] as const).map((i) => (
        <span key={i} className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-500">
            {labels[i]}
          </span>
          <NumberField
            value={value[i]}
            step={step}
            onChange={(n) => {
              const next: Vec3 = [...value];
              next[i] = n;
              onChange(next);
            }}
          />
        </span>
      ))}
    </div>
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        className="h-1 flex-1 cursor-pointer appearance-none rounded bg-white/15 accent-sky-400"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-20 shrink-0">
        <NumberField value={value} step={step} onChange={onChange} suffix={suffix} />
      </span>
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      className={inputClass}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-[#0b1220]">
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function ColorField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        className="h-7 w-10 shrink-0 cursor-pointer rounded border border-white/10 bg-transparent"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"}
        onChange={(e) => onChange(e.target.value)}
      />
      <TextField value={value} onChange={onChange} mono />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300">
      <input
        type="checkbox"
        className="h-4 w-4 accent-sky-400"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

type ButtonTone = "default" | "primary" | "danger" | "ghost";

const TONES: Record<ButtonTone, string> = {
  default: "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10",
  primary: "border-sky-500/50 bg-sky-500/20 text-sky-100 hover:bg-sky-500/30",
  danger: "border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20",
  ghost: "border-transparent bg-transparent text-slate-400 hover:text-white",
};

export function Button({
  children,
  onClick,
  tone = "default",
  disabled,
  title,
  small,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  title?: string;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded border font-medium transition disabled:cursor-not-allowed disabled:opacity-35 ${
        small ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      } ${TONES[tone]}`}
    >
      {children}
    </button>
  );
}

/** A short note about WHY a control is where it is. Used sparingly — the point
 *  of a studio is that the picture answers most questions. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="rounded border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200/80">
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded border border-dashed border-white/15 px-4 py-6 text-center text-xs text-slate-500">
      {children}
    </p>
  );
}
