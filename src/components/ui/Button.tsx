import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

/**
 * Three heights, fixed padding per height. A button's width comes from its
 * label — never from hand-tuned classes at the call site, which is what made
 * sizing look arbitrary before.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const variants: Record<Variant, string> = {
  // One per screen. If you want two, one of them is not primary.
  primary:
    'bg-signal text-signal-ink font-semibold hover:bg-signal-hover active:bg-signal-active',
  secondary:
    'bg-raised text-ink border border-line hover:border-line-strong hover:bg-overlay',
  ghost:
    'bg-transparent text-ink-dim hover:bg-raised hover:text-ink',
  danger:
    'bg-transparent text-bad border border-bad/40 hover:bg-bad/10 hover:border-bad',
}

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 gap-1.5 text-small',
  md: 'h-[34px] px-3.5 gap-2 text-body',
  lg: 'h-10 px-5 gap-2 text-body',
  icon: 'h-[34px] w-[34px] justify-center',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md whitespace-nowrap',
        'transition-colors duration-150 ease-[cubic-bezier(0.2,0.7,0.3,1)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
)

Button.displayName = 'Button'
