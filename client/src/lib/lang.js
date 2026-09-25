// Текущий язык сайта. Хранится в localStorage; по умолчанию — русский.
export function getLang() {
  try {
    return localStorage.getItem('lang') === 'en' ? 'en' : 'ru';
  } catch {
    return 'ru';
  }
}

export function setLang(l) {
  try {
    localStorage.setItem('lang', l === 'en' ? 'en' : 'ru');
  } catch {
    /* приватный режим — молча игнорируем */
  }
}
