import * as React from "react"
import { cn } from "../../lib/utils"

const Form = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("space-y-5", className)}
      {...props}
    />
  )
})
Form.displayName = "Form"

export { Form }
