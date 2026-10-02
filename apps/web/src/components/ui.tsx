// SPDX-License-Identifier: Apache-2.0

import { shortHex } from '@carbonseal/api';
import { Check, Copy, Globe, Loader2, Lock, X } from 'lucide-react';
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useState } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = ({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) => (
  <button
    type="button"
    className={`btn btn-${variant} ${size === 'md' ? '' : `btn-${size}`} ${className}`}
    disabled={disabled || loading}
    {...rest}
  >
    {loading ? <Loader2 size={15} className="spin" /> : icon}
    {children}
  </button>
);

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent' | 'private';

export const Badge = ({ tone = 'neutral', dot = false, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) => (
  <span className={`badge ${tone === 'neutral' ? '' : `badge-${tone}`}`}>
    {dot && <span className="dot" />}
    {children}
  </span>
);

export const PrivateTag = ({ children = 'Private · this device' }: { children?: ReactNode }) => (
  <span className="tag tag-private">
    <Lock size={12} strokeWidth={2.4} />
    {children}
  </span>
);

export const PublicTag = ({ children = 'Public · on-chain' }: { children?: ReactNode }) => (
  <span className="tag tag-public">
    <Globe size={12} strokeWidth={2.4} />
    {children}
  </span>
);

export const Hash = ({ value, chars = 6 }: { value: string; chars?: number }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <span className="hash" title={value}>
      {shortHex(value, chars)}
      <button type="button" className="icon-btn" onClick={copy} aria-label="Copy">
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </span>
  );
};

export const Card = ({ className = '', children }: { className?: string; children: ReactNode }) => (
  <div className={`card ${className}`}>{children}</div>
);

export const Stat = ({ label, value }: { label: string; value: ReactNode }) => (
  <Card className="stat">
    <div className="stat-label">{label}</div>
    <div className="stat-value">{value}</div>
  </Card>
);

export const Meter = ({ value, max }: { value: bigint; max: bigint }) => {
  const pct = max === 0n ? 0 : Math.min(100, Number((value * 10_000n) / max) / 100);
  return (
    <div className="meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
};

export const Empty = ({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) => (
  <div className="empty">
    {icon}
    <strong>{title}</strong>
    {children && <div>{children}</div>}
  </div>
);

export const Field = ({
  label,
  hint,
  className = '',
  children,
}: {
  label: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) => (
  <div className={`field ${className}`}>
    <label>{label}</label>
    {children}
    {hint && <div className="hint">{hint}</div>}
  </div>
);

export const Modal = ({
  title,
  subtitle,
  onClose,
  footer,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle && <div className="card-sub">{subtitle}</div>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
};

export type StepState = 'pending' | 'active' | 'done';

export const Steps = ({ steps }: { steps: readonly { label: string; state: StepState }[] }) => (
  <div className="steps">
    {steps.map((s) => (
      <div key={s.label} className={`step ${s.state}`}>
        <span className="step-icon">
          {s.state === 'done' && <Check size={12} strokeWidth={3} />}
          {s.state === 'active' && <Loader2 size={12} className="spin" />}
        </span>
        {s.label}
      </div>
    ))}
  </div>
);

export const PageHead = ({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) => (
  <header className="page-head">
    <div>
      <div className="eyebrow">{eyebrow}</div>
      <h1 className="page-title">{title}</h1>
      {description && <p className="page-desc">{description}</p>}
    </div>
    {actions && <div className="actions">{actions}</div>}
  </header>
);
