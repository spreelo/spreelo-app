"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, ClipboardList, PenLine, Send, X } from "lucide-react";
import styles from "./ContentCreatorWelcome.module.css";

export default function ContentCreatorWelcome({ t, locale, onClose }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = () => onClose(dontShowAgain);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector("button")?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const nodes = dialogRef.current?.querySelectorAll('button:not(:disabled), input, [tabindex="0"]');
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const steps = [ClipboardList, PenLine, Send];
  const key = (name) => t(`automation.welcomeV310.${name}`);
  return (
    <div className={styles.backdrop} onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeRef.current();
    }}>
      <section className={styles.dialog} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="content-creator-welcome-title" lang={locale}>
        <button className={styles.close} onClick={() => closeRef.current()} aria-label={key("close")} type="button"><X size={22}/></button>
        <div className={styles.scroll}>
        <header className={styles.header}>
          <img className={styles.logo} src="/brand/spreelologo-on-dark.png" alt="Spreelo" width="180" height="52"/>
          <h2 id="content-creator-welcome-title">{key("title")}</h2>
          <p>{key("subtitle")}</p>
        </header>
        <div className={styles.body}>
          <div className={styles.features}>
            {["products", "brain"].map((feature) => (
              <article className={`${styles.feature} ${styles[feature]}`} key={feature}>
                <img src={`/onboarding-guide/welcome-v310-${feature}.png`} alt={key(`${feature}Alt`)} width="1536" height="1024"/>
                <div className={styles.featureCopy}><h3>{key(`${feature}Title`)}</h3><p>{key(`${feature}Text`)}</p></div>
              </article>
            ))}
          </div>
          <div className={styles.divider}><span>{key("stepsTitle")}</span></div>
          <ol className={styles.steps}>
            {steps.map((Icon, index) => (
              <li className={styles.step} key={index}>
                <span className={`${styles.icon} ${styles[`tone${index}`]}`} aria-hidden="true"><Icon size={27}/></span>
                <div><h3>{index + 1}. {key(`step${index + 1}Title`)}</h3><p>{key(`step${index + 1}Text`)}</p></div>
                {index < 2 ? <ChevronRight className={styles.chevron} size={22} aria-hidden="true"/> : null}
              </li>
            ))}
          </ol>
          <footer className={styles.footer}>
            <label className={styles.preference}><input type="checkbox" checked={dontShowAgain} onChange={(event) => setDontShowAgain(event.target.checked)}/><span>{key("dontShowAgain")}</span></label>
            <p className={styles.recurring}>{key("recurring")}</p>
            <button type="button" className={styles.primary} onClick={() => closeRef.current()}>{key("cta")}<span aria-hidden="true">→</span></button>
          </footer>
        </div>
        </div>
      </section>
    </div>
  );
}
