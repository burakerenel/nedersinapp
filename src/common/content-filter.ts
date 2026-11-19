/**
 * Basit küfür / hakaret filtresi (iş listesi #25).
 *
 * Metin önce sadeleştirilir (küçük harf, Türkçe karakterler Latin'e, sık
 * kullanılan rakam/sembol maskeleri harfe: 0→o, 1→i, 3→e, 4→a, 5→s, @→a, $→s,
 * noktalama → boşluk, "s.i.k" gibi aralara konan ayraçlar kaldırılır).
 * Ardından kelime sınırlı desenler aranır. Araç yorumlarında sık geçen
 * masum kelimelerle (sık, göt-ür, am-ortisör, yarı vb.)
 * çakışmamak için kök eşleşmesi yerine ekli biçimler listelenmiştir.
 *
 * Liste niyetli aşırı kısa tutulmuştur; LLM kontrolü (#26) ileride ekleniyor.
 */
import { normalizeTurkish } from './utils/turkish';

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '€': 'e',
};

/** Küfür/hakaret desenleri (sadeleştirilmiş metne uygulanır). */
const PATTERNS: RegExp[] = [
  // amk / aq ve açık biçimleri
  /\b(amk|amq|aq|amcik|amcigi|amcigini|amina\s*koy\w*|amina\s*k\b|amini\s*s\w*|ananin\s*ami|ananizin\s*ami)\b/,
  /\b(amina|amini|aminin)\b/,
  // sik- kökü: sadece açık ekli biçimler (sık, sıkı, sıkıntı → "sik", "siki", "sikinti" eşleşmez)
  /\b(sikt\w*|sikeyim|sikerim|sikerler|sikersin|sikis\w*|sikil\w*|sikic\w*|sikim\w*|sikiyim|sikiyor\w*|sikin\b|sikine|sikme\w*|siktir\w*)\b/,
  /\b(yarrak\w*|yarak\w*|yarra\w*)\b/,
  /\b(orospu\w*|orosbu\w*|orsp\w*|kahpe\w*|kaltak\w*|fahise\w*)\b/,
  /\b(pic\s*kurusu|picin\b|pici\b|picler\w*|picsin|pic\s*(gibi|olan|misin))\b/,
  // göt: "götür", "götürmek" eşleşmesin
  /\b(gotu\b|gotun\w*|gote\b|goten\b|gotunu\w*|gotune|gotlek\w*|gotveren\w*|gotos\w*|got\s*(deligi|lalesi|veren))\b/,
  /\b(pezevenk\w*|pezo\b|gavat\w*|dassak\w*|tasak\w*|tassag\w*|yavsak\w*|ibne\w*|ipne\w*|top\s*ibne)\b/,
  /\b(bok\s*(gibi|yoluna|ye|yedin|yemek|yiyor)|boktan\b|bokunu\b|bokum\b|bokumu\b)\b/,
  /\b(sikerler|siktigim\w*|siktimin\w*|sikimin\w*|sikimsonik)\b/,
  /\b(mal\s*misin|gerizekali\w*|geri\s*zekali\w*|salak\w*|serefsiz\w*|sarlatan\w*|sapik\w*|hayvan\s*herif|oglum\s*mal)\b/,
  /\b(dangalak\w*|hiyar\w*|andaval\w*|dalyarak\w*|donyarragi|godos\w*|zikeyim|zikerim|ziktir\w*)\b/,
  /\b(fuck\w*|f\s*u\s*c\s*k|shit\b|bitch\w*|asshole\w*|motherf\w*|cunt\w*|wtf\b|stfu\b)\b/,
  /\b(allahini\s*s\w*|allahin\s*belasi|anani\s*s\w*|ananin\s*\w+ni\b|ananizi\s*s\w*|bacini\s*s\w*|avradini\s*s\w*)\b/,
];

/** Metni sadeleştir: Türkçe karakter, leet, ayraçlar. */
export function normalizeForFilter(input: string): string {
  let s = normalizeTurkish(input);
  s = s.replace(/[0-9@$€]/g, (c) => LEET[c] ?? c);
  // harfler arası tek ayraç ("s.i.k", "a-m-k", "s_i_k") → birleştir
  s = s.replace(/\b([a-z])(?:[.\-_*+]([a-z]))+\b/g, (m) =>
    m.replace(/[.\-_*+]/g, ''),
  );
  // sansür yıldızları ("s*k", "a**") → boşluk değil, harf gibi davranmasın: kaldır
  s = s.replace(/\*/g, '');
  s = s.replace(/[^a-z\s]/g, ' ');
  // uzatılmış harfler ("siiiktir") → tek harf
  s = s.replace(/([a-z])\1{2,}/g, '$1$1');
  return s.replace(/\s+/g, ' ').trim();
}

/** İlk yakalanan ifadeyi döner; temizse null. */
export function findDisallowedContent(
  ...texts: (string | null | undefined)[]
): string | null {
  for (const raw of texts) {
    if (!raw) continue;
    const s = normalizeForFilter(raw);
    if (!s) continue;
    for (const re of PATTERNS) {
      const m = re.exec(s);
      if (m) return m[0];
    }
  }
  return null;
}

export function containsDisallowedContent(
  ...texts: (string | null | undefined)[]
): boolean {
  return findDisallowedContent(...texts) !== null;
}
