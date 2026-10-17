// Tiny offline bootstrap only. Persistent server translation packs remain the
// source for the rest of the UI and take precedence over these two labels.
// The loader must be readable before a pack/network/storage is available.
const startup = {
  en: ['Preparing your workspace', 'Loading your workspace…'],
  es: ['Preparando tu espacio de trabajo', 'Cargando tu espacio de trabajo…'],
  pt: ['Preparando seu espaço de trabalho', 'Carregando seu espaço de trabalho…'],
  fr: ['Préparation de votre espace de travail', 'Chargement de votre espace de travail…'],
  de: ['Dein Arbeitsbereich wird vorbereitet', 'Dein Arbeitsbereich wird geladen…'],
  it: ['Preparazione del tuo spazio di lavoro', 'Caricamento del tuo spazio di lavoro…'],
  nl: ['Je werkruimte wordt voorbereid', 'Je werkruimte wordt geladen…'],
  sv: ['Förbereder din arbetsyta', 'Laddar din arbetsyta…'],
  da: ['Forbereder dit arbejdsområde', 'Indlæser dit arbejdsområde…'],
  no: ['Forbereder arbeidsområdet ditt', 'Laster arbeidsområdet ditt…'],
  fi: ['Valmistellaan työtilaasi', 'Ladataan työtilaasi…'],
  pl: ['Przygotowywanie obszaru roboczego', 'Ładowanie obszaru roboczego…'],
  tr: ['Çalışma alanınız hazırlanıyor', 'Çalışma alanınız yükleniyor…'],
  ar: ['جارٍ إعداد مساحة عملك', 'جارٍ تحميل مساحة عملك…'],
  hi: ['आपका कार्यक्षेत्र तैयार किया जा रहा है', 'आपका कार्यक्षेत्र लोड हो रहा है…'],
  id: ['Menyiapkan ruang kerja Anda', 'Memuat ruang kerja Anda…'],
  ja: ['ワークスペースを準備しています', 'ワークスペースを読み込んでいます…'],
  ko: ['작업 공간을 준비하고 있습니다', '작업 공간을 불러오고 있습니다…'],
  zh: ['正在准备您的工作区', '正在加载您的工作区…'],
  th: ['กำลังเตรียมพื้นที่ทำงานของคุณ', 'กำลังโหลดพื้นที่ทำงานของคุณ…'],
  uk: ['Підготовка вашого робочого простору', 'Завантаження вашого робочого простору…'],
  ru: ['Подготовка вашего рабочего пространства', 'Загрузка вашего рабочего пространства…'],
  bg: ['Подготовка на работното ви пространство', 'Зареждане на работното ви пространство…'],
  vi: ['Đang chuẩn bị không gian làm việc', 'Đang tải không gian làm việc…'],
  cs: ['Příprava vašeho pracovního prostoru', 'Načítání vašeho pracovního prostoru…'],
  ro: ['Se pregătește spațiul de lucru', 'Se încarcă spațiul de lucru…'],
  hu: ['Munkaterület előkészítése', 'Munkaterület betöltése…'],
  el: ['Προετοιμασία του χώρου εργασίας σας', 'Φόρτωση του χώρου εργασίας σας…'],
  ms: ['Menyediakan ruang kerja anda', 'Memuatkan ruang kerja anda…'],
  fil: ['Inihahanda ang iyong workspace', 'Nilo-load ang iyong workspace…'],
};

export function getStartupUiLabel(locale, key) {
  const labels = startup[String(locale || '').toLowerCase().split('-')[0]];
  if (!labels) return '';
  if (key === 'layout.preparingWorkspace') return labels[0];
  if (key === 'layout.loadingWorkspace') return labels[1];
  return '';
}

export const getShellStorageKey = locale => `spreelo_ui_labels_v30_shell_${locale}`;
export function selectShellUiLabels(labels) {
  return Object.fromEntries(Object.entries(labels || {}).filter(([key, value]) =>
    /^(common|layout)\./.test(key) && typeof value === 'string' && value.trim()));
}
