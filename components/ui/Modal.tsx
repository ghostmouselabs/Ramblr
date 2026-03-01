"use client";

import {
  type ReactNode,
  useEffect,
  useRef,
  useCallback,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useIsClient } from "@/lib/hooks";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  children,
  className = "",
}: ModalProps) {
  const isClient = useIsClient();
  const [visible, setVisible] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // State-adjustment: clear visibility immediately when closed
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setVisible(false);
    }
  }

  // Side effects: focus management and entrance animation
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      requestAnimationFrame(() => {
        setVisible(true);
        const firstFocusable = dialogRef.current?.querySelector(
          FOCUSABLE_SELECTOR,
        ) as HTMLElement | null;
        firstFocusable?.focus();
      });
    } else {
      previousFocusRef.current?.focus();
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      // Focus trap
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll(
          FOCUSABLE_SELECTOR,
        );
        if (focusable.length === 0) return;

        const first = focusable[0] as HTMLElement;
        const last = focusable[focusable.length - 1] as HTMLElement;

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";
      };
    }
  }, [open, handleKeyDown]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  if (!isClient || !open) return null;

  return createPortal(
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ease-smooth ${
        visible ? "bg-black/30 backdrop-blur-sm" : "bg-transparent"
      }`}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`glass rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto transition-all duration-300 ease-spring ${
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        } ${className}`}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        )}
        {!title && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
