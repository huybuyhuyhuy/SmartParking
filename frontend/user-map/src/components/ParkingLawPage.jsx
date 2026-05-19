import { useTranslation } from "react-i18next";

const LAW_BLOCKS = [
  {
    titleKey: "parkingLawSafeTitle",
    tone: "blue",
    items: ["parkingLawSafe1", "parkingLawSafe2", "parkingLawSafe3", "parkingLawSafe4"]
  },
  {
    titleKey: "parkingLawAvoidTitle",
    tone: "amber",
    items: ["parkingLawAvoid1", "parkingLawAvoid2", "parkingLawAvoid3", "parkingLawAvoid4", "parkingLawAvoid5"]
  },
  {
    titleKey: "parkingLawSmartTitle",
    tone: "green",
    items: ["parkingLawSmart1", "parkingLawSmart2", "parkingLawSmart3", "parkingLawSmart4"]
  },
  {
    titleKey: "parkingLawFineTitle",
    tone: "red",
    items: ["parkingLawFine1", "parkingLawFine2", "parkingLawFine3"]
  }
];

export default function ParkingLawPage({ onClose }) {
  const { t } = useTranslation();

  return (
    <div className="parking-law-page" role="dialog" aria-modal="true" aria-labelledby="parking-law-title">
      <div className="parking-law-shell">
        <header className="parking-law-hero">
          <div>
            <span className="parking-law-kicker">{t("parkingLawKicker")}</span>
            <h2 id="parking-law-title">{t("parkingLawTitle")}</h2>
            <p>{t("parkingLawSubtitle")}</p>
          </div>
          <button className="parking-law-close" onClick={onClose} aria-label={t("btnClose")}>×</button>
        </header>

        <section className="parking-law-source">
          <b>{t("parkingLawSourceTitle")}</b>
          <span>{t("parkingLawSourceText")}</span>
        </section>

        <div className="parking-law-grid">
          {LAW_BLOCKS.map((block) => (
            <section key={block.titleKey} className={`parking-law-card ${block.tone}`}>
              <h3>{t(block.titleKey)}</h3>
              <ul>
                {block.items.map((key) => <li key={key}>{t(key)}</li>)}
              </ul>
            </section>
          ))}
        </div>

        <footer className="parking-law-footer">
          <span>{t("parkingLawDisclaimer")}</span>
          <button className="btn btn-primary" onClick={onClose}>{t("btnClose")}</button>
        </footer>
      </div>
    </div>
  );
}
