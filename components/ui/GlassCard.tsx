"use client";

import { type HTMLAttributes } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function GlassCard({
  children,
  className = "",
  hover = false,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={`glass rounded-2xl p-4 sm:p-6 animate-fade-in transition-all duration-300 ease-smooth ${
        hover
          ? "hover:shadow-glass-hover hover:-translate-y-0.5 cursor-pointer"
          : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
