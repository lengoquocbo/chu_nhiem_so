"use client";

import { useState } from "react";

type ConfirmModalProps = {
  title: string;
  description?: string;
  fields?: { key: string; label: string; type?: "text" | "number"; defaultValue?: string | number; required?: boolean }[];
  confirmLabel?: string;
  loading?: boolean;
  loadingLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: (values: Record<string, string>) => void | Promise<void>;
};

/**
 * Modal xác nhận có thể kèm form nhỏ (VD: lý do điều chỉnh điểm, lý do mở khóa).
 * Dùng thay cho window.prompt()/window.confirm() - vốn không đồng bộ style
 * và trông thiếu chuyên nghiệp trên production.
 */
export function ConfirmModal({
  title,
  description,
  fields = [],
  confirmLabel = "Xác nhận",
  loading = false,
  loadingLabel = "Đang xử lý...",
  danger = false,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, String(f.defaultValue ?? "")]))
  );

  const missingRequired = fields.some((f) => f.required && !values[f.key]?.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4"
      onClick={() => { if (!loading) onCancel(); }}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-serif text-lg text-ink">{title}</h3>
        {description && <p className="mt-1.5 text-sm text-ink-muted">{description}</p>}

        {fields.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="field-label">{f.label}</label>
                <input
                  type={f.type || "text"}
                  className="field-input"
                  value={values[f.key] ?? ""}
                  disabled={loading}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  autoFocus={fields[0].key === f.key}
                />
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-secondary" disabled={loading} onClick={onCancel}>
            Hủy
          </button>
          <button
            className={danger ? "btn-danger" : "btn-primary"}
            disabled={missingRequired || loading}
            onClick={() => onConfirm(values)}
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
