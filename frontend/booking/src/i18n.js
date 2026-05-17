import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import vi from "./locales/vi/translation.json";
import en from "./locales/en/translation.json";

const savedLang = localStorage.getItem("i18nextLng");
const browserLang = navigator.language.slice(0, 2);
const defaultLang = savedLang || (["vi", "en"].includes(browserLang) ? browserLang : "vi");

i18n.use(initReactI18next).init({
  resources: { vi: { translation: vi }, en: { translation: en } },
  lng: defaultLang,
  fallbackLng: "vi",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  localStorage.setItem("i18nextLng", lng);
  document.documentElement.lang = lng;
});

document.documentElement.lang = defaultLang;

export default i18n;
