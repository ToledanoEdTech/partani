import type { Transition, Variants } from 'motion/react';

/**
 * ערכי Motion משותפים — duration / easing אחיד בכל האפליקציה.
 * לשמור על מהירות אנימציות 200–350ms עם easing עדין (ease-out).
 */
export const MOTION = {
  durationFast: 0.18,
  durationBase: 0.24,
  durationSlow: 0.32,
  easeOut: [0.22, 1, 0.36, 1] as [number, number, number, number],
  easeInOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
};

export const fadeTransition: Transition = {
  duration: MOTION.durationBase,
  ease: MOTION.easeOut,
};

export const tabVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  enter: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

export const tabTransition: Transition = {
  duration: MOTION.durationBase,
  ease: MOTION.easeOut,
};

export const modalBackdropVariants: Variants = {
  initial: { opacity: 0 },
  enter: { opacity: 1 },
  exit: { opacity: 0 },
};

export const modalContentVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  enter: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 4 },
};

export const drawerBackdropVariants: Variants = {
  initial: { opacity: 0 },
  enter: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * RTL — הפאנל נכנס מצד ימין: translateX 100% → 0.
 */
export const drawerPanelVariants: Variants = {
  initial: { x: '100%' },
  enter: { x: 0 },
  exit: { x: '100%' },
};

export const drawerItemVariants: Variants = {
  initial: { opacity: 0, x: 12 },
  enter: { opacity: 1, x: 0 },
};

export const toastVariants: Variants = {
  initial: { opacity: 0, y: 24, scale: 0.96 },
  enter: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 12, scale: 0.97 },
};

export const cardListVariants: Variants = {
  enter: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

export const cardItemVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0 },
};
