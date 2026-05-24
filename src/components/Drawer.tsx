import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  MOTION,
  drawerBackdropVariants,
  drawerPanelVariants,
} from './motion';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** רוחב הפאנל בקלאס Tailwind. ברירת מחדל w-72. */
  panelClassName?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * תפריט צד (Drawer) RTL — נכנס מימין לשמאל.
 * • Escape סוגר.
 * • לחיצה על backdrop סוגרת.
 * • Body scroll מנוטרל בזמן פתיחה.
 * • Focus trap בסיסי על אלמנטים בתוך הפאנל.
 * • מכבד prefers-reduced-motion.
 */
const Drawer: React.FC<DrawerProps> = ({
  open,
  onClose,
  title,
  children,
  panelClassName = 'w-72',
}) => {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Body scroll lock + תיעוד הפוקוס הקודם
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

  // Escape + Tab focus trap
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const items = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
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

  // אוטו-פוקוס לאלמנט הראשון
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const first = panelRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();
  }, [open]);

  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: MOTION.durationSlow, ease: MOTION.easeOut };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="drawer-root"
          className="fixed inset-0 z-50 flex justify-start"
          initial="initial"
          animate="enter"
          exit="exit"
        >
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-black/50"
            variants={drawerBackdropVariants}
            transition={{ duration: MOTION.durationBase, ease: MOTION.easeOut }}
            onClick={onClose}
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : 'תפריט'}
            className={`relative h-full ${panelClassName} bg-[#1e293b] text-white shadow-2xl flex flex-col`}
            variants={drawerPanelVariants}
            transition={transition}
          >
            {children}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Drawer;
