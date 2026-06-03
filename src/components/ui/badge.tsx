import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        healthy:
          "border-emerald-700/80 bg-emerald-950/80 text-emerald-300 shadow-[0_0_14px_rgba(74,222,128,0.12)]",
        warning:
          "border-amber-700/80 bg-amber-950/80 text-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.1)]",
        critical:
          "border-red-700/80 bg-red-950/80 text-red-300 shadow-[0_0_16px_rgba(248,113,113,0.14)]",
        default: "border-zinc-700/80 bg-zinc-900/80 text-zinc-300",
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
