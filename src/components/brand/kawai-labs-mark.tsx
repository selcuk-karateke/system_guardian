import Image from "next/image";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  size?: number;
  title?: string;
};

/** Official Kawai Labs mark (from website brand assets). */
export function KawaiLabsMark({
  className,
  size = 16,
  title = "Kawai Labs",
}: Props) {
  return (
    <Image
      src="/brand/kawai-labs-64.png"
      alt={title}
      width={size}
      height={size}
      className={cn("rounded-sm object-contain", className)}
      unoptimized
    />
  );
}
