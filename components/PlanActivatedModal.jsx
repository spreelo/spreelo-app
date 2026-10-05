"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CalendarDays, Check, ClipboardList, Eye, Lightbulb, Send, Share2, Target, X } from "lucide-react";
import styles from "./PlanActivatedModal.module.css";

export default function PlanActivatedModal({ t, locale, summary, platform, onClose, onHome }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector("button")?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const nodes = dialogRef.current?.querySelectorAll('button:not(:disabled), [tabindex="0"]');
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
  const key = (name) => t(`automation.planActivatedV313.${name}`);
  const channels = summary.channels || platform;
  const facebookOnly = /^facebook$/i.test(String(channels || "").trim());
  const cards = [
    { tone: "mint", Icon: ClipboardList, label: "posts", value: summary.totalPosts },
    { tone: "violet", Icon: CalendarDays, label: "firstPost", value: summary.firstPostLabel },
    { tone: "blue", Icon: Share2, label: "channels", value: channels, facebook: facebookOnly },
    { tone: "peach", Icon: Target, label: "goal", value: summary.goal || t("automation.notSet") },
  ];
  return createPortal(
    <div className={styles.backdrop} onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeRef.current();
    }}>
      <section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="plan-activated-title" lang={locale}>
        <button type="button" className={styles.close} aria-label={key("close")} onClick={onClose}><X size={23}/></button>
        <div className={styles.scroll}>
          <header className={styles.header}>
            <img className={styles.logo} src="/brand/spreelologo-on-dark.png" alt="Spreelo" width="180" height="52"/>
            <span className={styles.success} aria-hidden="true"><Check size={36} strokeWidth={2.5}/></span>
            <h2 id="plan-activated-title">{key("title")}</h2>
            <p>{key("subtitle")}</p>
          </header>
          <div className={styles.body}>
            <dl className={styles.summary}>
              {cards.map(({ tone, Icon, label, value, facebook }) => (
                <div key={label} className={`${styles.card} ${styles[tone]}`}>
                  <span className={styles.cardIcon} aria-hidden="true">{facebook ? <svg viewBox="0 0 24 24" width="30" height="30"><path fill="currentColor" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.027 4.388 11.022 10.125 11.927v-8.437H7.078v-3.49h3.047v-2.66c0-3.026 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.971h-1.513c-1.491 0-1.956.931-1.956 1.887v2.264h3.328l-.532 3.49h-2.796V24C19.612 23.095 24 18.1 24 12.073z"/></svg> : <Icon size={29}/>}</span>
                  <div><dt>{key(label)}</dt><dd>{value}</dd></div>
                </div>
              ))}
            </dl>
            <section className={styles.next} aria-labelledby="plan-activated-next">
              <div className={styles.nextCopy}><span className={styles.bulb} aria-hidden="true"><Lightbulb size={30}/></span><div><h3 id="plan-activated-next">{key("next")}</h3><p>{key("nextText")}</p></div></div>
              <ol className={styles.steps}>
                {[ClipboardList, Eye, Send].map((Icon, index) => <li key={index}><span aria-hidden="true"><Icon size={23}/></span><strong>{key(`step${index + 1}`)}</strong></li>)}
              </ol>
            </section>
            <footer className={styles.actions}>
              <button type="button" className={styles.primary} onClick={onHome}>{key("home")}<ArrowRight size={20} aria-hidden="true"/></button>
              <button type="button" className={styles.secondary} onClick={onClose}>{key("close")}</button>
            </footer>
          </div>
        </div>
      </section>
    </div>, document.body
  );
}
