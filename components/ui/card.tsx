import type { HTMLAttributes } from "react";

import styles from "./card.module.css";

type CardProps = HTMLAttributes<HTMLElement>;

export function Card({ className, ...props }: CardProps) {
  const classes = className ? `${styles.card} ${className}` : styles.card;
  return <article className={classes} {...props} />;
}
