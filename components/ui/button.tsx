"use client"

import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import type { VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button-variants"

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /** Renders {@link buttonVariants} styles on the single child (e.g. `next/link`). Base UI uses `render`, not Radix `asChild`. */
    asChild?: boolean
  }

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  children,
  ...props
}: ButtonProps) {
  const styles = cn(buttonVariants({ variant, size, className }))

  if (asChild) {
    return (
      <ButtonPrimitive
        data-slot="button"
        className={styles}
        nativeButton={false}
        render={React.Children.only(children) as React.ReactElement}
        {...props}
      />
    )
  }

  return (
    <ButtonPrimitive data-slot="button" className={styles} {...props}>
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
