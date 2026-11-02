/**
 * Arama için normalize: küçük harf + Türkçe karakterleri sadeleştir.
 * `Şanzıman`, `ŞANZIMAN`, `sanziman` → `sanziman`.
 * Dikkat: JS toLowerCase 'I' → 'i' yapar, 'İ' → 'i̇' (noktalı) yapar;
 * bu yüzden önce Türkçe harfler elle eşlenir.
 */
export function normalizeTurkish(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Yorumun aranabilir metni: başlık + içerik + konular. */
export function buildSearchText(parts: {
  title?: string | null;
  content?: string | null;
  topics?: string[] | null;
}): string {
  return normalizeTurkish(
    [parts.title ?? '', parts.content ?? '', (parts.topics ?? []).join(' ')]
      .filter(Boolean)
      .join(' '),
  );
}
