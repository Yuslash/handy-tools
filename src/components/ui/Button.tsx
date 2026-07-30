import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type Variant = 'signal' | 'bench' | 'quiet' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const variants: Record<Variant, string> = {
  // The one accent. Reserved for the primary action on a view.
  signal:
    'bg-signal text-[#1a1206] font-semibold hover:bg-[#f0b155] active:bg-[#d9922f] disabled:bg-rule disabled:text-ink-faint',
  bench:
    'bg-raised text-ink border border-rule hover:border-rule-bright hover:bg-[#333945] disabled:text-ink-faint',
  quiet:
    'bg-transparent text-ink-dim hover:text-ink hover:bg-raised disabled:text-ink-faint',
  danger:
    'bg-transparent text-fault border border-fault/40 hover:bg-fault/10 hover:border-fault',
}

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[11px] gap-1.5',
  md: 'h-9 px-3.5 text-[13px] gap-2',
  lg: 'h-11 px-5 text-[13px] gap-2',
  icon: 'h-8 w-8 justify-center',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'bench', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-md whitespace-nowrap transition-colors duration-100',
        'disabled:cursor-not-allowed disabled:opacity-70',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
)

Button.displayName = 'Button'
