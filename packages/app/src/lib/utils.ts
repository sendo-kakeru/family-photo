import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function hasMessage(obj: unknown): obj is { message: string } {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "message" in obj &&
    typeof obj.message === "string"
  );
}

export function toMiB(n: number) {
  return (n / (1024 * 1024)).toFixed(1);
}
