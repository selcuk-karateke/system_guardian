import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        healthy: "border-emerald-700 bg-emerald-950 text-emerald-300",
        warning: "border-amber-700 bg-amber-950 text-amber-300",
        critical: "border-red-700 bg-red-950 text-red-300",
        default: "border-zinc-700 bg-zinc-900 text-zinc-300",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
