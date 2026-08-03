import type { HTMLAttributes } from "react";

import styles from "./badge.module.css";

type BadgeProps = HTMLAttributes<HTMLSpanElement>;

export function Badge({ className, ...props }: BadgeProps) {
  const classes = className ? `${styles.badge} ${className}` : styles.badge;
  return <span className={classes} {...props} />;
}
