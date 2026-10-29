import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// The CTFd theme's 3D push button: an outlined face lifted on a solid ledge (a hard box-shadow), which rises
// on hover and sinks when pressed. "solid" and the status colours fill the face for the one action that matters
// on a screen; "muted" is the quiet partner (Cancel); ghost/link stay flat for small, frequent actions.
const buttonVariants = cva(
  "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-[6px] font-mono font-bold uppercase tracking-[0.16em] outline-none transition-[transform,box-shadow,background-color,color,border-color] duration-100 focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "-translate-y-[3px] border-2 border-primary bg-transparent text-primary hover:-translate-y-[5px] hover:border-gold-light hover:bg-primary/10 hover:text-gold-light active:translate-y-[1px] active:bg-primary/15 disabled:translate-y-[-3px] shadow-[0_5px_0_#5c4317,0_7px_12px_rgb(0_0_0/0.5)] hover:shadow-[0_7px_0_#5c4317,0_10px_16px_rgb(0_0_0/0.55)] active:shadow-[0_1px_0_#5c4317,0_2px_4px_rgb(0_0_0/0.4)]",
        solid: "-translate-y-[3px] border-2 border-[#e9c97f] bg-primary text-primary-foreground hover:-translate-y-[5px] hover:bg-[#e6c47f] active:translate-y-[1px] disabled:translate-y-[-3px] shadow-[0_5px_0_#7a5a22,0_7px_12px_rgb(0_0_0/0.5)] hover:shadow-[0_7px_0_#7a5a22,0_10px_16px_rgb(0_0_0/0.55)] active:shadow-[0_1px_0_#7a5a22,0_2px_4px_rgb(0_0_0/0.4)]",
        success: "-translate-y-[3px] border-2 border-[#7ee2a3] bg-[#2fb36a] text-[#03140a] hover:-translate-y-[5px] hover:bg-[#3cc679] active:translate-y-[1px] disabled:translate-y-[-3px] shadow-[0_5px_0_#145c31,0_7px_12px_rgb(0_0_0/0.5)] hover:shadow-[0_7px_0_#145c31,0_10px_16px_rgb(0_0_0/0.55)] active:shadow-[0_1px_0_#145c31,0_2px_4px_rgb(0_0_0/0.4)]",
        destructive: "-translate-y-[3px] border-2 border-destructive/80 bg-transparent text-[#f3b4ac] hover:-translate-y-[5px] hover:bg-destructive/15 hover:text-white active:translate-y-[1px] disabled:translate-y-[-3px] shadow-[0_5px_0_#5e1d18,0_7px_12px_rgb(0_0_0/0.5)] hover:shadow-[0_7px_0_#5e1d18,0_10px_16px_rgb(0_0_0/0.55)] active:shadow-[0_1px_0_#5e1d18,0_2px_4px_rgb(0_0_0/0.4)]",
        muted: "-translate-y-[3px] border-2 border-white/25 bg-transparent text-foreground/75 hover:-translate-y-[5px] hover:border-white/50 hover:bg-foreground/5 hover:text-foreground active:translate-y-[1px] disabled:translate-y-[-3px] shadow-[0_5px_0_#26231e,0_7px_12px_rgb(0_0_0/0.5)] hover:shadow-[0_7px_0_#26231e,0_10px_16px_rgb(0_0_0/0.55)] active:shadow-[0_1px_0_#26231e,0_2px_4px_rgb(0_0_0/0.4)]",
        outline: "border border-input bg-white/[0.03] font-sans font-medium normal-case tracking-normal text-foreground hover:border-foreground/30 hover:bg-white/[0.06]",
        ghost: "font-sans font-medium normal-case tracking-normal text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
        link: "font-sans font-medium normal-case tracking-normal text-gold-light underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 text-[0.72rem]",
        sm: "h-9 px-3.5 text-[0.66rem] tracking-[0.14em]",
        lg: "h-14 px-7 text-sm",
        xl: "h-20 px-8 text-lg tracking-[0.2em]",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
