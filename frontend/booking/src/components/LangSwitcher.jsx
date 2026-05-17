import { useTranslation } from "react-i18next";

export default function LangSwitcher() {
  const { i18n, t } = useTranslation();
  const toggle = () => i18n.changeLanguage(i18n.language === "vi" ? "en" : "vi");
  return (
    <button onClick={toggle} className="lang-switcher" title={i18n.language === "vi" ? "Switch to English" : "Chuyển sang tiếng Việt"}>
      {t("langSwitch")}
    </button>
  );
}
