"use client";

/**
 * The studio's input vocabulary.
 *
 * Every step is a form over one part of `site.json`, so the same half-dozen
 * shapes recur: a labelled number, a vec3, a slider with a live read-out, a
 * dropdown over a fixed enum, a colour. Defining them once is what keeps the
 * step files readable and, more usefully, what makes them behave the same —
 * particularly `NumberField`, which has one non-obvious job described below.
 *
 * The look is the 3di admin's: daisyUI's button, card and table shapes over
 * the `theme-3di` palette, transcribed in `theme.ts` rather than pulled in as
 * a plugin. See that file for why.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Vec3 } from "@/config/schema";
import { CARD, FIELD } from "./theme";

/** One step's form. The header is sticky so the step's own actions stay put
 *  while a thirty-row table scrolls under them. */
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
    <section className="flex min-h-0 flex-col">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#374151] bg-[#1f2937] px-5 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          {description && (
            <p className="mt-1 max-w-prose text-xs leading-relaxed text-slate-300">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap justify-end gap-2">{actions}</div>}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function Group({
  title,
  children,
  right,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className={`mb-4 ${CARD} p-4`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
        {right}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
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
    <label className="grid grid-cols-[10rem_1fr] items-center gap-3 text-sm">
      <span className="text-slate-100">
        {label}
        {hint && <span className="mt-0.5 block text-[10px] leading-tight text-slate-400">{hint}</span>}
      </span>
      <div className="min-w-0">{children}</div>
    </label>
  );
}

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
      className={`${FIELD} ${mono ? "font-mono text-xs" : ""}`}
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
      className={`${FIELD} resize-y leading-relaxed`}
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
        className={`${FIELD} font-mono text-xs ${suffix ? "pr-8" : ""}`}
        type="number"
        step={step}
        value={text}
        disabled={disabled}
        onFocus={() => {
          focused.current = true;
        }}
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
        <span className="pointer-events-none absolute right-2 text-[10px] font-semibold text-slate-400">{suffix}</span>
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
          <span className="pointer-events-none absolute left-2 top-1/2 z-10 -translate-y-1/2 text-[10px] font-bold text-slate-400">
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
    <div className="flex items-center gap-3">
      <input
        type="range"
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-[#4b5563] accent-[#22c55e]"
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
      className={FIELD}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-[#1f2937]">
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
        className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-[#4b5563] bg-transparent"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"}
        onChange={(e) => onChange(e.target.value)}
      />
      <TextField value={value} onChange={onChange} mono />
    </div>
  );
}

/** daisyUI's `toggle`, which reads as on/off at a glance where a checkbox
 *  reads as "one of a set". */
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
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-slate-100">
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full border transition ${
          checked ? "border-[#22c55e] bg-[#22c55e]/30" : "border-[#4b5563] bg-[#111827]"
        }`}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
            checked ? "left-[1.15rem] bg-[#22c55e]" : "left-0.5 bg-slate-400"
          }`}
        />
      </span>
      {label}
    </label>
  );
}

type ButtonTone = "default" | "primary" | "danger" | "warning" | "accent" | "ghost";

/**
 * Two accents and a grey.
 *
 * GREEN COMMITS, RED DESTROYS, everything else is neutral. Both are FILLED,
 * not outlined: an outline button on a dark card is a rectangle of the same
 * colour as the card with a hairline round it, and at 11px that is not a
 * button anyone finds. The filled pair is the only thing in the panel with a
 * saturated background, so "which one do I press" answers itself.
 *
 * `accent` and `warning` are the tinted middle ground the icon buttons use —
 * visible in a row of thirty without thirty solid blocks of colour.
 */
const TONES: Record<ButtonTone, string> = {
  default: "border-[#6b7280] bg-[#374151] text-slate-100 hover:border-[#9ca3af] hover:bg-[#4b5563]",
  primary: "border-[#22c55e] bg-[#22c55e] font-semibold text-[#06210f] hover:bg-[#16a34a]",
  danger: "border-[#ef4444] bg-[#ef4444] font-semibold text-white hover:bg-[#dc2626]",
  warning: "border-[#f59e0b]/70 bg-[#f59e0b]/15 text-[#fbbf24] hover:bg-[#f59e0b] hover:text-[#111827]",
  accent: "border-[#22c55e]/70 bg-[#22c55e]/15 text-[#4ade80] hover:bg-[#22c55e] hover:text-[#06210f]",
  ghost: "border-transparent bg-transparent text-slate-300 hover:bg-[#374151] hover:text-white",
};

export function Button({
  children,
  onClick,
  tone = "default",
  disabled,
  title,
  small,
  wide,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  title?: string;
  small?: boolean;
  /** daisyUI `btn-wide` — the fixed width the 3di admin gives the two footer
   *  buttons, so Back and Save sit in the same place on every step. */
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition
        disabled:cursor-not-allowed disabled:opacity-35 ${
          small ? "px-2.5 py-1.5 text-[11px]" : "px-4 py-2 text-xs"
        } ${wide ? "min-w-[8rem]" : ""} ${TONES[tone]}`}
    >
      {children}
    </button>
  );
}

/** daisyUI `btn-square btn-outline btn-sm` — the icon-only action the 3di
 *  admin puts in its table rows. */
export function IconButton({
  children,
  onClick,
  tone = "default",
  title,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: ButtonTone;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition
        disabled:cursor-not-allowed disabled:opacity-30 ${TONES[tone]}`}
    >
      {children}
    </button>
  );
}

/** A short note about WHY a control is where it is. Used sparingly — the point
 *  of a studio is that the picture answers most questions. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-3 py-2 text-[11px] leading-relaxed text-[#fcd34d]">
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-[#6b7280] px-4 py-8 text-center text-xs text-slate-400">
      {children}
    </p>
  );
}
