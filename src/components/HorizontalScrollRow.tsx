import { Children, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";

export interface HorizontalScrollRowProps {
  title: string;
  linkText?: string;
  linkTo?: string;
  children: ReactNode;
  className?: string;
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
};

export function HorizontalScrollRow({
  title,
  linkText,
  linkTo,
  children,
  className = "",
}: HorizontalScrollRowProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section className={className}>
      {/* Section header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>

        {linkText && linkTo && (
          <Link
            to={linkTo}
            className="text-sm text-accent transition-opacity hover:opacity-80"
          >
            {linkText}
          </Link>
        )}
      </div>

      {/* Horizontal scroll container */}
      <motion.div
        className="flex gap-6 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{
          maskImage:
            "linear-gradient(to right, black calc(100% - 80px), transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, black calc(100% - 80px), transparent)",
        }}
        role="list"
        aria-label={title}
        initial={shouldReduceMotion ? false : "hidden"}
        animate="visible"
        variants={containerVariants}
      >
        {Children.map(children, (child) => {
          if (!child) return null;
          return (
            <motion.div
              className="shrink-0 snap-start [&>*]:h-full"
              role="listitem"
              variants={shouldReduceMotion ? undefined : itemVariants}
            >
              {child}
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
