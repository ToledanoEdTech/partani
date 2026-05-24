import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  MOTION,
  modalBackdropVariants,
  modalContentVariants,
} from './motion';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** קלאס Tailwind לרוחב מקסימלי. ברירת מחדל max-w-md. */
  maxWidthClassName?: string;
  /** מבטל סגירה בלחיצה על backdrop (משאיר Escape ו-X פעילים). */
  disableBackdropClose?: boolean;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal עם אנימציה: backdrop fade + קונטיינר scale+fade.
 * סגירה: Escape, לחיצה על backdrop (אלא אם הושבת), focus trap בסיסי.
 */
const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  maxWidthClassName = 'max-w-md',
  disableBackdropClose,
}) => {
  const reduceMotion = useReducedMotion();
  const contentRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab' && contentRef.current) {
        const items = contentRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !contentRef.current) return;
    const first = contentRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();
  }, [open]);

  const contentTransition = reduceMotion
    ? { duration: 0 }
    : { duration: MOTION.durationBase, ease: MOTION.easeOut };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-root"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial="initial"
          animate="enter"
          exit="exit"
        >
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-black/50"
            variants={modalBackdropVariants}
            transition={{ duration: MOTION.durationBase, ease: MOTION.easeOut }}
            onClick={disableBackdropClose ? undefined : onClose}
          />
          <motion.div
            ref={contentRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            className={`relative bg-white rounded-lg shadow-xl w-full ${maxWidthClassName} p-6`}
            variants={modalContentVariants}
            transition={contentTransition}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Modal;
