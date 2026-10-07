"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, ClipboardList, PenLine, Send, X } from "lucide-react";
import styles from "./ThemeCalendarWelcome.module.css";

export default function ThemeCalendarWelcome({ t, locale, onClose }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = () => onClose(dontShowAgain);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector("button")?.focus();

    const handleKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const nodes = dialogRef.current?.querySelectorAll('button:not(:disabled), input, a[href], [tabindex="0"]');
      if (!nodes?.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [mounted]);

  const steps = [ClipboardList, PenLine, Send];
  const key = (name) => t(`calendar.welcomeV319.${name}`);
  const cards = ["occasions", "products", "setup"];

  if (!mounted) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeRef.current();
      }}
    >
      <section
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-calendar-welcome-title"
        lang={locale}
      >
        <button className={styles.close} onClick={() => closeRef.current()} aria-label={key("close")} type="button">
          <X size={22} />
        </button>

        <div className={styles.scroll}>
          <header className={styles.header}>
            <div className={styles.headerBackground} aria-hidden="true" />
            <img className={styles.logo} src="/brand/spreelologo-on-dark.png" alt="Spreelo" width="180" height="52" />
            <h2 id="theme-calendar-welcome-title">{key("title")}</h2>
            <p>{key("subtitle")}</p>
          </header>

          <div className={styles.body}>
            <div className={styles.features}>
              {cards.map((card) => (
                <article className={`${styles.feature} ${styles[card]}`} key={card}>
                  <img
                    src={`/onboarding-guide/theme-calendar-welcome-${card}-v319.png`}
                    alt={key(`${card}Alt`)}
                    width="1536"
                    height="1024"
                  />
                  <div className={styles.featureCopy}>
                    <h3>{key(`${card}Title`)}</h3>
                    <p>{key(`${card}Text`)}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className={styles.divider}>
              <span>{key("stepsTitle")}</span>
            </div>

            <ol className={styles.steps}>
              {steps.map((Icon, index) => (
                <li className={styles.step} key={index}>
                  <span className={`${styles.icon} ${styles[`tone${index}`]}`} aria-hidden="true">
                    <Icon size={27} />
                  </span>
                  <div>
                    <h3>{index + 1}. {key(`step${index + 1}Title`)}</h3>
                    <p>{key(`step${index + 1}Text`)}</p>
                  </div>
                  {index < 2 ? <ChevronRight className={styles.chevron} size={22} aria-hidden="true" /> : null}
                </li>
              ))}
            </ol>

            <footer className={styles.footer}>
              <label className={styles.preference}>
                <input type="checkbox" checked={dontShowAgain} onChange={(event) => setDontShowAgain(event.target.checked)} />
                <span>{key("dontShowAgain")}</span>
              </label>
              <p className={styles.note}>{key("note")}</p>
              <button type="button" className={styles.primary} onClick={() => closeRef.current()}>
                {key("cta")}
                <span aria-hidden="true">→</span>
              </button>
            </footer>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
