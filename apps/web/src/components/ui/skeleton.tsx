import { cn } from "@/lib/utils"

/**
 * A component that displays a skeleton screen.
 * @param className - The class name for the skeleton.
 * @param props - The props for the skeleton.
 * @returns A skeleton component.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
