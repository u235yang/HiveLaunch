import * as React from "react"
import { useFormContext, FormProvider as RHFFormProvider, FieldValues, UseFormReturn } from "react-hook-form"
import { cn } from "../../lib/utils"
import { Form } from "./form"

// 类型安全的 FormProvider 包装器
// 解决 react-hook-form v7 中 FormProvider 需要 children 属性的类型问题
// children 设为可选，因为在 JSX 中会通过子元素传递
interface FormProviderProps<TFieldValues extends FieldValues = FieldValues> {
  children?: React.ReactNode
}

function FormProvider<TFieldValues extends FieldValues = FieldValues>(
  props: FormProviderProps<TFieldValues> & UseFormReturn<TFieldValues>
): React.ReactElement {
  const { children, ...formMethods } = props
  return <RHFFormProvider {...formMethods}>{children}</RHFFormProvider>
}

interface FormFieldContextValue {
  name: string
}

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
)

// FormField 的 render props 类型
type FormFieldRenderProps = {
  field: {
    id: string
    name: string
    value: unknown
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
    onBlur: () => void
    ref: React.Ref<HTMLInputElement>
  }
  fieldState: any
}

interface FormFieldProps {
  name: string
  children?: (props: FormFieldRenderProps) => React.ReactNode
}

const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  ({ name, children }, ref) => {
    const form = useFormContext()
    const fieldState = form.getFieldState(name)
    const value = form.watch(name)

    return (
      <FormFieldContext.Provider value={{ name }}>
        <div ref={ref}>
          {children?.({
            field: {
              id: name,
              name,
              value: value as unknown,
              onChange: (e) => form.setValue(name as any, e.target.value as any, { shouldValidate: true }),
              onBlur: () => form.trigger(name as any),
              ref: form.register(name as any).ref,
            },
            fieldState,
          })}
        </div>
      </FormFieldContext.Provider>
    )
  }
)
FormField.displayName = "FormField"

const FormLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn("text-sm font-medium leading-none", className)}
    {...props}
  />
))
FormLabel.displayName = "FormLabel"

const FormControl = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ ...props }, ref) => <div ref={ref} {...props} />)
FormControl.displayName = "FormControl"

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm font-medium text-red-500", className)}
    {...props}
  >
    {children}
  </p>
))
FormMessage.displayName = "FormMessage"

export {
  Form,
  FormProvider,
  FormField,
  FormLabel,
  FormControl,
  FormMessage,
}
