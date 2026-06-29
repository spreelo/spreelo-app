"use client";

import { useEffect, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";
import {
  SUPPORTED_UI_LOCALES,
  getUiLanguageName,
} from "../../lib/i18n/defaultLabels";


const SETTINGS_DELETE_COPY = {
  en: {
    confirmation: "Confirmation",
    placeholder: "Type {word}",
    deleteButton: "Delete my account",
    deletingAccount: "Deleting account...",
    deletingMessage: "Deleting your account...",
    errorTypeDelete: "Type {word} to confirm account deletion.",
    confirmDialog: "This will permanently delete your Spreelo account, all brands, posts, content plans, campaign data and social connections. This cannot be undone.",
  },
  sv: {
    confirmation: "Bekräftelse",
    placeholder: "Skriv {word}",
    deleteButton: "Radera mitt konto",
    deletingAccount: "Raderar konto...",
    deletingMessage: "Raderar ditt konto...",
    errorTypeDelete: "Skriv {word} för att bekräfta kontoradering.",
    confirmDialog: "Detta raderar permanent ditt Spreelo-konto, alla varumärken, inlägg, innehållsplaner, kampanjdata och sociala kopplingar. Detta kan inte ångras.",
  },
  es: {
    confirmation: "Confirmación",
    placeholder: "Escribe {word}",
    deleteButton: "Eliminar mi cuenta",
    deletingAccount: "Eliminando cuenta...",
    deletingMessage: "Eliminando tu cuenta...",
    errorTypeDelete: "Escribe {word} para confirmar la eliminación de la cuenta.",
    confirmDialog: "Esto eliminará permanentemente tu cuenta de Spreelo, todas las marcas, publicaciones, planes de contenido, datos de campañas y conexiones sociales. No se puede deshacer.",
  },
  pt: {
    confirmation: "Confirmação",
    placeholder: "Digite {word}",
    deleteButton: "Excluir minha conta",
    deletingAccount: "Excluindo conta...",
    deletingMessage: "Excluindo sua conta...",
    errorTypeDelete: "Digite {word} para confirmar a exclusão da conta.",
    confirmDialog: "Isso excluirá permanentemente sua conta Spreelo, todas as marcas, publicações, planos de conteúdo, dados de campanhas e conexões sociais. Isso não pode ser desfeito.",
  },
  fr: {
    confirmation: "Confirmation",
    placeholder: "Saisissez {word}",
    deleteButton: "Supprimer mon compte",
    deletingAccount: "Suppression du compte...",
    deletingMessage: "Suppression de votre compte...",
    errorTypeDelete: "Saisissez {word} pour confirmer la suppression du compte.",
    confirmDialog: "Cela supprimera définitivement votre compte Spreelo, toutes les marques, publications, plans de contenu, données de campagne et connexions sociales. Cette action est irréversible.",
  },
  de: {
    confirmation: "Bestätigung",
    placeholder: "Gib {word} ein",
    deleteButton: "Mein Konto löschen",
    deletingAccount: "Konto wird gelöscht...",
    deletingMessage: "Dein Konto wird gelöscht...",
    errorTypeDelete: "Gib {word} ein, um die Kontolöschung zu bestätigen.",
    confirmDialog: "Dadurch werden dein Spreelo-Konto, alle Marken, Beiträge, Inhaltspläne, Kampagnendaten und Social-Media-Verbindungen dauerhaft gelöscht. Dies kann nicht rückgängig gemacht werden.",
  },
  it: {
    confirmation: "Conferma",
    placeholder: "Scrivi {word}",
    deleteButton: "Elimina il mio account",
    deletingAccount: "Eliminazione account...",
    deletingMessage: "Eliminazione del tuo account...",
    errorTypeDelete: "Scrivi {word} per confermare l'eliminazione dell'account.",
    confirmDialog: "Questo eliminerà definitivamente il tuo account Spreelo, tutti i brand, i post, i piani di contenuto, i dati delle campagne e le connessioni social. L'azione non può essere annullata.",
  },
  nl: {
    confirmation: "Bevestiging",
    placeholder: "Typ {word}",
    deleteButton: "Mijn account verwijderen",
    deletingAccount: "Account verwijderen...",
    deletingMessage: "Je account wordt verwijderd...",
    errorTypeDelete: "Typ {word} om het verwijderen van het account te bevestigen.",
    confirmDialog: "Dit verwijdert permanent je Spreelo-account, alle merken, berichten, contentplannen, campagnedata en sociale koppelingen. Dit kan niet ongedaan worden gemaakt.",
  },
  da: {
    confirmation: "Bekræftelse",
    placeholder: "Skriv {word}",
    deleteButton: "Slet min konto",
    deletingAccount: "Sletter konto...",
    deletingMessage: "Sletter din konto...",
    errorTypeDelete: "Skriv {word} for at bekræfte sletning af kontoen.",
    confirmDialog: "Dette sletter permanent din Spreelo-konto, alle brands, opslag, indholdsplaner, kampagnedata og sociale forbindelser. Dette kan ikke fortrydes.",
  },
  no: {
    confirmation: "Bekreftelse",
    placeholder: "Skriv {word}",
    deleteButton: "Slett kontoen min",
    deletingAccount: "Sletter konto...",
    deletingMessage: "Sletter kontoen din...",
    errorTypeDelete: "Skriv {word} for å bekrefte kontosletting.",
    confirmDialog: "Dette sletter permanent Spreelo-kontoen din, alle merkevarer, innlegg, innholdsplaner, kampanjedata og sosiale tilkoblinger. Dette kan ikke angres.",
  },
  fi: {
    confirmation: "Vahvistus",
    placeholder: "Kirjoita {word}",
    deleteButton: "Poista tilini",
    deletingAccount: "Poistetaan tiliä...",
    deletingMessage: "Poistetaan tiliäsi...",
    errorTypeDelete: "Kirjoita {word} vahvistaaksesi tilin poistamisen.",
    confirmDialog: "Tämä poistaa pysyvästi Spreelo-tilisi, kaikki brändit, julkaisut, sisältösuunnitelmat, kampanjatiedot ja sosiaaliset yhteydet. Tätä ei voi perua.",
  },
  pl: {
    confirmation: "Potwierdzenie",
    placeholder: "Wpisz {word}",
    deleteButton: "Usuń moje konto",
    deletingAccount: "Usuwanie konta...",
    deletingMessage: "Usuwanie Twojego konta...",
    errorTypeDelete: "Wpisz {word}, aby potwierdzić usunięcie konta.",
    confirmDialog: "Spowoduje to trwałe usunięcie konta Spreelo, wszystkich marek, postów, planów treści, danych kampanii i połączeń społecznościowych. Tego nie można cofnąć.",
  },
  tr: {
    confirmation: "Onay",
    placeholder: "{word} yazın",
    deleteButton: "Hesabımı sil",
    deletingAccount: "Hesap siliniyor...",
    deletingMessage: "Hesabınız siliniyor...",
    errorTypeDelete: "Hesap silmeyi onaylamak için {word} yazın.",
    confirmDialog: "Bu işlem Spreelo hesabınızı, tüm markaları, gönderileri, içerik planlarını, kampanya verilerini ve sosyal bağlantıları kalıcı olarak siler. Bu işlem geri alınamaz.",
  },
  ar: {
    confirmation: "تأكيد",
    placeholder: "اكتب {word}",
    deleteButton: "حذف حسابي",
    deletingAccount: "جارٍ حذف الحساب...",
    deletingMessage: "جارٍ حذف حسابك...",
    errorTypeDelete: "اكتب {word} لتأكيد حذف الحساب.",
    confirmDialog: "سيؤدي هذا إلى حذف حساب Spreelo الخاص بك نهائيًا، وكل العلامات التجارية والمنشورات وخطط المحتوى وبيانات الحملات والاتصالات الاجتماعية. لا يمكن التراجع عن ذلك.",
  },
  hi: {
    confirmation: "पुष्टि",
    placeholder: "{word} लिखें",
    deleteButton: "मेरा खाता हटाएँ",
    deletingAccount: "खाता हटाया जा रहा है...",
    deletingMessage: "आपका खाता हटाया जा रहा है...",
    errorTypeDelete: "खाता हटाने की पुष्टि के लिए {word} लिखें.",
    confirmDialog: "यह आपके Spreelo खाते, सभी ब्रांड, पोस्ट, कंटेंट प्लान, अभियान डेटा और सोशल कनेक्शन को स्थायी रूप से हटा देगा। इसे वापस नहीं किया जा सकता।",
  },
  id: {
    confirmation: "Konfirmasi",
    placeholder: "Ketik {word}",
    deleteButton: "Hapus akun saya",
    deletingAccount: "Menghapus akun...",
    deletingMessage: "Menghapus akun Anda...",
    errorTypeDelete: "Ketik {word} untuk mengonfirmasi penghapusan akun.",
    confirmDialog: "Ini akan menghapus akun Spreelo Anda secara permanen, semua brand, postingan, rencana konten, data kampanye, dan koneksi sosial. Tindakan ini tidak dapat dibatalkan.",
  },
  ja: {
    confirmation: "確認",
    placeholder: "{word} と入力",
    deleteButton: "アカウントを削除",
    deletingAccount: "アカウントを削除中...",
    deletingMessage: "アカウントを削除しています...",
    errorTypeDelete: "アカウント削除を確認するには {word} と入力してください。",
    confirmDialog: "Spreeloアカウント、すべてのブランド、投稿、コンテンツプラン、キャンペーンデータ、SNS接続が完全に削除されます。この操作は元に戻せません。",
  },
  ko: {
    confirmation: "확인",
    placeholder: "{word} 입력",
    deleteButton: "내 계정 삭제",
    deletingAccount: "계정 삭제 중...",
    deletingMessage: "계정을 삭제하는 중...",
    errorTypeDelete: "계정 삭제를 확인하려면 {word}를 입력하세요.",
    confirmDialog: "Spreelo 계정, 모든 브랜드, 게시물, 콘텐츠 계획, 캠페인 데이터 및 소셜 연결이 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.",
  },
  zh: {
    confirmation: "确认",
    placeholder: "输入 {word}",
    deleteButton: "删除我的账户",
    deletingAccount: "正在删除账户...",
    deletingMessage: "正在删除你的账户...",
    errorTypeDelete: "输入 {word} 以确认删除账户。",
    confirmDialog: "这将永久删除你的 Spreelo 账户、所有品牌、帖子、内容计划、活动数据和社交连接。此操作无法撤销。",
  },
  th: {
    confirmation: "การยืนยัน",
    placeholder: "พิมพ์ {word}",
    deleteButton: "ลบบัญชีของฉัน",
    deletingAccount: "กำลังลบบัญชี...",
    deletingMessage: "กำลังลบบัญชีของคุณ...",
    errorTypeDelete: "พิมพ์ {word} เพื่อยืนยันการลบบัญชี",
    confirmDialog: "การดำเนินการนี้จะลบบัญชี Spreelo แบรนด์ โพสต์ แผนเนื้อหา ข้อมูลแคมเปญ และการเชื่อมต่อโซเชียลทั้งหมดอย่างถาวร ไม่สามารถย้อนกลับได้",
  },
  uk: {
    confirmation: "Підтвердження",
    placeholder: "Введіть {word}",
    deleteButton: "Видалити мій акаунт",
    deletingAccount: "Видалення акаунта...",
    deletingMessage: "Ваш акаунт видаляється...",
    errorTypeDelete: "Введіть {word}, щоб підтвердити видалення акаунта.",
    confirmDialog: "Це назавжди видалить ваш акаунт Spreelo, усі бренди, дописи, контент-плани, дані кампаній і соціальні підключення. Цю дію не можна скасувати.",
  },
  ru: {
    confirmation: "Подтверждение",
    placeholder: "Введите {word}",
    deleteButton: "Удалить мой аккаунт",
    deletingAccount: "Удаление аккаунта...",
    deletingMessage: "Ваш аккаунт удаляется...",
    errorTypeDelete: "Введите {word}, чтобы подтвердить удаление аккаунта.",
    confirmDialog: "Это навсегда удалит ваш аккаунт Spreelo, все бренды, публикации, контент-планы, данные кампаний и социальные подключения. Это действие нельзя отменить.",
  },
  bg: {
    confirmation: "Потвърждение",
    placeholder: "Въведете {word}",
    deleteButton: "Изтрий моя акаунт",
    deletingAccount: "Акаунтът се изтрива...",
    deletingMessage: "Вашият акаунт се изтрива...",
    errorTypeDelete: "Въведете {word}, за да потвърдите изтриването на акаунта.",
    confirmDialog: "Това ще изтрие завинаги вашия Spreelo акаунт, всички брандове, публикации, планове за съдържание, данни за кампании и социални връзки. Това действие не може да бъде отменено.",
  },
};

function getLocaleBase(locale) {
  return String(locale || "en").toLowerCase().split("-")[0];
}

function formatDeleteCopy(value, word) {
  return String(value || "").replaceAll("{word}", word);
}

function getDeleteCopy(locale, key, word, fallback) {
  const copy = SETTINGS_DELETE_COPY[getLocaleBase(locale)] || SETTINGS_DELETE_COPY.en;
  return formatDeleteCopy(copy[key] || fallback || SETTINGS_DELETE_COPY.en[key], word);
}

export default function Settings() {
  const { t, locale, setLocale } = useUiText(["settings"]);

  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
  const recommendedLocale = SUPPORTED_UI_LOCALES.some(
    (item) => item.locale === locale
  )
    ? locale
    : "";
  const deleteConfirmWord = String(t("settings.deleteConfirmWord") || "DELETE").trim() || "DELETE";
  const deleteConfirmationLabel = getDeleteCopy(locale, "confirmation", deleteConfirmWord, t("settings.confirmation"));
  const deletePlaceholder = getDeleteCopy(locale, "placeholder", deleteConfirmWord, t("settings.confirmPlaceholder", { word: deleteConfirmWord }));
  const deleteButtonLabel = getDeleteCopy(locale, "deleteButton", deleteConfirmWord, t("settings.deleteButton"));
  const deletingAccountLabel = getDeleteCopy(locale, "deletingAccount", deleteConfirmWord, t("settings.deletingAccount"));

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUserEmail(user?.email || "");
    }

    loadUser();
  }, []);

  async function handleLanguageChange(nextLocale) {
    if (!nextLocale || savingLanguage) return;

    setSavingLanguage(true);
    setLocale(nextLocale);

    try {
      await supabase.auth.updateUser({
        data: {
          app_language: nextLocale,
        },
      });
    } catch {
      // The local UI language has already changed. Server-side email language will
      // fall back to brand/content language if user metadata cannot be updated.
    } finally {
      setSavingLanguage(false);
    }
  }

  async function handleDeleteAccount() {
    if (deletingAccount) return;

    if (confirmText.trim().toLocaleLowerCase() !== deleteConfirmWord.toLocaleLowerCase()) {
      setDeleteMessage(getDeleteCopy(locale, "errorTypeDelete", deleteConfirmWord, t("settings.errorTypeDelete", { word: deleteConfirmWord })));
      return;
    }

    const confirmed = window.confirm(getDeleteCopy(locale, "confirmDialog", deleteConfirmWord, t("settings.deleteConfirmDialog")));

    if (!confirmed) return;

    setDeletingAccount(true);
    setDeleteMessage(getDeleteCopy(locale, "deletingMessage", deleteConfirmWord, t("settings.deletingMessage")));

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }

      const response = await fetch("/api/delete-account", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || t("settings.errorDeleteAccount"));
      }

      await supabase.auth.signOut();

      window.location.href = "/login";
    } catch (error) {
      setDeleteMessage(error.message || t("settings.errorDeleteAccount"));
      setDeletingAccount(false);
    }
  }

  return (
    <AppLayout active="settings">
      <header className="topbar">
        <div>
          <p className="eyebrow">{t("settings.eyebrow")}</p>
          <h2>{t("settings.title")}</h2>
        </div>
      </header>

      <section className="hero-card">
        <div>
          <p className="eyebrow">{t("settings.accountEyebrow")}</p>
          <h3>{t("settings.accountTitle")}</h3>
          <p>{t("settings.accountText")}</p>
        </div>

        <div className="prompt-box">
          <label>{t("settings.signedInAs")}</label>
          <div className="input">
            {currentUserEmail || t("settings.signedInUserFallback")}
          </div>
        </div>
      </section>

      <section className="hero-card">
        <div>
          <p className="eyebrow">{t("settings.languageEyebrow")}</p>
          <h3>{t("settings.languageTitle")}</h3>
          <p>{t("settings.languageText")}</p>
        </div>

        <div className="prompt-box">
          <label>{t("settings.appLanguage")}</label>
          <select
            className="input"
            value={recommendedLocale}
            onChange={(event) => {
              handleLanguageChange(event.target.value);
            }}
            disabled={savingLanguage}
          >
            {!recommendedLocale && (
              <option value="">{getUiLanguageName(locale)}</option>
            )}

            {SUPPORTED_UI_LOCALES.map((item) => (
              <option key={item.locale} value={item.locale}>
                {item.nativeName || item.language}
              </option>
            ))}
          </select>


          <p>{t("settings.appLanguageHelp")}</p>
        </div>
      </section>

      <section className="settings-danger-zone">
        <div>
          <p className="eyebrow danger-eyebrow">
            {t("settings.dangerEyebrow")}
          </p>
          <h3>{t("settings.deleteTitle")}</h3>
          <p>{t("settings.deleteText")}</p>
          <p className="danger-warning">
            {t("settings.deleteWarningBefore")} <strong>{deleteConfirmWord}</strong>{" "}
            {t("settings.deleteWarningAfter")}
          </p>
        </div>

        <div className="settings-danger-box">
          <label>{deleteConfirmationLabel}</label>
          <input
            className="input"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder={deletePlaceholder}
            disabled={deletingAccount}
          />

          <button
            type="button"
            className="danger-button full"
            onClick={handleDeleteAccount}
            disabled={deletingAccount}
          >
            {deletingAccount
              ? deletingAccountLabel
              : deleteButtonLabel}
          </button>

          {deleteMessage && (
            <p className="settings-delete-message">{deleteMessage}</p>
          )}
        </div>
      </section>
    </AppLayout>
  );
}
